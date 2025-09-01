import React from 'react';

interface LapCounterProps {
  lap: number;
}

export const LapCounter: React.FC<LapCounterProps> = ({ lap }) => {
  return (
    <div className="absolute bottom-4 left-4 border border-white bg-black text-white px-4 py-1 font-mono text-lg">
      {lap}
    </div>
  );
};
