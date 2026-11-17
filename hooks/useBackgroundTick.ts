import { useEffect, useRef } from 'react';

export const useBackgroundTick = (
  isActive: boolean,
  onTick: () => void,
  intervalMs = 500
) => {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!isActive) return;

    let worker: Worker | null = null;
    let blobUrl: string | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const workerCode = `setInterval(function(){ postMessage(0); }, ${intervalMs});`;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      worker.onmessage = () => {
        onTickRef.current();
      };
    } catch {
      fallbackInterval = setInterval(() => {
        onTickRef.current();
      }, intervalMs);
    }

    return () => {
      if (worker) {
        worker.terminate();
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [isActive, intervalMs]);
};
