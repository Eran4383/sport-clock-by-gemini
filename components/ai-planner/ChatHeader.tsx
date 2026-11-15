import React from 'react';

interface ChatHeaderProps {
  onOpenProfile: () => void;
  onNewChat: () => void;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onOpenProfile,
  onNewChat,
  onClose,
}) => {
  return (
    <div className="flex justify-between items-center mb-4 text-white select-none">
      <button
        onClick={onOpenProfile}
        title="הפרופיל שלי"
        className="p-2 rounded-full hover:bg-gray-700 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
        </svg>
      </button>

      <h2 className="text-xl font-bold flex items-center gap-2">✨ AI Workout Planner</h2>

      <div className="flex items-center gap-2">
        <button
          onClick={onNewChat}
          title="שיחה חדשה"
          className="p-2 rounded-full hover:bg-gray-700 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={onClose}
          title="סגור"
          className="p-2 rounded-full hover:bg-gray-700 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
