import React from 'react';

interface FloatingScrollButtonsProps {
  show: boolean;
  isNearBottom: boolean;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
}

export const FloatingScrollButtons: React.FC<FloatingScrollButtonsProps> = ({
  show,
  isNearBottom,
  onScrollToTop,
  onScrollToBottom,
}) => {
  if (!show) return null;

  return (
    <div className="flex justify-center gap-2 mb-2 select-none z-20">
      <button
        type="button"
        onClick={onScrollToTop}
        className="px-3 py-1 bg-gray-800/90 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full text-xs border border-gray-650 shadow flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-sm"
        title="חזרה לראש ההודעות"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        <span>חזרה למעלה</span>
      </button>
      {!isNearBottom && (
        <button
          type="button"
          onClick={onScrollToBottom}
          className="px-3 py-1 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full text-xs shadow flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-sm"
          title="קפוץ להודעה האחרונה"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span>חזרה לתחתית</span>
        </button>
      )}
    </div>
  );
};
