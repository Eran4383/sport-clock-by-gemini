import React from 'react';

interface CountdownControlsProps {
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

const ControlButton: React.FC<{ onClick: () => void; className?: string; children: React.ReactNode; ariaLabel: string, disabled?: boolean }> = ({ onClick, className = '', children, ariaLabel, disabled = false }) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    disabled={disabled}
    className={`w-28 px-6 py-2 rounded-md text-lg font-semibold transition-colors duration-200 focus:outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
  >
    {children}
  </button>
);

export const CountdownControls: React.FC<CountdownControlsProps> = ({ isRunning, start, stop, reset }) => {
  const buttonColor = 'bg-gray-500/30 hover:bg-gray-500/40 text-white';

  return (
    <div 
      className="flex gap-4 mt-4"
      style={{ transform: 'scale(var(--countdown-controls-scale))' }}
    >
      <ControlButton 
        onClick={reset} 
        ariaLabel={'Reset Countdown'}
        className={buttonColor}
        disabled={isRunning}
      >
        Reset
      </ControlButton>
      <ControlButton 
        onClick={isRunning ? stop : start} 
        ariaLabel={isRunning ? 'Stop Countdown' : 'Start Countdown'}
        className={buttonColor}
      >
        {isRunning ? 'Stop' : 'Start'}
      </ControlButton>
    </div>
  );
};