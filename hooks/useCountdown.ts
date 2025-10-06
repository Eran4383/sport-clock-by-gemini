


import { useState, useRef, useCallback, useEffect } from 'react';
import { Settings } from './useSettings';
import { playNotificationSound, playEndSound, playTickSound, playStartSound } from '../utils/sound';

type Phase = 'stopped' | 'running' | 'resting';

export const useCountdown = (initialDuration: number, restDuration: number, settings: Settings, onCycleComplete?: () => void, stepKey?: string | number, isRestStep: boolean = false) => {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const endTimeRef = useRef<number>(0);
  const phaseRef = useRef<Phase>('stopped');
  const durationMsRef = useRef(initialDuration * 1000);
  const restDurationMsRef = useRef(restDuration * 1000);
  const halfwaySoundPlayedRef = useRef(false);
  const lastSecondPlayedRef = useRef<number | null>(null);
  
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const isRestStepRef = useRef(isRestStep);
  useEffect(() => {
    isRestStepRef.current = isRestStep;
  }, [isRestStep]);
  
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
        
        // Play the end sound as soon as ANY countdown hits zero.
        if (canPlaySound && currentSettings.playSoundAtEnd && (currentPhase === 'running' || currentPhase === 'resting')) {
            playEndSound(volume);
        }

        // Use a timeout to allow the '0' to render for a full second before transitioning.
        setTimeout(() => {
            if (currentPhase === 'running') {
                setCycleCount(c => c + 1);
                
                if (onCycleCompleteRef.current) {
                    setPhase('stopped');
                    onCycleCompleteRef.current();
                    return; // The component will re-trigger the hook for the next step.
                }

                if (restDurationMsRef.current > 0) {
                    setPhase('resting');
                    endTimeRef.current = performance.now() + restDurationMsRef.current;
                } else {
                    // No rest, restart immediately. The end sound is sufficient notification.
                    setPhase('running');
                    halfwaySoundPlayedRef.current = false;
                    lastSecondPlayedRef.current = null;
                    setTimeLeft(durationMsRef.current);
                    endTimeRef.current = performance.now() + durationMsRef.current;
                }
            } else if (currentPhase === 'resting') {
                // Restarting the next phase. The end sound is sufficient notification.
                setPhase('running');
                halfwaySoundPlayedRef.current = false;
                lastSecondPlayedRef.current = null;
                setTimeLeft(durationMsRef.current);
                endTimeRef.current = performance.now() + durationMsRef.current;
            }

            // After transitioning, restart the animation loop
            if (phaseRef.current !== 'stopped') {
                if (canPlaySound && currentSettings.playSoundOnRestart) {
                    playStartSound(volume);
                }
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        }, 1000);

        return; // End this frame's execution
    }

    // Default case: update time left and continue animation
    setTimeLeft(remaining);
    
    // Halfway sound logic for the running phase
    const isCurrentlyResting = phaseRef.current === 'resting' || isRestStepRef.current;
    if (!isCurrentlyResting && currentPhase === 'running' && canPlaySound && currentSettings.playSoundAtHalfway && !halfwaySoundPlayedRef.current && remaining <= durationMsRef.current / 2) {
        playNotificationSound(volume);
        halfwaySoundPlayedRef.current = true;
    }

    const currentSecond = Math.ceil(remaining / 1000);
    if (canPlaySound && currentSecond <= 3 && currentSecond > 0 && lastSecondPlayedRef.current !== currentSecond) {
        playTickSound(volume);
        lastSecondPlayedRef.current = currentSecond;
    }

    animationFrameRef.current = requestAnimationFrame(animate);
}, []);

  const start = useCallback(() => {
    // Check phaseRef directly as state update might be async
    if (phaseRef.current === 'stopped') {
      endTimeRef.current = performance.now() + timeLeftOnPauseRef.current;
      setPhase('running');
      const currentSecond = Math.ceil(timeLeftOnPauseRef.current / 1000);
      lastSecondPlayedRef.current = currentSecond > 3 ? null : currentSecond;

      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart && timeLeftOnPauseRef.current >= durationMsRef.current) {
         playStartSound(volume);
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
    lastSecondPlayedRef.current = null;
    setTimeLeft(durationMsRef.current);
    timeLeftOnPauseRef.current = durationMsRef.current;
    endTimeRef.current = performance.now() + durationMsRef.current;
    
    const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
    if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart) {
        playStartSound(volume);
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
    lastSecondPlayedRef.current = null;
    
    // Only reset cycles if not in a workout context
    if (!onCycleCompleteRef.current) {
        setCycleCount(0); 
    }

    if (wasActive) {
      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart) {
        playStartSound(volume);
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