import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { CountdownDisplay } from './CountdownDisplay';
import { CountdownControls } from './CountdownControls';
import { TimerDisplay } from './TimerDisplay';
import { Controls } from './Controls';
import { RepDisplay } from './RepDisplay';
import { useStopwatch } from '../hooks/useStopwatch';
import { useCountdown } from '../hooks/useCountdown';
import { useSettings } from '../contexts/SettingsContext';
import { useWorkout, ActiveWorkout } from '../contexts/WorkoutContext';
import { playNotificationSound } from '../utils/sound';
import { getStepDisplayName } from '../utils/workout';
import { formatTime } from '../utils/time';

interface MainDisplayProps {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  isWorkoutOpen: boolean;
  setIsWorkoutOpen: (isOpen: boolean) => void;
  toggleFullScreen: () => void;
}

export const MainDisplay: React.FC<MainDisplayProps> = ({ 
    isSettingsOpen, setIsSettingsOpen, isWorkoutOpen, setIsWorkoutOpen, toggleFullScreen 
}) => {
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
    isPreparingWorkout, // Still need to read this to prevent actions
    commitStartWorkout,
    clearPreparingWorkout,
  } = useWorkout();
  
  const mainStopwatch = useStopwatch();
  const workoutStopwatch = useStopwatch();
  const wasWorkoutActive = useRef(false);
  const lastActiveWorkoutRef = useRef<ActiveWorkout | null>(null);
  const [workoutCompleted, setWorkoutCompleted] = useState(false);

  const isWorkoutActive = !!(activeWorkout && currentStep);
  const isRepStep = isWorkoutActive && currentStep.isRepBased;
  const countdownDuration = isWorkoutActive && !isRepStep ? currentStep.duration : (isWorkoutActive && isRepStep ? 0 : settings.countdownDuration);
  
  const countdown = useCountdown(
    countdownDuration, 
    settings.countdownRestDuration, 
    settings,
    isWorkoutActive ? nextStep : undefined,
    isWorkoutActive ? `${currentStep.id}-${activeWorkout.currentStepIndex}-${activeWorkout.stepRestartKey || 0}` : undefined
  );
  
    const handleUniversalStartStop = useCallback(() => {
        if (isWorkoutActive) return;

        const isCdRunning = countdown && (countdown.isRunning || countdown.isResting);
        const isAnythingRunning = mainStopwatch.isRunning || isCdRunning;
        
        if (isAnythingRunning) {
          mainStopwatch.stop();
          countdown?.stop();
        } else {
          if (workoutCompleted) {
              setWorkoutCompleted(false);
          }
          const now = performance.now();
          mainStopwatch.start(now);
          countdown?.start(now);
        }
    }, [isWorkoutActive, mainStopwatch, countdown, workoutCompleted, setWorkoutCompleted]);

  const isPastHalfway = settings.showCountdown && countdown?.isRunning && countdown.timeLeft <= countdownDuration / 2 && countdown.timeLeft > 0;

  useEffect(() => {
    if (activeWorkout) {
        lastActiveWorkoutRef.current = activeWorkout;
    }
  }, [activeWorkout]);

  useEffect(() => {
    document.body.style.backgroundColor = settings.backgroundColor;
  }, [settings.backgroundColor]);
  
  const stopWorkoutAborted = () => {
    setWorkoutCompleted(false);
    if (isPreparingWorkout) {
      clearPreparingWorkout();
    } else {
      contextStopWorkout({ completed: false });
    }
  };
  
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);
    const touchEndX = useRef<number>(0);
    const touchEndY = useRef<number>(0);
  
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, input, a, [role="button"]')) {
        return;
      }
      touchStartX.current = e.targetTouches[0].clientX;
      touchStartY.current = e.targetTouches[0].clientY;
      touchEndX.current = 0;
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
  
      const swipeThreshold = 50;
      const edgeThreshold = 50;
  
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
        if (isSettingsOpen || isWorkoutOpen) return;
        
        if (diffX > 0 && touchStartX.current < edgeThreshold) {
          setIsWorkoutOpen(true);
        }
        
        if (diffX < 0 && touchStartX.current > window.innerWidth - edgeThreshold) {
          setIsSettingsOpen(true);
        }
      }
      
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
    };

  useEffect(() => {
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
            if (workoutCompleted) {
                setWorkoutCompleted(false);
                handleUniversalStartStop();
            } else if (isPreparingWorkout) {
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
        case 'כ':
            toggleFullScreen();
            break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, updateSettings, isWorkoutActive, isWorkoutPaused, isRepStep, nextStep, resumeWorkout, pauseWorkout, contextStopWorkout, toggleFullScreen, workoutCompleted, isPreparingWorkout, handleUniversalStartStop]);

  useEffect(() => {
    const mutePrefix = settings.isMuted ? '🔇 ' : '';

    if (workoutCompleted) {
        document.title = `${mutePrefix}סוף האימון!`;
    } else if (settings.showCountdown && countdown && (countdown.isRunning || countdown.isResting || isWorkoutActive) && !isWorkoutPaused) {
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
  }, [countdown?.isRunning, countdown?.isResting, countdown?.timeLeft, settings.showCountdown, isWorkoutActive, currentStep, isWorkoutPaused, settings.isMuted, workoutCompleted]);


  useEffect(() => {
    const now = performance.now();
    mainStopwatch.start(now);
    countdown?.start(now);
  }, []);

  useEffect(() => {
    if (isWorkoutActive) {
      if (!wasWorkoutActive.current) {
        setWorkoutCompleted(false);
        countdown?.stop();
        workoutStopwatch.reset();
        workoutStopwatch.start();
      }

      if (isWorkoutPaused) {
        workoutStopwatch.stop();
      } else {
        workoutStopwatch.start();
      }

      if (isRepStep) {
        countdown?.stop();
      } else if (isWorkoutPaused || isCountdownPaused) {
        countdown?.stop();
      } else {
        countdown?.start();
      }
      
      wasWorkoutActive.current = true;
    } else {
      if (wasWorkoutActive.current) {
        workoutStopwatch.stop();
        countdown?.stop();

        const finishedWorkout = lastActiveWorkoutRef.current;
        
        if (finishedWorkout) {
            contextStopWorkout({
                completed: true,
                durationMs: workoutStopwatch.time,
                planName: finishedWorkout.plan.name || 'Unnamed Workout',
                steps: finishedWorkout.plan.steps,
                planIds: finishedWorkout.sourcePlanIds
            });
            setWorkoutCompleted(true);
            lastActiveWorkoutRef.current = null;
        }
      }
      wasWorkoutActive.current = false;
    }
  }, [isWorkoutActive, isWorkoutPaused, isCountdownPaused, workoutStopwatch, countdown, contextStopWorkout, activeWorkout, isRepStep]);

  useEffect(() => {
    if (workoutCompleted && (mainStopwatch.isRunning || countdown?.isRunning)) {
        setWorkoutCompleted(false);
    }
  }, [workoutCompleted, mainStopwatch.isRunning, countdown?.isRunning]);

  const dynamicStyles = {
    '--countdown-font-size': `clamp(4rem, ${(settings.countdownSize / 100) * 25}vh, 40rem)`,
    '--stopwatch-font-size': `clamp(1.5rem, ${(settings.stopwatchSize / 100) * 8}vw, 10rem)`,
    '--countdown-controls-scale': settings.countdownControlsSize / 100,
    '--stopwatch-controls-scale': settings.stopwatchControlsSize / 100,
  } as React.CSSProperties;

  let bgColor: string;
  let textColor: 'white' | 'black';

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
          const brightness = Math.round(((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000);
          return brightness > 125 ? 'black' : 'white';
      }
      return 'white';
  };
  
  const isResting = (isWorkoutActive && currentStep.type === 'rest') || (!isWorkoutActive && countdown?.isResting && settings.showRestTitleOnDefaultCountdown);

  if (workoutCompleted) {
    bgColor = '#6ee7b7';
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


  const resetAllTimers = useCallback(() => {
    if (workoutCompleted) setWorkoutCompleted(false);
    mainStopwatch.reset();
    countdown?.reset();
  }, [workoutCompleted, setWorkoutCompleted, mainStopwatch, countdown]);
  
  const resetCountdownAndReset = () => {
    if (workoutCompleted) setWorkoutCompleted(false);
    isWorkoutActive ? restartCurrentStep() : countdown?.reset();
  };

  const isWarmupStep = isWorkoutActive && currentStep.isWarmup;
  const shouldShowFooter = (isWorkoutActive ? (settings.showWorkoutTimer || settings.showSessionTimer) : settings.showSessionTimer) || settings.showCycleCounter;
  
  const isAnythingRunning = mainStopwatch.isRunning || (countdown?.isRunning || countdown?.isResting);

  return (
    <div 
        onDoubleClick={(e) => { if (e.target === e.currentTarget) toggleFullScreen(); }} 
        className={`h-full w-full flex flex-col p-2 select-none theme-transition`} 
        style={dynamicStyles}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
      <main onDoubleClick={toggleFullScreen} className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
        <div className="text-center mb-1 h-10 flex items-end justify-center">
            {(() => {
                if (workoutCompleted) {
                    return <p className="text-7xl font-bold" dir="rtl">סוף האימון</p>;
                }

                if (isWorkoutActive && currentStep) {
                    if (currentStep.name === 'מנוחה לפני אימון') {
                        return <p className="text-7xl font-bold" dir="rtl">האימון מתחיל!</p>;
                    }
                    if (currentStep.type === 'rest') {
                        return (
                            <p className="text-7xl font-bold" dir="rtl">
                                {isWorkoutPaused ? 'PAUSED'
                                : isCountdownPaused ? 'מנוחה (Paused)'
                                : 'מנוחה'}
                            </p>
                        );
                    }
                    if (isWarmupStep) {
                        return <p className="text-7xl font-bold" dir="rtl">חימום</p>;
                    }
                }
                
                if (!isWorkoutActive && countdown?.isResting && settings.showRestTitleOnDefaultCountdown) {
                    return <p className="text-7xl font-bold" dir="rtl">מנוחה</p>;
                }

                return null;
            })()}
        </div>

        {settings.showCountdown && countdown && (
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

        <div className="text-center mt-2 h-8 flex items-start justify-center">
          {isWorkoutActive && currentStep.type === 'exercise' && (
            <p className="text-2xl">
              {isWorkoutPaused ? 'PAUSED' : (isCountdownPaused ? `${getStepDisplayName(currentStep)} (Paused)` : getStepDisplayName(currentStep))}
            </p>
          )}
        </div>
      </main>

      {shouldShowFooter && (
        <footer className="w-full max-w-3xl mx-auto flex flex-col items-center gap-1">
            <div className="text-center mb-0 h-5 flex items-center justify-center">
              {isWorkoutActive && settings.showNextExercise && nextUpcomingStep && (
                  <p className="text-lg text-gray-400">
                      Next Up: <span className="font-bold text-gray-300">{getStepDisplayName(nextUpcomingStep)}</span>
                  </p>
              )}
            </div>
            
            {isWorkoutActive ? (
              <>
                {settings.showWorkoutTimer && <TimerDisplay time={workoutStopwatch.time} />}
                {settings.showSessionTimer && (
                  <div className="text-xl font-bold tabular-nums tracking-tight text-gray-400 -mt-2" title="Total Session Time">
                    {formatTime(mainStopwatch.time)}
                  </div>
                )}
              </>
            ) : (
              settings.showSessionTimer && <TimerDisplay time={mainStopwatch.time} />
            )}
            
            <Controls 
              isRunning={isAnythingRunning}
              start={handleUniversalStartStop}
              stop={handleUniversalStartStop}
              reset={resetAllTimers}
              cycleCount={settings.showCycleCounter && !isWorkoutActive ? countdown?.cycleCount : null}
              resetCycleCount={countdown?.resetCycleCount}
              showSessionTimer={settings.showSessionTimer}
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
