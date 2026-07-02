import React, { useState, useEffect, useRef } from 'react';
import './MeetingSummary.css';

const MeetingSummary = ({ meetingId, isOpen, onClose, apiBase }) => {
  // Mode: 'summary' or 'chat'
  const [mode, setMode] = useState('summary');
  
  // Summary states
  const [summaryLevel, setSummaryLevel] = useState('intermediate'); // 'simple' | 'intermediate' | 'advanced'
  const [summary, setSummary] = useState(null);
  const [actionItems, setActionItems] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [isServiceAvailable, setIsServiceAvailable] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Check service availability on mount
  useEffect(() => {
    if (isOpen) {
      checkServiceStatus();
    }
  }, [isOpen]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const checkServiceStatus = async () => {
    try {
      const response = await fetch(`${apiBase}/api/summary/status`);
      const data = await response.json();
      setIsServiceAvailable(data.available);
      if (!data.available) {
        setError('Summary service is not configured. Please add your Gemini API key.');
      }
    } catch (err) {
      console.error('Failed to check service status:', err);
    }
  };

  const generateSummary = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/api/summary/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          summaryType: 'adaptive',
          level: summaryLevel,
          additionalData: {
            endTime: new Date().toISOString()
          }
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSummary(data.summary);
        if (data.actionItems) {
          setActionItems(data.actionItems);
        }
        if (data.meetingInfo) {
          setMeetingInfo(data.meetingInfo);
        }
      } else {
        throw new Error(data.message || 'Failed to generate summary');
      }
    } catch (err) {
      console.error('Error generating summary:', err);
      setError(err.message || 'Failed to generate summary. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLevelChange = (level) => {
    setSummaryLevel(level);
    setSummary(null); // Clear previous summary when level changes
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    
    // Add user message to chat
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/summary/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          message: userMessage,
          chatHistory: chatMessages
        }),
      });

      const data = await response.json();

      if (data.success) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        if (data.meetingInfo && !meetingInfo) {
          setMeetingInfo(data.meetingInfo);
        }
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (err) {
      console.error('Error in chat:', err);
      
      // Determine the error message to show
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      const errorStr = err.message || '';
      
      if (errorStr.includes('RATE_LIMIT') || errorStr.includes('429') || errorStr.includes('quota')) {
        errorMessage = '⚠️ **Rate Limit Reached**\n\nToo many requests. Please wait a moment (30-60 seconds) before asking another question.\n\nThis happens when the AI service receives too many requests in a short time.';
      } else if (errorStr.includes('SERVICE_UNAVAILABLE') || errorStr.includes('503')) {
        errorMessage = '⚠️ **Service Temporarily Unavailable**\n\nThe AI service is currently unavailable. Please try again in a few minutes.';
      } else if (errorStr.includes('Meeting not found')) {
        errorMessage = '❌ **Meeting Not Found**\n\nThis meeting data is no longer available. The meeting may have ended.';
      } else if (errorStr.includes('GEMINI_API_KEY') || errorStr.includes('not configured')) {
        errorMessage = '❌ **AI Service Not Configured**\n\nThe AI assistant is not properly set up. Please contact the administrator.';
      }
      
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage,
        error: true 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCopy = () => {
    const content = summary;
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const levelLabels = {
      simple: 'Simple',
      intermediate: 'Intermediate', 
      advanced: 'Advanced'
    };
    
    let content = `Meeting Summary - ${levelLabels[summaryLevel]} Level
Meeting ID: ${meetingId}
Generated: ${new Date().toLocaleString()}
${meetingInfo ? `Participants: ${meetingInfo.participantCount}` : ''}
${meetingInfo ? `Messages: ${meetingInfo.messageCount}` : ''}
${meetingInfo ? `Duration: ${meetingInfo.duration}` : ''}

${'='.repeat(50)}

${summary || 'No summary available'}
`;

    if (actionItems) {
      content += `

${'='.repeat(50)}

ACTION ITEMS
${'─'.repeat(40)}
${actionItems}
`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-summary-${meetingId}-${summaryLevel}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadChat = () => {
    let content = `Meeting AI Chat History
Meeting ID: ${meetingId}
Generated: ${new Date().toLocaleString()}

${'='.repeat(50)}

`;

    chatMessages.forEach(msg => {
      const label = msg.role === 'user' ? 'You' : 'AI Assistant';
      content += `${label}:\n${msg.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-chat-${meetingId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderMarkdown = (text) => {
    if (!text) return null;
    
    return text
      .split('\n')
      .map((line, index) => {
        // Headers
        if (line.startsWith('### ')) {
          return <h4 key={index}>{line.substring(4)}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={index}>{line.substring(3)}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={index}>{line.substring(2)}</h2>;
        }
        // Bold text in headers
        if (line.startsWith('**') && line.endsWith('**')) {
          return <h4 key={index} className="summary-section-title">{line.slice(2, -2)}</h4>;
        }
        // List items
        if (line.startsWith('- [ ] ')) {
          return <div key={index} className="action-item unchecked"><i className="far fa-square"></i> {line.substring(6)}</div>;
        }
        if (line.startsWith('- [x] ')) {
          return <div key={index} className="action-item checked"><i className="far fa-check-square"></i> {line.substring(6)}</div>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={index}>{line.substring(2)}</li>;
        }
        // Numbered lists
        if (/^\d+\.\s/.test(line)) {
          return <li key={index}>{line.replace(/^\d+\.\s/, '')}</li>;
        }
        // Empty lines
        if (line.trim() === '') {
          return <br key={index} />;
        }
        // Regular paragraph
        return <p key={index}>{line}</p>;
      });
  };

  const getLevelDescription = (level) => {
    switch(level) {
      case 'simple':
        return 'Easy to understand, key points only';
      case 'intermediate':
        return 'Balanced detail with main discussions';
      case 'advanced':
        return 'Comprehensive with full analysis';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-modal" onClick={e => e.stopPropagation()}>
        <div className="summary-header">
          <div className="summary-title">
            <i className="fas fa-brain"></i>
            <h2>AI Meeting Assistant</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Meeting Info Bar */}
        {meetingInfo && (
          <div className="meeting-info-bar">
            <div className="info-item">
              <i className="fas fa-hashtag"></i>
              <span>{meetingInfo.meetingId}</span>
            </div>
            <div className="info-item">
              <i className="fas fa-users"></i>
              <span>{meetingInfo.participantCount} participants</span>
            </div>
            <div className="info-item">
              <i className="fas fa-comments"></i>
              <span>{meetingInfo.messageCount} messages</span>
            </div>
            <div className="info-item">
              <i className="fas fa-clock"></i>
              <span>{meetingInfo.duration}</span>
            </div>
          </div>
        )}

        {/* Mode Tabs - Summary vs AI Chat */}
        <div className="mode-tabs">
          <button
            className={`mode-btn ${mode === 'summary' ? 'active' : ''}`}
            onClick={() => setMode('summary')}
          >
            <i className="fas fa-file-alt"></i>
            Summary
          </button>
          <button
            className={`mode-btn ${mode === 'chat' ? 'active' : ''}`}
            onClick={() => setMode('chat')}
          >
            <i className="fas fa-robot"></i>
            AI Assistant
          </button>
        </div>

        {/* Summary Mode */}
        {mode === 'summary' && (
          <>
            {/* Level Selector */}
            <div className="level-selector">
              <div className="level-label">
                <i className="fas fa-sliders-h"></i>
                <span>Summary Level:</span>
              </div>
              <div className="level-options">
                <button
                  className={`level-btn ${summaryLevel === 'simple' ? 'active' : ''}`}
                  onClick={() => handleLevelChange('simple')}
                >
                  <i className="fas fa-seedling"></i>
                  Simple
                </button>
                <button
                  className={`level-btn ${summaryLevel === 'intermediate' ? 'active' : ''}`}
                  onClick={() => handleLevelChange('intermediate')}
                >
                  <i className="fas fa-balance-scale"></i>
                  Intermediate
                </button>
                <button
                  className={`level-btn ${summaryLevel === 'advanced' ? 'active' : ''}`}
                  onClick={() => handleLevelChange('advanced')}
                >
                  <i className="fas fa-graduation-cap"></i>
                  Advanced
                </button>
              </div>
              <div className="level-description">
                {getLevelDescription(summaryLevel)}
              </div>
            </div>

            {/* Summary Content */}
            <div className="summary-content">
              {!isServiceAvailable ? (
                <div className="summary-error">
                  <i className="fas fa-exclamation-triangle"></i>
                  <h3>Summary Service Unavailable</h3>
                  <p>Please configure your Gemini API key in the backend .env file.</p>
                  <code>GEMINI_API_KEY=your_api_key_here</code>
                </div>
              ) : isLoading ? (
                <div className="summary-loading">
                  <div className="loading-spinner">
                    <i className="fas fa-spinner fa-spin"></i>
                  </div>
                  <p>Generating {summaryLevel} summary with AI...</p>
                  <span>This may take a few seconds</span>
                </div>
              ) : error ? (
                <div className="summary-error">
                  <i className="fas fa-exclamation-circle"></i>
                  <p>{error}</p>
                  <button onClick={generateSummary} className="retry-btn">
                    <i className="fas fa-redo"></i> Try Again
                  </button>
                </div>
              ) : summary ? (
                <div className="summary-result">
                  <div className="summary-result-header">
                    <span className="summary-level-badge">
                      <i className={`fas fa-${summaryLevel === 'simple' ? 'seedling' : summaryLevel === 'intermediate' ? 'balance-scale' : 'graduation-cap'}`}></i>
                      {summaryLevel.charAt(0).toUpperCase() + summaryLevel.slice(1)} Summary
                    </span>
                    <div className="summary-result-actions">
                      <button 
                        className="mini-action-btn"
                        onClick={handleCopy}
                        title="Copy summary"
                      >
                        <i className={`fas fa-${copied ? 'check' : 'copy'}`}></i>
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                      <button 
                        className="mini-action-btn"
                        onClick={handleDownload}
                        title="Download summary"
                      >
                        <i className="fas fa-download"></i>
                        Download
                      </button>
                    </div>
                  </div>
                  <div className="summary-text">
                    {renderMarkdown(summary)}
                    {actionItems && (
                      <div className="action-items-section">
                        <h4><i className="fas fa-tasks"></i> Action Items</h4>
                        {renderMarkdown(actionItems)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="summary-empty">
                  <i className="fas fa-magic"></i>
                  <h3>Generate Adaptive Summary</h3>
                  <p>Select your preferred level and click generate</p>
                  <button onClick={generateSummary} className="generate-btn" disabled={!isServiceAvailable}>
                    <i className="fas fa-sparkles"></i> Generate Summary
                  </button>
                </div>
              )}
            </div>

            {/* Summary Actions - only show regenerate when summary exists */}
            {summary && (
              <div className="summary-actions">
                <button 
                  className="action-btn generate-all" 
                  onClick={generateSummary}
                  disabled={isLoading || !isServiceAvailable}
                >
                  <i className="fas fa-sync-alt"></i>
                  Regenerate {summaryLevel.charAt(0).toUpperCase() + summaryLevel.slice(1)} Summary
                </button>
              </div>
            )}
          </>
        )}

        {/* AI Chat Mode */}
        {mode === 'chat' && (
          <>
            <div className="chat-layout">
              {/* Left Panel - Quick Actions */}
              <div className="chat-sidebar">
                <div className="chat-welcome-panel">
                  <i className="fas fa-robot"></i>
                  <h3>AI Meeting Assistant</h3>
                  <p>Ask me anything about this meeting!</p>
                </div>
                <div className="chat-quick-actions">
                  <h4><i className="fas fa-bolt"></i> Quick Questions</h4>
                  <button onClick={() => { setChatInput('What were the main topics discussed?'); }}>
                    <i className="fas fa-lightbulb"></i> Main topics discussed?
                  </button>
                  <button onClick={() => { setChatInput('What decisions were made?'); }}>
                    <i className="fas fa-check-circle"></i> What decisions were made?
                  </button>
                  <button onClick={() => { setChatInput('What are the action items?'); }}>
                    <i className="fas fa-tasks"></i> What are the action items?
                  </button>
                  <button onClick={() => { setChatInput('Summarize key points'); }}>
                    <i className="fas fa-list"></i> Summarize key points
                  </button>
                  <button onClick={() => { setChatInput('Who participated the most?'); }}>
                    <i className="fas fa-users"></i> Who participated most?
                  </button>
                  <button onClick={() => { setChatInput('What questions were asked?'); }}>
                    <i className="fas fa-question-circle"></i> Questions asked?
                  </button>
                </div>
              </div>

              {/* Right Panel - Chat Messages */}
              <div className="chat-main">
                <div className="chat-messages-container">
                  {chatMessages.length === 0 ? (
                    <div className="chat-empty-state">
                      <i className="fas fa-comments"></i>
                      <p>Select a quick question or type your own below</p>
                    </div>
                  ) : (
                    <div className="chat-messages">
                      {chatMessages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.role}`}>
                          <div className="message-avatar">
                            <i className={`fas fa-${msg.role === 'user' ? 'user' : 'robot'}`}></i>
                          </div>
                          <div className={`message-content ${msg.error ? 'error' : ''}`}>
                            {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                          </div>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="chat-message assistant">
                          <div className="message-avatar">
                            <i className="fas fa-robot"></i>
                          </div>
                          <div className="message-content typing">
                            <div className="typing-indicator">
                              <span></span>
                              <span></span>
                              <span></span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <form className="chat-input-form" onSubmit={handleChatSubmit}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type your question here..."
                    disabled={isChatLoading || !isServiceAvailable}
                  />
                  <button 
                    type="submit" 
                    disabled={!chatInput.trim() || isChatLoading || !isServiceAvailable}
                  >
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </form>
              </div>
            </div>

            {/* Chat Actions */}
            {chatMessages.length > 0 && (
              <div className="summary-actions">
                <div className="action-left">
                  <button 
                    className="action-btn" 
                    onClick={() => setChatMessages([])}
                  >
                    <i className="fas fa-trash-alt"></i>
                    Clear Chat
                  </button>
                </div>
                <div className="action-right">
                  <button 
                    className="action-btn"
                    onClick={handleDownloadChat}
                  >
                    <i className="fas fa-download"></i>
                    Download Chat
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MeetingSummary;
