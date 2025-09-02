import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { WorkoutPlan, WorkoutStep } from '../types';

interface ActiveWorkout {
  plan: WorkoutPlan; // This can be a "meta-plan" if multiple plans are selected
  currentStepIndex: number;
  sourcePlanIds: string[];
  stepRestartKey?: number;
}

interface WorkoutContextType {
  plans: WorkoutPlan[];
  activeWorkout: ActiveWorkout | null;
  currentStep: WorkoutStep | null;
  nextUpcomingStep: WorkoutStep | null;
  isWorkoutPaused: boolean;
  isCountdownPaused: boolean;
  recentlyImportedPlanId: string | null;
  savePlan: (plan: WorkoutPlan) => void;
  importPlan: (plan: WorkoutPlan, source?: string) => void;
  deletePlan: (planId: string) => void;
  reorderPlans: (reorderedPlans: WorkoutPlan[]) => void;
  startWorkout: (planIds: string[]) => void;
  stopWorkout: () => void;
  nextStep: () => void;
  previousStep: () => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  restartWorkout: () => void;
  pauseStepCountdown: () => void;
  resumeStepCountdown: () => void;
  restartCurrentStep: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

const WORKOUT_PLANS_KEY = 'sportsClockWorkoutPlans';

const getInitialPlans = (): WorkoutPlan[] => {
  try {
    const item = window.localStorage.getItem(WORKOUT_PLANS_KEY);
    return item ? JSON.parse(item) : [];
  } catch (error) {
    console.error('Error reading workout plans from localStorage', error);
    return [];
  }
};

/**
 * Extracts the base name of an exercise, stripping set/rep counts.
 * e.g., "Push-ups (Set 1/3)" -> "Push-ups"
 */
const getBaseExerciseName = (name: string): string => {
  const match = name.match(/(.+?)\s*\((Set|Rep|סט)\s*\d+/i);
  return match ? match[1].trim() : name;
};

/**
 * Re-orders a list of workout steps from a linear to a circuit structure.
 */
const generateCircuitSteps = (steps: WorkoutStep[]): WorkoutStep[] => {
  if (!steps || steps.length === 0) return [];

  const exerciseGroups = new Map<string, WorkoutStep[][]>();
  const exerciseOrder: string[] = [];

  let i = 0;
  while (i < steps.length) {
    const currentStep = steps[i];
    if (currentStep.type === 'exercise') {
      const baseName = getBaseExerciseName(currentStep.name);
      
      let setBlock: WorkoutStep[] = [currentStep];
      
      // Check for an immediate rest step that belongs to this exercise
      if (i + 1 < steps.length && steps[i + 1].type === 'rest') {
        setBlock.push(steps[i + 1]);
        i++; // Also consume the rest step
      }
      
      if (!exerciseGroups.has(baseName)) {
        exerciseGroups.set(baseName, []);
        exerciseOrder.push(baseName);
      }
      exerciseGroups.get(baseName)!.push(setBlock);
      
      i++;
    } else {
      // Ignore standalone rest steps at the beginning of the list for circuit logic
      i++;
    }
  }

  const circuitSteps: WorkoutStep[] = [];
  let maxSets = 0;
  exerciseGroups.forEach(sets => {
    if (sets.length > maxSets) {
      maxSets = sets.length;
    }
  });

  for (let setIndex = 0; setIndex < maxSets; setIndex++) {
    for (const baseName of exerciseOrder) {
      const sets = exerciseGroups.get(baseName);
      if (sets && setIndex < sets.length) {
        circuitSteps.push(...sets[setIndex]);
      }
    }
  }

  return circuitSteps;
};


export const WorkoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [plans, setPlans] = useState<WorkoutPlan[]>(getInitialPlans);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const [recentlyImportedPlanId, setRecentlyImportedPlanId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKOUT_PLANS_KEY, JSON.stringify(plans));
    } catch (error) {
      console.error('Error writing workout plans to localStorage', error);
    }
  }, [plans]);

  const savePlan = useCallback((planToSave: WorkoutPlan) => {
    setPlans(prevPlans => {
      const existingIndex = prevPlans.findIndex(p => p.id === planToSave.id);
      if (existingIndex > -1) {
        const newPlans = [...prevPlans];
        newPlans[existingIndex] = planToSave;
        return newPlans;
      } else {
        return [...prevPlans, planToSave];
      }
    });
  }, []);
  
  const importPlan = useCallback((planToImport: WorkoutPlan, source: string = 'file') => {
    // Sanitize and prepare the imported plan to prevent conflicts
    const newPlanId = `${Date.now()}_imported_from_${source}`;
    const newPlan: WorkoutPlan = {
      ...planToImport,
      id: newPlanId,
      name: planToImport.name, // Keep original name, remove "(Imported)" suffix
      steps: planToImport.steps.map((step, index) => ({
        ...step,
        id: `${Date.now()}_imported_step_${index}`
      }))
    };
    
    setPlans(prevPlans => {
      // Avoid adding duplicates if imported multiple times quickly
      if (prevPlans.some(p => p.name === newPlan.name)) {
        return prevPlans;
      }
      return [...prevPlans, newPlan];
    });

    // Set the ID for highlighting and clear it after the animation
    setRecentlyImportedPlanId(newPlanId);
    setTimeout(() => setRecentlyImportedPlanId(null), 2500);
  }, []);

  // Effect to handle importing a plan from a URL hash on initial load
  useEffect(() => {
    const handleImportFromUrl = () => {
        const hash = window.location.hash;
        if (hash.startsWith('#import=')) {
            try {
                const base64Data = hash.substring(8); // remove '#import='
                
                // Decode Base64 and then use TextDecoder for proper UTF-8 handling
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const decoder = new TextDecoder('utf-8');
                const jsonString = decoder.decode(bytes);

                const plan = JSON.parse(jsonString);
                
                // Basic validation
                if (plan && typeof plan.name === 'string' && Array.isArray(plan.steps)) {
                    importPlan(plan, 'url');
                    alert(`Workout plan "${plan.name}" imported successfully!`);
                } else {
                    throw new Error("Invalid plan structure in URL.");
                }
            } catch (e) {
                console.error("Failed to import from URL", e);
                alert("Could not import workout plan from the link. The link may be invalid or corrupted.");
            } finally {
                // Clean the URL to prevent re-importing on refresh
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    };
    
    handleImportFromUrl();
  }, [importPlan]);


  const deletePlan = useCallback((planId: string) => {
    setPlans(prevPlans => prevPlans.filter(p => p.id !== planId));
  }, []);

  const reorderPlans = useCallback((reorderedPlans: WorkoutPlan[]) => {
      setPlans(reorderedPlans);
  }, []);

  const startWorkout = useCallback((planIds: string[]) => {
    if (planIds.length === 0) return;
    
    const plansToRun = planIds.map(id => plans.find(p => p.id === id)).filter(Boolean) as WorkoutPlan[];
    if (plansToRun.length === 0) return;

    // A workout is considered 'circuit' only if a single plan with that mode is selected.
    const executionMode = plansToRun.length === 1 ? (plansToRun[0].executionMode || 'linear') : 'linear';

    let allSteps = plansToRun.flatMap(p => p.steps);
    
    if (executionMode === 'circuit') {
      allSteps = generateCircuitSteps(allSteps);
    }

    if (allSteps.length === 0) return;

    const metaPlan: WorkoutPlan = {
      id: `meta_${Date.now()}`,
      name: plansToRun.map(p => p.name).join(' & '),
      steps: allSteps,
      executionMode: executionMode,
    };
    
    setActiveWorkout({ plan: metaPlan, currentStepIndex: 0, sourcePlanIds: planIds, stepRestartKey: 0 });
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, [plans]);

  const stopWorkout = useCallback(() => {
    setActiveWorkout(null);
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, []);

  const pauseWorkout = useCallback(() => {
    if (activeWorkout) {
        setIsWorkoutPaused(true);
    }
  }, [activeWorkout]);

  const resumeWorkout = useCallback(() => {
      if (activeWorkout) {
        setIsWorkoutPaused(false);
      }
  }, [activeWorkout]);

  const restartWorkout = useCallback(() => {
    setActiveWorkout(prev => {
        if (!prev) return null;
        return { ...prev, currentStepIndex: 0, stepRestartKey: (prev.stepRestartKey || 0) + 1 };
    });
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, []);

  const nextStep = useCallback(() => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      const nextIndex = prev.currentStepIndex + 1;
      if (nextIndex >= prev.plan.steps.length) {
        // Workout finished
        stopWorkout();
        return null;
      }
      return { ...prev, currentStepIndex: nextIndex };
    });
    setIsCountdownPaused(false);
  }, [stopWorkout]);
  
  const previousStep = useCallback(() => {
    setActiveWorkout(prev => {
      if (!prev || prev.currentStepIndex === 0) return prev;
      return { ...prev, currentStepIndex: prev.currentStepIndex - 1 };
    });
    setIsCountdownPaused(false);
  }, []);

  const pauseStepCountdown = useCallback(() => {
    if (activeWorkout) {
      setIsCountdownPaused(true);
    }
  }, [activeWorkout]);

  const resumeStepCountdown = useCallback(() => {
    if (activeWorkout) {
      setIsCountdownPaused(false);
    }
  }, [activeWorkout]);
  
  const restartCurrentStep = useCallback(() => {
    setActiveWorkout(prev => {
        if (!prev) return null;
        return { ...prev, stepRestartKey: (prev.stepRestartKey || 0) + 1 };
    });
    setIsCountdownPaused(false);
  }, []);

  const currentStep = activeWorkout ? activeWorkout.plan.steps[activeWorkout.currentStepIndex] : null;
  const nextUpcomingStep = activeWorkout ? activeWorkout.plan.steps[activeWorkout.currentStepIndex + 1] || null : null;

  const value = {
    plans,
    activeWorkout,
    currentStep,
    nextUpcomingStep,
    isWorkoutPaused,
    isCountdownPaused,
    recentlyImportedPlanId,
    savePlan,
    importPlan,
    deletePlan,
    reorderPlans,
    startWorkout,
    stopWorkout,
    nextStep,
    previousStep,
    pauseWorkout,
    resumeWorkout,
    restartWorkout,
    pauseStepCountdown,
    resumeStepCountdown,
    restartCurrentStep,
  };

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
};

export const useWorkout = (): WorkoutContextType => {
  const context = useContext(WorkoutContext);
  if (context === undefined) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return context;
};