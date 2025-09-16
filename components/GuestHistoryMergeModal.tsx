
import React, { useState, useMemo } from 'react';
import { WorkoutLogEntry } from '../types';

interface GuestHistoryMergeModalProps {
  guestHistory: WorkoutLogEntry[];
  onMerge: (historyToMerge: WorkoutLogEntry[]) => void;
  onDiscard: () => void;
}

export const GuestHistoryMergeModal: React.FC<GuestHistoryMergeModalProps> = ({ guestHistory, onMerge, onDiscard }) => {
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>(() => guestHistory.map(h => h.id));

  const handleToggleHistory = (historyId: string) => {
    setSelectedHistoryIds(prev => 
      prev.includes(historyId) ? prev.filter(id => id !== historyId) : [...prev, historyId]
    );
  };
  
  const handleSelectAll = () => {
    if (selectedHistoryIds.length === guestHistory.length) {
      setSelectedHistoryIds([]);
    } else {
      setSelectedHistoryIds(guestHistory.map(h => h.id));
    }
  };

  const handleMerge = () => {
    const historyToMerge = guestHistory.filter(h => selectedHistoryIds.includes(h.id));
    onMerge(historyToMerge);
  };
  
  const mergeButtonText = useMemo(() => {
    const count = selectedHistoryIds.length;
    if (count === 0) return 'בחר אימונים להוספה';
    if (count === 1) return 'הוסף אימון נבחר לחשבון';
    return `הוסף ${count} אימונים נבחרים לחשבון`;
  }, [selectedHistoryIds.length]);

  return (
    <div 
        className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 animate-fadeIn"
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <h2 className="text-2xl font-bold text-white text-center">מצאנו היסטוריית אימונים!</h2>
        <p className="text-gray-300 mt-3 text-center">מצאנו {guestHistory.length} אימונים שביצעת כאורח במכשיר זה. בחר אילו מהם תרצה להוסיף לחשבונך.</p>
        
        <div className="my-4 max-h-60 overflow-y-auto bg-gray-900/50 p-3 rounded-lg space-y-2">
            {guestHistory.map(entry => (
                <div key={entry.id} className="bg-gray-700/50 rounded-md overflow-hidden transition-all">
                    <div 
                        className="flex items-center p-2"
                    >
                        <input 
                            type="checkbox"
                            checked={selectedHistoryIds.includes(entry.id)}
                            onChange={() => handleToggleHistory(entry.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-5 w-5 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 shrink-0"
                        />
                        <div className="mr-3 flex-grow min-w-0">
                            <p className="font-semibold text-white truncate">{entry.planName}</p>
                            <p className="text-xs text-gray-400">{new Date(entry.date).toLocaleString('he-IL')}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        
        <div className="text-center mb-6">
            <button onClick={handleSelectAll} className="text-sm text-blue-400 hover:underline">
                {selectedHistoryIds.length === guestHistory.length ? 'בטל בחירת הכל' : 'בחר הכל'}
            </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleMerge}
            disabled={selectedHistoryIds.length === 0}
            className="flex-1 px-4 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {mergeButtonText}
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-3 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            טען מהחשבון בלבד
          </button>
        </div>
      </div>
    </div>
  );
};
