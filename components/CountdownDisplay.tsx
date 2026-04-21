import React from 'react';

interface CountdownDisplayProps {
  timeLeft: number;
}

export const CountdownDisplay: React.FC<CountdownDisplayProps> = ({ timeLeft }) => {
  return (
    <div 
      className={`tabular-nums font-bold tracking-tighter w-full text-center leading-none`}
      style={{ fontSize: 'var(--countdown-font-size)' }}
    >
      {Math.ceil(timeLeft)}
    </div>
  );
};