





import { useState, useRef, useCallback, useEffect } from 'react';
import { Settings } from '../contexts/SettingsContext';
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

    // Handle end of a phase (running or resting)
    if (remaining <= 0) {
        setTimeLeft(0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;

        // Use a timeout to allow the '0' to render for a moment before transitioning
        setTimeout(() => {
            if (phaseRef.current === 'running') {
                if (canPlaySound && currentSettings.playSoundAtEnd) {
                    playEndSound(volume);
                }
                setCycleCount(c => c + 1);
                if (onCycleCompleteRef.current) {
                    onCycleCompleteRef.current();
                }
                if (restDurationMsRef.current > 0) {
                    setPhase('resting');
                    endTimeRef.current = performance.now() + restDurationMsRef.current;
                    setTimeLeft(restDurationMsRef.current);
                    halfwaySoundPlayedRef.current = false;
                    animationFrameRef.current = requestAnimationFrame(animate);
                } else {
                    setPhase('stopped');
                    setTimeLeft(durationMsRef.current);
                    timeLeftOnPauseRef.current = durationMsRef.current;
                    halfwaySoundPlayedRef.current = false;
                }
            } else if (phaseRef.current === 'resting') {
                // For the default timer (which is the only case that reaches here),
                // loop back to the running phase instead of stopping.
                setPhase('running');
                endTimeRef.current = performance.now() + durationMsRef.current;
                setTimeLeft(durationMsRef.current);
                halfwaySoundPlayedRef.current = false; // Reset for the next run
                if (canPlaySound && currentSettings.playSoundOnRestart) {
                    // Play a sound to signify the start of the next cycle
                    playNotificationSound(volume);
                }
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        }, 100);
        return;
    }

    setTimeLeft(remaining);

    // Play halfway sound
    const totalDuration = currentPhase === 'running' ? durationMsRef.current : restDurationMsRef.current;
    if (canPlaySound && currentSettings.playSoundAtHalfway && !halfwaySoundPlayedRef.current && remaining <= totalDuration / 2) {
        playNotificationSound(volume);
        halfwaySoundPlayedRef.current = true;
    }
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const start = useCallback(() => {
    // FIX: Use the state setter from useState (_setPhase) which accepts a function,
    // and manually update the ref inside the callback to keep it in sync.
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
    // FIX: Use the state setter from useState (_setPhase) which accepts a function,
    // and manually update the ref inside the callback to keep it in sync.
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

  const reset = useCallback(() => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
      setPhase('stopped');
      const newDurationMs = durationMsRef.current;
      setTimeLeft(newDurationMs);
      timeLeftOnPauseRef.current = newDurationMs;
      setCycleCount(0);
      halfwaySoundPlayedRef.current = false;
      const currentSettings = settingsRef.current;
      if (currentSettings.allSoundsEnabled && !currentSettings.isMuted && !currentSettings.stealthModeEnabled && currentSettings.playSoundOnRestart) {
          playNotificationSound(currentSettings.volume);
      }
  }, []);

  const resetCycleCount = useCallback(() => {
      setCycleCount(0);
  }, []);

  useEffect(() => {
      const newDurationMs = initialDuration * 1000;
      const newRestDurationMs = restDuration * 1000;
      durationMsRef.current = newDurationMs;
      restDurationMsRef.current = newRestDurationMs;
      if (phaseRef.current === 'stopped') {
          setTimeLeft(newDurationMs);
          timeLeftOnPauseRef.current = newDurationMs;
      }
  }, [initialDuration, restDuration]);

  useEffect(() => {
      reset();
  }, [stepKey, reset]);

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