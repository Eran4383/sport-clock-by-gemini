import React from 'react';

interface RepDisplayProps {
  reps: number;
  onComplete: () => void;
}

export const RepDisplay: React.FC<RepDisplayProps> = ({ reps, onComplete }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div 
        className={`tabular-nums font-bold tracking-tighter w-full leading-none`}
        style={{ fontSize: 'var(--countdown-font-size)' }}
      >
        {reps}
        <span className="text-4xl align-middle ml-4 opacity-80">Reps</span>
      </div>
      <button
        onClick={onComplete}
        aria-label="Complete step and move to next"
        className="mt-8 w-48 px-6 py-3 rounded-md text-xl font-semibold transition-transform duration-200 focus:outline-none bg-green-500 text-white hover:bg-green-600 focus:ring-4 ring-green-400/50 transform hover:scale-105"
      >
        Done
      </button>
    </div>
  );
};
