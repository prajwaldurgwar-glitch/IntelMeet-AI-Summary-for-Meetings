import React, { useState } from 'react';
import './MissedSpeech.css';

const MissedSpeech = ({ 
  transcripts, 
  awayDuration, 
  onClose, 
  onSummarize,
  currentUserId 
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  // Filter out current user's speech (only show what others said)
  const othersSpeech = transcripts.filter(t => t.speakerId !== currentUserId);

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

  // Group consecutive speech by same speaker
  const groupedSpeech = othersSpeech.reduce((acc, curr) => {
    const last = acc[acc.length - 1];
    if (last && last.speakerId === curr.speakerId) {
      // Same speaker - append text
      last.text += ' ' + curr.text;
      last.endTime = curr.timestamp;
    } else {
      // New speaker
      acc.push({
        ...curr,
        endTime: curr.timestamp
      });
    }
    return acc;
  }, []);

  // Handle summarize button click
  const handleSummarize = async () => {
    if (!onSummarize || othersSpeech.length === 0) return;
    
    setIsLoadingSummary(true);
    setSummaryError(null);
    
    try {
      const result = await onSummarize(othersSpeech);
      setSummary(result);
    } catch (error) {
      console.error('Error generating summary:', error);
      setSummaryError(error.message || 'Failed to generate summary');
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Removed the check that prevents popup from showing with 0 messages
  // Now popup will always appear when user returns, even if no speech was captured
  // if (othersSpeech.length === 0) {
  //   return null; // Don't show popup if no speech was missed
  // }

  if (isMinimized) {
    return (
      <div className="missed-speech-minimized" onClick={() => setIsMinimized(false)}>
        <div className="minimized-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </div>
        <span className="minimized-count">{groupedSpeech.length}</span>
        <span className="minimized-text">Missed</span>
      </div>
    );
  }

  return (
    <div className="missed-speech-popup">
      <div className="missed-speech-header">
        <div className="header-title">
          <div className="header-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
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

      <div className="missed-speech-body">
        <div className="speech-header">
          <div className="speech-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </div>
          <span className="speech-count">
            {groupedSpeech.length} conversation{groupedSpeech.length !== 1 ? 's' : ''} while you were away
          </span>
        </div>

        {/* AI Summary Section */}
        {onSummarize && (
          <div className="summary-section">
            {!summary && !isLoadingSummary && (
              <button 
                className="generate-summary-btn"
                onClick={handleSummarize}
                disabled={isLoadingSummary}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
                Summarize What I Missed
              </button>
            )}
            
            {isLoadingSummary && (
              <div className="summary-loading">
                <div className="loading-spinner"></div>
                <span>Generating summary...</span>
              </div>
            )}
            
            {summaryError && (
              <div className="summary-error">
                <span>{summaryError}</span>
                <button onClick={handleSummarize}>Try Again</button>
              </div>
            )}
            
            {summary && (
              <div className="summary-content">
                <div className="summary-header">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span>AI Summary</span>
                </div>
                <div className="summary-text">{summary}</div>
              </div>
            )}
          </div>
        )}
        
        <div className="speech-list">
          {groupedSpeech.map((speech, index) => (
            <div key={index} className="missed-speech-item">
              <div className="speech-speaker">
                <div className="speaker-avatar">
                  {speech.speakerName?.charAt(0).toUpperCase() || '?'}
                </div>
                <span className="speaker-name">{speech.speakerName || 'Unknown'}</span>
                <span className="speech-time">{formatTime(speech.timestamp)}</span>
              </div>
              <div className="speech-text">"{speech.text}"</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MissedSpeech;
