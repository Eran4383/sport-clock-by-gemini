import { useState, useRef, useCallback, useEffect } from 'react';
import { Settings } from '../contexts/SettingsContext';
import { playStartSound, playNotificationSound, playEndSound } from '../utils/sound';

type Phase = 'stopped' | 'running' | 'resting';

export const useCountdown = (initialDuration: number, restDuration: number, settings: Settings, onCycleComplete?: () => void, stepKey?: string | number) => {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const endTimeRef = useRef<number>(0);
  const phaseRef = useRef<Phase>('stopped');
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
  const durationRef = useRef(initialDuration); // Ref to hold the most up-to-date duration.

  const setPhase = (newPhase: Phase) => {
    phaseRef.current = newPhase;
    _setPhase(newPhase);
  };

  const animate = useCallback(() => {
    if (phaseRef.current === 'stopped') {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
        return;
    }

    const remaining = endTimeRef.current - performance.now();
    const currentSettings = settingsRef.current;
    const { allSoundsEnabled, isMuted, volume, stealthModeEnabled } = currentSettings;
    const canPlaySound = allSoundsEnabled && !isMuted && !stealthModeEnabled;
    const durationMs = durationRef.current * 1000; // Use ref for current duration
    const restDurationMs = restDuration * 1000;

    if (remaining <= 0) {
        const endedPhase = phaseRef.current;
        setTimeLeft(0);
        
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
        }

        // Play sound immediately when countdown hits zero for the 'running' phase.
        if (endedPhase === 'running' && canPlaySound && currentSettings.playSoundAtEnd) {
            playEndSound(volume);
        }

        setTimeout(() => {
            if (phaseRef.current === 'stopped') {
                return;
            }

            if (onCycleCompleteRef.current) {
                // Sound already played, just call the workout handler
                onCycleCompleteRef.current();
                return;
            }

            const startNewPhase = (phase: Phase, duration: number) => {
                setPhase(phase);
                endTimeRef.current = performance.now() + duration;
                setTimeLeft(duration);
                halfwaySoundPlayedRef.current = false;
                if (canPlaySound && currentSettings.playSoundOnRestart) {
                    playStartSound(volume);
                }
                animationFrameRef.current = requestAnimationFrame(animate);
            };

            if (endedPhase === 'running') {
                setCycleCount(c => c + 1);
                // Sound is already played.
                
                if (restDurationMs > 0) {
                    startNewPhase('resting', restDurationMs);
                } else {
                    startNewPhase('running', durationMs);
                }
            } else if (endedPhase === 'resting') {
                startNewPhase('running', durationMs);
            }

        }, 1000);

        return;
    }

    setTimeLeft(remaining);

    const totalDuration = phaseRef.current === 'running' ? durationMs : restDurationMs;
    if (canPlaySound && currentSettings.playSoundAtHalfway && !halfwaySoundPlayedRef.current && remaining <= totalDuration / 2) {
        playNotificationSound(volume);
        halfwaySoundPlayedRef.current = true;
    }
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [restDuration]);

  const start = useCallback(() => {
    _setPhase(currentPhase => {
        if (currentPhase !== 'stopped') {
            return currentPhase;
        }
        const startTime = performance.now();
        endTimeRef.current = startTime + timeLeftOnPauseRef.current;
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(animate);
        phaseRef.current = 'running';
        return 'running';
    });
  }, [animate]);

  const stop = useCallback(() => {
    _setPhase(currentPhase => {
        if (currentPhase === 'stopped') {
            return 'stopped';
        }
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
        const remaining = endTimeRef.current - performance.now();
        timeLeftOnPauseRef.current = remaining > 0 ? remaining : 0;
        phaseRef.current = 'stopped';
        return 'stopped';
    });
  }, []);

  const resetCycleCount = useCallback(() => {
      setCycleCount(0);
  }, []);
  
  const reset = useCallback(() => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
      setPhase('stopped');
      // FIX: Use the ref to get the current duration, preventing stale closures.
      const newDurationMs = durationRef.current * 1000;
      setTimeLeft(newDurationMs);
      timeLeftOnPauseRef.current = newDurationMs;
      resetCycleCount();
      halfwaySoundPlayedRef.current = false;
      const currentSettings = settingsRef.current;
      if (currentSettings.allSoundsEnabled && !currentSettings.isMuted && !currentSettings.stealthModeEnabled && currentSettings.playSoundOnRestart) {
          playStartSound(currentSettings.volume);
      }
  }, [resetCycleCount]);


  // This is the CRITICAL effect that handles external changes to duration (from settings) or workout steps.
  useEffect(() => {
      const wasRunning = phaseRef.current !== 'stopped';

      // 1. Stop any currently running timer.
      if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
      }

      // 2. Update the ref and reset internal state to reflect the new duration.
      // This will cause the UI to update immediately.
      durationRef.current = initialDuration;
      const newDurationMs = initialDuration * 1000;
      setTimeLeft(newDurationMs);
      timeLeftOnPauseRef.current = newDurationMs;
      halfwaySoundPlayedRef.current = false;
      
      // For workout step changes, always reset cycle count and stop.
      // The workout context is responsible for starting the timer for the new step.
      if (stepKey) {
          setCycleCount(0);
          setPhase('stopped');
          return;
      }
      
      // For duration changes from settings, auto-start if it was running before.
      if (wasRunning) {
          setPhase('running');
          endTimeRef.current = performance.now() + newDurationMs;
          animationFrameRef.current = requestAnimationFrame(animate);
      } else {
          setPhase('stopped');
      }
  // The `animate` dependency is included because it's used inside the effect.
  // The effect logic correctly handles restarts based on the `wasRunning` flag.
  }, [initialDuration, stepKey, animate]);


  return {
      timeLeft: timeLeft / 1000, // convert to seconds for display
      isRunning: phase === 'running',
      isResting: phase === 'resting',
      cycleCount,
      start,
      stop,
      reset,
      resetCycleCount,
  };
};
