import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutStep, WorkoutLogEntry } from '../types';
import { prefetchExercises } from '../services/geminiService';
import { getBaseExerciseName, generateCircuitSteps, processAndFormatAiSteps } from '../utils/workout';
import { useSettings } from './SettingsContext';
import { getLocalPlans, saveLocalPlans, getLocalHistory, saveLocalHistory } from '../services/storageService';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, doc, getDocs, writeBatch, query, orderBy, setDoc, deleteDoc } from 'firebase/firestore';

export interface ActiveWorkout {
  plan: WorkoutPlan; // This can be a "meta-plan" if multiple plans are selected
  currentStepIndex: number;
  sourcePlanIds: string[];
  stepRestartKey?: number;
}

interface ImportNotificationData {
    message: string;
    planName: string;
}

interface WorkoutContextType {
  plans: WorkoutPlan[];
  activeWorkout: ActiveWorkout | null;
  currentStep: WorkoutStep | null;
  nextUpcomingStep: WorkoutStep | null;
  isWorkoutPaused: boolean;
  isCountdownPaused: boolean;
  recentlyImportedPlanId: string | null;
  workoutHistory: WorkoutLogEntry[];
  isPreparingWorkout: boolean;
  isSyncing: boolean;
  importNotification: ImportNotificationData | null;
  clearImportNotification: () => void;
  savePlan: (plan: WorkoutPlan) => void;
  importPlan: (plan: WorkoutPlan, source?: string) => void;
  deletePlan: (planId: string) => void;
  reorderPlans: (reorderedPlans: WorkoutPlan[]) => void;
  startWorkout: (planIds: string[]) => void;
  commitStartWorkout: () => void;
  clearPreparingWorkout: () => void;
  stopWorkout: (options: { completed: boolean; durationMs?: number; planName?: string; steps?: WorkoutStep[], planIds?: string[] }) => void;
  nextStep: () => void;
  previousStep: () => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  restartWorkout: () => void;
  pauseStepCountdown: () => void;
  resumeStepCountdown: () => void;
  restartCurrentStep: () => void;
  clearWorkoutHistory: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

const getInitialPlans = (): WorkoutPlan[] => {
  return getLocalPlans();
};

const getInitialHistory = (): WorkoutLogEntry[] => {
  return getLocalHistory();
};

export const WorkoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings(); // Get settings for warm-up logic
  const { user, authStatus } = useAuth();
  const [plans, setPlans] = useState<WorkoutPlan[]>(getInitialPlans);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const [recentlyImportedPlanId, setRecentlyImportedPlanId] = useState<string | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLogEntry[]>(getInitialHistory);
  const [plansToStart, setPlansToStart] = useState<string[]>([]);
  const [importNotification, setImportNotification] = useState<ImportNotificationData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialSyncDone = useRef(false);
  const isPreparingWorkout = plansToStart.length > 0;

  const clearImportNotification = useCallback(() => setImportNotification(null), []);

  useEffect(() => {
    // Only save to local storage if user is not logged in.
    // When logged in, Firestore is the source of truth, and local is just a cache.
    if (!user) {
        saveLocalPlans(plans);
    }
  }, [plans, user]);

  useEffect(() => {
    saveLocalHistory(workoutHistory);
  }, [workoutHistory]);

  // This effect handles data synchronization with Firestore on user login/logout.
  useEffect(() => {
    if (authStatus === 'authenticated' && user && !initialSyncDone.current) {
      const syncData = async () => {
        setIsSyncing(true);
        initialSyncDone.current = true; // Mark that sync has started

        try {
          const firestorePlansCollection = collection(db, 'users', user.uid, 'plans');
          const q = query(firestorePlansCollection, orderBy('order', 'asc'));
          
          const firestoreSnapshot = await getDocs(q);
          const remotePlans: WorkoutPlan[] = firestoreSnapshot.docs.map(doc => doc.data() as WorkoutPlan);

          if (remotePlans.length > 0) {
            // User has data in the cloud. Cloud is the source of truth.
            console.log("Cloud data found. Overwriting local data.");
            const sortedRemotePlans = remotePlans.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            setPlans(sortedRemotePlans);
            saveLocalPlans(sortedRemotePlans); // Replace local storage with cloud data
          } else {
            // No data in the cloud. This is a first-time sync for this user.
            // Check if there are local "guest" plans to upload.
            const localPlans = getLocalPlans();
            if (localPlans.length > 0) {
              console.log("No cloud data found. Uploading local data.");
              // The user has local data, let's upload it for them.
              const plansToUpload = localPlans.map((p, i) => ({ ...p, order: i }));
              
              const batch = writeBatch(db);
              plansToUpload.forEach((plan) => {
                const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
                batch.set(planRef, plan);
              });
              await batch.commit();

              // Set the app state to these newly uploaded plans.
              setPlans(plansToUpload);
              // saveLocalPlans is already implicitly correct here, but let's be explicit.
              saveLocalPlans(plansToUpload); 
            } else {
              // No cloud data and no local data. User is fresh.
              console.log("No cloud or local data found for new user.");
              setPlans([]);
              saveLocalPlans([]);
            }
          }
        } catch (error) {
            console.error("Firebase sync failed:", error);
            // Fallback: if sync fails, just load local plans to not break the app
            setPlans(getLocalPlans());
        } finally {
            setIsSyncing(false);
        }
      };
      
      syncData();

    } else if (authStatus === 'unauthenticated') {
      initialSyncDone.current = false; // Reset for next login
      setPlans(getLocalPlans()); // On sign out, revert to local storage
    }
  }, [user, authStatus]);


  // Prefetch exercise info on initial load
  useEffect(() => {
    if (plans && plans.length > 0) {
        const allExerciseNames = plans.flatMap(plan => plan.steps)
                                      .filter(step => step.type === 'exercise')
                                      .map(step => getBaseExerciseName(step.name));
        prefetchExercises(allExerciseNames);
    }
  }, [plans]);


  const savePlan = useCallback(async (planToSave: WorkoutPlan) => {
    let finalPlans: WorkoutPlan[] = [];
    setPlans(prevPlans => {
        const existingIndex = prevPlans.findIndex(p => p.id === planToSave.id);
        let newPlans: WorkoutPlan[];
        if (existingIndex > -1) {
            newPlans = [...prevPlans];
            newPlans[existingIndex] = planToSave;
        } else {
            // Ensure new plans get the next order number
            const maxOrder = prevPlans.reduce((max, p) => Math.max(max, p.order ?? 0), 0);
            planToSave.order = prevPlans.length > 0 ? maxOrder + 1 : 0;
            newPlans = [...prevPlans, planToSave];
        }
        finalPlans = newPlans;
        return finalPlans;
    });
    
    saveLocalPlans(finalPlans); // Optimistically update local storage

    if (user) {
      setIsSyncing(true);
      try {
        const planToSync = finalPlans.find(p => p.id === planToSave.id);
        if (planToSync) {
            const planRef = doc(db, 'users', user.uid, 'plans', planToSave.id);
            await setDoc(planRef, planToSync);
        }
      } catch (error) {
        console.error("Failed to save plan to Firestore:", error);
        // Here you might want to add logic to revert the optimistic update or notify the user
      } finally {
        setIsSyncing(false);
      }
    }

    const exerciseNames = planToSave.steps
        .filter(s => s.type === 'exercise')
        .map(s => getBaseExerciseName(s.name));
    prefetchExercises(exerciseNames);
  }, [user]);
  
  const importPlan = useCallback((planToImport: WorkoutPlan, source: string = 'file') => {
    // Sanitize and prepare the imported plan to prevent conflicts
    const newPlanId = `${Date.now()}_imported_from_${source}`;
    const newPlan: WorkoutPlan = {
      ...planToImport,
      id: newPlanId,
      name: planToImport.name, // Keep original name
      steps: planToImport.steps.map((step, index) => ({
        ...step,
        id: `${Date.now()}_imported_step_${index}`
      }))
    };
    
    // If the plan is from the AI, process its steps to add set formatting.
    if (source === 'ai') {
        newPlan.steps = processAndFormatAiSteps(newPlan.steps);
    }
    
    savePlan(newPlan); // Use savePlan to handle state and Firestore update

    setImportNotification({
        message: 'תוכנית אימונים יובאה בהצלחה!',
        planName: newPlan.name,
    });

    // Prefetch data for the imported plan
    const exerciseNames = newPlan.steps
        .filter(s => s.type === 'exercise')
        .map(s => getBaseExerciseName(s.name));
    prefetchExercises(exerciseNames);

    // Set the ID for highlighting and clear it after the animation
    setRecentlyImportedPlanId(newPlanId);
    setTimeout(() => setRecentlyImportedPlanId(null), 2500);
  }, [savePlan]);

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


  const deletePlan = useCallback(async (planId: string) => {
    const newPlans = plans.filter(p => p.id !== planId);
    setPlans(newPlans);
    saveLocalPlans(newPlans);

    if (user) {
      setIsSyncing(true);
      try {
        const planRef = doc(db, 'users', user.uid, 'plans', planId);
        await deleteDoc(planRef);
      } catch (error) {
        console.error("Failed to delete plan from Firestore:", error);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [user, plans]);

  const reorderPlans = useCallback(async (reorderedPlans: WorkoutPlan[]) => {
      const plansWithOrder = reorderedPlans.map((p, i) => ({ ...p, order: i }));
      setPlans(plansWithOrder);
      saveLocalPlans(plansWithOrder);

      if (user) {
        setIsSyncing(true);
        try {
            const batch = writeBatch(db);
            plansWithOrder.forEach((plan) => {
                const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
                batch.set(planRef, plan);
            });
            await batch.commit();
        } catch (error) {
            console.error("Failed to reorder plans in Firestore:", error);
        } finally {
            setIsSyncing(false);
        }
      }
  }, [user]);
  
  const logWorkoutCompletion = useCallback((planName: string, durationMs: number, steps: WorkoutStep[], planIds: string[]) => {
    const now = new Date();
    const newEntry: WorkoutLogEntry = {
        id: now.toISOString(),
        date: now.toISOString(),
        planName: planName,
        durationSeconds: Math.round(durationMs / 1000),
        steps: steps,
        planIds: planIds,
    };
    setWorkoutHistory(prev => [newEntry, ...prev]);
  }, []);
  
  const clearWorkoutHistory = useCallback(() => {
    if (window.confirm("Are you sure you want to delete your entire workout history? This action cannot be undone.")) {
        setWorkoutHistory([]);
    }
  }, []);

  const startWorkout = useCallback((planIds: string[]) => {
    if (planIds.length === 0) return;
    setPlansToStart(planIds);
  }, []);
  
  const clearPreparingWorkout = useCallback(() => {
    setPlansToStart([]);
  }, []);
  
  const commitStartWorkout = useCallback(() => {
    if (plansToStart.length === 0) return;
    
    const plansToRun = plansToStart.map(id => plans.find(p => p.id === id)).filter(Boolean) as WorkoutPlan[];
    if (plansToRun.length === 0) {
        setPlansToStart([]);
        return;
    }

    const executionMode = plansToRun.length === 1 ? (plansToRun[0].executionMode || 'linear') : 'linear';
    let mainWorkoutSteps = plansToRun.flatMap(p => p.steps);
    
    if (executionMode === 'circuit') {
      mainWorkoutSteps = generateCircuitSteps(mainWorkoutSteps);
    }
    
    let allSteps: WorkoutStep[] = [];
    
    // Warm-up logic
    if (settings.isWarmupEnabled && settings.warmupSteps.length > 0) {
        const enabledWarmupSteps = settings.warmupSteps.filter(step => step.enabled !== false);
        // Mark warm-up steps
        const markedWarmupSteps = enabledWarmupSteps.map(step => ({ ...step, isWarmup: true }));
        allSteps.push(...markedWarmupSteps);

        // Add rest after warm-up
        if (settings.restAfterWarmupDuration > 0 && markedWarmupSteps.length > 0) {
            const restStep: WorkoutStep = {
                id: `rest_after_warmup_${Date.now()}`,
                name: 'מנוחה לפני אימון',
                type: 'rest',
                isRepBased: false,
                duration: settings.restAfterWarmupDuration,
                reps: 0,
                isWarmup: true, // Consider this part of the warm-up phase
            };
            allSteps.push(restStep);
        }
    }
    
    allSteps.push(...mainWorkoutSteps);

    if (allSteps.length === 0) {
        setPlansToStart([]);
        return;
    };

    const metaPlan: WorkoutPlan = {
      id: `meta_${Date.now()}`,
      name: plansToRun.map(p => p.name).join(' & '),
      steps: allSteps,
      executionMode: executionMode,
    };
    
    setActiveWorkout({ plan: metaPlan, currentStepIndex: 0, sourcePlanIds: plansToStart, stepRestartKey: 0 });
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
    setPlansToStart([]);
  }, [plans, plansToStart, settings]);

  const stopWorkout = useCallback(({ completed, durationMs, planName, steps, planIds }: { completed: boolean; durationMs?: number; planName?: string; steps?: WorkoutStep[], planIds?: string[] }) => {
    if (completed && durationMs !== undefined && durationMs > -1 && planName && steps && planIds) {
        logWorkoutCompletion(planName, durationMs, steps, planIds);
    }
    setActiveWorkout(null);
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, [logWorkoutCompletion]);

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
        // Workout finished. Simply return null. App.tsx will detect this state change
        // and call stopWorkout with the correct duration.
        return null;
      }
      return { ...prev, currentStepIndex: nextIndex };
    });
    setIsCountdownPaused(false);
  }, []);
  
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

  const nextUpcomingStep = useMemo(() => {
    if (!activeWorkout) return null;
    const { plan, currentStepIndex } = activeWorkout;
    for (let i = currentStepIndex + 1; i < plan.steps.length; i++) {
        if (plan.steps[i].type === 'exercise') {
            return plan.steps[i];
        }
    }
    return null;
  }, [activeWorkout]);


  const value = {
    plans,
    activeWorkout,
    currentStep,
    nextUpcomingStep,
    isWorkoutPaused,
    isCountdownPaused,
    recentlyImportedPlanId,
    workoutHistory,
    isPreparingWorkout,
    isSyncing,
    importNotification,
    clearImportNotification,
    savePlan,
    importPlan,
    deletePlan,
    reorderPlans,
    startWorkout,
    commitStartWorkout,
    clearPreparingWorkout,
    stopWorkout,
    nextStep,
    previousStep,
    pauseWorkout,
    resumeWorkout,
    restartWorkout,
    pauseStepCountdown,
    resumeStepCountdown,
    restartCurrentStep,
    clearWorkoutHistory,
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
