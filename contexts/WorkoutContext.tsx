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
  isWorkoutPaused: boolean;
  isCountdownPaused: boolean;
  savePlan: (plan: WorkoutPlan) => void;
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

export const WorkoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [plans, setPlans] = useState<WorkoutPlan[]>(getInitialPlans);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);

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

    const allSteps = plansToRun.flatMap(p => p.steps);
    if (allSteps.length === 0) return;

    const metaPlan: WorkoutPlan = {
      id: `meta_${Date.now()}`,
      name: plansToRun.map(p => p.name).join(' & '),
      steps: allSteps,
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

  const value = {
    plans,
    activeWorkout,
    currentStep,
    isWorkoutPaused,
    isCountdownPaused,
    savePlan,
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