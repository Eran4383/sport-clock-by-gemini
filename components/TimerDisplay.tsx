
import React from 'react';
import { formatTime } from '../utils/time';

interface TimerDisplayProps {
  time: number;
  completedWorkoutDuration?: number | null;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ time, completedWorkoutDuration }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full text-center">
      <div 
        className={`tabular-nums font-bold tracking-tight`}
        style={{ fontSize: 'var(--stopwatch-font-size)' }}
      >
        {formatTime(time)}
      </div>
      {completedWorkoutDuration != null && (
        <div className="text-2xl text-gray-400 tabular-nums">
          (Workout: {formatTime(completedWorkoutDuration)})
        </div>
      )}
    </div>
  );
};
