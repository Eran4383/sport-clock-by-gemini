import React, { useEffect } from 'react';

interface ImportNotificationProps {
  message: string;
  planName: string;
  onClose: () => void;
}

export const ImportNotification: React.FC<ImportNotificationProps> = ({ message, planName, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-close after 5 seconds

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className="fixed top-5 right-5 bg-green-500 text-white p-4 rounded-lg shadow-lg flex items-center gap-4 z-[200] animate-fadeIn"
      role="alert"
      style={{ maxWidth: '350px' }}
    >
      {/* Icon */}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      
      <div className="flex-grow">
        <p className="font-bold">{message}</p>
        <p className="text-sm opacity-90">{planName}</p>
      </div>

      {/* Close Button */}
      <button onClick={onClose} className="p-1 rounded-full hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-white/50 shrink-0" aria-label="Close notification">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
