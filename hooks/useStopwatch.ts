import { useState, useRef, useCallback } from 'react';

export const useStopwatch = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // FIX: useRef must be initialized. Using `undefined` as the initial value.
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number>(0);
  const totalTimeRef = useRef<number>(0);

  const animate = (timestamp: number) => {
    if (lastTickRef.current) {
      const delta = timestamp - lastTickRef.current;
      totalTimeRef.current += delta;
      setTime(totalTimeRef.current);
    }
    lastTickRef.current = timestamp;
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  const start = useCallback(() => {
    if (!isRunning) {
      setIsRunning(true);
      lastTickRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [isRunning]);

  const stop = useCallback(() => {
    if (isRunning && animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      setIsRunning(false);
    }
  }, [isRunning]);

  const reset = useCallback(() => {
    stop();
    setTime(0);
    totalTimeRef.current = 0;
  }, [stop]);

  return { time, isRunning, start, stop, reset };
};