import { useEffect, useRef } from 'react';

export const useWakeLock = (enabled: boolean) => {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = async () => {
      const current = sentinelRef.current;
      sentinelRef.current = null;
      if (current && !current.released) {
        try {
          await current.release();
        } catch {
          // Ignore release errors when browser already released the lock
        }
      }
    };

    const requestWakeLock = async () => {
      if (
        cancelled ||
        !enabledRef.current ||
        document.visibilityState !== 'visible' ||
        !('wakeLock' in navigator)
      ) {
        return;
      }

      if (sentinelRef.current && !sentinelRef.current.released) {
        return;
      }

      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled || !enabledRef.current) {
          await sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
        });
      } catch {
        // Screen Wake Lock can fail due to battery saver mode or browser policy
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        requestWakeLock();
      }
    };

    if (enabled) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled]);
};
