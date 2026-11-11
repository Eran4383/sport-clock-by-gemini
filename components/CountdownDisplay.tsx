import React from 'react';

interface CountdownDisplayProps {
  timeLeft: number;
  notes?: string;
}

export const CountdownDisplay: React.FC<CountdownDisplayProps> = ({ timeLeft, notes }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div 
        className={`tabular-nums font-bold tracking-tighter w-full text-center leading-none`}
        style={{ fontSize: 'var(--countdown-font-size)' }}
      >
        {Math.ceil(timeLeft)}
      </div>
      {notes && (
        <div className="mt-4 px-6 py-2 bg-white/10 rounded-lg text-lg text-white/90 max-w-lg animate-fadeIn text-center" dir="rtl">
          {notes}
        </div>
      )}
    </div>
  );
};
