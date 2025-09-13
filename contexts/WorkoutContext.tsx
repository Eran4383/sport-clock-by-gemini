import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutStep, WorkoutLogEntry } from '../types';
import { prefetchExercises } from '../services/geminiService';
import { getBaseExerciseName, generateCircuitSteps, processAndFormatAiSteps } from '../utils/workout';
import { useSettings } from './SettingsContext';
import { getLocalPlans, saveLocalPlans, getLocalHistory, saveLocalHistory } from '../services/storageService';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, doc, writeBatch, query, orderBy, setDoc, deleteDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';

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
  showGuestMergeModal: boolean;
  handleMergeGuestData: () => void;
  handleDiscardGuestData: () => void;
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

export const WorkoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const { user, authStatus } = useAuth();
  const [plans, setPlans] = useState<WorkoutPlan[]>(getLocalPlans);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const [recentlyImportedPlanId, setRecentlyImportedPlanId] = useState<string | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLogEntry[]>(getLocalHistory);
  const [plansToStart, setPlansToStart] = useState<string[]>([]);
  const [importNotification, setImportNotification] = useState<ImportNotificationData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const firestoreListener = useRef<Unsubscribe | null>(null);
  
  // This ref is crucial to distinguish the FIRST data snapshot from subsequent real-time updates.
  const isInitialSnapshotProcessed = useRef(false);

  // State for handling guest data on first login
  const [showGuestMergeModal, setShowGuestMergeModal] = useState(false);
  const guestPlansToMerge = useRef<WorkoutPlan[]>([]);
  
  const isPreparingWorkout = plansToStart.length > 0;

  const clearImportNotification = useCallback(() => setImportNotification(null), []);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
        saveLocalPlans(plans);
    }
  }, [plans, authStatus]);

  useEffect(() => {
    saveLocalHistory(workoutHistory);
  }, [workoutHistory]);

  const handleMergeGuestData = useCallback(async () => {
    if (!user || guestPlansToMerge.current.length === 0) return;

    setIsSyncing(true);
    setShowGuestMergeModal(false);

    try {
        const plansToUpload = guestPlansToMerge.current.map((p, i) => ({ ...p, order: i }));
        const batch = writeBatch(db);
        plansToUpload.forEach((plan) => {
            const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
            batch.set(planRef, plan);
        });
        await batch.commit();
        // The onSnapshot listener will automatically pick up this change and update the UI.
    } catch (error) {
        console.error("Failed to merge guest data:", error);
        setIsSyncing(false);
    } finally {
        guestPlansToMerge.current = [];
    }
  }, [user]);

  const handleDiscardGuestData = useCallback(() => {
    guestPlansToMerge.current = [];
    setShowGuestMergeModal(false);
    saveLocalPlans([]); // Clear out the old guest data
    setPlans([]); // Optimistically clear the UI. The listener will confirm with an empty state.
  }, []);

  // This is the core logic for data synchronization.
  useEffect(() => {
    // If there's an active listener, tear it down first.
    if (firestoreListener.current) {
        firestoreListener.current();
        firestoreListener.current = null;
    }
    // Crucially, reset the processing flag whenever the user's auth state changes.
    isInitialSnapshotProcessed.current = false;

    // Case 1: User is not logged in.
    if (authStatus !== 'authenticated' || !user) {
        // If they are explicitly logged out, load their local (guest) plans.
        if (authStatus === 'unauthenticated') {
            setPlans(getLocalPlans());
        }
        setIsSyncing(false);
        return; // Stop here if there's no authenticated user.
    }
    
    // Case 2: User is authenticated. Set up the real-time listener.
    setIsSyncing(true);
    const plansCollection = collection(db, 'users', user.uid, 'plans');
    const q = query(plansCollection, orderBy('order', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const remotePlans = snapshot.docs.map(doc => doc.data() as WorkoutPlan);

        // This block runs only ONCE per login, on the very first data receive.
        if (!isInitialSnapshotProcessed.current) {
            isInitialSnapshotProcessed.current = true;
            
            if (remotePlans.length === 0) {
                // Scenario: Firestore is empty for this user (they are new).
                const localPlans = getLocalPlans();
                if (localPlans.length > 0) {
                    // They have "guest" plans on this device. Ask them what to do.
                    guestPlansToMerge.current = localPlans;
                    setShowGuestMergeModal(true);
                } else {
                    // New user with no guest data. Their state is empty.
                    setPlans([]);
                }
            } else {
                // Scenario: Existing user with data in the cloud. Cloud is the source of truth.
                setPlans(remotePlans);
                saveLocalPlans(remotePlans); // Overwrite local storage to match the cloud.
            }
            // The initial sync is now complete.
            setIsSyncing(false);
        } else {
            // This block runs for all subsequent updates (e.g., from another device).
            // The cloud is always the source of truth. Update the state.
            setPlans(remotePlans);
            saveLocalPlans(remotePlans);
        }

    }, (error) => {
        console.error("Firestore listener error:", error);
        setIsSyncing(false);
    });

    // Store the unsubscribe function to be called on cleanup.
    firestoreListener.current = unsubscribe;

    // Cleanup function: runs when the component unmounts or user/authStatus changes.
    return () => {
        if (firestoreListener.current) {
            firestoreListener.current();
            firestoreListener.current = null;
        }
        isInitialSnapshotProcessed.current = false;
    };
  }, [user, authStatus]);


  const savePlan = useCallback(async (planToSave: WorkoutPlan) => {
    const isNewPlan = !plans.some(p => p.id === planToSave.id);
    
    // Add order property if it's a new plan
    if (isNewPlan) {
        const maxOrder = plans.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
        planToSave.order = maxOrder + 1;
    }

    // Optimistic UI update
    setPlans(prevPlans => {
        if (isNewPlan) {
            return [...prevPlans, planToSave];
        }
        return prevPlans.map(p => p.id === planToSave.id ? planToSave : p);
    });

    if (user) {
        try {
            const planRef = doc(db, 'users', user.uid, 'plans', planToSave.id);
            await setDoc(planRef, planToSave, { merge: true });
        } catch (error) {
            console.error("Failed to save plan to Firestore:", error);
            // The onSnapshot listener will eventually correct the state if the write fails.
        }
    } else {
        // For guest users, update local storage directly
        const currentPlans = getLocalPlans();
        let updatedPlans;
        if (isNewPlan) {
            updatedPlans = [...currentPlans, planToSave];
        } else {
            updatedPlans = currentPlans.map(p => (p.id === planToSave.id ? planToSave : p));
        }
        saveLocalPlans(updatedPlans);
    }
  }, [user, plans]);
  
  const importPlan = useCallback((planToImport: WorkoutPlan, source: string = 'file') => {
    const newPlanId = `${Date.now()}_imported_from_${source}`;
    const newPlan: WorkoutPlan = {
      ...planToImport,
      id: newPlanId,
      name: planToImport.name,
      steps: planToImport.steps.map((step, index) => ({
        ...step,
        id: `${Date.now()}_imported_step_${index}`
      }))
    };
    
    if (source === 'ai') {
        newPlan.steps = processAndFormatAiSteps(newPlan.steps);
    }
    
    savePlan(newPlan);

    setImportNotification({
        message: 'תוכנית אימונים יובאה בהצלחה!',
        planName: newPlan.name,
    });

    const exerciseNames = newPlan.steps
        .filter(s => s.type === 'exercise')
        .map(s => getBaseExerciseName(s.name));
    prefetchExercises(exerciseNames);

    setRecentlyImportedPlanId(newPlanId);
    setTimeout(() => setRecentlyImportedPlanId(null), 2500);
  }, [savePlan]);

  useEffect(() => {
    const handleImportFromUrl = () => {
        const hash = window.location.hash;
        if (hash.startsWith('#import=')) {
            try {
                const base64Data = hash.substring(8);
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const decoder = new TextDecoder('utf-8');
                const jsonString = decoder.decode(bytes);
                const plan = JSON.parse(jsonString);
                
                if (plan && typeof plan.name === 'string' && Array.isArray(plan.steps)) {
                    importPlan(plan, 'url');
                } else {
                    throw new Error("Invalid plan structure in URL.");
                }
            } catch (e) {
                console.error("Failed to import from URL", e);
                alert("Could not import workout plan from the link. The link may be invalid or corrupted.");
            } finally {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    };
    handleImportFromUrl();
  }, [importPlan]);


  const deletePlan = useCallback(async (planId: string) => {
    setPlans(prev => prev.filter(p => p.id !== planId));
    if (user) {
      try {
        const planRef = doc(db, 'users', user.uid, 'plans', planId);
        await deleteDoc(planRef);
      } catch (error) {
        console.error("Failed to delete plan from Firestore:", error);
      }
    } else {
        saveLocalPlans(plans.filter(p => p.id !== planId));
    }
  }, [user, plans]);

  const reorderPlans = useCallback(async (reorderedPlans: WorkoutPlan[]) => {
      const plansWithOrder = reorderedPlans.map((p, i) => ({ ...p, order: i }));
      setPlans(plansWithOrder);

      if (user) {
        try {
            const batch = writeBatch(db);
            plansWithOrder.forEach((plan) => {
                const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
                batch.set(planRef, plan, { merge: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("Failed to reorder plans in Firestore:", error);
        }
      } else {
          saveLocalPlans(plansWithOrder);
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
    
    if (settings.isWarmupEnabled && settings.warmupSteps.length > 0) {
        const enabledWarmupSteps = settings.warmupSteps.filter(step => step.enabled !== false);
        const markedWarmupSteps = enabledWarmupSteps.map(step => ({ ...step, isWarmup: true }));
        allSteps.push(...markedWarmupSteps);

        if (settings.restAfterWarmupDuration > 0 && markedWarmupSteps.length > 0) {
            allSteps.push({
                id: `rest_after_warmup_${Date.now()}`,
                name: 'מנוחה לפני אימון',
                type: 'rest',
                isRepBased: false,
                duration: settings.restAfterWarmupDuration,
                reps: 0,
                isWarmup: true,
            });
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

  const pauseWorkout = useCallback(() => setIsWorkoutPaused(true), []);
  const resumeWorkout = useCallback(() => setIsWorkoutPaused(false), []);
  
  const restartWorkout = useCallback(() => {
    setActiveWorkout(prev => prev ? { ...prev, currentStepIndex: 0, stepRestartKey: (prev.stepRestartKey || 0) + 1 } : null);
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, []);

  const nextStep = useCallback(() => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      if (prev.currentStepIndex + 1 >= prev.plan.steps.length) return null;
      return { ...prev, currentStepIndex: prev.currentStepIndex + 1 };
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

  const pauseStepCountdown = useCallback(() => setIsCountdownPaused(true), []);
  const resumeStepCountdown = useCallback(() => setIsCountdownPaused(false), []);
  
  const restartCurrentStep = useCallback(() => {
    setActiveWorkout(prev => prev ? { ...prev, stepRestartKey: (prev.stepRestartKey || 0) + 1 } : null);
    setIsCountdownPaused(false);
  }, []);

  const currentStep = activeWorkout ? activeWorkout.plan.steps[activeWorkout.currentStepIndex] : null;

  const nextUpcomingStep = useMemo(() => {
    if (!activeWorkout) return null;
    const { plan, currentStepIndex } = activeWorkout;
    for (let i = currentStepIndex + 1; i < plan.steps.length; i++) {
        if (plan.steps[i].type === 'exercise') return plan.steps[i];
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
    showGuestMergeModal,
    handleMergeGuestData,
    handleDiscardGuestData,
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
