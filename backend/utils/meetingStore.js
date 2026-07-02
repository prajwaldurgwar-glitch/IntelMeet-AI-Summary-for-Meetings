const MeetingModel = require('../models/Meeting');

class InMemoryMeeting {
    constructor(meetingId, host, hostUsername, title) {
        this.meetingId = meetingId;
        this.host = host;
        this.hostUsername = hostUsername;
        this.title = title;
        this.participants = [];
        this.messages = []; // chat history (in-memory)
        this.transcript = []; // speech-to-text transcript
        this.activities = []; // join/leave, screen share, hand raise events
        this.createdAt = new Date();
        this.isActive = true;
    }

    addParticipant(userId, username, socketId) {
        // Remove if already exists (reconnection)
        this.participants = this.participants.filter(p => p.userId !== userId);

        const participant = {
            userId,
            username,
            socketId,
            isAudioMuted: false,
            isVideoOff: false,
            isHandRaised: false,
            isScreenSharing: false,
            joinedAt: new Date()
        };

        this.participants.push(participant);
        
        // Log join activity
        this.addActivity('join', userId, username);
        
        return participant;
    }

    removeParticipant(userId) {
        const participant = this.getParticipant(userId);
        if (participant) {
            // Log leave activity
            this.addActivity('leave', userId, participant.username);
        }
        this.participants = this.participants.filter(p => p.userId !== userId);
    }

    getParticipant(userId) {
        return this.participants.find(p => p.userId === userId);
    }

    updateParticipant(userId, updates) {
        const participant = this.getParticipant(userId);
        if (participant) {
            // Log activity for state changes
            if (updates.isHandRaised !== undefined && updates.isHandRaised !== participant.isHandRaised) {
                this.addActivity(updates.isHandRaised ? 'hand-raise' : 'hand-lower', userId, participant.username);
            }
            if (updates.isScreenSharing !== undefined && updates.isScreenSharing !== participant.isScreenSharing) {
                this.addActivity(updates.isScreenSharing ? 'screen-share-start' : 'screen-share-stop', userId, participant.username);
            }
            if (updates.isAudioMuted !== undefined && updates.isAudioMuted !== participant.isAudioMuted) {
                this.addActivity(updates.isAudioMuted ? 'mute' : 'unmute', userId, participant.username);
            }
            if (updates.isVideoOff !== undefined && updates.isVideoOff !== participant.isVideoOff) {
                this.addActivity(updates.isVideoOff ? 'video-off' : 'video-on', userId, participant.username);
            }
            
            Object.assign(participant, updates);
        }
        return participant;
    }

    addMessage(message) {
        // message: { userId, username, message, type, timestamp, ... }
        this.messages = this.messages || [];
        this.messages.push(message);
        // Keep history bounded to last 500 messages
        if (this.messages.length > 500) this.messages.shift();
    }

    getChatHistory() {
        return this.messages || [];
    }

    // Add transcript entry (speech-to-text)
    addTranscript(userId, username, text, isFinal = true) {
        if (!text || text.trim() === '') return;
        
        this.transcript = this.transcript || [];
        this.transcript.push({
            userId,
            username,
            text: text.trim(),
            isFinal,
            timestamp: new Date().toISOString()
        });
        
        // Keep transcript bounded to last 1000 entries
        if (this.transcript.length > 1000) this.transcript.shift();
    }

    getTranscript() {
        return this.transcript || [];
    }

    // Add activity event
    addActivity(type, userId, username, details = {}) {
        this.activities = this.activities || [];
        this.activities.push({
            type,
            userId,
            username,
            details,
            timestamp: new Date().toISOString()
        });
        
        // Keep activities bounded to last 500 entries
        if (this.activities.length > 500) this.activities.shift();
    }

    getActivities() {
        return this.activities || [];
    }

    // Get all meeting data for summary
    getAllMeetingData() {
        return {
            meetingId: this.meetingId,
            title: this.title,
            host: this.hostUsername,
            participants: this.participants,
            chatMessages: this.getChatHistory(),
            transcript: this.getTranscript(),
            activities: this.getActivities(),
            startTime: this.createdAt,
            isActive: this.isActive
        };
    }
}

class MeetingStore {
    constructor() {
        this.meetings = new Map();
    }

    async getMeeting(meetingId) {
        // 1. Check in-memory
        if (this.meetings.has(meetingId)) {
            return this.meetings.get(meetingId);
        }

        // 2. If not found, check MongoDB (Persistence Fix)
        try {
            console.log(`🔍 Meeting ${meetingId} not in memory, checking DB...`);
            const dbMeeting = await MeetingModel.findOne({ meetingId });

            // Check both isActive field and status field for compatibility
            const isActive = dbMeeting && (dbMeeting.isActive === true || dbMeeting.status === 'active');
            
            if (isActive) {
                console.log(`✅ Meeting ${meetingId} found in DB, restoring to memory.`);

                // Rehydrate InMemoryMeeting from DB data
                // Note: We don't restore active socket connections (those must reconnect)
                // But we restore the meeting structure so users CAN reconnect
                const meeting = new InMemoryMeeting(
                    dbMeeting.meetingId,
                    dbMeeting.host.userId,
                    dbMeeting.host.username,
                    dbMeeting.title
                );

                // Optionally restore participants who haven't "left" if you want to show them as offline
                // For now, we'll start with empty participants as they need to re-join via socket

                this.meetings.set(meetingId, meeting);
                return meeting;
            }
        } catch (error) {
            console.error('❌ Error fetching meeting from DB:', error);
        }

        return null;
    }

    createMeeting(meetingId, host, hostUsername, title) {
        const meeting = new InMemoryMeeting(meetingId, host, hostUsername, title);
        this.meetings.set(meetingId, meeting);
        return meeting;
    }

    removeMeeting(meetingId) {
        this.meetings.delete(meetingId);
    }

    getAllMeetings() {
        return Array.from(this.meetings.values());
    }
}

// Singleton instance
const meetingStore = new MeetingStore();

module.exports = meetingStore;
