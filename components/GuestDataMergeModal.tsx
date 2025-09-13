import React from 'react';

interface GuestDataMergeModalProps {
  onMerge: () => void;
  onDiscard: () => void;
}

export const GuestDataMergeModal: React.FC<GuestDataMergeModalProps> = ({ onMerge, onDiscard }) => {
  return (
    <div 
        className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 animate-fadeIn"
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md text-center"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white">Welcome!</h2>
        <p className="text-gray-300 mt-3">We found some workout plans saved on this device. What would you like to do with them?</p>
        
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button
            onClick={onMerge}
            className="flex-1 px-4 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            Add to My Account
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-3 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
};
