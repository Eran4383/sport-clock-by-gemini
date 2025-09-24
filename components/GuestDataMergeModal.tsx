import React, { useState } from 'react';
import { WorkoutPlan } from '../types';

interface GuestDataMergeModalProps {
  guestPlans: WorkoutPlan[];
  guestHistoryCount: number;
  onMerge: (options: { mergePlans: boolean; plansToMerge: WorkoutPlan[]; mergeHistory: boolean; }) => void;
  onDiscard: () => void;
}

const Toggle: React.FC<{ id: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; }> = ({ id, checked, onChange, disabled }) => (
    <label htmlFor={id} className={`relative inline-flex items-center cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
        <input type="checkbox" id={id} className="sr-only peer" checked={checked} onChange={onChange} disabled={disabled} />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
    </label>
);

const AccordionSection: React.FC<{
  title: string;
  count: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isMergingEnabled: boolean;
  onToggleMerge: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children: React.ReactNode;
}> = ({ title, count, isExpanded, onToggleExpand, isMergingEnabled, onToggleMerge, children }) => (
    <div className="bg-gray-700/50 rounded-lg overflow-hidden">
        <div className="flex items-center p-3 cursor-pointer" onClick={onToggleExpand}>
            <Toggle id={`merge-${title}`} checked={isMergingEnabled} onChange={onToggleMerge} />
            <div className="mx-3 flex-grow">
                <p className="font-semibold text-white">{title}</p>
                <p className="text-sm text-gray-400">{count} {count === 1 ? 'פריט' : 'פריטים'}</p>
            </div>
            {count > 0 && (
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            )}
        </div>
        {isExpanded && count > 0 && (
            <div className="p-3 border-t border-gray-600/50 bg-gray-900/50 animate-fadeIn" style={{ animationDuration: '0.3s' }}>
                {children}
            </div>
        )}
    </div>
);


export const GuestDataMergeModal: React.FC<GuestDataMergeModalProps> = ({ guestPlans, guestHistoryCount, onMerge, onDiscard }) => {
  const [mergePlansEnabled, setMergePlansEnabled] = useState(guestPlans.length > 0);
  const [mergeHistoryEnabled, setMergeHistoryEnabled] = useState(guestHistoryCount > 0);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(() => guestPlans.map(p => p.id));

  const [isPlansExpanded, setIsPlansExpanded] = useState(guestPlans.length > 0);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  const handleTogglePlanSelection = (planId: string) => {
    setSelectedPlanIds(prev =>
      prev.includes(planId) ? prev.filter(id => id !== planId) : [...prev, planId]
    );
  };
  
  const handleSelectAllPlans = () => {
    if (selectedPlanIds.length === guestPlans.length) {
      setSelectedPlanIds([]);
    } else {
      setSelectedPlanIds(guestPlans.map(p => p.id));
    }
  };

  const handleMerge = () => {
    onMerge({
        mergePlans: mergePlansEnabled,
        plansToMerge: guestPlans.filter(p => selectedPlanIds.includes(p.id)),
        mergeHistory: mergeHistoryEnabled,
    });
  };

  const isMergeDisabled = (!mergePlansEnabled || selectedPlanIds.length === 0) && !mergeHistoryEnabled;

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
        <h2 className="text-2xl font-bold text-white text-center">ברוכים השבים!</h2>
        <p className="text-gray-300 mt-3 text-center">מצאנו נתונים שלא שמורים בחשבונך על מכשיר זה. בחר מה תרצה למזג לחשבון.</p>
        
        <div className="space-y-3 my-6">
            <AccordionSection
                title="תוכניות אימונים"
                count={guestPlans.length}
                isExpanded={isPlansExpanded}
                onToggleExpand={() => guestPlans.length > 0 && setIsPlansExpanded(p => !p)}
                isMergingEnabled={mergePlansEnabled}
                onToggleMerge={(e) => setMergePlansEnabled(e.target.checked)}
            >
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {guestPlans.map(plan => (
                        <div key={plan.id} className="flex items-center">
                            <input 
                                type="checkbox"
                                id={`plan-${plan.id}`}
                                checked={selectedPlanIds.includes(plan.id)}
                                onChange={() => handleTogglePlanSelection(plan.id)}
                                className="h-4 w-4 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 shrink-0"
                            />
                            <label htmlFor={`plan-${plan.id}`} className="mr-3 text-white truncate cursor-pointer">{plan.name}</label>
                        </div>
                    ))}
                </div>
                 <button onClick={handleSelectAllPlans} className="text-sm text-blue-400 hover:underline mt-3">
                    {selectedPlanIds.length === guestPlans.length ? 'בטל בחירת הכל' : 'בחר הכל'}
                </button>
            </AccordionSection>

             <AccordionSection
                title="היסטוריית אימונים"
                count={guestHistoryCount}
                isExpanded={isHistoryExpanded}
                onToggleExpand={() => guestHistoryCount > 0 && setIsHistoryExpanded(p => !p)}
                isMergingEnabled={mergeHistoryEnabled}
                onToggleMerge={(e) => setMergeHistoryEnabled(e.target.checked)}
            >
                <p className="text-gray-400">מיזוג יוסיף {guestHistoryCount} רשומות אימון לחשבונך.</p>
            </AccordionSection>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleMerge}
            disabled={isMergeDisabled}
            className="flex-1 px-4 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            מזג נתונים נבחרים
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
