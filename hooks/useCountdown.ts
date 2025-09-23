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
  
  const durationRef = useRef(initialDuration);
  const restDurationRef = useRef(restDuration);
  
  // Effect to keep rest duration up-to-date without interrupting the timer.
  useEffect(() => {
    restDurationRef.current = restDuration;
  }, [restDuration]);


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
    const durationMs = durationRef.current * 1000;
    const restDurationMs = restDurationRef.current * 1000;

    if (remaining <= 0) {
        const endedPhase = phaseRef.current;
        setTimeLeft(0);
        
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
        }

        if (endedPhase === 'running' && canPlaySound && currentSettings.playSoundAtEnd) {
            playEndSound(volume);
        }

        setTimeout(() => {
            if (phaseRef.current === 'stopped') {
                return;
            }

            if (onCycleCompleteRef.current) {
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
  }, []);

  const start = useCallback((startTime?: number) => {
    _setPhase(currentPhase => {
        if (currentPhase !== 'stopped') {
            return currentPhase;
        }
        const sTime = startTime ?? performance.now();
        endTimeRef.current = sTime + timeLeftOnPauseRef.current;
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

      // FIX: Use the LATEST initialDuration from props, not a potentially stale
      // value from a ref. This ensures manual resets always use the current settings.
      const newDurationMs = initialDuration * 1000;
      durationRef.current = initialDuration; // Also update the ref for other parts of the hook.

      setTimeLeft(newDurationMs);
      timeLeftOnPauseRef.current = newDurationMs;
      resetCycleCount();
      halfwaySoundPlayedRef.current = false;
      const currentSettings = settingsRef.current;
      if (currentSettings.allSoundsEnabled && !currentSettings.isMuted && !currentSettings.stealthModeEnabled && currentSettings.playSoundOnRestart) {
          playStartSound(currentSettings.volume);
      }
  }, [initialDuration, resetCycleCount]);

  // This is the critical effect that handles external changes from settings or workout steps.
  useEffect(() => {
      const wasRunning = phaseRef.current !== 'stopped';

      // 1. Stop any currently running timer.
      if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
      }

      // 2. Update the duration ref and reset internal state to reflect the new duration.
      durationRef.current = initialDuration;
      const newDurationMs = initialDuration * 1000;
      setTimeLeft(newDurationMs);
      timeLeftOnPauseRef.current = newDurationMs;
      halfwaySoundPlayedRef.current = false;
      
      // 3. For workout step changes, always reset cycle count and stop.
      // The workout context is responsible for starting the timer for the new step.
      if (stepKey) {
          setCycleCount(0);
          setPhase('stopped');
          return;
      }
      
      // 4. For duration changes from settings, auto-restart if it was running before.
      if (wasRunning) {
          setPhase('running');
          endTimeRef.current = performance.now() + newDurationMs;
          animationFrameRef.current = requestAnimationFrame(animate);
      } else {
          setPhase('stopped');
      }
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
