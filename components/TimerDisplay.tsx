import React from 'react';
import { formatTime } from '../utils/time';

interface TimerDisplayProps {
  time: number;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ time }) => {
  return (
    <div 
      className={`tabular-nums font-bold tracking-tight w-full text-center`}
      style={{ fontSize: 'var(--stopwatch-font-size)' }}
    >
      {formatTime(time)}
    </div>
  );
};