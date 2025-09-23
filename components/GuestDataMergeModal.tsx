import React, { useState, useMemo } from 'react';
import { WorkoutPlan } from '../types';

interface GuestDataMergeModalProps {
  guestPlans: WorkoutPlan[];
  onMerge: (plansToMerge: WorkoutPlan[]) => void;
  onDiscard: () => void;
}

export const GuestDataMergeModal: React.FC<GuestDataMergeModalProps> = ({ guestPlans, onMerge, onDiscard }) => {
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(() => guestPlans.map(p => p.id));
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const handleTogglePlan = (planId: string) => {
    setSelectedPlanIds(prev => 
      prev.includes(planId) ? prev.filter(id => id !== planId) : [...prev, planId]
    );
  };
  
  const handleSelectAll = () => {
    if (selectedPlanIds.length === guestPlans.length) {
      setSelectedPlanIds([]);
    } else {
      setSelectedPlanIds(guestPlans.map(p => p.id));
    }
  };

  const handleMerge = () => {
    const plansToMerge = guestPlans.filter(p => selectedPlanIds.includes(p.id));
    onMerge(plansToMerge);
  };
  
  const mergeButtonText = useMemo(() => {
    const count = selectedPlanIds.length;
    if (count === 0) return 'בחר אימונים להוספה';
    if (count === 1) return 'הוסף אימון נבחר לחשבון';
    return `הוסף ${count} אימונים נבחרים לחשבון`;
  }, [selectedPlanIds.length]);

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
        <p className="text-gray-300 mt-3 text-center">מצאנו {guestPlans.length} תוכניות אימונים במכשיר זה. בחר אילו מהן תרצה להוסיף לחשבונך.</p>
        
        <div className="my-4 max-h-60 overflow-y-auto bg-gray-900/50 p-3 rounded-lg space-y-2">
            {guestPlans.map(plan => (
                <div key={plan.id} className="bg-gray-700/50 rounded-md overflow-hidden transition-all">
                    <div 
                        className="flex items-center p-2 cursor-pointer hover:bg-gray-700/80"
                        onClick={() => setExpandedPlanId(prev => prev === plan.id ? null : plan.id)}
                    >
                        <input 
                            type="checkbox"
                            checked={selectedPlanIds.includes(plan.id)}
                            onChange={() => handleTogglePlan(plan.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-5 w-5 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 shrink-0"
                        />
                        <div className="mr-3 flex-grow min-w-0">
                            <p className="font-semibold text-white truncate">{plan.name}</p>
                            <p className="text-xs text-gray-400">{plan.steps.length} צעדים</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ml-auto text-gray-400 transition-transform ${expandedPlanId === plan.id ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                    {expandedPlanId === plan.id && (
                        <div className="p-3 border-t border-gray-600/50 bg-gray-900/50 animate-fadeIn" style={{ animationDuration: '0.3s' }}>
                            <ol className="text-gray-300 space-y-1 text-sm list-decimal list-inside">
                                {plan.steps.map(step => (
                                    <li key={step.id} className="truncate">
                                        {step.name} - <span className="text-gray-400 font-normal">{step.isRepBased ? `${step.reps} חזרות` : `${step.duration} שניות`}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            ))}
        </div>
        
        <div className="text-center mb-6">
            <button onClick={handleSelectAll} className="text-sm text-blue-400 hover:underline">
                {selectedPlanIds.length === guestPlans.length ? 'בטל בחירת הכל' : 'בחר הכל'}
            </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleMerge}
            disabled={selectedPlanIds.length === 0}
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