import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

import VideoCall from './components/VideoCall';
import Chat from './components/Chat';
import Settings from './components/Settings';
import ConfirmModal from './components/ConfirmModal';
import MeetingSummary from './components/MeetingSummary';
import MissedSpeech from './components/MissedSpeech';
import { ThemeSwitch } from './components/ui/theme-switch-button';

// Production-ready backend URL configuration
// Set REACT_APP_API_URL in .env or deployment platform
const getBackendUrl = () => {
  // Use environment variable if set (recommended for production)
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/+$/, '');
  }
  
  // Fallback: assume backend is on same host, port 5000
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5000`;
};

function App() {
  // Chat & Settings UI State
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [videoCallSocket, setVideoCallSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [appliedSettings, setAppliedSettings] = useState({});

  // Meeting States
  const [apiBase] = useState(() => getBackendUrl());

  const [meetingState, setMeetingState] = useState('lobby');
  const [meetingId, setMeetingId] = useState('');
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinMeetingId, setJoinMeetingId] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [showMeetingCredentials, setShowMeetingCredentials] = useState(false);
  const [createdMeetingId, setCreatedMeetingId] = useState('');
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const videoCallCleanupRef = React.useRef(null);

  // Missed Speech / Away Detection States
  const [showMissedSpeech, setShowMissedSpeech] = useState(false);
  const [missedSpeechData, setMissedSpeechData] = useState({ transcripts: [], awayDuration: 0 });
  const missedTranscriptsRef = useRef([]);
  const isAwayRef = useRef(false);

  // Camera-based face detection callbacks - triggered by VideoCall component
  const handleUserAway = useCallback(() => {
    if (meetingState !== 'joined') return;
    
    isAwayRef.current = true;
    missedTranscriptsRef.current = [];
    
    // Request others to start transcribing
    if (videoCallSocket) {
      videoCallSocket.emit('request-transcription', {
        meetingId: meetingId,
        requestedBy: username
      });
    }
  }, [meetingState, videoCallSocket, meetingId, username]);

  // When camera detects user has returned (face visible again)
  const handleUserReturn = useCallback(({ awayDuration }) => {
    if (!isAwayRef.current || meetingState !== 'joined') {
      isAwayRef.current = false;
      return;
    }
    
    setMissedSpeechData({
      transcripts: [...missedTranscriptsRef.current],
      awayDuration
    });
    setShowMissedSpeech(true);
    
    isAwayRef.current = false;
    missedTranscriptsRef.current = [];
  }, [meetingState]);

  // Generate unique user ID on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem('intelmeet_userId');
    if (storedUserId) {
      setUserId(storedUserId);
    } else {
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      setUserId(newUserId);
      localStorage.setItem('intelmeet_userId', newUserId);
    }
  }, []);

  // Apply initial theme on mount
  useEffect(() => {
    const savedTheme =
      localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const darkMode = savedTheme === 'dark';

    document.documentElement.classList.toggle('dark', darkMode);
    if (darkMode) {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
    }
  }, []);

  // Listen for speech transcripts when user is away
  useEffect(() => {
    if (!videoCallSocket || meetingState !== 'joined') return;

    const handleTranscript = (data) => {
      if (isAwayRef.current && data.userId !== userId && data.isFinal) {
        missedTranscriptsRef.current.push({
          speakerId: data.userId,
          speakerName: data.username,
          text: data.text || '',
          timestamp: data.timestamp || new Date().toISOString()
        });
      }
    };

    videoCallSocket.on('transcript-update', handleTranscript);
    return () => videoCallSocket.off('transcript-update', handleTranscript);
  }, [videoCallSocket, meetingState, userId]);

  // Handle summarize missed speech
  const handleSummarizeMissedSpeech = async (transcripts) => {
    try {
      const response = await fetch(`${apiBase}/api/summary/missed-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcripts }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.summary;
      } else {
        throw new Error(data.message || 'Failed to generate summary');
      }
    } catch (error) {
      console.error('Error summarizing missed messages:', error);
      throw error;
    }
  };

  // Close missed speech popup
  const handleCloseMissedSpeech = () => {
    setShowMissedSpeech(false);
    missedTranscriptsRef.current = [];
  };

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Show error
  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(''), 5000);
  };

  // Handle create meeting
  const openCreateModal = () => {
    setShowCreateModal(true);
    setCreateUsername('');
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setError('');
  };

  const handleCreateMeeting = async (e) => {
    if (e) e.preventDefault();

    if (!createUsername.trim()) {
      showError('Please enter your name');
      return;
    }

    try {
      setIsLoading(true);

      const meetingData = {
        host: userId,
        hostUsername: createUsername.trim(),
        title: `${createUsername.trim()}'s Meeting`
      };

      const response = await fetch(`${apiBase}/api/meetings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meetingData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setCreatedMeetingId(data.meetingId);
        
        // Store host credentials for rejoining
        localStorage.setItem(`host_${data.meetingId}`, JSON.stringify({
          meetingId: data.meetingId,
          userId: userId,
          timestamp: Date.now()
        }));
        
        setShowCreateModal(false);
        setShowMeetingCredentials(true);
        setCreateUsername('');
      } else {
        throw new Error(data.message || 'Failed to create meeting');
      }
    } catch (error) {
      showError(error.message || 'Failed to create meeting. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle join meeting modal
  const openJoinModal = () => {
    setShowJoinModal(true);
    setJoinMeetingId('');
    setJoinUsername('');
  };

  const closeJoinModal = () => {
    setShowJoinModal(false);
    setError('');
  };

  // Handle join meeting submission
  const handleJoinSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!joinMeetingId.trim()) {
      showError('Please enter a meeting ID');
      return;
    }

    if (!joinUsername.trim()) {
      showError('Please enter your name');
      return;
    }

    try {
      setIsLoading(true);

      // Check if meeting exists
      const checkResponse = await fetch(`${apiBase}/api/meetings/${joinMeetingId.trim()}`);

      if (!checkResponse.ok) {
        throw new Error('Meeting not found');
      }

      const checkData = await checkResponse.json();

      if (!checkData.success) {
        throw new Error(checkData.message || 'Meeting not found');
      }

      // Check if this user is the host
      let joiningAsHost = checkData.meeting?.host === userId;
      
      // Check stored host credentials
      const storedHostCred = localStorage.getItem(`host_${joinMeetingId}`);
      if (storedHostCred && !joiningAsHost) {
        try {
          const { userId: storedUserId, timestamp } = JSON.parse(storedHostCred);
          const isValid = (Date.now() - timestamp) < (24 * 60 * 60 * 1000);
          if (isValid && storedUserId === userId) {
            joiningAsHost = true;
          } else if (!isValid) {
            localStorage.removeItem(`host_${joinMeetingId}`);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      // Join the meeting
      const joinResponse = await fetch(`${apiBase}/api/meetings/${joinMeetingId.trim()}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          username: joinUsername.trim(),
          deviceInfo: {
            browser: navigator.userAgent,
            platform: navigator.platform,
            userAgent: navigator.userAgent
          }
        }),
      });

      const joinData = await joinResponse.json();

      if (joinData.success) {
        if (joinData.waitingRoom) {
          showNotification('Added to waiting room. Awaiting host approval...', 'info');
          return;
        }

        setMeetingId(joinMeetingId.trim());
        setUsername(joinUsername.trim());
        setIsHost(joiningAsHost);
        setMeetingState('joined');
        setShowJoinModal(false);
        showNotification('Joined meeting successfully!', 'success');
      } else {
        throw new Error(joinData.message || 'Failed to join meeting');
      }
    } catch (error) {
      showError(error.message || 'Failed to join meeting. Please check the meeting ID.');
    } finally {
      setIsLoading(false);
    }
  };

  // Quick join with Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleJoinSubmit();
    }
  };

  // Handle leave meeting
  const handleLeaveMeeting = () => {
    setShowConfirmLeave(true);
  };

  const cancelLeaveMeeting = () => {
    setShowConfirmLeave(false);
  };

  const confirmLeaveMeeting = async () => {
    try {
      // Stop camera and audio immediately
      if (videoCallCleanupRef.current) {
        videoCallCleanupRef.current();
        videoCallCleanupRef.current = null;
      }

      if (isHost) {
        await fetch(`${apiBase}/api/meetings/${meetingId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } else {
        await fetch(`${apiBase}/api/meetings/${meetingId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      }
    } catch (error) {
      // Silently handle errors when leaving
    } finally {
      // Reset state
      setMeetingState('lobby');
      setMeetingId('');
      setUsername('');
      setIsHost(false);
      setShowConfirmLeave(false);
      setLocalStream(null); // Clear local stream reference
      setVideoCallSocket(null); // Clear socket reference
      showNotification('Left meeting', 'info');
    }
  };  // Handle video call error
  const handleVideoCallError = (errorMessage) => {
    showError(errorMessage);
  };

  // Copy meeting ID to clipboard
  const copyMeetingId = () => {
    navigator.clipboard.writeText(meetingId).then(() => {
      showNotification('Meeting ID copied to clipboard!', 'success');
    }).catch(() => {
      showError('Failed to copy meeting ID');
    });
  };

  // Render loading overlay
  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner"></div>
        <div className="loading-text">
          {meetingState === 'lobby' ? 'Setting up meeting...' : 'Please wait...'}
        </div>
      </div>
    );
  }

  // Render lobby
  if (meetingState === 'lobby') {
    return (
      <div className="app-container">
        <div className="lobby-container">
          {/* Starfield animation background */}
          <div className="starfield" aria-hidden="true">
            <div className="stars-layer stars-small"></div>
            <div className="stars-layer stars-medium"></div>
            <div className="stars-layer stars-large"></div>
          </div>
          <div className="lobby-card">
            <div className="lobby-theme-switch-wrap">
              <ThemeSwitch className="lobby-theme-switch" />
            </div>

            {/* Brand Panel */}
            <div className="lobby-brand-panel">
              <div className="brand-icon">
                <i className="fas fa-brain"></i>
              </div>
              <h1>IntelMeet</h1>
              <p className="lobby-tagline">AI Summary for Meetings</p>
              <ul className="lobby-highlight-list">
                <li><i className="fas fa-video"></i> HD video conferencing, built in</li>
                <li><i className="fas fa-file-alt"></i> Automatic AI-generated meeting summaries</li>
                <li><i className="fas fa-comments"></i> Live chat that never leaves anyone behind</li>
                <li><i className="fas fa-eye"></i> Smart away-detection recaps what you missed</li>
              </ul>
            </div>

            {/* Form Panel */}
            <div className="lobby-form-panel">
              <div className="lobby-header">
                <h1 style={{ fontSize: '1.6rem' }}>Get Started</h1>
                <p>Create or join a meeting in seconds</p>
              </div>

              <div className="lobby-actions">
                <button
                  className="btn-primary"
                  onClick={openCreateModal}
                  disabled={isLoading}
                >
                  <i className="fas fa-plus-circle"></i>
                  Create New Meeting
                </button>

                <button
                  className="btn-secondary"
                  onClick={openJoinModal}
                  disabled={isLoading}
                >
                  <i className="fas fa-sign-in-alt"></i>
                  Join Meeting
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Join Meeting Modal */}
        {showJoinModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Join Meeting</h3>
                <button className="modal-close" onClick={closeJoinModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <form onSubmit={handleJoinSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label htmlFor="meetingId">Meeting ID</label>
                    <input
                      type="text"
                      id="meetingId"
                      autoComplete="off"
                      value={joinMeetingId}
                      onChange={(e) => setJoinMeetingId(e.target.value)}
                      placeholder="Enter meeting ID"
                      onKeyPress={handleKeyPress}
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="username">Your Name</label>
                    <input
                      type="text"
                      id="username"
                      autoComplete="name"
                      value={joinUsername}
                      onChange={(e) => setJoinUsername(e.target.value)}
                      placeholder="Enter your name"
                      onKeyPress={handleKeyPress}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={closeJoinModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Join Meeting
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Meeting Modal */}
        {showCreateModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Create New Meeting</h3>
                <button className="modal-close" onClick={closeCreateModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <form onSubmit={handleCreateMeeting}>
                <div className="modal-body">
                  <div className="form-group">
                    <label htmlFor="createUsername">Your Name</label>
                    <input
                      type="text"
                      id="createUsername"
                      autoComplete="name"
                      value={createUsername}
                      onChange={(e) => setCreateUsername(e.target.value)}
                      placeholder="Enter your name"
                      autoFocus
                    />
                  </div>
                  <p className="modal-info">
                    <i className="fas fa-info-circle"></i>
                    A unique meeting ID will be generated automatically
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={closeCreateModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Create Meeting'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Meeting Credentials Modal */}
        {showMeetingCredentials && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Meeting Created Successfully!</h3>
                <button className="modal-close" onClick={() => setShowMeetingCredentials(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#7C3AED', marginBottom: '20px' }}></i>
                  <h4 style={{ marginBottom: '20px' }}>Share this Meeting ID</h4>
                  <div style={{
                    background: 'rgba(124, 58, 237, 0.1)',
                    border: '2px solid #7C3AED',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '20px',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    letterSpacing: '2px',
                    color: '#7C3AED'
                  }}>
                    {createdMeetingId}
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      navigator.clipboard.writeText(createdMeetingId)
                        .then(() => {
                          showNotification('Meeting ID copied to clipboard!', 'success');
                        })
                        .catch((err) => {
                          console.error('Failed to copy:', err);
                          showNotification('Failed to copy. Please copy manually.', 'error');
                        });
                    }}
                    style={{ marginBottom: '10px', width: '100%' }}
                  >
                    <i className="fas fa-copy"></i> Copy Meeting ID
                  </button>
                  <p style={{ color: '#888', fontSize: '14px', marginTop: '15px' }}>
                    <i className="fas fa-info-circle"></i> Share this ID with participants to join the meeting
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-primary" onClick={() => setShowMeetingCredentials(false)}>
                  Got it!
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {/* Notification Toast */}
        {notification && (
          <div className={`notification-toast ${notification.type}`}>
            {notification.type === 'success' && <i className="fas fa-check-circle"></i>}
            {notification.type === 'error' && <i className="fas fa-times-circle"></i>}
            {notification.type === 'warning' && <i className="fas fa-exclamation-triangle"></i>}
            {notification.type === 'info' && <i className="fas fa-info-circle"></i>}
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Render meeting
  return (
    <div className="app-container">
      <div className="meeting-container">
        <header className="meeting-header">
          <div className="meeting-info">
            <h2>
              <i className="fas fa-video meeting-icon"></i>
              Meeting: {meetingId}
              <button
                className="copy-btn"
                onClick={copyMeetingId}
              >
                <i className="fas fa-copy"></i>
              </button>
            </h2>
            <span className="user-badge">
              <i className="fas fa-user"></i> {username} {isHost && '(Host)'}
            </span>
          </div>
          <div className="meeting-controls">
            <ThemeSwitch className="workspace-theme-switch" />
            <button
              className="control-btn"
              onClick={() => setShowSettings(true)}
            >
              <i className="fas fa-cog"></i>
              <span>Settings</span>
            </button>
            <button
              className="control-btn"
              onClick={() => setShowChat(true)}
            >
              <i className="fas fa-comments"></i>
              <span>Chat</span>
              {showChat === false && (
                <span className="unread-dot" style={{ color: 'red', marginLeft: 4, fontSize: 12 }}></span>
              )}
            </button>
            <button
              className="control-btn"
              onClick={() => setShowSummary(true)}
            >
              <i className="fas fa-file-alt"></i>
              <span>Summary</span>
            </button>
            <button
              className="control-btn end-call"
              onClick={handleLeaveMeeting}
            >
              <i className="fas fa-phone-slash"></i>
              <span>Leave</span>
            </button>
          </div>
        </header>

        <div className="meeting-content">
          <div className="video-section">
            <VideoCall
              meetingId={meetingId}
              username={username}
              userId={userId}
              isHost={isHost}
              onError={handleVideoCallError}
              setSocket={setVideoCallSocket}
              onStreamChange={setLocalStream}
              appliedSettings={appliedSettings}
              onCleanup={(cleanupFn) => { videoCallCleanupRef.current = cleanupFn; }}
              onUserAway={handleUserAway}
              onUserReturn={handleUserReturn}
            />
          </div>
        </div>

        {/* Chat Overlay */}
        {showChat && videoCallSocket && (
          <Chat
            socket={videoCallSocket}
            meetingId={meetingId}
            userId={userId}
            username={username}
            isOpen={showChat}
            onClose={() => setShowChat(false)}
          />
        )}

        {/* Settings Overlay */}
        {showSettings && (
          <Settings
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            localStream={localStream}
            onSettingsChange={(settings) => {
              console.log('Settings changed:', settings);
              setAppliedSettings(settings || {});
            }}
          />
        )}

        {/* Meeting Summary Modal */}
        <MeetingSummary
          meetingId={meetingId}
          isOpen={showSummary}
          onClose={() => setShowSummary(false)}
          apiBase={apiBase}
        />

        {/* Confirm Leave Modal */}
        <ConfirmModal
          isOpen={showConfirmLeave}
          onClose={cancelLeaveMeeting}
          onConfirm={confirmLeaveMeeting}
          title="Leave Meeting?"
          message="Are you sure you want to leave this meeting?"
          confirmText="Leave Meeting"
          cancelText="Stay"
          isHost={isHost}
        />

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {/* Notification Toast */}
        {notification && (
          <div className={`notification-toast ${notification.type}`}>
            {notification.type === 'success' && <i className="fas fa-check-circle"></i>}
            {notification.type === 'error' && <i className="fas fa-times-circle"></i>}
            {notification.type === 'warning' && <i className="fas fa-exclamation-triangle"></i>}
            {notification.type === 'info' && <i className="fas fa-info-circle"></i>}
            {notification.message}
          </div>
        )}

        {/* Missed Speech Popup (Away Detection) */}
        {showMissedSpeech && meetingState === 'joined' && (
          <MissedSpeech
            transcripts={missedSpeechData.transcripts}
            awayDuration={missedSpeechData.awayDuration}
            onClose={handleCloseMissedSpeech}
            onSummarize={handleSummarizeMissedSpeech}
            currentUserId={userId}
          />
        )}
      </div>
    </div>
  );
}

export default App;