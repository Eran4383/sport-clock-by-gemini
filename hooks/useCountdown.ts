import { useState, useRef, useCallback, useEffect } from 'react';
import { Settings } from './useSettings';
import { playNotificationSound, playEndSound } from '../utils/sound';

type Phase = 'stopped' | 'running' | 'resting';

export const useCountdown = (initialDuration: number, restDuration: number, settings: Settings, onCycleComplete?: () => void, stepKey?: string | number) => {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const endTimeRef = useRef<number>(0);
  const phaseRef = useRef<Phase>('stopped');
  const durationMsRef = useRef(initialDuration * 1000);
  const restDurationMsRef = useRef(restDuration * 1000);
  const halfwaySoundPlayedRef = useRef(false);
  
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  
  const onCycleCompleteRef = useRef(onCycleComplete);
  useEffect(() => {
      onCycleCompleteRef.current = onCycleComplete;
  }, [onCycleComplete]);

  const [timeLeft, setTimeLeft] = useState(initialDuration * 1000);
  const [cycleCount, setCycleCount] = useState(0);
  const [phase, _setPhase] = useState<Phase>('stopped');
  const timeLeftOnPauseRef = useRef(initialDuration * 1000);

  const setPhase = (newPhase: Phase) => {
    phaseRef.current = newPhase;
    _setPhase(newPhase);
  };

  const animate = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase === 'stopped') {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
      return;
    }
    
    const remaining = endTimeRef.current - performance.now();
    const currentSettings = settingsRef.current;
    const { allSoundsEnabled, isMuted, volume, stealthModeEnabled } = currentSettings;
    const canPlaySound = allSoundsEnabled && !isMuted && !stealthModeEnabled;


    if (currentPhase === 'running') {
       if (canPlaySound && currentSettings.playSoundAtHalfway && !halfwaySoundPlayedRef.current && remaining <= durationMsRef.current / 2) {
          playNotificationSound(volume);
          halfwaySoundPlayedRef.current = true;
       }

      if (remaining <= 0) {
        setCycleCount(c => c + 1);
        if (canPlaySound && currentSettings.playSoundAtEnd) {
          playEndSound(volume);
        }
        
        setTimeLeft(0); // Ensure timer visually hits 0
        
        if (onCycleCompleteRef.current) {
            const callback = onCycleCompleteRef.current;
            // Stop this timer instance immediately
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
            phaseRef.current = 'stopped';
            
            // Trigger the next step on the next paint cycle, allowing '0' to render first.
            requestAnimationFrame(callback);
            return; // Stop the animate function
        }
        
        if (restDurationMsRef.current > 0) {
            setPhase('resting');
            endTimeRef.current = performance.now() + restDurationMsRef.current;
        } else {
            // No rest, just restart
            if (canPlaySound && currentSettings.playSoundOnRestart) {
                playNotificationSound(volume);
            }
            halfwaySoundPlayedRef.current = false;
            setTimeLeft(durationMsRef.current);
            endTimeRef.current = performance.now() + durationMsRef.current;
        }

      } else {
        setTimeLeft(remaining);
      }
    } else if (currentPhase === 'resting') {
      if (remaining <= 0) {
        if (canPlaySound && currentSettings.playSoundOnRestart) {
          playNotificationSound(volume);
        }
        setPhase('running');
        halfwaySoundPlayedRef.current = false;
        setTimeLeft(durationMsRef.current);
        endTimeRef.current = performance.now() + durationMsRef.current;
      } else {
        setTimeLeft(remaining);
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const start = useCallback(() => {
    // Check phaseRef directly as state update might be async
    if (phaseRef.current === 'stopped') {
      endTimeRef.current = performance.now() + timeLeftOnPauseRef.current;
      setPhase('running');
      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart && timeLeftOnPauseRef.current >= durationMsRef.current) {
         playNotificationSound(volume);
      }
      if (!animationFrameRef.current) {
          animationFrameRef.current = requestAnimationFrame(animate);
      }
    }
  }, [animate]);

  const stop = useCallback(() => {
    if (phaseRef.current !== 'stopped') {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;

      const remaining = endTimeRef.current - performance.now();
      const newTimeLeft = Math.max(0, remaining);
      setTimeLeft(newTimeLeft);
      timeLeftOnPauseRef.current = newTimeLeft;
      
      setPhase('stopped');
    }
  }, []);

  const reset = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = undefined;
    
    // During a workout, reset shouldn't reset the cycle count
    if (!onCycleCompleteRef.current) {
        setCycleCount(0);
    }
    
    halfwaySoundPlayedRef.current = false;
    setTimeLeft(durationMsRef.current);
    timeLeftOnPauseRef.current = durationMsRef.current;
    endTimeRef.current = performance.now() + durationMsRef.current;
    
    const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
    if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart) {
        playNotificationSound(volume);
    }
    
    setPhase('running');
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [animate]);
  
  const resetCycleCount = useCallback(() => {
    setCycleCount(0);
  }, []);

  useEffect(() => {
    const newDurationMs = initialDuration * 1000;
    const wasActive = phaseRef.current !== 'stopped' || onCycleCompleteRef.current !== undefined;
    
    durationMsRef.current = newDurationMs;
    
    setTimeLeft(newDurationMs);
    timeLeftOnPauseRef.current = newDurationMs;
    halfwaySoundPlayedRef.current = false;
    
    // Only reset cycles if not in a workout context
    if (!onCycleCompleteRef.current) {
        setCycleCount(0); 
    }

    if (wasActive) {
      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart) {
        playNotificationSound(volume);
      }
      endTimeRef.current = performance.now() + newDurationMs;
      setPhase('running');
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    } else {
      // If it wasn't active, ensure it stays stopped.
      setPhase('stopped');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    }
    // The stepKey is crucial. It ensures this effect re-runs when the step changes,
    // even if the new step has the same duration as the old one.
  }, [initialDuration, stepKey, animate]);
  
  useEffect(() => {
    restDurationMsRef.current = restDuration * 1000;
  }, [restDuration]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, []);

  return {
    timeLeft: timeLeft > 0 ? timeLeft / 1000 : 0,
    cycleCount,
    isRunning: phase === 'running',
    isResting: phase === 'resting',
    start,
    stop,
    reset,
    resetCycleCount,
  };
};