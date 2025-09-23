import React from 'react';

interface StopwatchDisplayProps {
  time: number; // time in milliseconds
}

const formatTime = (timeInMs: number) => {
  const totalSeconds = Math.floor(timeInMs / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const StopwatchDisplay: React.FC<StopwatchDisplayProps> = ({ time }) => {
  return (
    <div className="font-mono text-xl text-white tracking-wider">
      {formatTime(time)}
    </div>
  );
};
