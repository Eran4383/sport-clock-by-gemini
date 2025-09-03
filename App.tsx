
import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { CountdownDisplay } from './components/CountdownDisplay';
import { CountdownControls } from './components/CountdownControls';
import { TimerDisplay } from './components/TimerDisplay';
import { Controls } from './components/Controls';
import { SettingsMenu } from './components/SettingsMenu';
import { WorkoutMenu } from './components/WorkoutMenu';
import { RepDisplay } from './components/RepDisplay';
import { PreWorkoutCountdown } from './components/PreWorkoutCountdown';
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
    restartCurrentStep,
    isPreparingWorkout,
    commitStartWorkout,
    clearPreparingWorkout,
  } = useWorkout();
  
  const stopwatch = useStopwatch();
  const wasWorkoutActive = useRef(false);
  const [workoutCompleted, setWorkoutCompleted] = useState(false);
  const [completedWorkoutDuration, setCompletedWorkoutDuration] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkoutOpen, setIsWorkoutOpen] = useState(false);
  const [preWorkoutTimeLeft, setPreWorkoutTimeLeft] = useState<number | null>(null);


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

  useEffect(() => {
    // This just sets the "out of bounds" color for overscroll etc.
    document.body.style.backgroundColor = settings.backgroundColor;
  }, [settings.backgroundColor]);
  
  // Handle the pre-workout countdown
  useEffect(() => {
    // FIX: Using `const` for the timer and returning the cleanup function from within the `if` block
    // solves both the type error (`NodeJS.Timeout` is not a browser type) and a potential runtime
    // error from trying to clear an uninitialized timer.
    if (isPreparingWorkout) {
        setPreWorkoutTimeLeft(10);
        const timer = setInterval(() => {
            setPreWorkoutTimeLeft(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    commitStartWorkout();
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    } else {
        setPreWorkoutTimeLeft(null); // Ensure countdown stops if workout is aborted
    }
  }, [isPreparingWorkout, commitStartWorkout]);


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
    if (isPreparingWorkout) {
      clearPreparingWorkout();
    } else {
      contextStopWorkout({ completed: false });
    }
  };
  
    // Refs for swipe gesture detection on the main app body
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);
    const touchEndX = useRef<number>(0);
    const touchEndY = useRef<number>(0);
  
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // Prevent gesture if interacting with controls to avoid conflicts
      if (target.closest('button, input, a, [role="button"]')) {
        return;
      }
      touchStartX.current = e.targetTouches[0].clientX;
      touchStartY.current = e.targetTouches[0].clientY;
      touchEndX.current = 0; // Reset end position
      touchEndY.current = 0;
    };
  
    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      touchEndX.current = e.targetTouches[0].clientX;
      touchEndY.current = e.targetTouches[0].clientY;
    };
  
    const handleTouchEnd = () => {
      if (!touchStartX.current || !touchEndX.current) return;
      
      const diffX = touchEndX.current - touchStartX.current;
      const diffY = touchEndY.current - touchStartY.current;
  
      const swipeThreshold = 50; // min distance
      const edgeThreshold = 50; // activation area from edge
  
      // Only process horizontal swipes that are longer than vertical swipes
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
        // If a menu is already open, don't try to open another one.
        if (isSettingsOpen || isWorkoutOpen) return;
        
        // Swipe right from left edge to open Workout Menu
        if (diffX > 0 && touchStartX.current < edgeThreshold) {
          setIsWorkoutOpen(true);
        }
        
        // Swipe left from right edge to open Settings Menu
        if (diffX < 0 && touchStartX.current > window.innerWidth - edgeThreshold) {
          setIsSettingsOpen(true);
        }
      }
      
      // Reset coords
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
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
            if (isWorkoutActive || isPreparingWorkout) {
                if(window.confirm('Are you sure you want to stop the current workout?')) {
                    stopWorkoutAborted();
                }
            } else {
                setIsSettingsOpen(false);
                setIsWorkoutOpen(false);
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
  }, [settings, updateSettings, stopwatch, countdown, isWorkoutActive, isWorkoutPaused, isRepStep, nextStep, resumeWorkout, pauseWorkout, contextStopWorkout, toggleFullScreen, workoutCompleted, isPreparingWorkout]);

  // Update document title with countdown
  useEffect(() => {
    const mutePrefix = settings.isMuted ? '🔇 ' : '';

    if (workoutCompleted) {
        document.title = `${mutePrefix}סוף האימון!`;
    } else if (preWorkoutTimeLeft !== null) {
        document.title = `${mutePrefix}מתחילים בעוד ${preWorkoutTimeLeft}s`;
    } else if (settings.showCountdown && (countdown.isRunning || countdown.isResting || isWorkoutActive) && !isWorkoutPaused) {
        const timeLeftFormatted = Math.ceil(countdown.timeLeft);
        if (isWorkoutActive && currentStep) {
            document.title = `${mutePrefix}${timeLeftFormatted}s - ${currentStep.name}`;
        } else {
            document.title = `${mutePrefix}${timeLeftFormatted}s`;
        }
    } else if (isWorkoutPaused) {
        document.title = `${mutePrefix}Paused`;
    } else {
        document.title = `${mutePrefix}⏱️`;
    }
  }, [countdown.isRunning, countdown.isResting, countdown.timeLeft, settings.showCountdown, isWorkoutActive, currentStep, isWorkoutPaused, settings.isMuted, workoutCompleted, preWorkoutTimeLeft]);


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
        setCompletedWorkoutDuration(null);
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
        setCompletedWorkoutDuration(stopwatch.time);
        countdown.stop();
        contextStopWorkout({
            completed: true,
            durationMs: stopwatch.time,
            planName: activeWorkout?.plan.name || 'Unnamed Workout',
            steps: activeWorkout?.plan.steps
        });
        setWorkoutCompleted(true);
        // Do NOT stop the main stopwatch, let it continue.
      }
      wasWorkoutActive.current = false;
    }
  }, [isWorkoutActive, isWorkoutPaused, isCountdownPaused, stopwatch, countdown, contextStopWorkout, activeWorkout]);

  // If the user starts the main timers after a workout is complete, reset the completion screen.
  useEffect(() => {
    if (workoutCompleted && (stopwatch.isRunning || countdown.isRunning)) {
        setWorkoutCompleted(false);
        setCompletedWorkoutDuration(null);
    }
  }, [workoutCompleted, stopwatch.isRunning, countdown.isRunning]);

  if (preWorkoutTimeLeft !== null) {
    return <PreWorkoutCountdown timeLeft={preWorkoutTimeLeft} />;
  }

  if (settings.stealthModeEnabled) {
    return <div className="fixed inset-0 bg-black z-[100]"></div>;
  }

  const dynamicStyles = {
    '--countdown-font-size': `clamp(4rem, 25dvh, 20rem)`,
    '--stopwatch-font-size': `clamp(1.5rem, 8vw, ${2 + (settings.stopwatchSize / 100) * 1.5}rem)`,
    '--countdown-controls-scale': settings.countdownControlsSize / 100,
    '--stopwatch-controls-scale': settings.stopwatchControlsSize / 100,
  } as React.CSSProperties;

  // Logic for background and text color
  let bgColor = settings.backgroundColor;
  let textColor = 'white'; // Default

  // Heuristic to decide text color based on the selected background
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  const rgb = hexToRgb(settings.backgroundColor);
  if (rgb) {
      // Formula for perceived brightness
      const brightness = Math.round(((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000);
      if (brightness > 125) {
          textColor = 'black';
      }
  }

  if (workoutCompleted) {
    bgColor = '#6ee7b7'; // A light green color
    textColor = 'black';
  } else if (isPastHalfway) {
    bgColor = settings.halfwayColor;
    textColor = 'white'; // Assume halfway color is intense and needs white text
  }
  
  dynamicStyles.backgroundColor = bgColor;
  dynamicStyles.color = textColor;


  const startStopwatchAndReset = () => {
    if (workoutCompleted) {
        setWorkoutCompleted(false);
        setCompletedWorkoutDuration(null);
    }
    stopwatch.start();
  };

  const resetStopwatchAndReset = () => {
    if (workoutCompleted) {
        setWorkoutCompleted(false);
        setCompletedWorkoutDuration(null);
    }
    stopwatch.reset();
    countdown.resetCycleCount(); // Reset cycles with main timer
  };
  
  const resetCountdownAndReset = () => {
    if (workoutCompleted) {
        setWorkoutCompleted(false);
        setCompletedWorkoutDuration(null);
    }
    isWorkoutActive ? restartCurrentStep() : countdown.reset();
  };


  return (
    <div 
        onDoubleClick={(e) => { if (e.target === e.currentTarget) toggleFullScreen(); }} 
        className={`h-screen overflow-y-hidden flex flex-col p-4 select-none theme-transition`} 
        style={dynamicStyles}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
      <SettingsMenu isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
      <WorkoutMenu isOpen={isWorkoutOpen} setIsOpen={setIsWorkoutOpen} />
      <main onDoubleClick={toggleFullScreen} className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
        {/* TOP TITLE CONTAINER - reserves space to prevent layout shift */}
        <div className="text-center mb-2 h-28 flex items-end justify-center">
          {(workoutCompleted || (isWorkoutActive && currentStep.type === 'rest') || (!isWorkoutActive && countdown.isResting && settings.showRestTitleOnDefaultCountdown)) && (
            <p className="text-8xl font-bold">
              {workoutCompleted
                ? 'סוף האימון'
                : (isWorkoutActive && isWorkoutPaused) ? 'PAUSED' 
                : (isWorkoutActive && isCountdownPaused) ? 'מנוחה (Paused)' 
                : 'מנוחה'}
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
            {settings.showTimer && <TimerDisplay time={stopwatch.time} completedWorkoutDuration={completedWorkoutDuration} />}
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
