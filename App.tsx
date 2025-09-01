import React, { useMemo, useEffect } from 'react';
import { CountdownDisplay } from './components/CountdownDisplay';
import { CountdownControls } from './components/CountdownControls';
import { TimerDisplay } from './components/TimerDisplay';
import { Controls } from './components/Controls';
import { SettingsMenu } from './components/SettingsMenu';
import { useStopwatch } from './hooks/useStopwatch';
import { useCountdown } from './hooks/useCountdown';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { playNotificationSound } from './utils/sound';

const AppContent: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const stopwatch = useStopwatch();
  const countdown = useCountdown(settings.countdownDuration, settings.countdownRestDuration, settings);

  const isPastHalfway = countdown.timeLeft <= settings.countdownDuration / 2 && countdown.timeLeft > 0;

  const themeClasses = useMemo(() => {
    if (settings.showCountdown && isPastHalfway && countdown.isRunning) {
        return 'bg-red-600 text-white';
    }
    return 'bg-black text-white';
  }, [settings.showCountdown, isPastHalfway, countdown.isRunning]);

  useEffect(() => {
    if (settings.stealthModeEnabled) {
      document.body.className = 'bg-black';
    } else {
      document.body.className = `${themeClasses} theme-transition`;
    }
  }, [themeClasses, settings.stealthModeEnabled]);


  // Keyboard shortcuts
  useEffect(() => {
    const handleUniversalStartStop = () => {
        const isAnythingRunning = stopwatch.isRunning || countdown.isRunning || countdown.isResting;
        if (isAnythingRunning) {
          stopwatch.stop();
          countdown.stop();
        } else {
          stopwatch.start();
          countdown.start();
        }
    };
      
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return; // Don't interfere with text inputs
      }

      const key = event.key.toLowerCase();
      let newVolume: number;

      const toggleMute = () => {
        if (settings.isMuted) {
          updateSettings({
            isMuted: false,
            volume: settings.volume === 0 ? 0.5 : settings.volume,
          });
        } else {
          updateSettings({ isMuted: true });
        }
      };

      switch (key) {
        case 'm':
        case 'צ': // Hebrew keyboard mapping for 'm'
          toggleMute();
          break;
        case 'arrowup':
          event.preventDefault();
          newVolume = Math.min(1, (settings.isMuted ? 0 : settings.volume) + 0.05);
          updateSettings({ volume: newVolume, isMuted: false });
          if(settings.allSoundsEnabled && !settings.stealthModeEnabled) playNotificationSound(newVolume);
          break;
        case 'arrowdown':
          event.preventDefault();
          newVolume = Math.max(0, (settings.isMuted ? 0 : settings.volume) - 0.05);
          updateSettings({ volume: newVolume, isMuted: newVolume === 0 });
          if(settings.allSoundsEnabled && !settings.stealthModeEnabled) playNotificationSound(newVolume);
          break;
        case ' ': // Spacebar
            event.preventDefault();
            handleUniversalStartStop();
            break;
        case 'home':
            event.preventDefault();
            updateSettings({ stealthModeEnabled: !settings.stealthModeEnabled });
            break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, updateSettings, stopwatch, countdown]);


  // Auto-start timers on initial render
  useEffect(() => {
    stopwatch.start();
    countdown.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

  if (settings.stealthModeEnabled) {
    return <div className="fixed inset-0 bg-black z-[100]"></div>;
  }

  const dynamicStyles = {
    '--countdown-font-size': `${10 + (settings.countdownSize / 100) * 10}rem`,
    '--stopwatch-font-size': `${2 + (settings.stopwatchSize / 100) * 1.5}rem`,
    '--controls-scale': settings.controlsSize / 100,
  } as React.CSSProperties;

  return (
    <div className="min-h-screen flex flex-col p-4 select-none" style={dynamicStyles}>
      <SettingsMenu />
      <main className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
        {settings.showCountdown ? (
          <>
            <CountdownDisplay timeLeft={countdown.timeLeft} />
            <CountdownControls
              isRunning={countdown.isRunning || countdown.isResting}
              start={countdown.start}
              stop={countdown.stop}
              reset={countdown.reset}
            />
          </>
        ) : (
           null
        )}
      </main>

      {settings.showTimer && (
        <footer className="w-full max-w-lg mx-auto flex flex-col items-center pt-8">
            <TimerDisplay time={stopwatch.time} />
            <Controls 
              isRunning={stopwatch.isRunning}
              start={stopwatch.start}
              stop={stopwatch.stop}
              reset={stopwatch.reset}
              cycleCount={settings.showCycleCounter ? countdown.cycleCount : null}
              resetCycleCount={countdown.resetCycleCount}
            />
        </footer>
      )}
    </div>
  );
};


const App: React.FC = () => {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
};

export default App;