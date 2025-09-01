import React from 'react';

interface ControlsProps {
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  cycleCount: number | null;
  resetCycleCount: () => void;
  showTimer: boolean;
  showStopwatchControls: boolean;
}

const Button: React.FC<{ onClick: () => void; className?: string; children: React.ReactNode; ariaLabel: string, disabled?: boolean }> = ({ onClick, className = '', children, ariaLabel, disabled = false }) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    disabled={disabled}
    className={`w-28 px-6 py-2 rounded-md text-lg font-semibold transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

export const Controls: React.FC<ControlsProps> = ({ isRunning, start, stop, reset, cycleCount, resetCycleCount, showTimer, showStopwatchControls }) => {
  const buttonColor = 'bg-gray-500/30 hover:bg-gray-500/40 text-white';

  return (
    <div 
      className="flex justify-center items-center gap-8 w-full"
      style={{ transform: 'scale(var(--stopwatch-controls-scale))' }}
    >
      {showTimer && showStopwatchControls && (
        <Button 
          onClick={reset} 
          ariaLabel={'Reset Timer'}
          className={buttonColor}
          disabled={isRunning}
          >
          Reset
        </Button>
      )}
      
      {cycleCount !== null && (
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
      )}

      {showTimer && showStopwatchControls && (
        <Button 
          onClick={isRunning ? stop : start} 
          ariaLabel={isRunning ? 'Stop Timer' : 'Start Timer'}
          className={buttonColor}
          >
          {isRunning ? 'Stop' : 'Start'}
        </Button>
      )}
    </div>
  );
};