import React, { useEffect } from 'react';

interface ImportNotificationProps {
  message: string;
  planName: string;
  onClose: () => void;
  type: 'success' | 'warning';
}

const ICONS = {
    success: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
    ),
    warning: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 3.001-1.742 3.001H4.42c-1.53 0-2.493-1.667-1.743-3.001l5.58-9.92zM10 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
    )
};

const STYLES = {
    success: {
        bg: 'bg-green-500',
        hoverBg: 'hover:bg-green-600',
    },
    warning: {
        bg: 'bg-yellow-500',
        hoverBg: 'hover:bg-yellow-600',
    }
};

export const ImportNotification: React.FC<ImportNotificationProps> = ({ message, planName, onClose, type }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-close after 5 seconds

    return () => clearTimeout(timer);
  }, [onClose]);
  
  const style = STYLES[type] || STYLES.success;
  const icon = ICONS[type] || ICONS.success;

  return (
    <div 
      className={`fixed top-5 right-5 text-white p-4 rounded-lg shadow-lg flex items-center gap-4 z-[200] animate-fadeIn ${style.bg}`}
      role="alert"
      style={{ maxWidth: '350px' }}
    >
      {/* Icon */}
      {icon}
      
      <div className="flex-grow">
        <p className="font-bold">{message}</p>
        <p className="text-sm opacity-90">{planName}</p>
      </div>

      {/* Close Button */}
      <button onClick={onClose} className={`p-1 rounded-full ${style.hoverBg} focus:outline-none focus:ring-2 focus:ring-white/50 shrink-0`} aria-label="Close notification">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};