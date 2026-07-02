import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import useFaceDetection from '../hooks/useFaceDetection';

const VideoCall = ({ meetingId, username, userId, isHost, onError, setSocket, onStreamChange, appliedSettings, onCleanup, onUserAway, onUserReturn }) => {
  // Debug: Log props on mount
  useEffect(() => {
    console.log('🎬 VideoCall mounted with callbacks:', {
      hasOnUserAway: typeof onUserAway,
      hasOnUserReturn: typeof onUserReturn
    });
  }, []);

  // Media States
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [screenStream, setScreenStream] = useState(null);

  // Control States
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // UI States
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [participants, setParticipants] = useState([]);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [showParticipants, setShowParticipants] = useState(false);
  
  // Layout modes: 'grid' | 'speaker' | 'pin' | 'stage'
  // Layout is FROZEN - only changes when user manually clicks the button
  const [layoutMode, setLayoutMode] = useState('grid');
  const [pinnedUser, setPinnedUser] = useState(null);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  
  // Speech-to-Text States
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');

  // Show transcription reminder modal at meeting start
  const [showTranscribeReminder, setShowTranscribeReminder] = useState(true);
  
  // Host notification popup state
  const [hostNotification, setHostNotification] = useState(null);
  
  // Host confirmation dialog state
  const [hostConfirmDialog, setHostConfirmDialog] = useState(null);
  
  // Presence toast notification
  const [presenceToast, setPresenceToast] = useState(null);
  
  // Fullscreen state
  const [fullscreenUser, setFullscreenUser] = useState(null);
  
  // Ref to track if layout has been initialized (prevents initial flicker)
  const layoutInitialized = useRef(true);
  
  // Speech recognition ref
  const recognitionRef = useRef(null);
  const shouldTranscribeRef = useRef(false); // Track if we WANT to be transcribing
  const restartTimeoutRef = useRef(null); // For restart delay
  const isAudioMutedRef = useRef(false); // Track mute state for speech recognition

  // Refs
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnections = useRef(new Map());
  const remoteVideoRefs = useRef(new Map());
  const pendingPeers = useRef(new Set());
  const pendingOffers = useRef(new Set()); // Track pending offers to prevent duplicates
  const pendingIceCandidates = useRef(new Map()); // Queue ICE candidates before remote description
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const DEFAULT_RTC_CONFIGURATION = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };
  const rtcConfigurationRef = useRef(DEFAULT_RTC_CONFIGURATION);

  // Initialize connection
  useEffect(() => {
    let isMounted = true;
    const start = async () => {
      await initializeConnection();
    };
    start();

    // Expose cleanup function to parent component
    if (onCleanup && typeof onCleanup === 'function') {
      onCleanup(cleanup);
    }

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [meetingId, username, userId]);

  // CRITICAL: Synchronize localStreamRef with localStream state
  // This ensures event handlers always have access to the current stream
  useEffect(() => {
    if (localStream) {
      console.log('🔄 Syncing localStreamRef with localStream state');
      localStreamRef.current = localStream;
    }
  }, [localStream]);

  // When localStream becomes available, process any pending peer creations
  useEffect(() => {
    if (localStream && pendingPeers.current.size > 0) {
      console.log('📬 Processing pending peers:', Array.from(pendingPeers.current));
      pendingPeers.current.forEach(remoteId => {
        if (!peerConnections.current.has(remoteId)) {
          const localId = socketRef.current?.id || '';
          const shouldInitiate = localId < remoteId;
          createPeerConnection(remoteId, shouldInitiate);
          if (shouldInitiate) {
            setTimeout(() => {
              console.log('⏰ pendingPeers: sending offer to', remoteId);
              createOffer(remoteId, false);
            }, 1500);
          }
        }
      });
      pendingPeers.current.clear();
    }
  }, [localStream]);

  // Apply visual settings (e.g., mirror) to local video element
  useEffect(() => {
    try {
      const mirror = appliedSettings?.mirrorVideo;
      if (localVideoRef.current) {
        localVideoRef.current.style.transform = mirror ? 'scaleX(-1)' : 'none';
      }
    } catch (e) {
      // ignore
    }
  }, [appliedSettings, localStream]);

  // Apply audio output volume to all remote video elements
  useEffect(() => {
    if (appliedSettings?.audioOutputVolume !== undefined) {
      const volume = appliedSettings.audioOutputVolume / 100;
      console.log(`🔊 Applying audio output volume: ${appliedSettings.audioOutputVolume}%`);

      // Update all remote video elements
      remoteVideoRefs.current.forEach((videoElement) => {
        if (videoElement) {
          videoElement.volume = volume;
        }
      });
    }
  }, [appliedSettings?.audioOutputVolume]);

  // Clean up orphan streams when participants change
  useEffect(() => {
    const participantSocketIds = new Set(participants.map(p => p.socketId));
    const mySocketId = socketRef.current?.id;
    
    // Check for orphan streams (streams without matching participant)
    remoteStreams.forEach((stream, socketId) => {
      if (socketId !== mySocketId && !participantSocketIds.has(socketId)) {
        console.log('🧹 Cleaning up orphan stream for disconnected user:', socketId);
        cleanupPeerConnection(socketId);
      }
    });
  }, [participants]);

  // Camera-based Face Detection for Smart Presence / Away Detection
  // Detects when user's face is not visible in camera (they walked away from screen)
  // Enhanced v2.0 with better detection and real-time metrics
  const { 
    isAway: isFaceAway, 
    faceDetected, 
    isDetecting: isFaceDetecting,
    detectionMetrics,
    resetBaseline
  } = useFaceDetection({
    videoRef: localVideoRef,
    enabled: !!localStream && !isVideoOff && !isScreenSharing, // Disable during screen sharing
    awayThreshold: 4000, // 4 seconds without presence = away (faster response)
    detectionInterval: 1500, // Check every 1.5 seconds (more responsive)
    onAway: onUserAway,
    onReturn: onUserReturn,
    debugMode: false // Set to false for production
  });

  // Track previous away state for toast logic
  const wasAwayRef = useRef(false);

  // Show toast when presence status changes
  useEffect(() => {
    if (!isFaceDetecting) return;
    
    if (isFaceAway && !wasAwayRef.current) {
      // Just went away
      wasAwayRef.current = true;
      setPresenceToast({
        type: 'away',
        icon: '🚶',
        message: 'You appear to be away from screen',
        subtext: 'Speech-to-text will be saved for you'
      });
      // Auto-dismiss after 4 seconds
      const timer = setTimeout(() => setPresenceToast(null), 4000);
      return () => clearTimeout(timer);
    } else if (!isFaceAway && wasAwayRef.current && faceDetected) {
      // Just came back
      wasAwayRef.current = false;
      setPresenceToast({
        type: 'present',
        icon: '👋',
        message: 'Welcome back!',
        subtext: 'Presence detected'
      });
      // Auto-dismiss after 3 seconds
      const timer = setTimeout(() => setPresenceToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [isFaceAway, faceDetected, isFaceDetecting]);

  const initializeConnection = async () => {
    try {
      setConnectionStatus('connecting');
      await loadRtcConfiguration();
      await initializeMedia();
      
      // Production-ready socket URL configuration
      const getSocketUrl = () => {
        if (process.env.REACT_APP_SOCKET_URL) {
          return process.env.REACT_APP_SOCKET_URL;
        }
        const { protocol, hostname } = window.location;
        return `${protocol}//${hostname}:5000`;
      };
      
      const socketBase = getSocketUrl();

      socketRef.current = io(socketBase, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: maxReconnectAttempts,
        timeout: 20000
      });

      if (setSocket && typeof setSocket === 'function') {
        setSocket(socketRef.current);
      }

      setupSocketListeners();
      socketRef.current.emit('join-meeting', {
        meetingId,
        userId: userId,
        username,
        deviceInfo: getDeviceInfo()
      });
    } catch (error) {
      setConnectionStatus('failed');
      onError?.('Failed to initialize connection: ' + error.message);
    }
  };

  const loadRtcConfiguration = async () => {
    const getBackendBase = () => {
      if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL.replace(/\/+$/, '');
      }
      const { protocol, hostname } = window.location;
      return `${protocol}//${hostname}:5000`;
    };

    try {
      const baseUrl = getBackendBase();
      const response = await fetch(
        `${baseUrl}/api/webrtc/ice-config?meetingId=${encodeURIComponent(meetingId)}&userId=${encodeURIComponent(userId || '')}`
      );

      if (!response.ok) {
        throw new Error(`ICE config request failed: ${response.status}`);
      }

      const data = await response.json();
      if (data?.success && data?.rtcConfiguration?.iceServers?.length) {
        rtcConfigurationRef.current = {
          ...DEFAULT_RTC_CONFIGURATION,
          ...data.rtcConfiguration
        };
        console.log('✅ Loaded ICE config from backend:', rtcConfigurationRef.current.iceServers.length, 'servers');
        return;
      }

      throw new Error('Invalid ICE config payload from backend');
    } catch (error) {
      rtcConfigurationRef.current = DEFAULT_RTC_CONFIGURATION;
      console.warn('⚠️ Falling back to default STUN-only ICE config:', error.message);
    }
  };

  const initializeMedia = async () => {
    try {
      console.log('🎯 Requesting media permissions...');

      // First try to get audio and video together
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (videoAudioError) {
        console.warn('Failed to get video+audio, trying video only:', videoAudioError);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: constraints.video,
            audio: false
          });
        } catch (videoError) {
          console.warn('Failed to get video, trying audio only:', videoError);
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: constraints.audio
          });
        }
      }

      setLocalStream(stream);
      // store a ref to the stream so event handlers have access without stale closures
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Expose stream to parent (for Settings)
      if (onStreamChange && typeof onStreamChange === 'function') {
        onStreamChange(stream);
      }

      console.log('✅ Local media initialized');
      console.log('📹 Video tracks:', stream.getVideoTracks().length);
      console.log('🎤 Audio tracks:', stream.getAudioTracks().length);

      // Set initial mute states based on actual track states
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      if (audioTracks.length > 0) {
        setIsAudioMuted(!audioTracks[0].enabled);
      }
      if (videoTracks.length > 0) {
        setIsVideoOff(!videoTracks[0].enabled);
      }

    } catch (error) {
      console.error('❌ Media access error:', error);

      let errorMessage = 'Failed to access media devices';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera/Microphone permission denied. Please allow access and refresh.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found. Please connect a device.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera/Microphone is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'Cannot satisfy the requested media constraints.';
      }

      onError?.(errorMessage);
      throw error;
    }
  };

  const setupSocketListeners = () => {
    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      console.log('🌐 Connected to:', socket.io.uri);
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    });

    socket.on('disconnect', (reason) => {
      setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('connect_error', () => {
      reconnectAttempts.current++;

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        setConnectionStatus('failed');
        onError?.('Failed to connect to server. Please refresh and try again.');
      } else {
        setConnectionStatus('reconnecting');
      }
    });

    socket.on('reconnect', () => {
      setConnectionStatus('connected');

      if (meetingId && username) {
        socket.emit('join-meeting', {
          meetingId,
          userId: userId,
          username,
          deviceInfo: getDeviceInfo()
        });
      }
    });

    socket.on('joined-meeting', (data) => {
      const seenUserIds = new Set();
      seenUserIds.add(userId);
      
      const deduplicatedParticipants = data.participants.filter(p => {
        if (!p.userId || seenUserIds.has(p.userId)) {
          return false;
        }
        seenUserIds.add(p.userId);
        return true;
      });

      const allParticipants = [
        {
          socketId: socket.id,
          odersID: `user-${userId}`,
          userId: userId,
          username: username,
          isAudioMuted: false,
          isVideoOff: false,
          isHandRaised: false,
          isScreenSharing: false
        },
        ...deduplicatedParticipants.map(p => ({
          ...p,
          odersID: `user-${p.userId}`
        }))
      ];

      setParticipants(allParticipants);
      setConnectionStatus('joined');

      // Create peer connections to all existing users.
      // Use deterministic initiation: the peer with the lexicographically smaller socketId will initiate the offer.
      const currentLocalStream = localStreamRef.current;
      if (currentLocalStream) {
        const localId = socket.id;
        console.log('🔍 joined-meeting debug: localSocketId=', localId, 'localStream=', !!currentLocalStream, 'existingPCs=', peerConnections.current.size);
        data.participants.forEach(participant => {
          const remoteId = participant.socketId;
          console.log('  participant debug:', participant);
          if (!remoteId) {
            console.log('    -> skipping participant (no socketId yet)');
            return;
          }
          if (remoteId === localId) {
            console.log('    -> skipping participant (same as local)');
            return;
          }
          const hasPc = peerConnections.current.has(remoteId);
          const shouldInitiate = localId < remoteId; // deterministic tie-breaker
          console.log(`    -> remoteId=${remoteId} hasPc=${hasPc} shouldInitiate=${shouldInitiate}`);
          if (!hasPc) {
            createPeerConnection(remoteId, shouldInitiate);
            if (shouldInitiate) {
              // Delay to ensure pc is set up and tracks are added
              setTimeout(() => {
                console.log('⏰ joined-meeting: sending offer to', remoteId);
                createOffer(remoteId, false);
              }, 1500);
            }
          }
        });
      }
    });

    socket.on('user-joined', (data) => {
      console.log('🚀 User joined:', data.username, 'socketId:', data.socketId);

      // Check if this user is already in our list
      setParticipants(prev => {
        const existingByUser = prev.find(p => p.userId === data.userId);

        if (existingByUser) {
          console.log('♻️ User re-joined (refresh/reconnect):', data.username);

          // If they have a different socket ID, it's a reconnection
          if (existingByUser.socketId !== data.socketId) {
            console.log('  -> Cleaning up old session:', existingByUser.socketId);
            // Clean up the old connection
            cleanupPeerConnection(existingByUser.socketId);

            // Remove old participant and add new one
            const filtered = prev.filter(p => p.userId !== data.userId);
            return [...filtered, {
              socketId: data.socketId,
              userId: data.userId,
              username: data.username,
              isAudioMuted: false,
              isVideoOff: false,
              isHandRaised: false,
              isScreenSharing: false
            }];
          } else {
            console.log('  -> Same socket ID, ignoring duplicate event');
            return prev;
          }
        }

        console.log('✅ Adding new participant:', data.username);
        return [...prev, {
          socketId: data.socketId,
          userId: data.userId,
          username: data.username,
          isAudioMuted: false,
          isVideoOff: false,
          isHandRaised: false,
          isScreenSharing: false
        }];
      });

      // Deterministic initiator: compare socket ids
      const localId = socket.id;
      const remoteId = data.socketId;
      const currentLocalStream = localStreamRef.current;

      console.log('🔍 user-joined debug: localSocketId=', localId, 'remoteSocketId=', remoteId);

      if (!remoteId || remoteId === localId) return;

      // Always check if we need to create a NEW connection for this socketId
      // (Even if we had one for this UserID before, this is a new SocketID)
      const hasPc = peerConnections.current.has(remoteId);
      const shouldInitiate = localId < remoteId;

      if (currentLocalStream && !hasPc) {
        createPeerConnection(remoteId, shouldInitiate);
        if (shouldInitiate) {
          setTimeout(() => {
            console.log('⏰ user-joined: sending offer to', remoteId);
            createOffer(remoteId, false);
          }, 1500);
        }
      }
    });

    socket.on('user-left', (data) => {
      console.log('👋 User left:', data.username);
      handleUserDisconnected(data.socketId);
    });

    socket.on('user-disconnected', (data) => {
      console.log('💔 User disconnected:', data.username);
      handleUserDisconnected(data.socketId);
    });

    // WebRTC signaling
    socket.on('offer', async (data) => {
      console.log('📨 Received offer from:', data.sender);
      await handleOffer(data.offer, data.sender);
    });

    socket.on('answer', async (data) => {
      console.log('📨 Received answer from:', data.sender);
      await handleAnswer(data.answer, data.sender);
    });

    socket.on('ice-candidate', async (data) => {
      console.log('🧊 Received ICE candidate from:', data.sender);
      await handleIceCandidate(data.candidate, data.sender);
    });

    // Participant state updates
    socket.on('audio-toggled', (data) => {
      updateParticipantState(data.userId, { isAudioMuted: data.isAudioMuted });
    });

    socket.on('video-toggled', (data) => {
      updateParticipantState(data.userId, { isVideoOff: data.isVideoOff });
    });

    socket.on('hand-raised', (data) => {
      updateParticipantState(data.userId, {
        isHandRaised: data.isHandRaised
      });
    });

    socket.on('screen-share-update', (data) => {
      updateParticipantState(data.userId, { isScreenSharing: data.isScreenSharing });
    });

    // Host controls - when host mutes you
    socket.on('force-mute', (data) => {
      console.log('🔇 Force mute received from host:', data);
      // Mute local audio
      if (localStreamRef.current) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        console.log('🔇 Muting audio tracks:', audioTracks.length);
        audioTracks.forEach(track => {
          track.enabled = false;
        });
        setIsAudioMuted(true);
        isAudioMutedRef.current = true;
        
        // Also emit toggle-audio to update state for everyone
        socket.emit('toggle-audio', {
          meetingId,
          userId: userId,
          isAudioMuted: true
        });
      }
      // Show styled notification popup
      setHostNotification({
        type: 'muted',
        title: 'You have been muted',
        message: 'The host has muted your microphone. You can unmute yourself anytime.',
        icon: 'fa-microphone-slash'
      });
    });

    // Host controls - when host kicks you from meeting
    socket.on('kicked-from-meeting', (data) => {
      console.log('🚫 Kicked from meeting received:', data);
      // Show styled notification popup
      setHostNotification({
        type: 'kicked',
        title: 'Removed from meeting',
        message: 'You have been removed from this meeting by the host.',
        icon: 'fa-user-times',
        onClose: () => window.location.reload()
      });
    });

    // When another participant is kicked
    socket.on('user-kicked', (data) => {
      console.log('👢 User kicked from meeting:', data.username);
      handleUserDisconnected(data.socketId);
    });

    // Error handling
    socket.on('error', (data) => {
      console.error('❌ Socket error:', data);
      onError?.(data.message || 'An error occurred');
    });
  };

  const createPeerConnection = (socketId, isInitiator) => {
    console.log('🔗 Creating peer connection:', socketId, '| Initiator:', isInitiator);

    try {
      // Close existing connection if any
      const existingPc = peerConnections.current.get(socketId);
      if (existingPc) {
        existingPc.close();
      }

      const peerConnection = new RTCPeerConnection({
        ...rtcConfigurationRef.current,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });
      peerConnections.current.set(socketId, peerConnection);

      // Add local tracks if available
      const currentLocalStream = localStreamRef.current;
      if (currentLocalStream) {
        const tracks = currentLocalStream.getTracks();
        console.log('📤 Adding local tracks to peer connection:', tracks.length);
        tracks.forEach(track => {
          if (track.kind === 'audio' || track.kind === 'video') {
            peerConnection.addTrack(track, currentLocalStream);
            console.log('✅ Added local', track.kind, 'track | enabled:', track.enabled, '| readyState:', track.readyState);
          }
        });
      } else {
        console.warn('⚠️ No local stream available when creating peer connection for:', socketId);
      }

      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log('🎬 Remote track received from:', socketId);
        const [remoteStream] = event.streams;

        if (remoteStream) {
          console.log('✅ Remote stream:', remoteStream.id);
          console.log('   Video tracks:', remoteStream.getVideoTracks().length);
          console.log('   Audio tracks:', remoteStream.getAudioTracks().length);
          
          // Log track states for debugging
          remoteStream.getTracks().forEach(track => {
            console.log(`   Track ${track.kind}: ${track.readyState}, enabled: ${track.enabled}`);
          });

          setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.set(socketId, remoteStream);
            return newMap;
          });

          // Let React's ref callback (setRemoteVideoRef) handle video element assignment
          // This prevents race conditions and duplicate srcObject assignments
        }
      };

      // ICE candidate handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 ICE candidate generated for:', socketId, '| Type:', event.candidate.type);
          if (socketRef.current) {
            socketRef.current.emit('ice-candidate', {
              target: socketId,
              candidate: event.candidate
            });
          }
        } else {
          console.log('🧊 ICE gathering completed for:', socketId);
        }
      };

      // Connection state monitoring
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`📊 Connection state [${socketId}]:`, state);

        if (state === 'connected') {
          setConnectionQuality('good');
          console.log('✅ Peer connection established successfully:', socketId);
          reconnectAttempts.current = 0; // Reset reconnect attempts on success
        } else if (state === 'connecting') {
          setConnectionQuality('fair');
          console.log('⏳ Connection is being established:', socketId);
        } else if (state === 'disconnected') {
          setConnectionQuality('poor');
          console.warn('⚠️ Connection disconnected, ICE is trying to reconnect automatically:', socketId);
          // Don't do anything - let ICE reconnect automatically
          // WebRTC will try to reconnect on its own
        } else if (state === 'failed') {
          setConnectionQuality('poor');
          console.error('❌ Connection failed:', socketId);
          console.log('🔄 Attempting connection recovery with ICE restart...');
          
          // Try ICE restart for failed connections - critical for NAT/firewall issues
          setTimeout(() => {
            const pc = peerConnections.current.get(socketId);
            if (pc && pc.connectionState === 'failed') {
              console.log('🔄 Recreating connection for:', socketId);
              
              // Cleanup and recreate
              cleanupPeerConnection(socketId);
              
              // Recreate with proper initiator check
              const localId = socketRef.current?.id;
              if (localId && socketRef.current?.connected) {
                const shouldInitiate = localId < socketId;
                const newPc = createPeerConnection(socketId, shouldInitiate);
                
                if (shouldInitiate && newPc) {
                  setTimeout(() => {
                    console.log('📤 Sending new offer after connection failure');
                    createOffer(socketId, true); // ICE restart flag
                  }, 1000);
                }
              }
            }
          }, 2000);
        }
      };

      // Negotiation needed - handle renegotiation and prevent glare
      peerConnection.onnegotiationneeded = async () => {
        console.log('🔄 Negotiation needed for:', socketId);
        
        // Only initiate if we're the designated initiator and connection is stable
        if (isInitiator && peerConnection.signalingState === 'stable') {
          console.log('📤 Initiating renegotiation...');
          // Small delay to batch multiple track changes
          setTimeout(async () => {
            if (peerConnection.signalingState === 'stable') {
              await createOffer(socketId, false);
            }
          }, 100);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.log(`🧊 ICE state [${socketId}]:`, iceState);
        
        if (iceState === 'checking') {
          console.log('🔍 ICE is checking connectivity:', socketId);
        } else if (iceState === 'connected') {
          console.log('✅ ICE connection established:', socketId);
        } else if (iceState === 'completed') {
          console.log('✅ ICE gathering completed:', socketId);
        } else if (iceState === 'failed') {
          console.error('❌ ICE connection failed - may need TURN relay:', socketId);
        } else if (iceState === 'disconnected') {
          console.warn('⚠️ ICE disconnected - trying to reconnect:', socketId);
        }
      };

      // Monitor ICE gathering for debugging
      peerConnection.onicegatheringstatechange = () => {
        console.log(`🧊 ICE gathering state [${socketId}]:`, peerConnection.iceGatheringState);
        if (peerConnection.iceGatheringState === 'complete') {
          console.log('✅ All ICE candidates gathered for:', socketId);
        }
      };

      peerConnection.onnegotiationneeded = async () => {
        console.log('🔄 Negotiation needed for:', socketId);
        if (isInitiator) {
          await createOffer(socketId);
        }
      };

      // Create offer if initiator - delay to ensure tracks are fully added
      if (isInitiator) {
        setTimeout(() => {
          console.log('⏰ Sending initial offer to:', socketId);
          createOffer(socketId, false);
        }, 1500); // Longer delay for stability
      }

      return peerConnection;

    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
    }
  };

  const createOffer = async (socketId, iceRestart = false) => {
    // Prevent duplicate offers
    if (pendingOffers.current.has(socketId)) {
      console.log('⏳ Offer already pending for:', socketId);
      return;
    }
    
    const pc = peerConnections.current.get(socketId);
    if (!pc) {
      console.error('❌ No peer connection for offer:', socketId);
      return;
    }

    // Check signaling state - only create offer if stable
    if (pc.signalingState !== 'stable') {
      console.log('⏳ Signaling state not stable, skipping offer:', pc.signalingState);
      return;
    }

    try {
      pendingOffers.current.add(socketId);
      console.log('📤 Creating offer for:', socketId, iceRestart ? '(with ICE restart)' : '');
      
      // Verify we have tracks
      const senders = pc.getSenders();
      console.log('📤 Senders:', senders.length, '| Receivers:', pc.getReceivers().length);
      
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: iceRestart // Enable ICE restart for connection recovery
      });

      await pc.setLocalDescription(offer);

      socketRef.current.emit('offer', {
        target: socketId,
        offer: offer
      });

      console.log('✅ Offer sent to:', socketId);

    } catch (error) {
      console.error('❌ Error creating offer:', error);
    } finally {
      pendingOffers.current.delete(socketId);
    }
  };

  const handleOffer = async (offer, senderId) => {
    console.log('📨 Processing offer from:', senderId);

    let pc = peerConnections.current.get(senderId);
    
    // If we have an existing connection, check state
    if (pc) {
      console.log('📊 Existing PC state:', pc.signalingState, '| connection:', pc.connectionState);
      
      // Handle glare (both sides sent offers) - use polite/impolite pattern
      if (pc.signalingState === 'have-local-offer') {
        const localId = socketRef.current?.id;
        // Lower socketId is "polite" and rolls back
        if (localId && localId < senderId) {
          console.log('🤝 Glare detected - rolling back our offer (polite peer)');
          await pc.setLocalDescription({type: 'rollback'});
        } else {
          console.log('🤝 Glare detected - ignoring their offer (impolite peer)');
          return;
        }
      }
      
      // If in conflicting state, recreate
      if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
        console.log('⚠️ Existing PC in conflicting state:', pc.signalingState, '- recreating');
        cleanupPeerConnection(senderId);
        pc = null;
      }
    }
    
    if (!pc) {
      pc = createPeerConnection(senderId, false);
    }

    if (!pc) {
      console.error('❌ Failed to create peer connection for offer');
      return;
    }

    try {
      // Only set remote description if we're in a valid state
      if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Process any queued ICE candidates now that we have remote description
        await processQueuedIceCandidates(senderId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current.emit('answer', {
          target: senderId,
          answer: answer
        });

        console.log('✅ Answer sent to:', senderId);
      } else {
        console.warn('⚠️ Cannot process offer in state:', pc.signalingState);
      }
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      // On error, cleanup and let the other peer retry
      cleanupPeerConnection(senderId);
    }
  };

  const handleAnswer = async (answer, senderId) => {
    const pc = peerConnections.current.get(senderId);
    if (!pc) {
      console.error('❌ No peer connection for answer:', senderId);
      return;
    }

    try {
      // Only accept answer if we're waiting for one
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Answer processed from:', senderId);
        
        // Process any queued ICE candidates now that we have remote description
        await processQueuedIceCandidates(senderId);
      } else {
        console.warn('⚠️ Ignoring answer - not in have-local-offer state:', pc.signalingState);
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      // If answer fails, we might need to renegotiate
      if (pc.signalingState !== 'stable') {
        console.log('🔄 Resetting connection due to answer error');
        cleanupPeerConnection(senderId);
      }
    }
  };

  const handleIceCandidate = async (candidate, senderId) => {
    const pc = peerConnections.current.get(senderId);
    if (!pc) {
      // Queue candidate for later - PC may be created soon
      console.log('⏳ Queuing ICE candidate (no PC yet):', senderId);
      if (!pendingIceCandidates.current.has(senderId)) {
        pendingIceCandidates.current.set(senderId, []);
      }
      pendingIceCandidates.current.get(senderId).push(candidate);
      return;
    }

    try {
      // Only add ICE candidate if remote description is set
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ ICE candidate added for:', senderId);
      } else {
        // Queue candidate until remote description is set
        console.log('⏳ Queuing ICE candidate (no remote desc):', senderId);
        if (!pendingIceCandidates.current.has(senderId)) {
          pendingIceCandidates.current.set(senderId, []);
        }
        pendingIceCandidates.current.get(senderId).push(candidate);
      }
    } catch (error) {
      // Ignore errors for candidates that arrive at wrong time
      if (error.name !== 'InvalidStateError' && error.name !== 'OperationError') {
        console.error('❌ Error adding ICE candidate:', error);
      }
    }
  };

  // Process queued ICE candidates after remote description is set
  const processQueuedIceCandidates = async (socketId) => {
    const pc = peerConnections.current.get(socketId);
    const candidates = pendingIceCandidates.current.get(socketId);
    
    if (!pc || !candidates || candidates.length === 0) return;
    
    console.log(`🧊 Processing ${candidates.length} queued ICE candidates for:`, socketId);
    
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('⚠️ Failed to add queued ICE candidate:', e.message);
      }
    }
    
    pendingIceCandidates.current.delete(socketId);
  };

  const toggleAudio = useCallback((forceMute = null) => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const newMutedState = forceMute !== null ? forceMute : !isAudioMuted;
        audioTracks.forEach(track => {
          track.enabled = !newMutedState;
        });
        setIsAudioMuted(newMutedState);
        isAudioMutedRef.current = newMutedState; // Update ref for speech recognition
        
        // Clear current transcript display when muted
        if (newMutedState) {
          setCurrentTranscript('');
        }

        socketRef.current?.emit('toggle-audio', {
          meetingId,
          userId: userId,
          isAudioMuted: newMutedState
        });
      }
    }
  }, [localStream, isAudioMuted, meetingId, userId]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const newVideoState = !videoTracks[0].enabled;
        videoTracks.forEach(track => {
          track.enabled = newVideoState;
        });
        setIsVideoOff(!newVideoState);

        socketRef.current?.emit('toggle-video', {
          meetingId,
          userId: userId,
          isVideoOff: !newVideoState
        });
      }
    }
  }, [localStream, meetingId, userId]);

  const toggleScreenShare = async () => {
    // Check if user is on mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Show notification for mobile users
      setHostNotification({
        type: 'info',
        title: 'Screen Sharing Not Available',
        message: 'Screen sharing is not supported on mobile devices. Please use a desktop or laptop computer to share your screen.',
        icon: '📱'
      });
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => setHostNotification(null), 5000);
      return;
    }
    
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor',
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });

        const screenTrack = stream.getVideoTracks()[0];
        if (!screenTrack) {
          console.error('❌ No video track in screen stream');
          return;
        }

        // Store the screen stream
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Show screen in the screen share video element
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }

        // Also show in local video for self-preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Replace video tracks in all peer connections
        peerConnections.current.forEach((pc, socketId) => {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack)
              .then(() => console.log('✅ Replaced video track for screen sharing:', socketId))
              .catch(err => console.error('❌ Failed to replace track:', err));
          } else {
            // No video sender exists, add the track
            pc.addTrack(screenTrack, stream);
            console.log('➕ Added screen track to peer:', socketId);
          }
        });

        // Update localStreamRef for new peers
        localStreamRef.current = stream;
        console.log('🔄 Updated localStreamRef for screen share');

        // Handle screen share end (user clicks stop in browser)
        screenTrack.onended = () => {
          console.log('🛑 Screen share ended by user');
          stopScreenShare();
        };

        socketRef.current?.emit('screen-share', {
          meetingId,
          userId: userId,
          isScreenSharing: true
        });

      } else {
        stopScreenShare();
      }
    } catch (error) {
      console.error('❌ Screen share error:', error);
      if (error.name !== 'NotAllowedError') {
        onError?.('Failed to share screen: ' + error.message);
      }
    }
  };

  const stopScreenShare = async () => {
    console.log('🛑 Stopping screen share...');
    
    // Stop screen stream tracks
    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Stopped screen track:', track.kind);
      });
      setScreenStream(null);
    }

    setIsScreenSharing(false);

    // Restore camera
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        },
        audio: false
      });

      const cameraTrack = cameraStream.getVideoTracks()[0];
      
      // Create a combined stream with existing audio + new camera
      const audioTracks = localStream?.getAudioTracks() || [];
      const combinedStream = new MediaStream([...audioTracks, cameraTrack]);
      
      setLocalStream(combinedStream);
      localStreamRef.current = combinedStream;
      console.log('🔄 Updated localStreamRef after camera restore');
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = combinedStream;
      }

      // Replace screen share track with camera track in all peer connections
      peerConnections.current.forEach((pc, socketId) => {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender && cameraTrack) {
          videoSender.replaceTrack(cameraTrack)
            .then(() => console.log('✅ Restored camera track:', socketId))
            .catch(err => console.error('❌ Failed to restore camera track:', err));
        }
      });

    } catch (error) {
      console.error('❌ Failed to restore camera:', error);
      // Even if camera fails, still show video off state
      setIsVideoOff(true);
    }

    socketRef.current?.emit('screen-share', {
      meetingId,
      userId: userId,
      isScreenSharing: false
    });
  };

  const toggleHandRaise = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);

    socketRef.current?.emit('raise-hand', {
      meetingId,
      userId: userId,
      isHandRaised: newState
    });
  };

  // Host controls - mute a participant
  const hostMuteParticipant = (participant) => {
    if (!isHost) {
      console.log('❌ Cannot mute: not a host');
      return;
    }
    
    console.log('🔇 Host wants to mute participant:', participant.username);
    
    // Show confirmation dialog
    setHostConfirmDialog({
      type: 'mute',
      title: 'Mute Participant',
      message: `Are you sure you want to mute ${participant.username}?`,
      icon: 'fa-microphone-slash',
      participant: participant,
      onConfirm: () => {
        socketRef.current?.emit('host-mute-participant', {
          meetingId,
          hostUserId: userId,
          targetUserId: participant.userId,
          targetSocketId: participant.socketId
        });
        console.log('✅ Mute request sent');
        setHostConfirmDialog(null);
      }
    });
  };

  // Host controls - remove a participant from meeting
  const hostKickParticipant = (participant) => {
    if (!isHost) {
      console.log('❌ Cannot kick: not a host');
      return;
    }
    
    console.log('🚫 Host wants to kick participant:', participant.username);
    
    // Show confirmation dialog
    setHostConfirmDialog({
      type: 'kick',
      title: 'Remove Participant',
      message: `Are you sure you want to remove ${participant.username} from this meeting?`,
      icon: 'fa-user-times',
      participant: participant,
      onConfirm: () => {
        socketRef.current?.emit('host-kick-participant', {
          meetingId,
          hostUserId: userId,
          targetUserId: participant.userId,
          targetSocketId: participant.socketId,
          targetUsername: participant.username
        });
        console.log('✅ Kick request sent');
        setHostConfirmDialog(null);
      }
    });
  };

  const cleanupPeerConnection = (socketId) => {
    console.log('🧹 Cleaning up peer connection for:', socketId);
    
    // Clear pending offers
    pendingOffers.current.delete(socketId);
    pendingIceCandidates.current.delete(socketId); // Clean up queued ICE candidates
    
    const pc = peerConnections.current.get(socketId);
    if (pc) {
      // Remove all event handlers before closing
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
      peerConnections.current.delete(socketId);
    }

    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      if (newMap.has(socketId)) {
        // Stop all tracks in the stream before removing
        const stream = newMap.get(socketId);
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        newMap.delete(socketId);
        return newMap;
      }
      return prev;
    });

    // Also remove from remoteVideoRefs
    if (remoteVideoRefs.current.has(socketId)) {
      const videoEl = remoteVideoRefs.current.get(socketId);
      if (videoEl) {
        videoEl.srcObject = null;
      }
      remoteVideoRefs.current.delete(socketId);
    }

    if (pinnedUser === socketId) {
      // Don't auto-switch layout when pinned user disconnects
      // Just clear the pinned user, keep layout mode
      setPinnedUser(null);
    }
  };

  // FIXED: Manual layout switching functions - no auto-switching
  const switchLayout = useCallback((mode) => {
    setLayoutMode(mode);
    setShowLayoutMenu(false);
    // Clear pin when switching to grid mode
    if (mode === 'grid') {
      setPinnedUser(null);
    }
  }, []);

  const toggleLayoutMenu = useCallback(() => {
    setShowLayoutMenu(prev => !prev);
  }, []);

  // Get layout display info
  const getLayoutInfo = useCallback(() => {
    switch (layoutMode) {
      case 'grid': return { icon: 'th', label: 'Grid View' };
      case 'speaker': return { icon: 'user-tie', label: 'Speaker View' };
      case 'pin': return { icon: 'thumbtack', label: 'Pin View' };
      case 'stage': return { icon: 'desktop', label: 'Stage View' };
      default: return { icon: 'th', label: 'Grid View' };
    }
  }, [layoutMode]);

  // Toggle fullscreen for a video
  const toggleFullscreen = useCallback((userId) => {
    if (fullscreenUser === userId) {
      setFullscreenUser(null);
    } else {
      setFullscreenUser(userId);
    }
  }, [fullscreenUser]);

  // Close fullscreen on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && fullscreenUser) {
        setFullscreenUser(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [fullscreenUser]);

  // FIXED: Memoize participants - include video/audio/hand state in dependencies
  const stableParticipants = useMemo(() => participants, [
    participants.length, 
    participants.map(p => `${p.socketId}-${p.isVideoOff}-${p.isAudioMuted}-${p.isHandRaised}`).join(',')
  ]);;

  const handleUserDisconnected = (socketId) => {
    cleanupPeerConnection(socketId);
    setParticipants(prev => prev.filter(p => p.socketId !== socketId));
  };

  const updateParticipantState = (userId, updates) => {
    setParticipants(prev => prev.map(p =>
      p.userId === userId ? { ...p, ...updates } : p
    ));
  };

  const setRemoteVideoRef = (socketId, element) => {
    if (element) {
      remoteVideoRefs.current.set(socketId, element);

      const stream = remoteStreams.get(socketId);
      if (stream) {
        // Only update srcObject if it's different to prevent AbortError
        if (element.srcObject !== stream) {
          console.log('🎥 Ref callback: Assigning stream to video element for:', socketId);
          element.srcObject = stream;
          
          // Use a promise to handle play properly
          const playPromise = element.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              // Only log if it's not an AbortError (which is expected during cleanup)
              if (e.name !== 'AbortError') {
                console.warn('⚠️ Video play failed:', e.name, '- retrying...');
                // Single retry after delay
                setTimeout(() => {
                  element.play().catch(() => {});
                }, 300);
              }
            });
          }
        } else {
          console.log('🎥 Stream already assigned for:', socketId);
        }
      }
    } else {
      remoteVideoRefs.current.delete(socketId);
    }
  };

  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    return {
      browser: getBrowser(ua),
      os: getOS(ua),
      device: /Mobi|Android/i.test(ua) ? 'mobile' : 'desktop',
      userAgent: ua
    };
  };

  const getBrowser = (ua) => {
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  };

  const getOS = (ua) => {
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  };

  // ==================== SPEECH-TO-TEXT FUNCTIONS ====================
  
  // Check if browser supports Speech Recognition
  const isSpeechRecognitionSupported = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  };

  // Restart speech recognition with delay
  const restartRecognition = useCallback(() => {
    if (!shouldTranscribeRef.current) return;
    
    // Clear any existing restart timeout
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    
    // Restart after a short delay to avoid rapid restart loops
    restartTimeoutRef.current = setTimeout(() => {
      if (!shouldTranscribeRef.current) return;
      
      try {
        if (recognitionRef.current) {
          recognitionRef.current.start();
          console.log('🔄 Speech recognition restarted');
        }
      } catch (e) {
        // If start fails (already running), ignore
        if (e.message && !e.message.includes('already started')) {
          console.warn('Failed to restart speech recognition:', e);
          // Try again after a longer delay
          restartTimeoutRef.current = setTimeout(() => {
            if (shouldTranscribeRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (err) {
                console.error('Second restart attempt failed:', err);
              }
            }
          }, 2000);
        }
      }
    }, 300);
  }, []);

  // Initialize speech recognition
  const initSpeechRecognition = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      console.warn('⚠️ Speech Recognition not supported in this browser');
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      console.log('🎤 Speech recognition started');
      setIsTranscribing(true);
    };
    
    recognition.onend = () => {
      console.log('🎤 Speech recognition ended');
      setIsTranscribing(false);
      
      // Auto-restart if we should still be transcribing
      if (shouldTranscribeRef.current) {
        restartRecognition();
      }
    };
    
    recognition.onerror = (event) => {
      console.error('🎤 Speech recognition error:', event.error);
      
      // Handle different error types
      switch (event.error) {
        case 'no-speech':
          // Normal - no speech detected, will auto-restart via onend
          console.log('No speech detected, waiting...');
          break;
        case 'aborted':
          // User or system aborted - restart if needed
          if (shouldTranscribeRef.current) {
            restartRecognition();
          }
          break;
        case 'audio-capture':
          // Microphone issue
          console.error('Microphone not available');
          shouldTranscribeRef.current = false;
          setIsTranscribing(false);
          break;
        case 'not-allowed':
          // Permission denied
          console.error('Microphone permission denied');
          shouldTranscribeRef.current = false;
          setIsTranscribing(false);
          break;
        case 'network':
          // Network error - retry after delay
          console.warn('Network error, will retry...');
          if (shouldTranscribeRef.current) {
            setTimeout(restartRecognition, 1000);
          }
          break;
        default:
          // Other errors - try to restart
          if (shouldTranscribeRef.current) {
            restartRecognition();
          }
      }
    };
    
    recognition.onresult = (event) => {
      // Don't process or send transcripts when muted
      if (isAudioMutedRef.current) {
        return;
      }
      
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Update current transcript display (only if not muted)
      setCurrentTranscript(interimTranscript || finalTranscript);
      
      // Send final transcript to server (only if not muted)
      if (finalTranscript && socketRef.current) {
        socketRef.current.emit('transcript', {
          meetingId,
          userId,
          username,
          text: finalTranscript,
          isFinal: true
        });
        console.log('📝 Sent transcript:', finalTranscript);
      }
    };
    
    return recognition;
  }, [meetingId, userId, username, restartRecognition]);

  // Toggle speech recognition
  const toggleTranscription = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    if (shouldTranscribeRef.current || isTranscribing) {
      // Stop transcription
      shouldTranscribeRef.current = false;
      
      // Clear any restart timeout
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore stop errors
        }
        recognitionRef.current = null;
      }
      setIsTranscribing(false);
      setCurrentTranscript('');
      
      // Notify others that this user stopped transcription
      if (socketRef.current) {
        socketRef.current.emit('transcription-status', {
          meetingId,
          userId,
          username,
          isTranscribing: false
        });
      }
    } else {
      // Start transcription
      shouldTranscribeRef.current = true;
      
      const recognition = initSpeechRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        try {
          recognition.start();
          
          // Notify others that this user started transcription
          if (socketRef.current) {
            socketRef.current.emit('transcription-status', {
              meetingId,
              userId,
              username,
              isTranscribing: true
            });
          }
        } catch (e) {
          console.error('Failed to start speech recognition:', e);
          shouldTranscribeRef.current = false;
        }
      }
    }
  }, [isTranscribing, initSpeechRecognition, meetingId, userId, username]);

  // Start transcription silently (for auto-enable feature)
  const startTranscriptionSilently = useCallback(() => {
    if (shouldTranscribeRef.current || isTranscribing || !isSpeechRecognitionSupported()) return;
    
    shouldTranscribeRef.current = true;
    
    const recognition = initSpeechRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      try {
        recognition.start();
        console.log('🎤 Auto-started transcription');
      } catch (e) {
        console.error('Failed to auto-start speech recognition:', e);
        shouldTranscribeRef.current = false;
      }
    }
  }, [isTranscribing, initSpeechRecognition]);

  // Listen for transcription requests from other users
  useEffect(() => {
    if (!socketRef.current) return;
    
    // Handle request from another user to enable transcription
    const handleTranscriptionRequest = (data) => {
      console.log(`📢 ${data.requestedBy} requested everyone to enable transcription`);
      
      // Auto-enable transcription if supported and not already running
      if (!isTranscribing && isSpeechRecognitionSupported()) {
        startTranscriptionSilently();
      }
    };
    
    socketRef.current.on('transcription-requested', handleTranscriptionRequest);
    
    return () => {
      if (socketRef.current) {
        socketRef.current.off('transcription-requested', handleTranscriptionRequest);
      }
    };
  }, [isTranscribing, startTranscriptionSilently, connectionStatus]);

  // Handle page visibility changes - restart transcription when returning to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldTranscribeRef.current) {
        // Page became visible - check if recognition needs restart
        console.log('👁️ Page visible - checking transcription status');
        
        // Small delay to let browser settle
        setTimeout(() => {
          if (shouldTranscribeRef.current && !isTranscribing) {
            console.log('🔄 Restarting transcription after visibility change');
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                // If already running, that's fine
                if (!e.message?.includes('already started')) {
                  // Reinitialize if needed
                  const recognition = initSpeechRecognition();
                  if (recognition) {
                    recognitionRef.current = recognition;
                    try {
                      recognition.start();
                    } catch (err) {
                      console.warn('Failed to restart transcription:', err);
                    }
                  }
                }
              }
            } else {
              // No recognition ref - reinitialize
              const recognition = initSpeechRecognition();
              if (recognition) {
                recognitionRef.current = recognition;
                try {
                  recognition.start();
                } catch (err) {
                  console.warn('Failed to start transcription:', err);
                }
              }
            }
          }
        }, 500);
      }
    };

    // Also handle window focus for modal interactions
    const handleFocus = () => {
      if (shouldTranscribeRef.current && !isTranscribing) {
        console.log('🔄 Window focused - checking transcription');
        setTimeout(() => {
          if (shouldTranscribeRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Ignore if already running
            }
          }
        }, 300);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isTranscribing, initSpeechRecognition]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      shouldTranscribeRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const cleanup = () => {
    console.log('🧹 Cleaning up all media and connections...');
    
    // Stop speech recognition
    shouldTranscribeRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }

    // Stop local stream tracks (use ref to avoid stale closure)
    if (localStreamRef.current) {
      console.log('🎥 Stopping local stream tracks...');
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`   Stopping track: ${track.kind} (${track.label})`);
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Also stop from state if different
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
      });
    }

    // Stop screen share stream
    if (screenStream) {
      console.log('🖥️ Stopping screen share tracks...');
      screenStream.getTracks().forEach(track => track.stop());
    }

    // Close all peer connections
    peerConnections.current.forEach((pc, socketId) => {
      console.log(`🔌 Closing peer connection: ${socketId}`);
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
    });
    peerConnections.current.clear();

    // Clear remote streams
    remoteStreams.forEach((stream, socketId) => {
      stream.getTracks().forEach(track => track.stop());
    });

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.emit('leave-meeting', {
        meetingId,
        userId: userId
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Clear video element srcObject
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    console.log('✅ Cleanup complete - camera and audio released');
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
      case 'joined':
        return '#48bb78';
      case 'connecting':
      case 'reconnecting':
        return '#ed8936';
      case 'disconnected':
      case 'failed':
        return '#f56565';
      default:
        return '#718096';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
      case 'joined':
        return `Connected • ${participants.length} participant${participants.length !== 1 ? 's' : ''}`;
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected - Reconnecting...';
      case 'failed':
        return 'Connection Failed';
      default:
        return 'Initializing...';
    }
  };

  // FIXED: Memoized render function to prevent unnecessary re-renders
  const renderRemoteVideos = useCallback(() => {
    const mySocketId = socketRef.current?.id;
    
    return Array.from(remoteStreams.entries())
      .filter(([socketId, stream]) => {
        // Filter out self
        if (socketId === mySocketId) {
          return false;
        }
        
        // Filter out streams without any tracks
        if (!stream || stream.getTracks().length === 0) {
          return false;
        }
        
        // Filter out if no matching participant (disconnected user)
        const participant = stableParticipants.find(p => p.socketId === socketId);
        if (!participant) {
          return false;
        }
        
        return true;
      })
      .map(([socketId, stream]) => {
        const participant = stableParticipants.find(p => p.socketId === socketId);
        const videoTracks = stream.getVideoTracks();
        const hasVideo = videoTracks.length > 0 &&
          videoTracks[0].readyState === 'live' &&
          videoTracks[0].enabled &&
          !participant?.isVideoOff;

        return (
          <div
            key={`remote-${socketId}`}
            className={`video-item remote-video ${pinnedUser === socketId ? 'pinned' : ''}`}
            onDoubleClick={() => toggleFullscreen(socketId)}
          >
            <video
              ref={(el) => {
                setRemoteVideoRef(socketId, el);
                // Apply audio output volume from settings
                if (el && appliedSettings?.audioOutputVolume !== undefined) {
                  el.volume = appliedSettings.audioOutputVolume / 100;
                }
              }}
              autoPlay
              playsInline
              muted={false}
              className={!hasVideo ? 'hidden' : ''}
            />
            {!hasVideo && (
              <div className="video-off-placeholder">
                <i className="fas fa-user-circle"></i>
                <span>{participant?.username || 'Participant'}</span>
              </div>
            )}
            {/* Prominent Hand Raised Indicator */}
            {participant?.isHandRaised && (
              <div className="hand-raised-indicator">
                <i className="fas fa-hand-paper"></i>
                <span>Hand Raised</span>
              </div>
            )}
            <div className="video-overlay">
              <span className="username">{participant?.username || 'Participant'}</span>
              <div className="status-icons">
                {participant?.isAudioMuted && <i className="fas fa-microphone-slash"></i>}
                {participant?.isScreenSharing && <i className="fas fa-desktop"></i>}
              </div>
            </div>
            <div className="video-actions">
              <button
                className="action-btn"
                onClick={() => setPinnedUser(pinnedUser === socketId ? null : socketId)}
              >
                <i className={`fas fa-thumbtack ${pinnedUser === socketId ? 'pinned' : ''}`}></i>
              </button>
              <button
                className="action-btn"
                onClick={() => toggleFullscreen(socketId)}
              >
                <i className="fas fa-expand"></i>
              </button>
            </div>
          </div>
        );
      });
  }, [remoteStreams, stableParticipants, pinnedUser, appliedSettings?.audioOutputVolume, toggleFullscreen]);

  return (
    <div className="video-call-container">
      <div className="connection-status" style={{
        backgroundColor: `${getConnectionStatusColor()}22`,
        borderLeft: `4px solid ${getConnectionStatusColor()}`
      }}>
        <span className="status-indicator" style={{ color: getConnectionStatusColor() }}>●</span>
        <span>{getConnectionStatusText()}</span>
        {connectionQuality !== 'good' && connectionStatus === 'joined' && (
          <span className="quality-indicator">⚠️ {connectionQuality} connection</span>
        )}
      </div>

      <div className={`video-grid ${layoutMode}-view ${pinnedUser ? 'has-pinned' : ''}`}>
        {/* Local Video */}
        <div 
          className={`video-item local-video ${pinnedUser === 'local' ? 'pinned' : ''}`}
          onDoubleClick={() => toggleFullscreen('local')}
        >
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={isVideoOff ? 'hidden' : ''}
          />
          {isVideoOff && (
            <div className="video-off-placeholder">
              <i className="fas fa-user-circle"></i>
              <span>{username}</span>
            </div>
          )}
          {/* Prominent Hand Raised Indicator */}
          {isHandRaised && (
            <div className="hand-raised-indicator">
              <i className="fas fa-hand-paper"></i>
              <span>Hand Raised</span>
            </div>
          )}
          {/* Smart Presence Detection Indicator */}
          {!isVideoOff && (
            <div className={`presence-indicator ${isFaceAway ? 'away' : 'present'} ${faceDetected ? 'detected' : 'not-detected'}`}>
              <div className="presence-status">
                <div className={`presence-dot ${faceDetected ? 'pulse' : 'fade'}`}></div>
                <span className="presence-text">
                  {isFaceAway ? '🚶 Away' : faceDetected ? '👤 Present' : '🔍 Detecting...'}
                </span>
              </div>
              {/* Confidence meter */}
              <div className="presence-meter">
                <div 
                  className="presence-meter-fill" 
                  style={{ width: `${detectionMetrics.confidence || 0}%` }}
                ></div>
              </div>
              {/* Debug Info (Hidden in production, visible on hover) */}
              <div className="presence-debug" style={{ fontSize: '9px', opacity: 0.7, marginTop: '2px' }}>
                ML Conf: {detectionMetrics.confidence || 0}% | Faces: {detectionMetrics.faceCount || 0}
              </div>
            </div>
          )}
          <div className="video-overlay">
            <span className="username">{username} (You)</span>
            <div className="status-icons">
              {isAudioMuted && <i className="fas fa-microphone-slash"></i>}
              {isVideoOff && <i className="fas fa-video-slash"></i>}
              {isScreenSharing && <i className="fas fa-desktop"></i>}
            </div>
          </div>
          <div className="video-actions">
            <button
              className="action-btn"
              onClick={() => setPinnedUser(pinnedUser === 'local' ? null : 'local')}
            >
              <i className={`fas fa-thumbtack ${pinnedUser === 'local' ? 'pinned' : ''}`}></i>
            </button>
            <button
              className="action-btn"
              onClick={() => toggleFullscreen('local')}
            >
              <i className="fas fa-expand"></i>
            </button>
          </div>
        </div>

        {/* Screen Share */}
        {isScreenSharing && screenStream && (
          <div className="video-item screen-share">
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted={true}
            />
            <div className="video-overlay">
              <span className="username">
                <i className="fas fa-desktop"></i> {username}'s Screen
              </span>
            </div>
          </div>
        )}

        {/* Remote Videos */}
        {renderRemoteVideos()}

        {/* Empty State */}
        {remoteStreams.size === 0 && connectionStatus === 'joined' && (
          <div className="empty-state">
            <i className="fas fa-users"></i>
            <h3>Waiting for others to join...</h3>
            <p>Share the meeting ID: <strong>{meetingId}</strong></p>
            <p>Participants will appear here when they join</p>
          </div>
        )}

        {/* Fullscreen Video Overlay */}
        {fullscreenUser && (
          <div className="fullscreen-overlay" onClick={() => setFullscreenUser(null)}>
            <div className="fullscreen-video-container" onClick={(e) => e.stopPropagation()}>
              {fullscreenUser === 'local' ? (
                <>
                  <video
                    ref={(el) => {
                      if (el && localStream) {
                        el.srcObject = localStream;
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    className={isVideoOff ? 'hidden' : ''}
                  />
                  {isVideoOff && (
                    <div className="video-off-placeholder">
                      <i className="fas fa-user-circle"></i>
                      <span>{username}</span>
                    </div>
                  )}
                  <div className="fullscreen-username">{username} (You)</div>
                </>
              ) : (
                (() => {
                  const stream = remoteStreams.get(fullscreenUser);
                  const participant = participants.find(p => p.socketId === fullscreenUser);
                  const hasVideo = stream && stream.getVideoTracks().length > 0 && !participant?.isVideoOff;
                  return (
                    <>
                      <video
                        ref={(el) => {
                          if (el && stream) {
                            el.srcObject = stream;
                          }
                        }}
                        autoPlay
                        playsInline
                        className={!hasVideo ? 'hidden' : ''}
                      />
                      {!hasVideo && (
                        <div className="video-off-placeholder">
                          <i className="fas fa-user-circle"></i>
                          <span>{participant?.username || 'Participant'}</span>
                        </div>
                      )}
                      <div className="fullscreen-username">{participant?.username || 'Participant'}</div>
                    </>
                  );
                })()
              )}
              <button className="fullscreen-close" onClick={() => setFullscreenUser(null)}>
                <i className="fas fa-compress"></i>
              </button>
            </div>
          </div>
        )}

        {/* Transcribe Reminder Popup */}
        {showTranscribeReminder && (
          <div className="transcribe-reminder-popup">
            <span>Click <b>Transcribe</b> for meeting summaries</span>
            <button onClick={() => setShowTranscribeReminder(false)}>OK</button>
          </div>
        )}

        {/* Host Action Notification Popup */}
        {hostNotification && (
          <div className="host-notification-overlay">
            <div className={`host-notification-popup ${hostNotification.type}`}>
              <div className="host-notification-icon">
                <i className={`fas ${hostNotification.icon}`}></i>
              </div>
              <h3>{hostNotification.title}</h3>
              <p>{hostNotification.message}</p>
              <button 
                className="host-notification-btn"
                onClick={() => {
                  if (hostNotification.onClose) {
                    hostNotification.onClose();
                  }
                  setHostNotification(null);
                }}
              >
                {hostNotification.type === 'kicked' ? 'Leave Meeting' : 'OK'}
              </button>
            </div>
          </div>
        )}

        {/* Host Confirmation Dialog */}
        {hostConfirmDialog && (
          <div className="host-notification-overlay">
            <div className={`host-confirm-dialog ${hostConfirmDialog.type}`}>
              <div className="host-confirm-icon">
                <i className={`fas ${hostConfirmDialog.icon}`}></i>
              </div>
              <h3>{hostConfirmDialog.title}</h3>
              <p>{hostConfirmDialog.message}</p>
              <div className="host-confirm-buttons">
                <button 
                  className="host-confirm-btn cancel"
                  onClick={() => setHostConfirmDialog(null)}
                >
                  Cancel
                </button>
                <button 
                  className={`host-confirm-btn confirm ${hostConfirmDialog.type}`}
                  onClick={hostConfirmDialog.onConfirm}
                >
                  {hostConfirmDialog.type === 'kick' ? 'Remove' : 'Mute'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Smart Presence Toast Notification */}
        {presenceToast && (
          <div className={`presence-toast ${presenceToast.type}`}>
            <span className="presence-toast-icon">{presenceToast.icon}</span>
            <div className="presence-toast-content">
              <span className="presence-toast-message">{presenceToast.message}</span>
              <span className="presence-toast-subtext">{presenceToast.subtext}</span>
            </div>
            <button 
              className="presence-toast-close"
              onClick={() => setPresenceToast(null)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* Transcription Status Indicator */}
        {isTranscribing && (
          <div className="transcription-indicator">
            <i className="fas fa-circle recording-dot"></i>
            <span>Transcribing...</span>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div className="video-controls">
        <button
          className={`control-btn ${isAudioMuted ? 'active danger' : ''}`}
          onClick={() => toggleAudio()}
        >
          <i className={`fas fa-${isAudioMuted ? 'microphone-slash' : 'microphone'}`}></i>
          <span>{isAudioMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          className={`control-btn ${isVideoOff ? 'active danger' : ''}`}
          onClick={toggleVideo}
        >
          <i className={`fas fa-${isVideoOff ? 'video-slash' : 'video'}`}></i>
          <span>{isVideoOff ? 'Start Video' : 'Stop Video'}</span>
        </button>

        <button
          className={`control-btn ${isScreenSharing ? 'active warning' : ''}`}
          onClick={toggleScreenShare}
        >
          <i className="fas fa-desktop"></i>
          <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>

        <button
          className={`control-btn ${isHandRaised ? 'active warning' : ''}`}
          onClick={toggleHandRaise}
        >
          <i className="fas fa-hand-paper"></i>
          <span>{isHandRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>

        {/* Transcription Button */}
        <button
          className={`control-btn ${isTranscribing ? 'active transcribing' : ''}`}
          onClick={toggleTranscription}
        >
          <i className={`fas fa-${isTranscribing ? 'microphone-alt' : 'microphone-alt-slash'}`}></i>
          <span>{isTranscribing ? 'Stop Transcribing' : 'Transcribe'}</span>
        </button>

        <button
          className={`control-btn ${showParticipants ? 'active' : ''}`}
          onClick={() => setShowParticipants(!showParticipants)}
        >
          <i className="fas fa-users"></i>
          <span>Participants ({participants.length})</span>
        </button>

        <div className="layout-menu-container">
          <button
            className={`control-btn ${showLayoutMenu ? 'active' : ''}`}
            onClick={toggleLayoutMenu}
          >
            <i className={`fas fa-${getLayoutInfo().icon}`}></i>
            <span>{getLayoutInfo().label}</span>
            <i className="fas fa-chevron-up layout-arrow"></i>
          </button>
          
          {showLayoutMenu && (
            <div className="layout-dropdown">
              <button
                className={`layout-option ${layoutMode === 'grid' ? 'active' : ''}`}
                onClick={() => switchLayout('grid')}
              >
                <i className="fas fa-th"></i>
                <div className="layout-option-info">
                  <span className="layout-option-title">Grid View</span>
                  <span className="layout-option-desc">Equal size for all participants</span>
                </div>
                {layoutMode === 'grid' && <i className="fas fa-check"></i>}
              </button>
              
              <button
                className={`layout-option ${layoutMode === 'speaker' ? 'active' : ''}`}
                onClick={() => switchLayout('speaker')}
              >
                <i className="fas fa-user-tie"></i>
                <div className="layout-option-info">
                  <span className="layout-option-title">Speaker View</span>
                  <span className="layout-option-desc">Active speaker is highlighted</span>
                </div>
                {layoutMode === 'speaker' && <i className="fas fa-check"></i>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Participants Panel */}
      {showParticipants && (
        <div className="participants-panel">
          <div className="panel-header">
            <h3>Participants ({participants.length}) {isHost && <span style={{fontSize: '0.7rem', color: '#4facfe'}}>(Host Controls)</span>}</h3>
            <button onClick={() => setShowParticipants(false)} title="Close panel">
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="participants-list">
            {participants.map(p => (
              <div key={p.userId || p.socketId} className="participant-item">
                <div className="participant-info">
                  <i className="fas fa-user-circle"></i>
                  <span>{p.username} {p.userId === userId ? '(You)' : ''}</span>
                </div>
                <div className="participant-status">
                  {p.isAudioMuted && <i className="fas fa-microphone-slash text-danger" title="Muted"></i>}
                  {p.isVideoOff && <i className="fas fa-video-slash text-danger" title="Camera off"></i>}
                  {p.isHandRaised && <i className="fas fa-hand-paper text-warning" title="Hand raised"></i>}
                  {p.isScreenSharing && <i className="fas fa-desktop text-warning" title="Screen sharing"></i>}
                </div>
                {/* Host Controls - only show for host and not for themselves */}
                {isHost && p.userId !== userId && (
                  <div className="host-controls">
                    {!p.isAudioMuted && (
                      <button 
                        className="host-control-btn" 
                        onClick={() => hostMuteParticipant(p)}
                        title="Mute participant"
                      >
                        <i className="fas fa-microphone-slash"></i>
                      </button>
                    )}
                    <button 
                      className="host-control-btn danger" 
                      onClick={() => hostKickParticipant(p)}
                      title="Remove from meeting"
                    >
                      <i className="fas fa-user-times"></i>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug Panel - Only in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-panel">
          <button
            className="debug-toggle"
            onClick={() => {
              const panel = document.querySelector('.debug-info');
              panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            }}
            title="Debug information"
          >
            <i className="fas fa-bug"></i>
          </button>
          <div className="debug-info" style={{ display: 'none' }}>
            <h4>Debug Information</h4>
            <div className="debug-row">
              <strong>Meeting ID:</strong>
              <span>{meetingId}</span>
            </div>
            <div className="debug-row">
              <strong>User ID:</strong>
              <span>{userId}</span>
            </div>
            <div className="debug-row">
              <strong>Local Stream:</strong>
              <span>{localStream ? '✅ Active' : '❌ Inactive'}</span>
            </div>
            <div className="debug-row">
              <strong>Screen Share:</strong>
              <span>{screenStream ? '✅ Active' : '❌ Inactive'}</span>
            </div>
            <div className="debug-row">
              <strong>Remote Streams:</strong>
              <span>{remoteStreams.size}</span>
            </div>
            <div className="debug-row">
              <strong>Peer Connections:</strong>
              <span>{peerConnections.current.size}</span>
            </div>
            <div className="debug-row">
              <strong>Connection Status:</strong>
              <span>{connectionStatus}</span>
            </div>
            <div className="debug-row">
              <strong>Connection Quality:</strong>
              <span>{connectionQuality}</span>
            </div>
            <div className="debug-row">
              <strong>Participants:</strong>
              <span>{participants.length}</span>
            </div>
            <button
              className="debug-btn"
              onClick={() => {
                console.log('=== FULL DEBUG INFO ===');
                console.log('Socket:', socketRef.current);
                console.log('Local Stream:', localStream);
                console.log('Remote Streams:', Array.from(remoteStreams.entries()));
                console.log('Peer Connections:', Array.from(peerConnections.current.entries()));
                console.log('Participants:', participants);
                console.log('States:', {
                  connectionStatus,
                  connectionQuality,
                  isAudioMuted,
                  isVideoOff,
                  isScreenSharing,
                  isHandRaised
                });
              }}
            >
              Log Full Debug
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCall;