import { useState, useRef, useCallback, useEffect } from 'react';
import { useBackgroundTick } from './useBackgroundTick';

export const useStopwatch = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    lastRafTimeRef.current = performance.now();
    const elapsedSinceStart = timestamp - startTimeRef.current;
    setTime(pausedTimeRef.current + elapsedSinceStart);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useBackgroundTick(
    isRunning,
    () => {
      if (document.hidden || performance.now() - lastRafTimeRef.current > 400) {
        const elapsedSinceStart = performance.now() - startTimeRef.current;
        setTime(pausedTimeRef.current + elapsedSinceStart);
      }
    },
    500
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        const elapsedSinceStart = performance.now() - startTimeRef.current;
        setTime(pausedTimeRef.current + elapsedSinceStart);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning]);

  const start = useCallback(() => {
    setIsRunning(running => {
      if (running) {
        return true;
      }
      startTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
      return true;
    });
  }, [animate]);

  const stop = useCallback(() => {
    setIsRunning(running => {
      if (!running || !animationFrameRef.current) {
        return false;
      }
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      
      const elapsedSinceStart = performance.now() - startTimeRef.current;
      pausedTimeRef.current = pausedTimeRef.current + elapsedSinceStart;

      return false;
    });
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setTime(0);
    pausedTimeRef.current = 0;
    startTimeRef.current = 0;
  }, []);

  return { time, isRunning, start, stop, reset };
};
