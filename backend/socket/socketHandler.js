const meetingStore = require('../utils/meetingStore');

// Map to track active sockets to user/meeting info
const activeSockets = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('🔌 New client connected:', socket.id);

        // --- Meeting Management ---

        socket.on('join-meeting', async (data) => {
            try {
                const { meetingId, userId, username } = data;

                console.log('🚀 JOIN-MEETING:', username, 'joining', meetingId);

                // Use meetingStore which handles persistence
                const meeting = await meetingStore.getMeeting(meetingId);

                if (!meeting || !meeting.isActive) {
                    socket.emit('error', { message: 'Meeting not found' });
                    return;
                }

                // Join socket room
                socket.join(meetingId);
                activeSockets.set(socket.id, { userId, username, meetingId });

                // Ensure participant exists (some flows add participant only via HTTP)
                const existing = meeting.getParticipant(userId);
                if (!existing) {
                    meeting.addParticipant(userId, username, socket.id);
                } else {
                    // User is reconnecting - clean up old socket from activeSockets map
                    if (existing.socketId && existing.socketId !== socket.id) {
                        console.log(`♻️ User ${username} reconnected: old socket ${existing.socketId} -> new socket ${socket.id}`);
                        activeSockets.delete(existing.socketId);
                        
                        // Notify others to clean up old connection
                        socket.to(meetingId).emit('user-disconnected', {
                            userId,
                            username,
                            socketId: existing.socketId
                        });
                    }
                    // Update participant with new socket ID
                    meeting.updateParticipant(userId, { socketId: socket.id });
                }

                // Get all participants EXCEPT the one who just joined (they don't need to connect to themselves)
                const participants = meeting.participants
                    .filter(p => p.socketId && p.socketId !== socket.id) // Exclude self, only include connected
                    .map(p => ({
                        socketId: p.socketId,
                        userId: p.userId,
                        username: p.username,
                        isAudioMuted: p.isAudioMuted,
                        isVideoOff: p.isVideoOff,
                        isHandRaised: p.isHandRaised,
                        isScreenSharing: p.isScreenSharing
                    }));

                console.log(`✅ JOIN SUCCESS: ${username} in ${meetingId}, sending ${participants.length} existing participants`);

                // Notify user who joined (with list of existing participants)
                socket.emit('joined-meeting', {
                    success: true,
                    meetingId,
                    participants,
                    yourSocketId: socket.id,
                    chatHistory: meeting.getChatHistory()
                });

                // Notify others that new user joined
                socket.to(meetingId).emit('user-joined', {
                    userId,
                    username,
                    socketId: socket.id,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('❌ JOIN ERROR:', error);
                socket.emit('error', { message: 'Failed to join meeting' });
            }
        });

        socket.on('leave-meeting', async (data) => {
            const { meetingId, userId } = data;
            console.log('👋 LEAVE-MEETING:', userId, 'leaving', meetingId);

            const meeting = await meetingStore.getMeeting(meetingId);
            if (meeting) {
                meeting.removeParticipant(userId);
                socket.to(meetingId).emit('user-left', { userId, socketId: socket.id });
            }

            socket.leave(meetingId);
            activeSockets.delete(socket.id);
        });

        socket.on('disconnect', async () => {
            console.log('❌ Socket disconnected:', socket.id);
            const session = activeSockets.get(socket.id);

            if (session) {
                const { meetingId, userId, username } = session;
                console.log(`   -> User ${username} (${userId}) disconnected from ${meetingId}`);

                const meeting = await meetingStore.getMeeting(meetingId);
                if (meeting) {
                    // Notify others
                    socket.to(meetingId).emit('user-disconnected', {
                        userId,
                        username,
                        socketId: socket.id
                    });

                    // Note: We don't remove the participant immediately from the store
                    // to allow for quick reconnections. The frontend handles cleanup of the *connection*.
                    // If they don't return, they remain in the list until they explicitly "leave" or the meeting ends.
                    // Optional: You could set a timeout here to remove them if they don't return in X minutes.
                }

                activeSockets.delete(socket.id);
            }
        });

        // --- WebRTC Signaling ---

        socket.on('offer', (data) => {
            // data: { target: socketId, offer: SDP }
            console.log(`Signal: OFFER from ${socket.id} to ${data.target}`);
            io.to(data.target).emit('offer', {
                offer: data.offer,
                sender: socket.id
            });
        });

        socket.on('answer', (data) => {
            // data: { target: socketId, answer: SDP }
            console.log(`Signal: ANSWER from ${socket.id} to ${data.target}`);
            io.to(data.target).emit('answer', {
                answer: data.answer,
                sender: socket.id
            });
        });

        socket.on('ice-candidate', (data) => {
            // data: { target: socketId, candidate: ICE }
            // console.log(`Signal: ICE from ${socket.id} to ${data.target}`);
            io.to(data.target).emit('ice-candidate', {
                candidate: data.candidate,
                sender: socket.id
            });
        });

        // --- Chat & Features ---

        socket.on('chat-message', async (data) => {
            // data: { meetingId, userId, username, message, timestamp }
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                const msg = { ...data, id: Date.now() + Math.random(), type: 'text' };
                meeting.addMessage(msg);
                io.to(data.meetingId).emit('chat-message', msg);
            }
        });

        socket.on('typing', (data) => {
            socket.to(data.meetingId).emit('user-typing', data);
        });

        socket.on('stop-typing', (data) => {
            socket.to(data.meetingId).emit('user-typing', { ...data, isTyping: false });
        });

        socket.on('file-share', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                const fileMsg = { ...data, id: Date.now() + Math.random(), type: 'file' };
                meeting.addMessage(fileMsg);
                io.to(data.meetingId).emit('file-shared', fileMsg);
            }
        });

        socket.on('create-poll', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                // Format options as objects with votes array for consistency
                const formattedOptions = data.options.map(opt => {
                    if (typeof opt === 'string') {
                        return { text: opt, votes: [], count: 0 };
                    }
                    return { text: opt.text || opt, votes: opt.votes || [], count: opt.count || 0 };
                });
                
                const pollMsg = { 
                    ...data, 
                    options: formattedOptions,
                    type: 'poll' 
                };
                meeting.addMessage(pollMsg);
                io.to(data.meetingId).emit('poll-created', pollMsg);
                console.log('📊 Poll created:', data.question, 'with', formattedOptions.length, 'options');
            }
        });

        socket.on('vote-poll', async (data) => {
            // data: { meetingId, pollId, userId, username, optionIndex }
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                // Update the poll in chat history
                const chatHistory = meeting.getChatHistory();
                const pollIndex = chatHistory.findIndex(msg => msg.id === data.pollId && msg.type === 'poll');
                
                if (pollIndex !== -1) {
                    const poll = chatHistory[pollIndex];
                    
                    // Remove user's vote from all options, then add to selected
                    poll.options = poll.options.map((opt, idx) => {
                        const votes = (opt.votes || []).filter(v => v !== data.userId);
                        if (idx === data.optionIndex) {
                            votes.push(data.userId);
                        }
                        return { ...opt, votes, count: votes.length };
                    });
                    
                    console.log('🗳️ Vote recorded for poll:', data.pollId, 'option:', data.optionIndex);
                }
            }
            
            io.to(data.meetingId).emit('poll-voted', data);
        });

        socket.on('get-chat-history', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                socket.emit('chat-history', { history: meeting.getChatHistory() });
            }
        });

        // --- Speech Transcript ---
        
        socket.on('transcript', async (data) => {
            // data: { meetingId, userId, username, text, isFinal }
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting && data.text && data.text.trim()) {
                meeting.addTranscript(data.userId, data.username, data.text, data.isFinal);
                // Broadcast to other participants for live captions
                socket.to(data.meetingId).emit('transcript-update', {
                    userId: data.userId,
                    username: data.username,
                    text: data.text,
                    isFinal: data.isFinal,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Handle transcription status updates (when user starts/stops transcribing)
        socket.on('transcription-status', (data) => {
            // data: { meetingId, userId, username, isTranscribing }
            socket.to(data.meetingId).emit('transcription-status-update', {
                userId: data.userId,
                username: data.username,
                isTranscribing: data.isTranscribing
            });
            console.log(`🎤 ${data.username} ${data.isTranscribing ? 'started' : 'stopped'} transcription`);
        });

        // Handle request for all users to enable transcription (for captions)
        socket.on('request-transcription', (data) => {
            // data: { meetingId, requestedBy }
            // Broadcast to ALL users in the meeting (including sender for confirmation)
            io.to(data.meetingId).emit('transcription-requested', {
                requestedBy: data.requestedBy,
                timestamp: new Date().toISOString()
            });
            console.log(`📢 ${data.requestedBy} requested transcription for all in meeting ${data.meetingId}`);
        });

        // --- User State Updates ---

        socket.on('toggle-audio', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                meeting.updateParticipant(data.userId, { isAudioMuted: data.isAudioMuted });
                socket.to(data.meetingId).emit('audio-toggled', data);
            }
        });

        socket.on('toggle-video', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                meeting.updateParticipant(data.userId, { isVideoOff: data.isVideoOff });
                socket.to(data.meetingId).emit('video-toggled', data);
            }
        });

        socket.on('raise-hand', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                meeting.updateParticipant(data.userId, { isHandRaised: data.isHandRaised });
                socket.to(data.meetingId).emit('hand-raised', data);
            }
        });

        socket.on('screen-share', async (data) => {
            const meeting = await meetingStore.getMeeting(data.meetingId);
            if (meeting) {
                meeting.updateParticipant(data.userId, { isScreenSharing: data.isScreenSharing });
                socket.to(data.meetingId).emit('screen-share-update', data);
            }
        });

        // --- Host Controls ---

        // Host mutes a participant
        socket.on('host-mute-participant', async (data) => {
            const { meetingId, hostUserId, targetUserId, targetSocketId } = data;
            console.log(`🔇 Host mute request:`, { meetingId, hostUserId, targetUserId, targetSocketId });
            
            const meeting = await meetingStore.getMeeting(meetingId);
            
            if (!meeting) {
                console.log('❌ Meeting not found:', meetingId);
                return;
            }
            
            console.log(`🔍 Meeting host check: meeting.host=${meeting.host}, hostUserId=${hostUserId}, match=${meeting.host === hostUserId}`);
            
            if (meeting.host === hostUserId) {
                console.log(`✅ Host ${hostUserId} muting participant ${targetUserId}`);
                meeting.updateParticipant(targetUserId, { isAudioMuted: true });
                
                // Notify the target user to mute themselves
                io.to(targetSocketId).emit('force-mute', {
                    mutedBy: 'host',
                    message: 'You have been muted by the host'
                });
                
                // Notify all participants about the mute (including the host)
                io.to(meetingId).emit('audio-toggled', {
                    userId: targetUserId,
                    isAudioMuted: true
                });
                
                console.log(`✅ Force mute sent to socket: ${targetSocketId}`);
            } else {
                console.log(`❌ Not authorized: ${hostUserId} is not the host`);
            }
        });

        // Host removes a participant from the meeting
        socket.on('host-kick-participant', async (data) => {
            const { meetingId, hostUserId, targetUserId, targetSocketId, targetUsername } = data;
            console.log(`🚫 Host kick request:`, { meetingId, hostUserId, targetUserId, targetSocketId });
            
            const meeting = await meetingStore.getMeeting(meetingId);
            
            if (!meeting) {
                console.log('❌ Meeting not found:', meetingId);
                return;
            }
            
            console.log(`🔍 Meeting host check: meeting.host=${meeting.host}, hostUserId=${hostUserId}, match=${meeting.host === hostUserId}`);
            
            if (meeting.host === hostUserId) {
                console.log(`✅ Host ${hostUserId} removing participant ${targetUserId} from meeting`);
                
                // Notify the target user they are being removed
                io.to(targetSocketId).emit('kicked-from-meeting', {
                    kickedBy: 'host',
                    message: 'You have been removed from the meeting by the host'
                });
                
                // Force disconnect the target socket from the room
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.leave(meetingId);
                    console.log(`✅ Forced socket ${targetSocketId} to leave room ${meetingId}`);
                }
                
                // Remove participant from meeting
                meeting.removeParticipant(targetUserId);
                
                // Notify all other participants
                io.to(meetingId).emit('user-kicked', {
                    userId: targetUserId,
                    username: targetUsername,
                    socketId: targetSocketId
                });
                
                console.log(`✅ Kick notification sent`);
            } else {
                console.log(`❌ Not authorized: ${hostUserId} is not the host`);
            }
        });
    });
};
