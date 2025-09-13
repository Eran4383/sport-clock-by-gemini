import React from 'react';

interface PreWorkoutCountdownProps {
  timeLeft: number;
  onDoubleClick: () => void;
}

export const PreWorkoutCountdown: React.FC<PreWorkoutCountdownProps> = ({ timeLeft, onDoubleClick }) => {
  return (
    <div 
      className="fixed inset-0 bg-white text-black flex flex-col items-center justify-center z-[200]"
      onDoubleClick={onDoubleClick}
    >
      <h1 className="text-4xl md:text-6xl font-bold mb-8" dir="rtl">
        מתחילים בעוד...
      </h1>
      <div 
        key={timeLeft}
        className="text-9xl md:text-[20rem] font-bold text-green-500 animate-pop"
        style={{ animationDuration: '1s' }}
      >
        {timeLeft}
      </div>
    </div>
  );
};
