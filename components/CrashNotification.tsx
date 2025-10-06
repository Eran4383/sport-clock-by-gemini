
import React from 'react';

interface CrashNotificationProps {
  onCopy: () => void;
  onDismiss: () => void;
}

export const CrashNotification: React.FC<CrashNotificationProps> = ({ onCopy, onDismiss }) => {
  return (
    <div 
      className="fixed top-0 left-0 right-0 bg-red-800 text-white p-4 shadow-lg flex flex-col sm:flex-row items-center gap-4 z-[201] animate-fadeIn"
      role="alert"
    >
      <div className="shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 3.001-1.742 3.001H4.42c-1.53 0-2.493-1.667-1.743-3.001l5.58-9.92zM10 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      
      <div className="flex-grow text-center sm:text-left">
        <p className="font-bold">נראה שהאפליקציה נתקלה בבעיה</p>
        <p className="text-sm opacity-90">
            האם תרצה להעתיק את דוח השגיאה כדי לעזור לנו לתקן אותה?
        </p>
      </div>

      <div className="flex gap-2 shrink-0">
        <button 
            onClick={onCopy} 
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-md font-semibold"
        >
            העתק דוח
        </button>
        <button 
            onClick={onDismiss} 
            className="p-2 hover:bg-red-700 rounded-md" 
            aria-label="Close notification"
        >
           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
      </div>
    </div>
  );
};
