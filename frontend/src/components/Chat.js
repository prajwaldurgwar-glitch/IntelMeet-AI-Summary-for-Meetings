import React, { useState, useEffect, useRef } from 'react';
import './Chat.css';

const Chat = ({ socket, meetingId, userId, username, isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    // Listen for new messages
    socket.on('chat-message', (data) => {
      console.log('📨 Received chat-message:', data);
      const msg = {
        id: data.id || Date.now() + Math.random(),
        userId: data.userId,
        username: data.username,
        message: data.message || data.messageText || '',
        timestamp: data.timestamp || new Date().toISOString(),
        type: data.type || 'text'
      };
      setMessages(prev => [...prev, msg]);

      // Increase unread count if chat is closed
      if (!isOpen && data.userId !== userId) {
        setUnreadCount(prev => prev + 1);
      }

      scrollToBottom();
    });

    // Listen for file shares
    socket.on('file-shared', (data) => {
      const fileMsg = {
        id: data.id || Date.now() + Math.random(),
        userId: data.userId,
        username: data.username,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileData: data.fileData,
        fileType: data.fileType,
        timestamp: data.timestamp || new Date().toISOString(),
        type: 'file'
      };
      setMessages(prev => [...prev, fileMsg]);

      if (!isOpen && data.userId !== userId) {
        setUnreadCount(prev => prev + 1);
      }

      scrollToBottom();
    });

    // Listen for polls
    socket.on('poll-created', (data) => {
      console.log('📊 Received poll-created:', data);
      const pollMsg = {
        id: data.id || Date.now() + Math.random(),
        userId: data.userId,
        username: data.username,
        question: data.question,
        options: data.options.map(opt => {
          // Handle both string options and object options
          if (typeof opt === 'string') {
            return { text: opt, votes: [], count: 0 };
          } else {
            return {
              text: opt.text || opt,
              votes: opt.votes || [],
              count: opt.count || 0
            };
          }
        }),
        timestamp: data.timestamp || new Date().toISOString(),
        type: 'poll'
      };
      setMessages(prev => [...prev, pollMsg]);

      if (!isOpen && data.userId !== userId) {
        setUnreadCount(prev => prev + 1);
      }

      scrollToBottom();
    });

    // Listen for poll votes
    socket.on('poll-voted', (data) => {
      console.log('🗳️ Received poll-voted:', data);
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.pollId && msg.type === 'poll') {
          // First, remove user's vote from all options, then add to selected option
          const updatedOptions = msg.options.map((opt, idx) => {
            // Ensure votes array exists
            const currentVotes = opt.votes || [];
            
            // Remove user's previous vote from this option
            const votesWithoutUser = currentVotes.filter(v => v !== data.userId);
            
            // If this is the selected option, add the user's vote
            const votes = idx === data.optionIndex 
              ? [...votesWithoutUser, data.userId]
              : votesWithoutUser;
            
            return {
              ...opt,
              votes,
              count: votes.length
            };
          });
          
          return {
            ...msg,
            options: updatedOptions
          };
        }
        return msg;
      }));
    });

    // Listen for typing indicators
    socket.on('user-typing', (data) => {
      if (data.userId !== userId) {
        if (data.isTyping === false) {
          setIsTyping(prev => {
            const newTyping = { ...prev };
            delete newTyping[data.userId];
            return newTyping;
          });
        } else {
          setIsTyping(prev => ({ ...prev, [data.userId]: data.username }));
          // Clear typing indicator after 3 seconds
          setTimeout(() => {
            setIsTyping(prev => {
              const newTyping = { ...prev };
              delete newTyping[data.userId];
              return newTyping;
            });
          }, 3000);
        }
      }
    });

    // Listen for chat history response
    socket.on('chat-history', (payload) => {
      if (payload && Array.isArray(payload.history)) {
        setMessages(payload.history.map(m => ({
          id: m.id || (Date.now() + Math.random()),
          userId: m.userId,
          username: m.username,
          message: m.message,
          fileName: m.fileName,
          fileSize: m.fileSize,
          fileData: m.fileData,
          fileType: m.fileType,
          question: m.question,
          options: m.options,
          timestamp: m.timestamp,
          type: m.type || 'text'
        })));
        // scroll after setting
        setTimeout(() => scrollToBottom(), 50);
      }
    });

    return () => {
        socket.off('chat-message');
        socket.off('file-shared');
        socket.off('user-typing');
        socket.off('chat-history');
        socket.off('poll-created');
        socket.off('poll-voted');
    };
  }, [socket, userId, isOpen, meetingId]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      // Request chat history when opening chat
      if (socket) {
        socket.emit('get-chat-history', { meetingId });
      }
    }
  }, [isOpen, socket, meetingId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !socket) return;

    const messageData = {
      meetingId,
      userId,
      username,
      message: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    console.log('📤 Sending chat-message:', messageData);
    // send normalized chat event
    socket.emit('chat-message', messageData);
    
    setNewMessage('');
    
    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);

    if (!socket) return;

    // Send typing indicator
  socket.emit('typing', { meetingId, userId, username, isTyping: true });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop-typing', { meetingId, userId, isTyping: false });
    }, 1000);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = {
        meetingId,
        userId,
        username,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileData: event.target.result,
        timestamp: new Date().toISOString()
      };

  socket.emit('file-share', fileData);
    };

    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const handleDownloadFile = (message) => {
    const link = document.createElement('a');
    link.href = message.fileData;
    link.download = message.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenPollModal = () => {
    setShowPollModal(true);
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  const handleClosePollModal = () => {
    setShowPollModal(false);
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  const handleAddPollOption = () => {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handleRemovePollOption = (index) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handlePollOptionChange = (index, value) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleCreatePoll = (e) => {
    e.preventDefault();
    
    if (!pollQuestion.trim() || !socket) return;
    
    const validOptions = pollOptions.filter(opt => opt.trim());
    if (validOptions.length < 2) {
      alert('Please provide at least 2 options');
      return;
    }

    const pollData = {
      id: Date.now() + Math.random(),
      meetingId,
      userId,
      username,
      question: pollQuestion.trim(),
      options: validOptions.map(opt => opt.trim()),
      timestamp: new Date().toISOString()
    };

    socket.emit('create-poll', pollData);
    handleClosePollModal();
  };

  const handleVotePoll = (pollId, optionIndex) => {
    if (!socket) return;

    socket.emit('vote-poll', {
      meetingId,
      pollId,
      userId,
      username,
      optionIndex
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen) return null;

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-title">
          <i className="fas fa-comments"></i>
          <h3>Chat</h3>
          {unreadCount > 0 && (
            <span className="chat-badge">{unreadCount}</span>
          )}
        </div>
        <button className="chat-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <i className="fas fa-comments"></i>
            <p>No messages yet</p>
            <span>Start the conversation!</span>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`chat-message ${msg.userId === userId ? 'own-message' : ''}`}
            >
              <div className="message-header">
                <span className="message-username">
                  {msg.userId === userId ? 'You' : msg.username}
                </span>
                <span className="message-time">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              
              {msg.type === 'text' ? (
                <div className="message-content">
                  {msg.message}
                </div>
              ) : msg.type === 'poll' ? (
                <div className="message-poll">
                  <div className="poll-question">
                    <i className="fas fa-poll"></i>
                    {msg.question}
                  </div>
                  <div className="poll-options">
                    {msg.options.map((option, idx) => {
                      const totalVotes = msg.options.reduce((sum, opt) => sum + (opt.count || 0), 0);
                      const percentage = totalVotes > 0 ? Math.round(((option.count || 0) / totalVotes) * 100) : 0;
                      const hasVoted = (option.votes || []).includes(userId);
                      const userVoted = msg.options.some(opt => (opt.votes || []).includes(userId));

                      return (
                        <div 
                          key={idx} 
                          className={`poll-option ${hasVoted ? 'voted' : ''} ${userVoted ? 'disabled' : ''}`}
                          onClick={() => !userVoted && handleVotePoll(msg.id, idx)}
                        >
                          <div className="poll-option-bar" style={{ width: `${percentage}%` }}></div>
                          <div className="poll-option-content">
                            <span className="poll-option-text">{option.text}</span>
                            <div className="poll-option-stats">
                              {hasVoted && <i className="fas fa-check"></i>}
                              <span>{percentage}%</span>
                              <span className="poll-votes">({option.count || 0})</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="poll-footer">
                    <i className="fas fa-users"></i>
                    <span>{msg.options.reduce((sum, opt) => sum + (opt.count || 0), 0)} votes</span>
                  </div>
                </div>
              ) : (
                <div className="message-file">
                  <div className="file-info">
                    <i className="fas fa-file"></i>
                    <div className="file-details">
                      <span className="file-name">{msg.fileName}</span>
                      <span className="file-size">{formatFileSize(msg.fileSize)}</span>
                    </div>
                  </div>
                  <button 
                    className="file-download-btn"
                    onClick={() => handleDownloadFile(msg)}
                  >
                    <i className="fas fa-download"></i>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        
        {Object.keys(isTyping).length > 0 && (
          <div className="typing-indicator">
            <span>{Object.values(isTyping)[0]} is typing</span>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSendMessage}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        <button
          type="button"
          className="chat-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <i className="fas fa-paperclip"></i>
        </button>

        <button
          type="button"
          className="chat-poll-btn"
          onClick={handleOpenPollModal}
          title="Create poll"
        >
          <i className="fas fa-poll"></i>
        </button>

        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={newMessage}
          onChange={handleTyping}
          autoFocus
        />

        <button
          type="submit"
          className="chat-send-btn"
          disabled={!newMessage.trim()}
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>

      {/* Poll Creation Modal */}
      {showPollModal && (
        <div className="poll-modal-overlay" onClick={handleClosePollModal}>
          <div className="poll-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="poll-modal-header">
              <h3>Create Poll</h3>
              <button className="poll-modal-close" onClick={handleClosePollModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleCreatePoll}>
              <div className="poll-modal-body">
                <div className="poll-form-group">
                  <label htmlFor="pollQuestion">Question</label>
                  <input
                    type="text"
                    id="pollQuestion"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    maxLength={200}
                    autoFocus
                  />
                </div>
                <div className="poll-form-group">
                  <label>Options</label>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="poll-option-input">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => handlePollOptionChange(index, e.target.value)}
                        placeholder={`Option ${index + 1}`}
                        maxLength={100}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          className="poll-option-remove"
                          onClick={() => handleRemovePollOption(index)}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 10 && (
                    <button
                      type="button"
                      className="poll-add-option"
                      onClick={handleAddPollOption}
                    >
                      <i className="fas fa-plus"></i> Add option
                    </button>
                  )}
                </div>
              </div>
              <div className="poll-modal-footer">
                <button type="button" className="poll-btn-cancel" onClick={handleClosePollModal}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="poll-btn-create"
                  disabled={!pollQuestion.trim() || pollOptions.filter(opt => opt.trim()).length < 2}
                >
                  Create Poll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;