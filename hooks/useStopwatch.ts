import { useState, useRef, useCallback } from 'react';

export const useStopwatch = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  // This ref will store the timestamp when the stopwatch was started or resumed.
  const startTimeRef = useRef<number>(0);
  // This ref will store the elapsed time when the stopwatch was paused.
  const pausedTimeRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    // Calculate time elapsed since the last start/resume
    const elapsedSinceStart = timestamp - startTimeRef.current;
    // Total time is the time from previous pauses + time since the last resume
    setTime(pausedTimeRef.current + elapsedSinceStart);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const start = useCallback(() => {
    setIsRunning(running => {
      if (running) {
        return true; // Already running, do nothing
      }
      // Set the start time for this new running interval
      startTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
      return true;
    });
  }, [animate]);

  const stop = useCallback(() => {
    setIsRunning(running => {
      if (!running || !animationFrameRef.current) {
        return false; // Already stopped, do nothing
      }
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      
      // Calculate the time elapsed during the last run and add it to pausedTimeRef
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
