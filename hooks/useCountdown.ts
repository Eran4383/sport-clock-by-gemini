
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
    setIsRestPhase(isRestStep);
  }, [isRestStep]);
  
  const onCycleCompleteRef = useRef(onCycleComplete);
  useEffect(() => {
      onCycleCompleteRef.current = onCycleComplete;
  }, [onCycleComplete]);

  const [timeLeft, setTimeLeft] = useState(initialDuration * 1000);
  const [cycleCount, setCycleCount] = useState(0);
  const [phase, _setPhase] = useState<Phase>('stopped');
  const [isRestPhase, setIsRestPhase] = useState(isRestStep);
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
    const { allSoundsEnabled, isMuted, volume, stealthModeEnabled, customSounds } = currentSettings;
    const canPlaySound = allSoundsEnabled && !isMuted && !stealthModeEnabled;

    if (remaining <= 0) {
        setTimeLeft(0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
        
        if (canPlaySound && currentSettings.playSoundAtEnd && (currentPhase === 'running' || currentPhase === 'resting')) {
            playEndSound(volume, customSounds?.end?.dataUrl);
        }

        setTimeout(() => {
            if (currentPhase === 'running') {
                setCycleCount(c => c + 1);
                
                if (onCycleCompleteRef.current) {
                    setPhase('stopped');
                    onCycleCompleteRef.current();
                    return;
                }

                if (restDurationMsRef.current > 0) {
                    setPhase('resting');
                    setIsRestPhase(true);
                    endTimeRef.current = performance.now() + restDurationMsRef.current;
                } else {
                    setPhase('running');
                    setIsRestPhase(false);
                    halfwaySoundPlayedRef.current = false;
                    lastSecondPlayedRef.current = null;
                    setTimeLeft(durationMsRef.current);
                    endTimeRef.current = performance.now() + durationMsRef.current;
                }
            } else if (currentPhase === 'resting') {
                setPhase('running');
                setIsRestPhase(false);
                halfwaySoundPlayedRef.current = false;
                lastSecondPlayedRef.current = null;
                setTimeLeft(durationMsRef.current);
                endTimeRef.current = performance.now() + durationMsRef.current;
            }

            if (phaseRef.current !== 'stopped') {
                if (canPlaySound && currentSettings.playSoundOnRestart) {
                    playStartSound(volume, customSounds?.start?.dataUrl);
                }
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        }, 1000);

        return;
    }

    setTimeLeft(remaining);
    
    const isCurrentlyResting = phaseRef.current === 'resting' || isRestStepRef.current;
    if (!isCurrentlyResting && currentPhase === 'running' && canPlaySound && currentSettings.playSoundAtHalfway && !halfwaySoundPlayedRef.current && remaining <= durationMsRef.current / 2) {
        playNotificationSound(volume, customSounds?.notification?.dataUrl);
        halfwaySoundPlayedRef.current = true;
    }

    const currentSecond = Math.ceil(remaining / 1000);
    if (canPlaySound && currentSecond <= 3 && currentSecond > 0 && lastSecondPlayedRef.current !== currentSecond) {
        playTickSound(volume, customSounds?.tick?.dataUrl);
        lastSecondPlayedRef.current = currentSecond;
    }

    animationFrameRef.current = requestAnimationFrame(animate);
}, []);

  const start = useCallback(() => {
    if (phaseRef.current === 'stopped') {
      const targetPhase = isRestPhase ? 'resting' : 'running';
      endTimeRef.current = performance.now() + timeLeftOnPauseRef.current;
      setPhase(targetPhase);
      
      const currentSecond = Math.ceil(timeLeftOnPauseRef.current / 1000);
      lastSecondPlayedRef.current = currentSecond > 3 ? null : currentSecond;

      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled, customSounds } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart && timeLeftOnPauseRef.current >= (isRestPhase ? restDurationMsRef.current : durationMsRef.current)) {
         playStartSound(volume, customSounds?.start?.dataUrl);
      }
      if (!animationFrameRef.current) {
          animationFrameRef.current = requestAnimationFrame(animate);
      }
    }
  }, [animate, isRestPhase]);

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
    
    if (!onCycleCompleteRef.current) {
        setCycleCount(0);
    }
    
    setIsRestPhase(false);
    halfwaySoundPlayedRef.current = false;
    lastSecondPlayedRef.current = null;
    setTimeLeft(durationMsRef.current);
    timeLeftOnPauseRef.current = durationMsRef.current;
    endTimeRef.current = performance.now() + durationMsRef.current;
    
    const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled, customSounds } = settingsRef.current;
    if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart) {
        playStartSound(volume, customSounds?.start?.dataUrl);
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
    
    if (!onCycleCompleteRef.current) {
        setCycleCount(0); 
    }

    if (wasActive) {
      const { allSoundsEnabled, isMuted, volume, playSoundOnRestart, stealthModeEnabled, customSounds } = settingsRef.current;
      if (allSoundsEnabled && !isMuted && !stealthModeEnabled && playSoundOnRestart) {
        playStartSound(volume, customSounds?.start?.dataUrl);
      }
      endTimeRef.current = performance.now() + newDurationMs;
      setPhase('running');
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    } else {
      setPhase('stopped');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    }
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
    isRestPhase,
    start,
    stop,
    reset,
    resetCycleCount,
  };
};
