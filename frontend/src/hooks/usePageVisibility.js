import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to detect when user leaves/returns to the page
 * Uses Page Visibility API to track tab focus
 */
const usePageVisibility = (onAway, onReturn, awayThreshold = 10000) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isAway, setIsAway] = useState(false);
  const [awayStartTime, setAwayStartTime] = useState(null);
  const awayTimerRef = useRef(null);
  const missedMessagesRef = useRef([]);

  // Clear the away timer
  const clearAwayTimer = useCallback(() => {
    if (awayTimerRef.current) {
      clearTimeout(awayTimerRef.current);
      awayTimerRef.current = null;
    }
  }, []);

  // Add a missed message while user is away
  const addMissedMessage = useCallback((message) => {
    if (isAway || !isVisible) {
      missedMessagesRef.current.push({
        ...message,
        missedAt: new Date().toISOString()
      });
    }
  }, [isAway, isVisible]);

  // Get all missed messages
  const getMissedMessages = useCallback(() => {
    return [...missedMessagesRef.current];
  }, []);

  // Clear missed messages
  const clearMissedMessages = useCallback(() => {
    missedMessagesRef.current = [];
  }, []);

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    const visible = !document.hidden;
    setIsVisible(visible);

    if (!visible) {
      // User left the tab - start the away timer
      setAwayStartTime(new Date());
      
      awayTimerRef.current = setTimeout(() => {
        setIsAway(true);
        if (onAway) {
          onAway();
        }
      }, awayThreshold);
    } else {
      // User returned to the tab
      clearAwayTimer();
      
      if (isAway) {
        const awayDuration = awayStartTime ? 
          Math.round((new Date() - awayStartTime) / 1000) : 0;
        
        if (onReturn) {
          onReturn({
            missedMessages: getMissedMessages(),
            awayDuration,
            awayStartTime
          });
        }
        
        setIsAway(false);
      }
      
      setAwayStartTime(null);
    }
  }, [awayThreshold, isAway, awayStartTime, onAway, onReturn, clearAwayTimer, getMissedMessages]);

  // Handle window blur/focus for additional detection
  const handleWindowBlur = useCallback(() => {
    if (document.hidden) return; // Already handled by visibility API
    
    setAwayStartTime(new Date());
    awayTimerRef.current = setTimeout(() => {
      setIsAway(true);
      if (onAway) {
        onAway();
      }
    }, awayThreshold);
  }, [awayThreshold, onAway]);

  const handleWindowFocus = useCallback(() => {
    clearAwayTimer();
    
    if (isAway) {
      const awayDuration = awayStartTime ? 
        Math.round((new Date() - awayStartTime) / 1000) : 0;
      
      if (onReturn) {
        onReturn({
          missedMessages: getMissedMessages(),
          awayDuration,
          awayStartTime
        });
      }
      
      setIsAway(false);
    }
    
    setAwayStartTime(null);
  }, [isAway, awayStartTime, onReturn, clearAwayTimer, getMissedMessages]);

  useEffect(() => {
    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      // Cleanup
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearAwayTimer();
    };
  }, [handleVisibilityChange, handleWindowBlur, handleWindowFocus, clearAwayTimer]);

  return {
    isVisible,
    isAway,
    awayStartTime,
    addMissedMessage,
    getMissedMessages,
    clearMissedMessages
  };
};

export default usePageVisibility;
