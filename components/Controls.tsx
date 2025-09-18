
import React from 'react';

interface ControlsProps {
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  cycleCount: number | null;
  resetCycleCount: () => void;
  showSessionTimer: boolean;
  showStopwatchControls: boolean;
  isWorkoutActive: boolean;
  nextStep: () => void;
  previousStep: () => void;
  workoutStepInfo?: {
    current: number;
    total: number;
  };
}

const Button: React.FC<{ onMouseDown: () => void; className?: string; children: React.ReactNode; ariaLabel: string, disabled?: boolean }> = ({ onMouseDown, className = '', children, ariaLabel, disabled = false }) => (
  <button
    onMouseDown={onMouseDown}
    aria-label={ariaLabel}
    disabled={disabled}
    className={`w-28 px-6 py-2 rounded-md text-lg font-semibold transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

export const Controls: React.FC<ControlsProps> = ({ 
  isRunning, start, stop, reset, cycleCount, resetCycleCount, showSessionTimer, showStopwatchControls,
  isWorkoutActive, nextStep, previousStep, workoutStepInfo 
}) => {
  const buttonColor = 'bg-gray-500/30 hover:bg-gray-500/40 text-white';

  const CycleDisplay = () => {
    if (workoutStepInfo) {
      return (
        <div className="text-center w-28">
            <span className="tabular-nums text-4xl font-bold">
                {workoutStepInfo.current}<span className="text-2xl text-gray-400">/{workoutStepInfo.total}</span>
            </span>
            <span className="block text-xs text-gray-400 uppercase tracking-wider">Step</span>
        </div>
      );
    }
    
    if (cycleCount !== null) {
      return (
        <div className="relative group text-center w-24">
          <span className="tabular-nums text-4xl font-bold">{cycleCount}</span>
          <span className="block text-xs text-gray-400 uppercase tracking-wider">Cycles</span>
          <button 
            onClick={resetCycleCount}
            aria-label="Reset cycle count"
            className="absolute -top-1 -right-1 p-1 rounded-full bg-gray-600/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-600/80 focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9a9 9 0 0114.13-5.23M20 15a9 9 0 01-14.13 5.23" />
            </svg>
          </button>
        </div>
      );
    }

    return <div className="w-28"></div>; // Placeholder for alignment
  };

  return (
    <div 
      className="flex justify-center items-center gap-4 w-full"
      style={{ transform: 'scale(var(--stopwatch-controls-scale))' }}
    >
      {isWorkoutActive ? (
        // Workout layout: PREV | STEP | SKIP
        <>
          <Button onMouseDown={previousStep} ariaLabel="Previous Step" className={buttonColor}>
            Previous
          </Button>
          <CycleDisplay />
          <Button onMouseDown={nextStep} ariaLabel="Skip Step" className={buttonColor}>
            Skip
          </Button>
        </>
      ) : (
        // Default layout: RESET | CYCLES | START
        <>
          { showSessionTimer && showStopwatchControls ?
            <Button onMouseDown={reset} ariaLabel={'Reset Timer'} className={buttonColor} disabled={isRunning}>
              Reset
            </Button>
            : <div className="w-28"></div> /* Placeholder for alignment */
          }

          <CycleDisplay />

          { showSessionTimer && showStopwatchControls ?
            <Button onMouseDown={isRunning ? stop : start} ariaLabel={isRunning ? 'Pause Timer' : 'Start Timer'} className={buttonColor}>
              {isRunning ? 'Pause' : 'Start'}
            </Button>
            : <div className="w-28"></div> /* Placeholder for alignment */
          }
        </>
      )}
    </div>
  );
};