import { useState, useRef, useCallback } from 'react';

export const useStopwatch = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number>(0);
  const totalTimeRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    if (lastTickRef.current) {
      const delta = timestamp - lastTickRef.current;
      totalTimeRef.current += delta;
      setTime(totalTimeRef.current);
    }
    lastTickRef.current = timestamp;
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const start = useCallback(() => {
    setIsRunning(running => {
      if (!running) {
        lastTickRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(animate);
        return true;
      }
      return running;
    });
  }, [animate]);

  const stop = useCallback(() => {
    setIsRunning(running => {
      if (running && animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
        return false;
      }
      return running;
    });
  }, []);

  const reset = useCallback(() => {
    stop();
    setTime(0);
    totalTimeRef.current = 0;
  }, [stop]);

  return { time, isRunning, start, stop, reset };
};