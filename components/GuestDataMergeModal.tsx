import React, { useState } from 'react';
import { WorkoutPlan } from '../types';

interface GuestDataMergeModalProps {
  guestPlans: WorkoutPlan[];
  onMerge: (plansToMerge: WorkoutPlan[]) => void;
  onDiscard: () => void;
}

export const GuestDataMergeModal: React.FC<GuestDataMergeModalProps> = ({ guestPlans, onMerge, onDiscard }) => {
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(() => guestPlans.map(p => p.id));

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

  return (
    <div 
        className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 animate-fadeIn"
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white text-center">Welcome!</h2>
        <p className="text-gray-300 mt-3 text-center">We found {guestPlans.length} workout plan(s) saved on this device. Select which ones you'd like to add to your account.</p>
        
        <div className="my-4 max-h-48 overflow-y-auto bg-gray-900/50 p-3 rounded-lg space-y-2">
            {guestPlans.map(plan => (
                <label key={plan.id} className="flex items-center p-2 rounded-md hover:bg-gray-700/50 cursor-pointer">
                    <input 
                        type="checkbox"
                        checked={selectedPlanIds.includes(plan.id)}
                        onChange={() => handleTogglePlan(plan.id)}
                        className="h-5 w-5 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 shrink-0"
                    />
                    <div className="ml-3">
                        <p className="font-semibold text-white">{plan.name}</p>
                        <p className="text-xs text-gray-400">{plan.steps.length} steps</p>
                    </div>
                </label>
            ))}
        </div>
        
        <div className="text-center mb-6">
            <button onClick={handleSelectAll} className="text-sm text-blue-400 hover:underline">
                {selectedPlanIds.length === guestPlans.length ? 'Deselect All' : 'Select All'}
            </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleMerge}
            disabled={selectedPlanIds.length === 0}
            className="flex-1 px-4 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Add {selectedPlanIds.length} Selected to Account
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