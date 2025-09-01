import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { CountdownDisplay } from './components/CountdownDisplay';
import { CountdownControls } from './components/CountdownControls';
import { TimerDisplay } from './components/TimerDisplay';
import { Controls } from './components/Controls';
import { SettingsMenu } from './components/SettingsMenu';
import { WorkoutMenu } from './components/WorkoutMenu';
import { RepDisplay } from './components/RepDisplay';
import { useStopwatch } from './hooks/useStopwatch';
import { useCountdown } from './hooks/useCountdown';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { WorkoutProvider, useWorkout } from './contexts/WorkoutContext';
import { playNotificationSound } from './utils/sound';

const AppContent: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { 
    activeWorkout, 
    currentStep, 
    nextStep,
    nextUpcomingStep,
    previousStep,
    stopWorkout: contextStopWorkout,
    isWorkoutPaused,
    pauseWorkout,
    resumeWorkout,
    isCountdownPaused,
    pauseStepCountdown,
    resumeStepCountdown,
    restartCurrentStep
  } = useWorkout();
  
  const stopwatch = useStopwatch();
  const wasWorkoutActive = useRef(false);
  const [workoutCompleted, setWorkoutCompleted] = useState(false);


  const isWorkoutActive = !!(activeWorkout && currentStep);
  const isRepStep = isWorkoutActive && currentStep.isRepBased;
  const countdownDuration = isWorkoutActive && !isRepStep ? currentStep.duration : (isWorkoutActive && isRepStep ? 0 : settings.countdownDuration);
  
  const countdown = useCountdown(
    countdownDuration, 
    settings.countdownRestDuration, 
    settings,
    isWorkoutActive ? nextStep : undefined,
    // Pass a unique key for each step and restart to ensure the countdown hook resets correctly
    isWorkoutActive ? `${currentStep.id}-${activeWorkout.currentStepIndex}-${activeWorkout.stepRestartKey || 0}` : undefined
  );

  const isPastHalfway = settings.showCountdown && countdown.isRunning && countdown.timeLeft <= countdownDuration / 2 && countdown.timeLeft > 0;

  const themeClasses = useMemo(() => {
    if (workoutCompleted) {
        return 'bg-green-300 text-black';
    }
    if (isPastHalfway) {
        return 'bg-red-600 text-white';
    }
    return 'bg-black text-white';
  }, [isPastHalfway, workoutCompleted]);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  }, []);
  
  const stopWorkoutAborted = () => {
    setWorkoutCompleted(false); // Aborting is not completing
    contextStopWorkout();
  };

  // Keyboard and interaction shortcuts
  useEffect(() => {
    const handleUniversalStartStop = () => {
        if (isRepStep || isWorkoutActive) return;
        
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
        return;
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
        case 'צ':
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
        case ' ':
            event.preventDefault();
            if (isWorkoutActive) {
                isWorkoutPaused ? resumeWorkout() : pauseWorkout();
            } else {
                if (workoutCompleted) setWorkoutCompleted(false);
                handleUniversalStartStop();
            }
            break;
        case 'enter':
            if (isRepStep) {
                event.preventDefault();
                nextStep();
            }
            break;
        case 'home':
            event.preventDefault();
            updateSettings({ stealthModeEnabled: !settings.stealthModeEnabled });
            break;
        case 'escape':
            if (isWorkoutActive) {
                if(window.confirm('Are you sure you want to stop the current workout?')) {
                    stopWorkoutAborted();
                }
            }
            break;
        case 'f':
        case 'כ': // Hebrew keyboard mapping for 'f'
            toggleFullScreen();
            break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, updateSettings, stopwatch, countdown, isWorkoutActive, isWorkoutPaused, isRepStep, nextStep, resumeWorkout, pauseWorkout, contextStopWorkout, toggleFullScreen, workoutCompleted]);

  // Update document title with countdown
  useEffect(() => {
    const originalTitle = "Advanced Sports Clock";
    const mutePrefix = settings.isMuted ? '🔇 ' : '';

    if (workoutCompleted) {
        document.title = `${mutePrefix}סוף האימון!`;
    } else if (settings.showCountdown && (countdown.isRunning || isWorkoutActive) && !isWorkoutPaused) {
        const timeLeftFormatted = Math.ceil(countdown.timeLeft);
        if (isWorkoutActive && currentStep) {
            document.title = `${mutePrefix}${timeLeftFormatted}s - ${currentStep.name}`;
        } else {
            document.title = `${mutePrefix}${timeLeftFormatted}s - ${originalTitle}`;
        }
    } else if (isWorkoutPaused) {
        document.title = `${mutePrefix}Paused | ${originalTitle}`;
    } else {
        document.title = `${mutePrefix}${originalTitle}`;
    }
    return () => { document.title = originalTitle; };
  }, [countdown.isRunning, countdown.timeLeft, settings.showCountdown, isWorkoutActive, currentStep, isWorkoutPaused, settings.isMuted, workoutCompleted]);

  // Start main clock on initial load
  useEffect(() => {
    stopwatch.start();
    countdown.start();
  }, []);

  // Manage transitions between main clock and workout mode, and handle all timer states.
  useEffect(() => {
    if (isWorkoutActive) {
      if (!wasWorkoutActive.current) {
        // On workout start
        setWorkoutCompleted(false);
        stopwatch.stop();
        countdown.stop();
        stopwatch.reset();
      }

      // Handle stopwatch based on GLOBAL pause
      if (isWorkoutPaused) {
        stopwatch.stop();
      } else {
        stopwatch.start();
      }

      // Handle countdown based on GLOBAL and STEP pause
      // The countdown should only run if the workout is NOT globally paused AND the step is NOT paused.
      if (isWorkoutPaused || isCountdownPaused) {
        countdown.stop();
      } else {
        countdown.start();
      }
      
      wasWorkoutActive.current = true;
    } else {
      if (wasWorkoutActive.current) {
        // On workout end
        stopwatch.stop();
        countdown.stop();
        setWorkoutCompleted(true);
      }
      wasWorkoutActive.current = false;
    }
  }, [isWorkoutActive, isWorkoutPaused, isCountdownPaused, stopwatch, countdown]);

  // If the user starts the main timers after a workout is complete, reset the completion screen.
  useEffect(() => {
    if (workoutCompleted && (stopwatch.isRunning || countdown.isRunning)) {
        setWorkoutCompleted(false);
    }
  }, [workoutCompleted, stopwatch.isRunning, countdown.isRunning]);


  if (settings.stealthModeEnabled) {
    return <div className="fixed inset-0 bg-black z-[100]"></div>;
  }

  const dynamicStyles = {
    '--countdown-font-size': `${10 + (settings.countdownSize / 100) * 10}rem`,
    '--stopwatch-font-size': `${2 + (settings.stopwatchSize / 100) * 1.5}rem`,
    '--countdown-controls-scale': settings.countdownControlsSize / 100,
    '--stopwatch-controls-scale': settings.stopwatchControlsSize / 100,
  } as React.CSSProperties;

  const startStopwatchAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    stopwatch.start();
  };

  const resetStopwatchAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    stopwatch.reset();
    countdown.resetCycleCount(); // Reset cycles with main timer
  };
  
  const resetCountdownAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    isWorkoutActive ? restartCurrentStep() : countdown.reset();
  };


  return (
    <div onDoubleClick={(e) => { if (e.target === e.currentTarget) toggleFullScreen(); }} className={`min-h-screen flex flex-col p-4 select-none theme-transition ${settings.stealthModeEnabled ? 'bg-black text-white' : themeClasses}`} style={dynamicStyles}>
      <SettingsMenu />
      <WorkoutMenu />
      <main onDoubleClick={toggleFullScreen} className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
        {/* TOP TITLE CONTAINER - reserves space to prevent layout shift */}
        <div className="text-center mb-2 h-28 flex items-end justify-center">
          {(workoutCompleted || (isWorkoutActive && currentStep.type === 'rest')) && (
            <p className="text-8xl font-bold">
              {workoutCompleted
                ? 'סוף האימון'
                : isWorkoutPaused ? 'PAUSED' : (isCountdownPaused ? 'מנוחה (Paused)' : 'מנוחה')}
            </p>
          )}
        </div>

        {settings.showCountdown && (
          <>
            {isRepStep ? (
              <RepDisplay reps={currentStep.reps} onComplete={nextStep} />
            ) : (
              <>
                <CountdownDisplay timeLeft={countdown.timeLeft} />
                {settings.showCountdownControls && (
                  <CountdownControls
                    isRunning={isWorkoutActive ? (!isWorkoutPaused && !isCountdownPaused) : (countdown.isRunning || countdown.isResting)}
                    start={isWorkoutActive ? resumeStepCountdown : countdown.start}
                    stop={isWorkoutActive ? pauseStepCountdown : countdown.stop}
                    reset={resetCountdownAndReset}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* BOTTOM TITLE CONTAINER - reserves space to prevent layout shift */}
        <div className="text-center mt-4 h-16 flex items-start justify-center">
          {isWorkoutActive && currentStep.type === 'exercise' && (
            <p className="text-2xl">
              {isWorkoutPaused ? 'PAUSED' : (isCountdownPaused ? `${currentStep.name} (Paused)` : currentStep.name)}
            </p>
          )}
        </div>
      </main>

      {(settings.showTimer || settings.showCycleCounter) && (
        <footer className="w-full max-w-3xl mx-auto flex flex-col items-center gap-1">
            {isWorkoutActive && settings.showNextExercise && nextUpcomingStep && (
                <div className="text-center mb-2 text-gray-400">
                    <p className="text-xl">
                        Next Up: <span className="font-bold text-gray-300">{nextUpcomingStep.name}</span>
                    </p>
                </div>
            )}
            {settings.showTimer && <TimerDisplay time={stopwatch.time} />}
            <Controls 
              isRunning={stopwatch.isRunning}
              start={startStopwatchAndReset}
              stop={stopwatch.stop}
              reset={resetStopwatchAndReset}
              cycleCount={settings.showCycleCounter && !isWorkoutActive ? countdown.cycleCount : null}
              resetCycleCount={countdown.resetCycleCount}
              showTimer={settings.showTimer}
              showStopwatchControls={settings.showStopwatchControls}
              isWorkoutActive={isWorkoutActive}
              nextStep={nextStep}
              previousStep={previousStep}
              workoutStepInfo={isWorkoutActive ? { current: activeWorkout.currentStepIndex + 1, total: activeWorkout.plan.steps.length } : undefined}
            />
        </footer>
      )}
    </div>
  );
};


const App: React.FC = () => {
  return (
    <SettingsProvider>
      <WorkoutProvider>
        <AppContent />
      </WorkoutProvider>
    </SettingsProvider>
  );
};

export default App;