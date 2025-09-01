import { useState, useRef, useCallback, useEffect } from 'react';
import { Settings } from './useSettings';
import { playNotificationSound, playEndSound } from '../utils/sound';

type Phase = 'stopped' | 'running' | 'resting';

export const useCountdown = (initialDuration: number, restDuration: number, settings: Settings) => {
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
        setTimeLeft(0);
        
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
      setTimeLeft(0); // Show 0 during rest
      if (remaining <= 0) {
        if (canPlaySound && currentSettings.playSoundOnRestart) {
          playNotificationSound(volume);
        }
        setPhase('running');
        halfwaySoundPlayedRef.current = false;
        setTimeLeft(durationMsRef.current);
        endTimeRef.current = performance.now() + durationMsRef.current;
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const start = useCallback(() => {
    if (phaseRef.current === 'stopped') {
      endTimeRef.current = performance.now() + timeLeftOnPauseRef.current;
      setPhase('running');
      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart && timeLeftOnPauseRef.current >= durationMsRef.current) {
         playNotificationSound(volume);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [animate]);

  const stop = useCallback(() => {
    if (phaseRef.current !== 'stopped') {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;

      if (phaseRef.current === 'running') {
          const remaining = endTimeRef.current - performance.now();
          const newTimeLeft = Math.max(0, remaining);
          setTimeLeft(newTimeLeft);
          timeLeftOnPauseRef.current = newTimeLeft;
      } else {
        // If stopped during rest, reset to full duration
        setTimeLeft(durationMsRef.current);
        timeLeftOnPauseRef.current = durationMsRef.current;
      }
      setPhase('stopped');
    }
  }, []);

  const reset = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = undefined;
    
    setCycleCount(0);
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
    const wasActive = phaseRef.current !== 'stopped';
    
    durationMsRef.current = newDurationMs;
    
    setTimeLeft(newDurationMs);
    timeLeftOnPauseRef.current = newDurationMs;
    halfwaySoundPlayedRef.current = false;
    setCycleCount(0); // Reset cycles when duration changes

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
    }
  }, [initialDuration, animate]);
  
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
    timeLeft: timeLeft / 1000,
    cycleCount,
    isRunning: phase === 'running',
    isResting: phase === 'resting',
    start,
    stop,
    reset,
    resetCycleCount,
  };
};