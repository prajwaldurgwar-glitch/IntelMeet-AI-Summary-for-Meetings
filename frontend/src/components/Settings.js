import React, { useState, useEffect } from 'react';
import './Settings.css';

const Settings = ({ isOpen, onClose, localStream, onSettingsChange }) => {
  const [activeTab, setActiveTab] = useState('audio');
  
  // Device Lists
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState('');
  const [selectedVideoInput, setSelectedVideoInput] = useState('');
  
  // Audio Settings (Working)
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  
  // Video Settings (Working)
  const [mirrorVideo, setMirrorVideo] = useState(true);

  // Notification state
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadDevices();
    loadSettings();
  }, []);

  // Load current stream devices on open
  useEffect(() => {
    if (isOpen && localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];
      
      if (audioTrack && audioTrack.getSettings().deviceId) {
        setSelectedAudioInput(audioTrack.getSettings().deviceId);
      }
      
      if (videoTrack && videoTrack.getSettings().deviceId) {
        setSelectedVideoInput(videoTrack.getSettings().deviceId);
      }
    }
  }, [isOpen, localStream]);

  const loadDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      
      if (audioInputs.length > 0 && !selectedAudioInput) {
        setSelectedAudioInput(audioInputs[0].deviceId);
      }
      
      if (videoInputs.length > 0 && !selectedVideoInput) {
        setSelectedVideoInput(videoInputs[0].deviceId);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  // Apply audio constraints when they change
  const handleAudioInputChange = async (deviceId) => {
    setSelectedAudioInput(deviceId);
    
    if (localStream) {
      try {
        console.log('🎤 Changing audio input to:', deviceId);
        const audioTrack = localStream.getAudioTracks()[0];
        
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            deviceId: { exact: deviceId },
            echoCancellation,
            noiseSuppression,
            autoGainControl
          }
        });
        
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        // Replace track in the stream
        localStream.removeTrack(audioTrack);
        localStream.addTrack(newAudioTrack);
        
        // Stop old track
        audioTrack.stop();
        
        console.log('✅ Audio input changed successfully');
        showNotification('Microphone changed successfully', 'success');
      } catch (error) {
        console.error('❌ Error changing audio input:', error);
        showNotification('Failed to change microphone', 'error');
      }
    }
  };

  const handleVideoInputChange = async (deviceId) => {
    setSelectedVideoInput(deviceId);
    
    if (localStream) {
      try {
        console.log('📹 Changing video input to:', deviceId);
        const videoTrack = localStream.getVideoTracks()[0];
        
        const newStream = await navigator.mediaDevices.getUserMedia({ 
          video: { deviceId: { exact: deviceId } }
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Replace track in the stream
        localStream.removeTrack(videoTrack);
        localStream.addTrack(newVideoTrack);
        
        // Stop old track
        videoTrack.stop();
        
        console.log('✅ Video input changed successfully');
        showNotification('Camera changed successfully', 'success');
      } catch (error) {
        console.error('❌ Error changing video input:', error);
        showNotification('Failed to change camera', 'error');
      }
    }
  };

  const applyAudioConstraints = async () => {
    if (!localStream || !selectedAudioInput) return;
    
    try {
      console.log('🎤 Applying audio constraints:', { echoCancellation, noiseSuppression, autoGainControl });
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) return;
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: selectedAudioInput },
          echoCancellation,
          noiseSuppression,
          autoGainControl
        }
      });
      
      const newAudioTrack = newStream.getAudioTracks()[0];
      localStream.removeTrack(audioTrack);
      localStream.addTrack(newAudioTrack);
      audioTrack.stop();
      
      console.log('✅ Audio constraints applied');
    } catch (error) {
      console.error('❌ Error applying audio constraints:', error);
    }
  };

  const resetToDefaults = () => {
    setEchoCancellation(true);
    setNoiseSuppression(true);
    setAutoGainControl(true);
    setMirrorVideo(true);
    
    console.log('✅ Settings reset to defaults');
    showNotification('Reset to defaults', 'success');
  };

  const loadSettings = () => {
    // Load from localStorage
    const saved = localStorage.getItem('intelmeet_settings');
    const defaultSettings = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      mirrorVideo: true
    };

    const savedSettings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;

    setEchoCancellation(savedSettings.echoCancellation);
    setNoiseSuppression(savedSettings.noiseSuppression);
    setAutoGainControl(savedSettings.autoGainControl);
    setMirrorVideo(savedSettings.mirrorVideo);
  };

  const saveSettings = () => {
    const settings = {
      echoCancellation,
      noiseSuppression,
      autoGainControl,
      mirrorVideo
    };
    
    // Save to localStorage
    localStorage.setItem('intelmeet_settings', JSON.stringify(settings));
    
    // Apply audio constraints
    if (localStream) {
      applyAudioConstraints();
    }
    
    // Notify parent component
    if (onSettingsChange) {
      onSettingsChange(settings);
    }
    
    console.log('✅ Settings saved:', settings);
    showNotification('Settings saved successfully', 'success');
    onClose();
  };

  const handleCancel = () => {
    // Reload original settings without saving changes
    loadSettings();
    console.log('❌ Settings changes cancelled, reverted to saved settings');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={handleCancel}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Notification Toast */}
        {notification && (
          <div className={`settings-notification ${notification.type}`}>
            {notification.type === 'success' && <i className="fas fa-check-circle"></i>}
            {notification.type === 'error' && <i className="fas fa-exclamation-circle"></i>}
            {notification.message}
          </div>
        )}
        
        <div className="settings-header">
          <h2>
            <i className="fas fa-cog"></i>
            Settings
          </h2>
          <button className="settings-close-btn" onClick={handleCancel}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === 'audio' ? 'active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              <i className="fas fa-microphone"></i>
              Audio
            </button>
            <button
              className={`settings-tab ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              <i className="fas fa-video"></i>
              Video
            </button>
          </div>

          <div className="settings-body">
            {/* Audio Settings */}
            {activeTab === 'audio' && (
              <div className="settings-section">
                <h3>Audio Settings</h3>

                <div className="setting-item">
                  <label>Microphone</label>
                  <select
                    value={selectedAudioInput}
                    onChange={(e) => handleAudioInputChange(e.target.value)}
                    className="device-select"
                  >
                    {audioDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.substr(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={echoCancellation}
                      onChange={(e) => setEchoCancellation(e.target.checked)}
                    />
                    Echo Cancellation
                  </label>
                  <p className="setting-description">
                    Reduces echo from speakers being picked up by microphone
                  </p>
                </div>

                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={noiseSuppression}
                      onChange={(e) => setNoiseSuppression(e.target.checked)}
                    />
                    Noise Suppression
                  </label>
                  <p className="setting-description">
                    Filters out background noise
                  </p>
                </div>

                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={autoGainControl}
                      onChange={(e) => setAutoGainControl(e.target.checked)}
                    />
                    Auto Gain Control
                  </label>
                  <p className="setting-description">
                    Automatically adjusts microphone volume
                  </p>
                </div>

                <p className="settings-note">
                  <i className="fas fa-info-circle"></i> Audio constraints apply when you save settings
                </p>
              </div>
            )}

            {/* Video Settings */}
            {activeTab === 'video' && (
              <div className="settings-section">
                <h3>Video Settings</h3>

                <div className="setting-item">
                  <label>Camera</label>
                  <select
                    value={selectedVideoInput}
                    onChange={(e) => handleVideoInputChange(e.target.value)}
                    className="device-select"
                  >
                    {videoDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.substr(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={mirrorVideo}
                      onChange={(e) => setMirrorVideo(e.target.checked)}
                    />
                    Mirror My Video
                  </label>
                  <p className="setting-description">
                    Flip your video horizontally (only affects your view)
                  </p>
                </div>

                <p className="settings-note">
                  <i className="fas fa-info-circle"></i> Video mirroring applies immediately
                </p>
              </div>
            )}

          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-btn settings-btn-secondary" onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <div className="settings-footer-actions">
            <button className="settings-btn settings-btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="settings-btn settings-btn-primary" onClick={saveSettings}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;