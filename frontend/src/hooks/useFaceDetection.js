import { useState, useEffect, useCallback, useRef } from 'react';
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * Custom hook for camera-based presence detection
 * Uses MediaPipe Face Detection (ML-based) for high accuracy
 * 
 * v4.0 - MediaPipe Integration (Replaces heuristic canvas analysis)
 * - Works locally (WASM)
 * - Lighting tolerant
 * - Device agnostic
 */
const useFaceDetection = ({
  videoRef,
  enabled = true,
  awayThreshold = 5000, // 5 seconds without presence = away
  detectionInterval = 500, // Check every 0.5 seconds (Fast ML inference)
  onAway,
  onReturn,
  debugMode = false
}) => {
  const [isAway, setIsAway] = useState(false);
  const [faceDetected, setFaceDetected] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [detectionMetrics, setDetectionMetrics] = useState({
    presenceScore: 0,
    confidence: 0,
    faceCount: 0,
    lastUpdate: null
  });
  
  const faceDetectorRef = useRef(null);
  const awayTimerRef = useRef(null);
  const awayStartTimeRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const isAwayRef = useRef(false);
  const noPresenceCountRef = useRef(0);
  const presenceCountRef = useRef(0);

  // Initialize MediaPipe Face Detector
  useEffect(() => {
    const initializeDetector = async () => {
      try {
        console.log('🚀 Initializing MediaPipe Face Detector...');
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: "GPU"
          },
          runningMode: "VIDEO"
        });
        faceDetectorRef.current = detector;
        setIsModelLoaded(true);
        console.log('✅ MediaPipe Face Detector ready');
      } catch (error) {
        console.error('❌ Failed to initialize MediaPipe Face Detector:', error);
      }
    };

    initializeDetector();
    
    return () => {
        if (faceDetectorRef.current) {
            faceDetectorRef.current.close();
        }
    };
  }, []);

  // Detect presence using MediaPipe
  const detectPresence = useCallback(async () => {
    if (!enabled || !videoRef?.current || !faceDetectorRef.current) return { isPresent: true, metrics: {} };
    
    const video = videoRef.current;
    
    // Make sure video is playing and has dimensions
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return { isPresent: true, metrics: {} }; 
    }

    try {
      const startTimeMs = performance.now();
      const detections = faceDetectorRef.current.detectForVideo(video, startTimeMs).detections;
      
      const isPresent = detections.length > 0;
      const confidence = isPresent ? Math.round(detections[0].categories[0].score * 100) : 0;
      
      const metrics = {
        presenceScore: confidence,
        confidence: confidence,
        faceCount: detections.length,
        isPresent,
        method: 'mediapipe-ml',
        lastUpdate: Date.now()
      };

      if (debugMode) {
        console.log(`🔍 MediaPipe: Faces=${detections.length}, Conf=${confidence}%`);
      }

      return { isPresent, metrics };
    } catch (error) {
      console.error('MediaPipe detection error:', error);
      return { isPresent: true, metrics: {} };
    }
  }, [enabled, videoRef, debugMode]);

  // Handle detection result
  const handleDetectionResult = useCallback(({ isPresent, metrics }) => {
    const now = Date.now();
    
    if (metrics && Object.keys(metrics).length > 0) {
      setDetectionMetrics(prev => ({ ...prev, ...metrics }));
    }
    
    if (isPresent) {
      setFaceDetected(true);
      noPresenceCountRef.current = 0;
      presenceCountRef.current++;
      
      if (awayTimerRef.current) {
        clearTimeout(awayTimerRef.current);
        awayTimerRef.current = null;
      }
      
      // If was away, trigger return (require 2 consecutive present detections)
      if (isAwayRef.current && presenceCountRef.current >= 2) {
        const awayDuration = awayStartTimeRef.current 
          ? Math.round((now - awayStartTimeRef.current) / 1000) 
          : 0;
        
        console.log(`👤 User returned! Away for ${awayDuration}s`);
        console.log(`🔔 About to call onReturn callback - onReturn is:`, typeof onReturn);
        
        isAwayRef.current = false;
        setIsAway(false);
        
        if (onReturn) {
          console.log(`✅ Calling onReturn({ awayDuration: ${awayDuration} })`);
          onReturn({
            awayDuration,
            awayStartTime: awayStartTimeRef.current,
            metrics
          });
        } else {
          console.error('❌ onReturn callback is not defined!');
        }
        
        awayStartTimeRef.current = null;
      }
    } else {
      setFaceDetected(false);
      noPresenceCountRef.current++;
      presenceCountRef.current = 0;
      
      // Require consecutive no-presence detections before triggering away
      const consecutiveRequired = Math.max(2, Math.ceil(awayThreshold / detectionInterval));
      
      if (noPresenceCountRef.current >= consecutiveRequired && !isAwayRef.current) {
        console.log(`👻 User is AWAY (no face detected)`);
        isAwayRef.current = true;
        awayStartTimeRef.current = Date.now();
        setIsAway(true);
        
        if (onAway) {
          onAway({ metrics });
        }
      }
    }
  }, [awayThreshold, detectionInterval, onAway, onReturn]);

  // Main detection loop
  useEffect(() => {
    if (!enabled || !isModelLoaded) {
      setIsDetecting(false);
      if (detectionLoopRef.current) {
        clearInterval(detectionLoopRef.current);
        detectionLoopRef.current = null;
      }
      return;
    }

    setIsDetecting(true);
    console.log('🎥 Starting MediaPipe presence detection loop');
    
    detectionLoopRef.current = setInterval(async () => {
      const result = await detectPresence();
      handleDetectionResult(result);
    }, detectionInterval);

    return () => {
      if (detectionLoopRef.current) {
        clearInterval(detectionLoopRef.current);
        detectionLoopRef.current = null;
      }
    };
  }, [enabled, isModelLoaded, detectPresence, handleDetectionResult, detectionInterval]);

  // Manual controls for testing
  const setUserAway = useCallback(() => {
    if (!isAwayRef.current) {
      console.log('👻 User manually set as AWAY');
      isAwayRef.current = true;
      awayStartTimeRef.current = Date.now();
      setIsAway(true);
      setFaceDetected(false);
      presenceCountRef.current = 0;
      if (onAway) onAway({ manual: true });
    }
  }, [onAway]);

  const setUserPresent = useCallback(() => {
    if (isAwayRef.current) {
      const awayDuration = awayStartTimeRef.current 
        ? Math.round((Date.now() - awayStartTimeRef.current) / 1000) 
        : 0;
      console.log(`👤 User manually set as PRESENT`);
      isAwayRef.current = false;
      setIsAway(false);
      setFaceDetected(true);
      noPresenceCountRef.current = 0;
      presenceCountRef.current = 0;
      if (onReturn) onReturn({ awayDuration, awayStartTime: awayStartTimeRef.current, manual: true });
      awayStartTimeRef.current = null;
    }
  }, [onReturn]);

  const resetBaseline = useCallback(() => {
    // No-op for MediaPipe, but kept for API compatibility
    console.log('🔄 Resetting baseline (No-op for MediaPipe)');
  }, []);

  return {
    isAway,
    faceDetected,
    isModelLoaded,
    isDetecting,
    detectionMetrics,
    setUserAway,
    setUserPresent,
    resetBaseline,
    isAwayRef
  };
};

export default useFaceDetection;
