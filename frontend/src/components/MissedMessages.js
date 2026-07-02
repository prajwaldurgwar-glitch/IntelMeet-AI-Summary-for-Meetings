import React, { useState } from 'react';
import './MissedMessages.css';

const MissedMessages = ({ 
  missedMessages, 
  awayDuration, 
  onClose, 
  onSummarize,
  currentUserId 
}) => {
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Filter out current user's messages (only show what others said)
  const othersMsgs = missedMessages.filter(msg => msg.senderId !== currentUserId);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds} seconds`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs} sec` : `${mins} minutes`;
  };

  const handleSummarize = async () => {
    setIsLoadingSummary(true);
    try {
      const result = await onSummarize(othersMsgs);
      setSummary(result);
      setShowSummary(true);
    } catch (error) {
      setSummary('Failed to generate summary. Please try again.');
      setShowSummary(true);
    }
    setIsLoadingSummary(false);
  };

  const handleBackToMessages = () => {
    setShowSummary(false);
  };

  if (othersMsgs.length === 0) {
    return null; // Don't show popup if no messages were missed
  }

  if (isMinimized) {
    return (
      <div className="missed-messages-minimized" onClick={() => setIsMinimized(false)}>
        <div className="minimized-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
            <circle cx="12" cy="10" r="2" fill="#ff6b6b"/>
          </svg>
        </div>
        <span className="minimized-count">{othersMsgs.length}</span>
        <span className="minimized-text">Missed</span>
      </div>
    );
  }

  return (
    <div className="missed-messages-popup">
      <div className="missed-messages-header">
        <div className="header-title">
          <div className="header-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <div>
            <h3>Welcome Back!</h3>
            <span className="away-duration">You were away for {formatDuration(awayDuration)}</span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="minimize-btn" 
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
          <button className="close-btn" onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="missed-messages-body">
        {!showSummary ? (
          <>
            <div className="messages-header">
              <span className="messages-count">
                {othersMsgs.length} message{othersMsgs.length !== 1 ? 's' : ''} while you were away
              </span>
            </div>
            
            <div className="messages-list">
              {othersMsgs.map((msg, index) => (
                <div key={index} className="missed-message-item">
                  <div className="message-sender">
                    <div className="sender-avatar">
                      {msg.senderName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span className="sender-name">{msg.senderName || 'Unknown'}</span>
                    <span className="message-time">{formatTime(msg.timestamp || msg.missedAt)}</span>
                  </div>
                  <div className="message-text">{msg.text || msg.message}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="summary-view">
            <div className="summary-header">
              <button className="back-btn" onClick={handleBackToMessages}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
                Back to messages
              </button>
            </div>
            <div className="summary-content">
              <div className="summary-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <h4>AI Summary</h4>
              <p className="summary-text">{summary}</p>
            </div>
          </div>
        )}
      </div>

      <div className="missed-messages-footer">
        {!showSummary && (
          <button 
            className="summarize-btn"
            onClick={handleSummarize}
            disabled={isLoadingSummary}
          >
            {isLoadingSummary ? (
              <>
                <div className="loading-spinner"></div>
                Generating Summary...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
                Get AI Summary
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default MissedMessages;
