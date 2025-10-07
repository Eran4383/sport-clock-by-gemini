

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { CountdownDisplay } from './components/CountdownDisplay';
import { CountdownControls } from './components/CountdownControls';
import { TimerDisplay } from './components/TimerDisplay';
import { Controls } from './components/Controls';
import { SettingsMenu } from './components/SettingsMenu';
import { WorkoutMenu } from './components/WorkoutMenu';
import { RepDisplay } from './components/RepDisplay';
import { PreWorkoutCountdown } from './components/PreWorkoutCountdown';
import { GuestDataMergeModal } from './components/GuestDataMergeModal';
import { LogSessionModal } from './components/LogSessionModal';
import { useStopwatch } from './hooks/useStopwatch';
import { useCountdown } from './hooks/useCountdown';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { WorkoutProvider, useWorkout, ActiveWorkout } from './contexts/WorkoutContext';
import { playNotificationSound, resumeAudioContext } from './utils/sound';
import { getStepDisplayName } from './utils/workout';
import { ImportNotification } from './components/ImportNotification';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { StepStatus, PerformedStep, WorkoutStep } from './types';
import { LoggingProvider, useLogger } from './contexts/LoggingContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CrashNotification } from './components/CrashNotification';

const CRASH_FLAG_KEY = 'app_crash_detected';

const AppContent: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const workoutContext = useWorkout();
  const { 
    activeWorkout, 
    currentStep, 
    nextUpcomingStep,
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
    importNotification,
    clearImportNotification,
    showGuestMergeModal,
    guestPlansToMerge,
    guestHistoryToMerge,
    handleMergeGuestData,
    handleDiscardGuestData,
    logManualSession,
  } = workoutContext;
  
  const stopwatch = useStopwatch();
  const wasWorkoutActive = useRef(false);
  const lastActiveWorkoutRef = useRef<ActiveWorkout | null>(null);
  const [workoutCompleted, setWorkoutCompleted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkoutOpen, setIsWorkoutOpen] = useState(false);
  const [preWorkoutTimeLeft, setPreWorkoutTimeLeft] = useState<number | null>(null);
  const { logAction, getDebugReportAsString } = useLogger();
  const [showCrashNotification, setShowCrashNotification] = useState(false);
  
  const [manualSessionLog, setManualSessionLog] = useState<PerformedStep[]>([]);
  const [isLoggingModalOpen, setIsLoggingModalOpen] = useState(false);
  const prevCycleCount = useRef(0);

  // Check for crash flag on initial app load
  useEffect(() => {
    try {
        if (localStorage.getItem(CRASH_FLAG_KEY) === 'true') {
            setShowCrashNotification(true);
        }
    } catch (e) {
        console.error("Could not read crash flag from localStorage:", e);
    }
  }, []);

  const handleCopyCrashReport = useCallback(() => {
    const report = getDebugReportAsString({ settings, user, workoutContext });
    navigator.clipboard.writeText(report).then(() => {
        // You could add a "copied!" message to the notification if desired
    }).catch(err => {
        console.error("Failed to copy crash report:", err);
    });
    // Dismiss after attempting to copy
    setShowCrashNotification(false);
    localStorage.removeItem(CRASH_FLAG_KEY);
  }, [getDebugReportAsString, settings, user, workoutContext]);

  const handleDismissCrashReport = useCallback(() => {
    setShowCrashNotification(false);
    localStorage.removeItem(CRASH_FLAG_KEY);
  }, []);

  // Resume AudioContext on the first user interaction to comply with browser policies.
  useEffect(() => {
    const handleFirstInteraction = () => {
      logAction('FIRST_USER_INTERACTION');
      resumeAudioContext();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [logAction]);

  const nextStepWithTime = useCallback((status: StepStatus) => {
      workoutContext.nextStep(Date.now(), status);
  }, [workoutContext]);

  const previousStepWithTime = useCallback(() => {
    workoutContext.previousStep(Date.now());
  }, [workoutContext]);


  const isWorkoutActive = !!(activeWorkout && currentStep);
  const isRepStep = isWorkoutActive && currentStep.isRepBased;
  const countdownDuration = isWorkoutActive && !isRepStep ? currentStep.duration : (isWorkoutActive && isRepStep ? 0 : settings.countdownDuration);
  const isRestStep = isWorkoutActive && currentStep.type === 'rest';
  
  const countdown = useCountdown(
    countdownDuration, 
    settings.countdownRestDuration, 
    settings,
    isWorkoutActive ? () => nextStepWithTime(StepStatus.Completed) : undefined,
    // Pass a unique key for each step and restart to ensure the countdown hook resets correctly
    isWorkoutActive ? `${currentStep.id}-${activeWorkout.currentStepIndex}-${activeWorkout.stepRestartKey || 0}` : undefined,
    isRestStep
  );

  // Track manual session cycles
  useEffect(() => {
    if (!isWorkoutActive && countdown.cycleCount > prevCycleCount.current) {
        const cyclesCompleted = countdown.cycleCount - prevCycleCount.current;
        const newPerformedSteps: PerformedStep[] = [];

        for(let i=0; i < cyclesCompleted; i++) {
            const cycleNumber = prevCycleCount.current + i + 1;
            const exerciseStep: WorkoutStep = {
                id: `manual-exercise-${cycleNumber}`,
                name: 'Interval',
                type: 'exercise',
                isRepBased: false,
                duration: settings.countdownDuration,
                reps: 0,
            };
            newPerformedSteps.push({
                step: exerciseStep,
                status: StepStatus.Completed,
                durationMs: settings.countdownDuration * 1000,
            });

            if (settings.countdownRestDuration > 0) {
                const restStep: WorkoutStep = {
                    id: `manual-rest-${cycleNumber}`,
                    name: 'Rest',
                    type: 'rest',
                    isRepBased: false,
                    duration: settings.countdownRestDuration,
                    reps: 0,
                };
                newPerformedSteps.push({
                    step: restStep,
                    status: StepStatus.Completed,
                    durationMs: settings.countdownRestDuration * 1000,
                });
            }
        }
        setManualSessionLog(currentLog => [...currentLog, ...newPerformedSteps]);
    }
    prevCycleCount.current = countdown.cycleCount;
  }, [countdown.cycleCount, isWorkoutActive, settings.countdownDuration, settings.countdownRestDuration]);

  // Sync prevCycleCount on reset
  useEffect(() => {
      if (countdown.cycleCount === 0) {
          prevCycleCount.current = 0;
      }
  }, [countdown.cycleCount]);

  const isPastHalfway = settings.showCountdown && countdown.isRunning && countdown.timeLeft <= countdownDuration / 2 && countdown.timeLeft > 0;

  // This effect will always keep the ref up-to-date with the latest non-null activeWorkout
  useEffect(() => {
    if (activeWorkout) {
        lastActiveWorkoutRef.current = activeWorkout;
    }
  }, [activeWorkout]);

  useEffect(() => {
    // This just sets the "out of bounds" color for overscroll etc.
    document.body.style.backgroundColor = settings.backgroundColor;
  }, [settings.backgroundColor]);
  
  // Handle the pre-workout countdown
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isPreparingWorkout) {
        let countdown = settings.preWorkoutCountdownDuration;
        setPreWorkoutTimeLeft(countdown);

        timer = setInterval(() => {
            countdown -= 1;
            setPreWorkoutTimeLeft(countdown);
            
            if (countdown <= 0) {
                clearInterval(timer);
                // After displaying 0, wait a full second before starting the workout.
                setTimeout(() => {
                    commitStartWorkout();
                }, 1000);
            }
        }, 1000);

        return () => { if (timer) clearInterval(timer); };
    } else {
        setPreWorkoutTimeLeft(null); // Ensure countdown stops if workout is aborted
    }
  }, [isPreparingWorkout, commitStartWorkout, settings.preWorkoutCountdownDuration]);


  const toggleFullScreen = useCallback(() => {
    logAction('TOGGLE_FULLSCREEN', { isFullscreen: !!document.fullscreenElement });
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            logAction('ERROR_FULLSCREEN_ENTER', { message: err.message, name: err.name });
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  }, [logAction]);
  
  const stopWorkoutAborted = () => {
    setWorkoutCompleted(false); // Aborting is not completing
    if (isPreparingWorkout) {
      clearPreparingWorkout();
    } else {
      if (activeWorkout) {
        contextStopWorkout({ completed: false, durationMs: stopwatch.time, finishedWorkout: activeWorkout });
      }
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
          logAction('SWIPE_OPEN_WORKOUT_MENU');
          setIsWorkoutOpen(true);
        }
        
        // Swipe left from right edge to open Settings Menu
        if (diffX < 0 && touchStartX.current > window.innerWidth - edgeThreshold) {
          logAction('SWIPE_OPEN_SETTINGS_MENU');
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
      
      logAction('KEY_DOWN', { key: event.key, code: event.code });

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
                nextStepWithTime(StepStatus.Completed);
            }
            break;
        case 'home':
            event.preventDefault();
            updateSettings({ stealthModeEnabled: !settings.stealthModeEnabled });
            break;
        case 'escape':
            if (workoutCompleted) {
                setWorkoutCompleted(false);
                handleUniversalStartStop();
            } else if (isPreparingWorkout) {
                // Skip the countdown and start the workout immediately.
                // A second press will be handled by the isWorkoutActive case below.
                commitStartWorkout();
            } else if (isWorkoutActive) {
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
  }, [settings, updateSettings, stopwatch, countdown, isWorkoutActive, isWorkoutPaused, isRepStep, nextStepWithTime, resumeWorkout, pauseWorkout, contextStopWorkout, toggleFullScreen, workoutCompleted, isPreparingWorkout, logAction]);

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
            document.title = `${mutePrefix}${timeLeftFormatted}s - ${getStepDisplayName(currentStep)}`;
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
        
        if (lastActiveWorkoutRef.current) {
            contextStopWorkout({
                completed: true,
                durationMs: stopwatch.time,
                finishedWorkout: lastActiveWorkoutRef.current,
            });
            setWorkoutCompleted(true);
            lastActiveWorkoutRef.current = null; // Clean up the ref
        }
      }
      wasWorkoutActive.current = false;
    }
  }, [isWorkoutActive, isWorkoutPaused, isCountdownPaused, stopwatch, countdown, contextStopWorkout, activeWorkout]);

  // If the user starts the main timers after a workout is complete, reset the completion screen.
  useEffect(() => {
    if (workoutCompleted && (stopwatch.isRunning || countdown.isRunning)) {
        setWorkoutCompleted(false);
    }
  }, [workoutCompleted, stopwatch.isRunning, countdown.isRunning]);

  if (preWorkoutTimeLeft !== null) {
    return <PreWorkoutCountdown timeLeft={preWorkoutTimeLeft} onDoubleClick={toggleFullScreen} />;
  }

  if (settings.stealthModeEnabled) {
    return <div className="fixed inset-0 bg-black z-[200] animate-fadeIn" style={{ animationDuration: '0.3s' }}></div>;
  }

  const dynamicStyles = {
    '--countdown-font-size': `clamp(2.5rem, 22vmin, 20rem)`,
    '--stopwatch-font-size': `clamp(1.5rem, 8vw, ${2 + (settings.stopwatchSize / 100) * 1.5}rem)`,
    '--countdown-controls-scale': settings.countdownControlsSize / 100,
    '--stopwatch-controls-scale': settings.stopwatchControlsSize / 100,
  } as React.CSSProperties;

  // Logic for background and text color
  let bgColor: string;
  let textColor: 'white' | 'black';

  // Heuristic to decide text color based on the selected background
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  const getTextColorForBg = (bgHex: string): 'white' | 'black' => {
      const rgb = hexToRgb(bgHex);
      if (rgb) {
          // Formula for perceived brightness
          const brightness = Math.round(((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000);
          return brightness > 125 ? 'black' : 'white';
      }
      return 'white'; // Default for invalid colors
  };
  
  const isResting = (isWorkoutActive && currentStep.type === 'rest') || (!isWorkoutActive && countdown.isResting && settings.showRestTitleOnDefaultCountdown);

  if (workoutCompleted) {
    bgColor = '#6ee7b7'; // A light green color for completion
    textColor = 'black';
  } else if (isResting) {
    bgColor = settings.restBackgroundColor;
    textColor = getTextColorForBg(settings.restBackgroundColor);
  } else if (isPastHalfway) {
    bgColor = settings.halfwayColor;
    textColor = getTextColorForBg(settings.halfwayColor);
  } else {
    bgColor = settings.backgroundColor;
    textColor = getTextColorForBg(settings.backgroundColor);
  }
  
  dynamicStyles.backgroundColor = bgColor;
  dynamicStyles.color = textColor;


  const startStopwatchAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    stopwatch.start();
  };

  const resetStopwatchAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    stopwatch.reset();
    countdown.resetCycleCount(); // Reset cycles with main timer
    setManualSessionLog([]); // Clear manual session
  };
  
  const resetCountdownAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    isWorkoutActive ? restartCurrentStep() : countdown.reset();
  };

  const handleLogManualSession = (name: string) => {
    logManualSession(name, stopwatch.time, manualSessionLog);
    // Reset everything after logging
    stopwatch.reset();
    countdown.resetCycleCount();
    setManualSessionLog([]);
    setIsLoggingModalOpen(false);
  };

  const isWarmupStep = isWorkoutActive && currentStep.isWarmup;

  return (
    <div 
        onDoubleClick={(e) => { if (e.target === e.currentTarget) toggleFullScreen(); }} 
        className={`h-screen overflow-hidden flex flex-col p-4 select-none theme-transition`} 
        style={dynamicStyles}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
      {showCrashNotification && (
          <CrashNotification
              onCopy={handleCopyCrashReport}
              onDismiss={handleDismissCrashReport}
          />
      )}
      {showGuestMergeModal && (
        <GuestDataMergeModal 
          guestPlans={guestPlansToMerge}
          guestHistoryCount={guestHistoryToMerge.length}
          onMerge={handleMergeGuestData} 
          onDiscard={handleDiscardGuestData} 
        />
      )}
      {importNotification && (
          <ImportNotification 
              message={importNotification.message} 
              planName={importNotification.planName} 
              onClose={clearImportNotification} 
              type={importNotification.type}
          />
      )}
      {isLoggingModalOpen && (
        <LogSessionModal
            onSave={handleLogManualSession}
            onClose={() => setIsLoggingModalOpen(false)}
        />
      )}
      <SettingsMenu isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
      <WorkoutMenu isOpen={isWorkoutOpen} setIsOpen={setIsWorkoutOpen} />
      <main onDoubleClick={toggleFullScreen} className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl mx-auto min-h-0">
        {/* TOP TITLE CONTAINER - reserves space to prevent layout shift */}
        <div className="text-center mb-2 min-h-[3.5rem] flex items-end justify-center">
            {(() => {
                if (workoutCompleted) {
                    return <p className="text-8xl font-bold" dir="rtl">סוף האימון</p>;
                }

                if (isWorkoutActive && currentStep) {
                    // Special title for the post-warmup rest
                    if (currentStep.name === 'מנוחה לפני אימון') {
                        return <p className="text-8xl font-bold" dir="rtl">האימון מתחיל!</p>;
                    }
                    
                    // For any rest step (during warm-up or main workout)
                    if (currentStep.type === 'rest') {
                        return (
                            <p className="text-8xl font-bold" dir="rtl">
                                {isWorkoutPaused ? 'PAUSED'
                                : isCountdownPaused ? 'מנוחה (Paused)'
                                : 'מנוחה'}
                            </p>
                        );
                    }
                    
                    // Title for any warm-up EXERCISE step
                    if (isWarmupStep) { // at this point, currentStep.type is not 'rest'
                        return <p className="text-8xl font-bold" dir="rtl">חימום</p>;
                    }
                }
                
                // Title for the default countdown rest (no workout active)
                if (!isWorkoutActive && countdown.isResting && settings.showRestTitleOnDefaultCountdown) {
                    return <p className="text-8xl font-bold" dir="rtl">מנוחה</p>;
                }

                return null; // No title for other cases (e.g., active exercise)
            })()}
        </div>

        {settings.showCountdown && (
          <>
            {isRepStep ? (
              <RepDisplay reps={currentStep.reps} onComplete={() => nextStepWithTime(StepStatus.Completed)} />
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
        <div className="text-center mt-4 min-h-[2.5rem] flex items-start justify-center">
          {isWorkoutActive && currentStep.type === 'exercise' && (
            <p className="text-2xl">
              {isWorkoutPaused ? 'PAUSED' : (isCountdownPaused ? `${getStepDisplayName(currentStep)} (Paused)` : getStepDisplayName(currentStep))}
            </p>
          )}
        </div>
      </main>

      {(settings.showTimer || settings.showCycleCounter) && (
        <footer className="w-full max-w-3xl mx-auto flex flex-col items-center gap-1">
            {/* Reserve space for "Next Up" to prevent layout shift on the last step */}
            <div className="text-center mb-2 min-h-[1.75rem] flex items-center justify-center">
              {isWorkoutActive && settings.showNextExercise && nextUpcomingStep && (
                  <p className="text-xl text-gray-400">
                      Next Up: <span className="font-bold text-gray-300">{getStepDisplayName(nextUpcomingStep)}</span>
                  </p>
              )}
            </div>
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
              nextStep={() => nextStepWithTime(StepStatus.Skipped)}
              previousStep={previousStepWithTime}
              workoutStepInfo={isWorkoutActive ? { current: activeWorkout.currentStepIndex + 1, total: activeWorkout.plan.steps.length } : undefined}
              showLogSessionButton={settings.showLogSessionButton && !isWorkoutActive && manualSessionLog.length > 0}
              onLogSession={() => setIsLoggingModalOpen(true)}
            />
        </footer>
      )}
    </div>
  );
};

// New wrapper component to add a startup log
const AppWithLogging: React.FC = () => {
  const { logAction } = useLogger();
  useEffect(() => {
    logAction('APP_MOUNTED', { userAgent: navigator.userAgent });
  }, [logAction]);

  return <AppContent />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <LoggingProvider>
        <SettingsProvider>
          <WorkoutProvider>
            <ErrorBoundary>
              <AppWithLogging />
            </ErrorBoundary>
          </WorkoutProvider>
        </SettingsProvider>
      </LoggingProvider>
    </AuthProvider>
  );
};

export default App;
