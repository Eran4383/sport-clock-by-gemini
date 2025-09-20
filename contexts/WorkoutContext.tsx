import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutStep, WorkoutLogEntry } from '../types';
import { prefetchExercises } from '../services/geminiService';
import { getBaseExerciseName, generateCircuitSteps, processAndFormatAiSteps, arePlansDeeplyEqual, migratePlanToV2 } from '../utils/workout';
import { useSettings } from './SettingsContext';
import { getLocalPlans, saveLocalPlans, getLocalHistory, saveLocalHistory, clearAiChatHistory } from '../services/storageService';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, writeBatch, doc, setDoc, deleteDoc } from 'firebase/firestore';

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
  showGuestHistoryMergeModal: boolean;
  guestHistoryToMerge: WorkoutLogEntry[];
  handleMergeGuestData: (plansToMerge: WorkoutPlan[]) => void;
  handleDiscardGuestData: () => void;
  handleMergeGuestHistory: (historyToMerge: WorkoutLogEntry[]) => void;
  handleDiscardGuestHistory: () => void;
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
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLogEntry[]>([]);
  const [plansToStart, setPlansToStart] = useState<string[]>([]);
  const [importNotification, setImportNotification] = useState<ImportNotificationData | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  
  const [showGuestMergeModal, setShowGuestMergeModal] = useState(false);
  const [guestPlansToMerge, setGuestPlansToMerge] = useState<WorkoutPlan[]>([]);
  const [showGuestHistoryMergeModal, setShowGuestHistoryMergeModal] = useState(false);
  const [guestHistoryToMerge, setGuestHistoryToMerge] = useState<WorkoutLogEntry[]>([]);

  const initialSyncDone = useRef(false);
  const guestPlansBackup = useRef<WorkoutPlan[] | null>(null);
  const guestHistoryBackup = useRef<WorkoutLogEntry[] | null>(null);

  const isPreparingWorkout = plansToStart.length > 0;

  const clearImportNotification = useCallback(() => setImportNotification(null), []);

  useEffect(() => {
    // This effect is now only for guests.
    // For logged-in users, persistence is handled by the Firestore listener.
    if (!user) {
        saveLocalHistory(workoutHistory);
    }
  }, [workoutHistory, user]);


  useEffect(() => {
    let plansUnsubscribe: (() => void) | undefined;
    let historyUnsubscribe: (() => void) | undefined;

    if (authStatus === 'authenticated' && user) {
        // Backup local data only once when the user signs in.
        if (guestPlansBackup.current === null) {
            guestPlansBackup.current = getLocalPlans().map(migratePlanToV2);
        }
        if (guestHistoryBackup.current === null) {
            guestHistoryBackup.current = getLocalHistory();
        }

        setIsSyncing(true);
        initialSyncDone.current = false; // Reset for new login
        
        // --- Plans Listener ---
        const plansCollectionRef = collection(db, 'users', user.uid, 'plans');
        const plansQuery = query(plansCollectionRef, orderBy('order', 'asc'));
        plansUnsubscribe = onSnapshot(plansQuery, (snapshot) => {
            const remotePlans = snapshot.docs.map(doc => migratePlanToV2(doc.data() as WorkoutPlan));
            setPlans(remotePlans);
            saveLocalPlans(remotePlans); // Keep local storage synced for offline access
        }, (error) => console.error("Firestore plans listener error:", error));

        // --- History Listener ---
        const historyCollectionRef = collection(db, 'users', user.uid, 'history');
        const historyQuery = query(historyCollectionRef, orderBy('date', 'desc'));
        historyUnsubscribe = onSnapshot(historyQuery, snapshot => {
            const remoteHistory = snapshot.docs.map(doc => doc.data() as WorkoutLogEntry);
            setWorkoutHistory(remoteHistory);
            saveLocalHistory(remoteHistory); // Keep local storage synced
        }, (error) => console.error("Firestore history listener error:", error));


        // --- Data Merge Logic (run once after initial data load) ---
        const checkDataToMerge = async () => {
             // Wait for both collections to give us their first result
            const [plansSnapshot, historySnapshot] = await Promise.all([
                getDocs(plansQuery),
                getDocs(historyQuery)
            ]);

            if (!initialSyncDone.current) {
                // Merge Plans
                const remotePlans = plansSnapshot.docs.map(doc => migratePlanToV2(doc.data() as WorkoutPlan));
                const localPlans = guestPlansBackup.current || [];
                const remotePlanIds = new Set(remotePlans.map(p => p.id));
                const newGuestPlans = localPlans.filter(p => !remotePlanIds.has(p.id));
                if (newGuestPlans.length > 0) {
                    setGuestPlansToMerge(newGuestPlans);
                    setShowGuestMergeModal(true);
                }
                
                // Merge History
                const remoteHistory = historySnapshot.docs.map(doc => doc.data() as WorkoutLogEntry);
                const localHistory = guestHistoryBackup.current || [];
                const remoteHistoryIds = new Set(remoteHistory.map(h => h.id));
                const newGuestHistory = localHistory.filter(h => !remoteHistoryIds.has(h.id));
                if (newGuestHistory.length > 0) {
                    setGuestHistoryToMerge(newGuestHistory);
                    setShowGuestHistoryMergeModal(true);
                }

                initialSyncDone.current = true;
            }
             setIsSyncing(false);
        };
        checkDataToMerge();

    } else if (authStatus === 'unauthenticated') {
        if (plansUnsubscribe) plansUnsubscribe();
        if (historyUnsubscribe) historyUnsubscribe();

        // A user has just signed out.
        if (guestPlansBackup.current !== null || guestHistoryBackup.current !== null) {
            clearAiChatHistory();

            const restoredGuestPlans = guestPlansBackup.current || [];
            setPlans(restoredGuestPlans);
            saveLocalPlans(restoredGuestPlans);
            
            const restoredGuestHistory = guestHistoryBackup.current || [];
            setWorkoutHistory(restoredGuestHistory);
            saveLocalHistory(restoredGuestHistory);

            guestPlansBackup.current = null;
            guestHistoryBackup.current = null;
        } else {
            // Fresh app start in guest mode.
            setPlans(getLocalPlans().map(migratePlanToV2));
            setWorkoutHistory(getLocalHistory());
        }
        setIsSyncing(false);
    }
    
    return () => {
      if (plansUnsubscribe) plansUnsubscribe();
      if (historyUnsubscribe) historyUnsubscribe();
    };
  }, [user, authStatus]);

  const forceSync = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
        // Plans
        const plansCollectionRef = collection(db, 'users', user.uid, 'plans');
        const remotePlansSnapshot = await getDocs(query(plansCollectionRef, orderBy('order', 'asc')));
        const remotePlans = remotePlansSnapshot.docs.map(doc => migratePlanToV2(doc.data() as WorkoutPlan));
        setPlans(remotePlans);
        saveLocalPlans(remotePlans);
        
        // History
        const historyCollectionRef = collection(db, 'users', user.uid, 'history');
        const remoteHistorySnapshot = await getDocs(query(historyCollectionRef, orderBy('date', 'desc')));
        const remoteHistory = remoteHistorySnapshot.docs.map(doc => doc.data() as WorkoutLogEntry);
        setWorkoutHistory(remoteHistory);
        saveLocalHistory(remoteHistory);

    } catch (error) {
        console.error("Manual sync failed:", error);
    } finally {
        setIsSyncing(false);
    }
  }, [user]);

  const handleMergeGuestData = useCallback(async (plansToMerge: WorkoutPlan[]) => {
    if (!user || plansToMerge.length === 0) {
        setShowGuestMergeModal(false);
        setGuestPlansToMerge([]);
        return;
    };

    setIsSyncing(true);
    setShowGuestMergeModal(false);

    try {
        const maxOrder = plans.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
        const plansToUpload = plansToMerge.map((p, i) => ({ ...p, order: maxOrder + 1 + i }));
        
        const batch = writeBatch(db);
        plansToUpload.forEach((plan) => {
            const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
            batch.set(planRef, plan);
        });
        await batch.commit();
    } catch (error) {
        console.error("Failed to merge guest data:", error);
    } finally {
        setGuestPlansToMerge([]);
    }
  }, [user, plans]);

  const handleDiscardGuestData = useCallback(() => {
    setShowGuestMergeModal(false);
    setGuestPlansToMerge([]);
  }, []);

  const handleMergeGuestHistory = useCallback(async (historyToMerge: WorkoutLogEntry[]) => {
    if (!user || historyToMerge.length === 0) {
        setShowGuestHistoryMergeModal(false);
        setGuestHistoryToMerge([]);
        return;
    }
    setIsSyncing(true);
    setShowGuestHistoryMergeModal(false);
    try {
        const batch = writeBatch(db);
        historyToMerge.forEach(entry => {
            const docRef = doc(db, 'users', user.uid, 'history', entry.id);
            batch.set(docRef, entry);
        });
        await batch.commit();
    } catch (error) {
        console.error("Failed to merge guest history:", error);
    } finally {
        setGuestHistoryToMerge([]);
    }
  }, [user]);

  const handleDiscardGuestHistory = useCallback(() => {
    setShowGuestHistoryMergeModal(false);
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
    setWorkoutHistory(prev => [newEntry, ...prev]);

    if (user) {
        const historyDocRef = doc(db, 'users', user.uid, 'history', newEntry.id);
        setDoc(historyDocRef, newEntry)
          .catch(error => console.error("Failed to save workout log to Firestore:", error));
    }
  }, [user]);
  
  const clearWorkoutHistory = useCallback(async () => {
    if (window.confirm("Are you sure you want to delete your entire workout history? This action cannot be undone.")) {
        setWorkoutHistory([]); // Optimistic update for UI
        if (user) {
            try {
                const historyCollectionRef = collection(db, 'users', user.uid, 'history');
                const snapshot = await getDocs(historyCollectionRef);
                if (snapshot.empty) return;
                
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (error) {
                console.error("Failed to clear remote history:", error);
                // Consider reverting the optimistic update or showing an error
            }
        }
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
    showGuestHistoryMergeModal,
    guestHistoryToMerge,
    handleMergeGuestData,
    handleDiscardGuestData,
    handleMergeGuestHistory,
    handleDiscardGuestHistory,
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
