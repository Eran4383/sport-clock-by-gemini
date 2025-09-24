import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutStep, WorkoutLogEntry } from '../types';
import { prefetchExercises } from '../services/geminiService';
import { getBaseExerciseName, generateCircuitSteps, processAndFormatAiSteps, arePlansDeeplyEqual, migratePlanToV2 } from '../utils/workout';
import { useSettings } from './SettingsContext';
import { getLocalPlans, saveLocalPlans, getLocalHistory, saveLocalHistory } from '../services/storageService';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, doc, writeBatch, query, orderBy, setDoc, deleteDoc, onSnapshot, Unsubscribe, getDocs } from 'firebase/firestore';

export interface ActiveWorkout {
  plan: WorkoutPlan; // This can be a "meta-plan" if multiple plans are selected
  currentStepIndex: number;
  sourcePlanIds: string[];
  stepRestartKey?: number;
}

interface ImportNotificationData {
    message: string;
    planName: string;
    type: 'success' | 'warning';
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
  guestPlansToMerge: WorkoutPlan[];
  guestHistoryToMerge: WorkoutLogEntry[];
  handleMergeGuestData: (plansToMerge: WorkoutPlan[]) => void;
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
  forceSync: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

export const WorkoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const { user, authStatus } = useAuth();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const [recentlyImportedPlanId, setRecentlyImportedPlanId] = useState<string | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLogEntry[]>(getLocalHistory);
  const [plansToStart, setPlansToStart] = useState<string[]>([]);
  const [importNotification, setImportNotification] = useState<ImportNotificationData | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  
  const [showGuestMergeModal, setShowGuestMergeModal] = useState(false);
  const [guestPlansToMerge, setGuestPlansToMerge] = useState<WorkoutPlan[]>([]);
  const [guestHistoryToMerge, setGuestHistoryToMerge] = useState<WorkoutLogEntry[]>([]);
  const initialPlansSyncDone = useRef(false);
  const initialHistorySyncDone = useRef(false);
  
  const guestPlansBackup = useRef<WorkoutPlan[] | null>(null);
  const guestHistoryBackup = useRef<WorkoutLogEntry[] | null>(null);

  const isPreparingWorkout = plansToStart.length > 0;

  const clearImportNotification = useCallback(() => setImportNotification(null), []);
  
  // Persist history to local storage whenever it changes for guest users.
  // For logged-in users, this serves as an offline cache.
  useEffect(() => {
    saveLocalHistory(workoutHistory);
  }, [workoutHistory]);


  useEffect(() => {
    let plansUnsubscribe: Unsubscribe | undefined;
    let historyUnsubscribe: Unsubscribe | undefined;
    
    const cleanup = () => {
        if (plansUnsubscribe) plansUnsubscribe();
        if (historyUnsubscribe) historyUnsubscribe();
    };

    if (authStatus === 'authenticated' && user) {
        // When a user signs in, back up the current local (guest) data into memory.
        if (guestPlansBackup.current === null) {
            guestPlansBackup.current = getLocalPlans().map(migratePlanToV2);
        }
        if (guestHistoryBackup.current === null) {
            guestHistoryBackup.current = getLocalHistory();
        }

        setIsSyncing(true);
        initialPlansSyncDone.current = false;
        initialHistorySyncDone.current = false;

        // --- PLANS LISTENER & MERGE LOGIC ---
        const plansCollection = collection(db, 'users', user.uid, 'plans');
        plansUnsubscribe = onSnapshot(query(plansCollection, orderBy('order', 'asc')), (snapshot) => {
            const remotePlans = snapshot.docs.map(doc => migratePlanToV2(doc.data()));

            if (!initialPlansSyncDone.current) {
                const localPlans = guestPlansBackup.current || [];
                const remotePlanIds = new Set(remotePlans.map(p => p.id));
                const newGuestPlans = localPlans.filter(p => !remotePlanIds.has(p.id));

                if (newGuestPlans.length > 0) {
                    setGuestPlansToMerge(newGuestPlans);
                    setShowGuestMergeModal(true);
                }
                initialPlansSyncDone.current = true;
            }
            
            setPlans(remotePlans);
            saveLocalPlans(remotePlans);
            setIsSyncing(false);
        }, (error) => {
            console.error("Firestore plans listener error:", error);
            setIsSyncing(false);
        });
        
        // --- HISTORY LISTENER & MERGE LOGIC ---
        const historyCollection = collection(db, 'users', user.uid, 'history');
        historyUnsubscribe = onSnapshot(query(historyCollection, orderBy('date', 'desc')), (snapshot) => {
            const remoteHistory = snapshot.docs.map(doc => doc.data() as WorkoutLogEntry);

            if (!initialHistorySyncDone.current) {
                const localHistory = guestHistoryBackup.current || [];
                const remoteHistoryIds = new Set(remoteHistory.map(h => h.id));
                const newGuestHistory = localHistory.filter(h => !remoteHistoryIds.has(h.id));

                if (newGuestHistory.length > 0) {
                    setGuestHistoryToMerge(newGuestHistory);
                    setShowGuestMergeModal(true);
                }
                initialHistorySyncDone.current = true;
            }

            setWorkoutHistory(remoteHistory);
        }, (error) => {
            console.error("Firestore history listener error:", error);
        });

    } else if (authStatus === 'unauthenticated') {
        cleanup();

        if (guestPlansBackup.current !== null) {
            setPlans(guestPlansBackup.current);
            guestPlansBackup.current = null;
        } else {
            setPlans(getLocalPlans().map(migratePlanToV2));
        }

        if (guestHistoryBackup.current !== null) {
            setWorkoutHistory(guestHistoryBackup.current);
            guestHistoryBackup.current = null;
        } else {
            setWorkoutHistory(getLocalHistory());
        }
        setIsSyncing(false);
    }
    
    return cleanup;
  }, [user, authStatus]);

  const forceSync = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
        const plansCollection = collection(db, 'users', user.uid, 'plans');
        const remoteSnapshot = await getDocs(query(plansCollection, orderBy('order', 'asc')));
        const remotePlans = remoteSnapshot.docs.map(doc => migratePlanToV2(doc.data()));
        setPlans(remotePlans);
        saveLocalPlans(remotePlans);
    } catch (error) {
        console.error("Manual sync failed:", error);
    } finally {
        setIsSyncing(false);
    }
  }, [user]);

  const handleMergeGuestData = useCallback(async (plansToMerge: WorkoutPlan[]) => {
    if (!user) {
        setShowGuestMergeModal(false);
        setGuestPlansToMerge([]);
        setGuestHistoryToMerge([]);
        return;
    };

    if (plansToMerge.length === 0 && guestHistoryToMerge.length === 0) {
        setShowGuestMergeModal(false);
        setGuestPlansToMerge([]);
        setGuestHistoryToMerge([]);
        return;
    }

    setIsSyncing(true);
    setShowGuestMergeModal(false);

    try {
        const batch = writeBatch(db);
        
        // Handle plans
        if (plansToMerge.length > 0) {
            const maxOrder = plans.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
            const plansToUpload = plansToMerge.map((p, i) => ({ ...p, order: maxOrder + 1 + i }));
            
            plansToUpload.forEach((plan) => {
                const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
                batch.set(planRef, plan);
            });
        }
        
        // Handle history
        if (guestHistoryToMerge.length > 0) {
            guestHistoryToMerge.forEach(entry => {
                const historyRef = doc(db, 'users', user.uid, 'history', entry.id);
                batch.set(historyRef, entry);
            });
        }

        await batch.commit();
    } catch (error) {
        console.error("Failed to merge guest data:", error);
    } finally {
        setGuestPlansToMerge([]);
        setGuestHistoryToMerge([]);
    }
  }, [user, plans, guestHistoryToMerge]);

  const handleDiscardGuestData = useCallback(() => {
    setShowGuestMergeModal(false);
    setGuestPlansToMerge([]);
    setGuestHistoryToMerge([]);
  }, []);

  const savePlan = useCallback(async (planToSave: WorkoutPlan) => {
    const migratedPlan = migratePlanToV2(planToSave);
    const isNewPlan = !plans.some(p => p.id === migratedPlan.id);
    
    setPlans(prevPlans => {
        const plansWithOrder = prevPlans.map((p, i) => ({ ...p, order: i }));
        if (isNewPlan) {
            const maxOrder = plansWithOrder.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
            migratedPlan.order = maxOrder + 1;
            return [...plansWithOrder, migratedPlan];
        }
        return plansWithOrder.map(p => p.id === migratedPlan.id ? migratedPlan : p);
    });

    if (user) {
        try {
            const planRef = doc(db, 'users', user.uid, 'plans', migratedPlan.id);
            await setDoc(planRef, migratedPlan, { merge: true });
        } catch (error) {
            console.error("Failed to save plan to Firestore:", error);
        }
    } else {
        const currentPlans = getLocalPlans().map(migratePlanToV2);
        let updatedPlans;
        if (isNewPlan) {
            const maxOrder = currentPlans.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
            migratedPlan.order = maxOrder + 1;
            updatedPlans = [...currentPlans, migratedPlan];
        } else {
            updatedPlans = currentPlans.map(p => (p.id === migratedPlan.id ? migratedPlan : p));
        }
        saveLocalPlans(updatedPlans);
    }
  }, [user, plans]);
  
  const importPlan = useCallback((planToImport: WorkoutPlan, source: string = 'file') => {
    const migratedPlan = migratePlanToV2(planToImport);
    const isDuplicate = plans.some(existingPlan => arePlansDeeplyEqual(migratedPlan, existingPlan));

    if (isDuplicate) {
        setImportNotification({
            message: 'האימון כבר קיים',
            planName: `"${migratedPlan.name}" לא יובא שוב.`,
            type: 'warning',
        });
        return;
    }

    const newPlanId = `${Date.now()}_imported_from_${source}`;
    const newPlan: WorkoutPlan = {
      ...migratedPlan,
      id: newPlanId,
      name: migratedPlan.name,
      steps: migratedPlan.steps.map((step, index) => ({
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
        type: 'success',
    });

    const exerciseNames = newPlan.steps
        .filter(s => s.type === 'exercise')
        .map(s => s.name); // Already base name
    prefetchExercises(exerciseNames);

    setRecentlyImportedPlanId(newPlanId);
    setTimeout(() => setRecentlyImportedPlanId(null), 2500);
  }, [savePlan, plans]);

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

    if (user) {
        const historyRef = doc(db, 'users', user.uid, 'history', newEntry.id);
        setDoc(historyRef, newEntry).catch(e => console.error("Failed to save workout log to Firestore:", e));
        // The onSnapshot listener will handle updating the state.
    } else {
        setWorkoutHistory(prev => [newEntry, ...prev]);
    }
  }, [user]);
  
  const clearWorkoutHistory = useCallback(() => {
    if (window.confirm("Are you sure you want to delete your entire workout history? This action cannot be undone.")) {
        const performClear = async () => {
            if (user) {
                setIsSyncing(true);
                try {
                    const historyCollection = collection(db, 'users', user.uid, 'history');
                    const snapshot = await getDocs(historyCollection);
                    if (snapshot.empty) return;
                    
                    const batch = writeBatch(db);
                    snapshot.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                } catch (error) {
                    console.error("Failed to clear Firestore history:", error);
                } finally {
                    setIsSyncing(false);
                }
            } else {
                setWorkoutHistory([]);
            }
        };
        performClear();
    }
  }, [user]);

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
      version: 2,
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
    guestPlansToMerge,
    guestHistoryToMerge,
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
    forceSync,
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