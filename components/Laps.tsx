import React from 'react';
import { formatTime } from '../utils/time';

interface LapsProps {
  laps: number[];
  currentTime: number;
}

export const Laps: React.FC<LapsProps> = ({ laps, currentTime }) => {
  const reversedLaps = [...laps].reverse();
  const currentLapTime = currentTime - (laps.length > 0 ? laps.reduce((a, b) => a + b, 0) : 0);

  if (laps.length === 0 && currentTime === 0) {
    return null;
  }

  return (
    <div className="w-full max-h-60 overflow-y-auto px-4">
      <ul className="w-full text-lg">
        {currentTime > 0 && (
           <li className="flex justify-between items-center py-2 border-b border-gray-500/30">
            <span className="font-mono text-gray-400">Lap {laps.length + 1}</span>
            <span className="font-mono">{formatTime(currentLapTime)}</span>
          </li>
        )}
        {reversedLaps.map((lapTime, index) => (
          <li key={laps.length - index} className="flex justify-between items-center py-2 border-b border-gray-500/30">
            <span className="font-mono text-gray-400">Lap {laps.length - index}</span>
            <span className="font-mono">{formatTime(lapTime)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};