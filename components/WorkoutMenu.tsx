import React, { useState, useEffect, useRef } from 'react';
import { useWorkout } from '../contexts/WorkoutContext';
import { WorkoutPlan, WorkoutStep } from '../types';
import { useSettings } from '../contexts/SettingsContext';

const PlanListItem: React.FC<{
  plan: WorkoutPlan;
  onSelectPlan: (plan: WorkoutPlan) => void;
  isSelected: boolean;
  onToggleSelection: (planId: string) => void;
  isDraggable: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
  isDragTarget: boolean;
  index: number;
}> = ({ plan, onSelectPlan, isSelected, onToggleSelection, isDraggable, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, isDragTarget, index }) => {
  const { 
      activeWorkout, 
      isCountdownPaused,
      startWorkout, 
      stopWorkout, 
      pauseStepCountdown, 
      resumeStepCountdown, 
      restartCurrentStep, 
      deletePlan 
  } = useWorkout();
  const [isExpanded, setIsExpanded] = useState(false);

  const isActive = activeWorkout?.sourcePlanIds.includes(plan.id) ?? false;

  const getTotalDuration = (plan: WorkoutPlan) => {
    const totalSeconds = plan.steps.reduce((sum, step) => sum + (step.isRepBased ? 0 : step.duration), 0);
    if (isNaN(totalSeconds)) return '00:00';
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${plan.name}"?`)) {
      deletePlan(plan.id);
    }
  };

  const handleStop = (e: React.MouseEvent) => {
      e.stopPropagation();
      stopWorkout();
  }

  const handleTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCountdownPaused) {
      resumeStepCountdown();
    } else {
      pauseStepCountdown();
    }
  };
  
  const handleRestart = (e: React.MouseEvent) => {
      e.stopPropagation();
      restartCurrentStep();
  }

  const dragStyles = isDragTarget ? 'border-2 border-dashed border-blue-400' : 'border-2 border-transparent';

  return (
    <div 
        className={`bg-gray-700/50 rounded-lg transition-all duration-300 ${isDraggable ? 'cursor-grab' : ''} ${dragStyles}`}
        draggable={isDraggable}
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onDragEnd={onDragEnd}
        onDragLeave={onDragLeave}
    >
      <div className="p-4" onClick={() => !isActive && setIsExpanded(!isExpanded)}>
        <div className="flex justify-between items-center">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {!activeWorkout && (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelection(plan.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="form-checkbox h-5 w-5 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 shrink-0"
                    aria-label={`Select plan ${plan.name}`}
                />
            )}
            <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-white truncate">{plan.name}</h3>
                <p className="text-sm text-gray-400">
                {plan.steps.length} steps, Total: {getTotalDuration(plan)}
                </p>
            </div>
          </div>
          <div className="flex gap-2 items-center ml-2 flex-shrink-0">
            <button 
              onClick={(e) => { e.stopPropagation(); onSelectPlan(plan); }}
              className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/50 rounded-full"
              aria-label="Edit plan" title="Edit plan" disabled={!!activeWorkout}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
            </button>
            <button 
              onClick={handleDelete}
              className="p-2 text-gray-300 hover:text-red-500 hover:bg-gray-600/50 rounded-full"
              aria-label="Delete plan" title="Delete plan" disabled={!!activeWorkout}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
         {isActive ? (
             <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={handleStop} className="py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors text-sm">Stop</button>
                <button onClick={handleTogglePause} className="py-2 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-600 transition-colors text-sm">{isCountdownPaused ? 'Resume' : 'Pause'}</button>
                <button onClick={handleRestart} className="py-2 bg-gray-500 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors text-sm" title="Restart current step">Restart</button>
             </div>
         ) : (
            <button 
                onClick={(e) => { e.stopPropagation(); startWorkout([plan.id]); }}
                className="w-full mt-3 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                disabled={!!activeWorkout}
            >
                Start Workout
            </button>
         )}
      </div>
      {isExpanded && !isActive && (
        <div className="border-t border-gray-600/50 px-4 pb-4 pt-2">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Steps:</h4>
            <ol className="list-decimal list-inside text-gray-300 space-y-1">
                {plan.steps.map(step => (
                    <li key={step.id}>
                        {step.name} - <span className="text-gray-400">{step.isRepBased ? `${step.reps} reps` : `${step.duration}s`}</span>
                    </li>
                ))}
            </ol>
        </div>
      )}
    </div>
  );
};

const PlanList: React.FC<{
  onSelectPlan: (plan: WorkoutPlan) => void;
  onCreateNew: () => void;
}> = ({ onSelectPlan, onCreateNew }) => {
  const { plans, reorderPlans, startWorkout, activeWorkout } = useWorkout();
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const dragItemIndex = useRef<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  const handleToggleSelection = (planId: string) => {
    setSelectedPlanIds(prev =>
      prev.includes(planId) ? prev.filter(id => id !== planId) : [...prev, planId]
    );
  };
  
  const handleStartSelected = () => {
      startWorkout(selectedPlanIds);
      setSelectedPlanIds([]);
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    dragItemIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (index !== dragTargetIndex) {
      setDragTargetIndex(index);
    }
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragItemIndex.current === null || dragItemIndex.current === index) {
      return;
    }
    const draggedItem = plans[dragItemIndex.current];
    const newPlans = [...plans];
    newPlans.splice(dragItemIndex.current, 1);
    newPlans.splice(index, 0, draggedItem);
    reorderPlans(newPlans);
    dragItemIndex.current = null;
    setDragTargetIndex(null);
  };

  const onDragEnd = () => {
    dragItemIndex.current = null;
    setDragTargetIndex(null);
  };
  
  const onDragLeave = () => {
    setDragTargetIndex(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Workout Plans</h2>
        <button 
          onClick={onCreateNew}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          disabled={!!activeWorkout}
        >
          + Create New
        </button>
      </div>

      {selectedPlanIds.length > 0 && !activeWorkout && (
          <button
            onClick={handleStartSelected}
            className="w-full mb-4 py-2.5 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors"
          >
              Start Selected ({selectedPlanIds.length})
          </button>
      )}

      <div className="space-y-4">
        {plans.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No workout plans yet. Create one to get started!</p>
        ) : (
          plans.map((plan, index) => (
            <PlanListItem 
                key={plan.id} 
                plan={plan} 
                index={index}
                onSelectPlan={onSelectPlan}
                isSelected={selectedPlanIds.includes(plan.id)}
                onToggleSelection={handleToggleSelection}
                isDraggable={!activeWorkout}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onDragLeave={onDragLeave}
                isDragTarget={dragTargetIndex === index}
            />
          ))
        )}
      </div>
    </div>
  );
};

const SetBuilder: React.FC<{ onAddSets: (steps: WorkoutStep[]) => void }> = ({ onAddSets }) => {
    const [name, setName] = useState('Exercise');
    const [isRepBased, setIsRepBased] = useState(false);
    const [duration, setDuration] = useState(30);
    const [reps, setReps] = useState(10);
    const [sets, setSets] = useState(3);
    const [rest, setRest] = useState(15);
    
    const handleAdd = () => {
        const newSteps: WorkoutStep[] = [];
        for (let i = 0; i < sets; i++) {
            const exerciseStep: WorkoutStep = {
                id: `${Date.now()}-set-${i}-ex`,
                name: `${name} (Set ${i + 1}/${sets})`,
                type: 'exercise',
                isRepBased,
                duration: isRepBased ? 0 : duration,
                reps: isRepBased ? reps : 0,
            };
            newSteps.push(exerciseStep);
            
            if (rest > 0 && i < sets - 1) { // No rest after the last set
                const restStep: WorkoutStep = {
                    id: `${Date.now()}-set-${i}-rest`,
                    name: 'Rest',
                    type: 'rest',
                    isRepBased: false,
                    duration: rest,
                    reps: 0,
                };
                newSteps.push(restStep);
            }
        }
        onAddSets(newSteps);
    };

    return (
        <div className="bg-gray-700/50 p-3 rounded-lg space-y-3 mt-4">
            <h4 className="text-md font-semibold text-center text-gray-300">Set Builder</h4>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Exercise Name" title="Name of the exercise for this set" className="w-full bg-gray-600 p-2 rounded-md focus:outline-none focus:ring-1 ring-blue-500" />
            <div className="flex gap-2">
                <button onClick={() => setIsRepBased(false)} className={`flex-1 py-1 rounded ${!isRepBased ? 'bg-blue-500' : 'bg-gray-600'}`}>Time</button>
                <button onClick={() => setIsRepBased(true)} className={`flex-1 py-1 rounded ${isRepBased ? 'bg-blue-500' : 'bg-gray-600'}`}>Reps</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
                {isRepBased ? (
                    <input type="number" min="1" value={reps} onChange={e => setReps(parseInt(e.target.value, 10) || 1)} title="Number of repetitions per set" className="w-full bg-gray-600 p-2 rounded-md [appearance:textfield]" />
                ) : (
                    <input type="number" min="1" value={duration} onChange={e => setDuration(parseInt(e.target.value, 10) || 1)} title="Duration in seconds per set" className="w-full bg-gray-600 p-2 rounded-md [appearance:textfield]" />
                )}
                <input type="number" min="1" value={sets} onChange={e => setSets(parseInt(e.target.value, 10) || 1)} title="Total number of sets to perform" className="w-full bg-gray-600 p-2 rounded-md [appearance:textfield]" placeholder="Sets"/>
            </div>
            <input type="number" min="0" value={rest} onChange={e => setRest(parseInt(e.target.value, 10) || 0)} title="Rest time in seconds between sets" className="w-full bg-gray-600 p-2 rounded-md [appearance:textfield]" placeholder="Rest between sets (s)" />
            <button onClick={handleAdd} className="w-full py-2 bg-blue-500/80 hover:bg-blue-500 rounded-lg">+ Add to Plan</button>
        </div>
    );
};

const PlanEditor: React.FC<{
  plan: WorkoutPlan | null;
  onBack: () => void;
}> = ({ plan, onBack }) => {
    const { savePlan } = useWorkout();
    const { settings, updateSettings } = useSettings();

    const [editedPlan, setEditedPlan] = useState<WorkoutPlan | null>(null);

    useEffect(() => {
        if (plan) {
            setEditedPlan(JSON.parse(JSON.stringify(plan)));
        } else {
            setEditedPlan({
                id: `new_${Date.now()}`,
                name: '',
                steps: [],
            });
        }
    }, [plan]);


    const handleSave = () => {
        if (!editedPlan || editedPlan.name.trim() === '' || editedPlan.steps.length === 0) {
            alert('Please provide a name and at least one step.');
            return;
        }
        
        const planToSave = { ...editedPlan };
        if (planToSave.id.startsWith('new_')) {
            planToSave.id = Date.now().toString();
        }

        savePlan(planToSave);
        onBack();
    };
    
    const updateStep = (index: number, newStep: Partial<WorkoutStep>) => {
        if (!editedPlan) return;
        const newSteps = [...editedPlan.steps];
        newSteps[index] = { ...newSteps[index], ...newStep };
        setEditedPlan(p => p ? { ...p, steps: newSteps } : null);
    };
    
    const addStep = (type: 'exercise' | 'rest') => {
        if (!editedPlan) return;
        const newStep: WorkoutStep = {
            id: Date.now().toString(),
            type: type,
            name: type === 'exercise' ? 'Exercise' : 'Rest',
            isRepBased: false,
            duration: type === 'exercise' ? settings.defaultExerciseDuration : settings.defaultRestDuration,
            reps: 10,
        };
        setEditedPlan(p => p ? { ...p, steps: [...p.steps, newStep] } : null);
    };

    const removeStep = (index: number) => {
        if (!editedPlan) return;
        setEditedPlan(p => p ? { ...p, steps: p.steps.filter((_, i) => i !== index)} : null);
    };

    const addStepsFromBuilder = (steps: WorkoutStep[]) => {
        if (!editedPlan) return;
        setEditedPlan(p => p ? { ...p, steps: [...p.steps, ...steps] } : null);
    };

    const PinButton: React.FC<{onClick: () => void; isActive: boolean; title: string}> = ({ onClick, isActive, title }) => (
        <button onClick={onClick} title={title} className={`p-1 rounded-full ${isActive ? 'text-blue-400' : 'text-gray-500 hover:text-white'}`}>
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 9.586V4a1 1 0 011-1z" clipRule="evenodd" /><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
        </button>
    );

    if (!editedPlan) {
        return null;
    }
    
    return (
        <div>
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-500/30 mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="text-2xl font-bold text-white">{plan ? 'Edit Plan' : 'Create Plan'}</h2>
            </div>
            
            <div className="space-y-6">
                <input 
                    type="text"
                    placeholder="Workout Plan Name"
                    title="The name for your workout plan"
                    value={editedPlan.name}
                    onChange={e => setEditedPlan(p => p ? { ...p, name: e.target.value } : null)}
                    className="w-full bg-gray-600 text-white p-3 rounded-lg text-lg focus:outline-none focus:ring-2 ring-blue-500"
                />

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                   {editedPlan.steps.map((step, index) => (
                       <div key={step.id} className="bg-gray-700/50 p-3 rounded-lg space-y-3">
                           <div className="flex items-center gap-2">
                               <span className="text-gray-400 font-bold">#{index + 1}</span>
                               <input 
                                   type="text"
                                   value={step.name}
                                   onChange={e => updateStep(index, { name: e.target.value })}
                                   className="flex-grow bg-gray-600 p-2 rounded-md focus:outline-none focus:ring-1 ring-blue-500"
                                   title="Name of this step (e.g., Push-ups)"
                               />
                               <button onClick={() => removeStep(index)} className="p-2 text-gray-400 hover:text-red-500" title="Remove step">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                               </button>
                           </div>
                           
                           <div className="grid grid-cols-2 gap-3">
                               <div>
                                   <label className="text-sm text-gray-400">Type</label>
                                   <div className="flex rounded-md border border-gray-500 overflow-hidden mt-1">
                                       <button onClick={() => updateStep(index, { type: 'exercise' })} className={`flex-1 px-2 py-1 text-sm ${step.type === 'exercise' ? 'bg-blue-500' : 'bg-transparent'}`}>Exercise</button>
                                       <button onClick={() => updateStep(index, { type: 'rest' })} className={`flex-1 px-2 py-1 text-sm ${step.type === 'rest' ? 'bg-blue-500' : 'bg-transparent'}`}>Rest</button>
                                   </div>
                               </div>
                                {step.type === 'exercise' && (
                                    <div>
                                        <label className="text-sm text-gray-400">Mode</label>
                                        <div className="flex rounded-md border border-gray-500 overflow-hidden mt-1">
                                            <button onClick={() => updateStep(index, { isRepBased: false })} className={`flex-1 px-2 py-1 text-sm ${!step.isRepBased ? 'bg-blue-500' : 'bg-transparent'}`}>Time</button>
                                            <button onClick={() => updateStep(index, { isRepBased: true })} className={`flex-1 px-2 py-1 text-sm ${step.isRepBased ? 'bg-blue-500' : 'bg-transparent'}`}>Reps</button>
                                        </div>
                                    </div>
                                )}
                           </div>
                           
                           <div>
                                <label className="text-sm text-gray-400">{step.isRepBased ? 'Reps' : 'Duration (s)'}</label>
                                {step.isRepBased ? (
                                    <input type="number" min="1" value={step.reps} onChange={e => updateStep(index, { reps: parseInt(e.target.value, 10) || 1 })} title="Number of repetitions" className="w-full mt-1 bg-gray-600 text-center p-2 rounded-md [appearance:textfield]" />
                                ) : (
                                    <div className="flex items-center gap-2 mt-1">
                                        <input type="number" min="1" value={step.duration} onChange={e => updateStep(index, { duration: parseInt(e.target.value, 10) || 1 })} title={step.type === 'exercise' ? 'Exercise duration in seconds' : 'Rest duration in seconds'} className="w-full bg-gray-600 text-center p-2 rounded-md [appearance:textfield]" />
                                        <PinButton 
                                            onClick={() => updateSettings(step.type === 'exercise' ? { defaultExerciseDuration: step.duration } : { defaultRestDuration: step.duration })}
                                            isActive={step.type === 'exercise' ? settings.defaultExerciseDuration === step.duration : settings.defaultRestDuration === step.duration}
                                            title="Set as default time for new steps"
                                        />
                                    </div>
                                )}
                           </div>

                       </div>
                   ))}
                </div>
                
                <div className="flex gap-4">
                    <button onClick={() => addStep('exercise')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500/80 rounded-lg">+ Add Exercise</button>
                    <button onClick={() => addStep('rest')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500/80 rounded-lg">+ Add Rest</button>
                </div>
                
                <SetBuilder onAddSets={addStepsFromBuilder} />

                <button onClick={handleSave} className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors text-lg">
                    Save Plan
                </button>
            </div>
        </div>
    );
};


export const WorkoutMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const { activeWorkout } = useWorkout();

  useEffect(() => {
    if (!isOpen) {
        setTimeout(() => {
             setView('list');
             setEditingPlan(null);
        }, 500); 
    }
  }, [isOpen]);
  
  const handleCreateNew = () => {
      setEditingPlan(null);
      setView('editor');
  };

  const handleSelectPlan = (plan: WorkoutPlan) => {
      setEditingPlan(plan);
      setView('editor');
  };

  const handleBack = () => {
      setView('list');
      setEditingPlan(null);
  };
  
  useEffect(() => {
      if(activeWorkout) {
          setIsOpen(false);
      }
  }, [activeWorkout]);


  return (
    <>
      <div className="absolute top-4 left-4 menu-container group">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          aria-label="Open workout planner"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-opacity duration-1000 focus:outline-none opacity-0 group-hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      <div 
        className={`fixed top-0 left-0 h-full w-full max-w-sm bg-gray-800/80 backdrop-blur-md shadow-2xl z-50 transform transition-all ease-in-out ${isOpen ? 'duration-500' : 'duration-[1500ms]'} ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}
        >
          <div className="p-6 overflow-y-auto h-full">
            {view === 'list' ? (
                <PlanList onSelectPlan={handleSelectPlan} onCreateNew={handleCreateNew} />
            ) : (
                <PlanEditor plan={editingPlan} onBack={handleBack} />
            )}
          </div>
        </div>
    </>
  );
};