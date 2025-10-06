import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutStep, WorkoutLogEntry, StepStatus, PerformedStep } from '../types';
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
  // For detailed logging
  sessionLog: PerformedStep[];
  stepStartTime: number; // performance.now() timestamp
}

interface ImportNotificationData {
    message: string;
    planName: string;
    type: 'success' | 'warning';
}

export interface GuestMergeOptions {
    mergePlans: boolean;
    plansToMerge: WorkoutPlan[];
    mergeHistory: boolean;
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
  handleMergeGuestData: (options: GuestMergeOptions) => void;
  handleDiscardGuestData: () => void;
  clearImportNotification: () => void;
  savePlan: (plan: WorkoutPlan) => void;
  importPlan: (plan: WorkoutPlan, source?: string) => void;
  deletePlan: (planId: string) => void;
  reorderPlans: (reorderedPlans: WorkoutPlan[]) => void;
  startWorkout: (planIds: string[]) => void;
  commitStartWorkout: () => void;
  clearPreparingWorkout: () => void;
  stopWorkout: (options: { completed: boolean; durationMs: number; finishedWorkout: ActiveWorkout }) => void;
  nextStep: (timestamp: number, status: StepStatus) => void;
  previousStep: (timestamp: number) => void;
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
  const [guestHistoryToMerge, setGuestHistoryToMerge] = useState<WorkoutLogEntry[]>([]);
  const initialSyncDone = useRef(false);
  
  // Ref to hold the current auth status to use in callbacks without adding it as a dependency.
  const authStatusRef = useRef(authStatus);
  useEffect(() => {
    authStatusRef.current = authStatus;
  }, [authStatus]);


  const isPreparingWorkout = plansToStart.length > 0;

  const clearImportNotification = useCallback(() => setImportNotification(null), []);

  useEffect(() => {
    let plansUnsubscribe: Unsubscribe | undefined;
    let historyUnsubscribe: Unsubscribe | undefined;
    
    const cleanup = () => {
        if (plansUnsubscribe) plansUnsubscribe();
        if (historyUnsubscribe) historyUnsubscribe();
        initialSyncDone.current = false;
        setShowGuestMergeModal(false);
        setGuestPlansToMerge([]);
        setGuestHistoryToMerge([]);
    };

    if (authStatus === 'authenticated' && user) {
        setIsSyncing(true);
        initialSyncDone.current = false;
        
        let remotePlansCache: WorkoutPlan[] = [];
        let remoteHistoryCache: WorkoutLogEntry[] = [];
        let plansListenerDone = false;
        let historyListenerDone = false;
        
        const checkAndTriggerMergeModal = () => {
            if (!plansListenerDone || !historyListenerDone || initialSyncDone.current) return;
            
            initialSyncDone.current = true;

            const localPlans = getLocalPlans().map(migratePlanToV2).filter((p): p is WorkoutPlan => !!p);
            const remotePlanIds = new Set(remotePlansCache.map(p => p.id));
            const newGuestPlans = localPlans.filter(p => !remotePlanIds.has(p.id));

            const localHistory = getLocalHistory();
            const remoteHistoryIds = new Set(remoteHistoryCache.map(h => h.id));
            const newGuestHistory = localHistory.filter(h => !remoteHistoryIds.has(h.id));

            if (newGuestPlans.length > 0 || newGuestHistory.length > 0) {
                setGuestPlansToMerge(newGuestPlans);
                setGuestHistoryToMerge(newGuestHistory);
                setShowGuestMergeModal(true);
            }
        };

        const plansCollection = collection(db, 'users', user.uid, 'plans');
        plansUnsubscribe = onSnapshot(query(plansCollection, orderBy('order', 'asc')), (snapshot) => {
            remotePlansCache = snapshot.docs.map(doc => migratePlanToV2(doc.data())).filter((p): p is WorkoutPlan => !!p);
            setPlans(remotePlansCache);
            
            if (!plansListenerDone) {
                plansListenerDone = true;
                checkAndTriggerMergeModal();
            }
            setIsSyncing(false);
        }, (error) => {
            console.error("Firestore plans listener error:", error);
            setIsSyncing(false);
        });
        
        const historyCollection = collection(db, 'users', user.uid, 'history');
        historyUnsubscribe = onSnapshot(query(historyCollection, orderBy('date', 'desc')), (snapshot) => {
            remoteHistoryCache = snapshot.docs.map(doc => doc.data() as WorkoutLogEntry);
            setWorkoutHistory(remoteHistoryCache);
            
            if (!historyListenerDone) {
                historyListenerDone = true;
                checkAndTriggerMergeModal();
            }
        }, (error) => {
            console.error("Firestore history listener error:", error);
        });

    } else if (authStatus === 'unauthenticated') {
        cleanup(); // Detaches any previous Firestore listeners.
        
        // This is now the single source of truth for loading guest data.
        setPlans(getLocalPlans().map(migratePlanToV2).filter((p): p is WorkoutPlan => !!p));
        setWorkoutHistory(getLocalHistory());

        // On sign out, clear all active session state regardless.
        setActiveWorkout(null);
        setIsWorkoutPaused(false);
        setIsCountdownPaused(false);
        setPlansToStart([]);
        
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
        const remotePlans = remoteSnapshot.docs.map(doc => migratePlanToV2(doc.data())).filter((p): p is WorkoutPlan => !!p);
        setPlans(remotePlans);
    } catch (error) {
        console.error("Manual sync failed:", error);
    } finally {
        setIsSyncing(false);
    }
  }, [user]);
  
  const handleDiscardGuestData = useCallback(() => {
    setShowGuestMergeModal(false);
    setGuestPlansToMerge([]);
    setGuestHistoryToMerge([]);
  }, []);

  const handleMergeGuestData = useCallback(async (options: GuestMergeOptions) => {
    const { mergePlans, plansToMerge, mergeHistory } = options;

    if (!user) {
        setShowGuestMergeModal(false);
        return;
    };

    if (!mergePlans && !mergeHistory) {
        handleDiscardGuestData();
        return;
    }

    setIsSyncing(true);
    setShowGuestMergeModal(false);

    try {
        const batch = writeBatch(db);
        
        let plansToUpload: WorkoutPlan[] = [];
        if (mergePlans && plansToMerge.length > 0) {
            const maxOrder = plans.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
            plansToUpload = plansToMerge.map((p, i) => ({ ...p, order: maxOrder + 1 + i }));
            
            plansToUpload.forEach((plan) => {
                const planRef = doc(db, 'users', user.uid, 'plans', plan.id);
                batch.set(planRef, plan);
            });
        }
        
        if (mergeHistory && guestHistoryToMerge.length > 0) {
            guestHistoryToMerge.forEach(entry => {
                const historyRef = doc(db, 'users', user.uid, 'history', entry.id);
                batch.set(historyRef, entry);
            });
        }

        await batch.commit();
        
        if (mergePlans && plansToUpload.length > 0) {
            saveLocalPlans([...plans, ...plansToUpload]);
        }
        if (mergeHistory && guestHistoryToMerge.length > 0) {
            saveLocalHistory([...workoutHistory, ...guestHistoryToMerge]);
        }
        
    } catch (error) {
        console.error("Failed to merge guest data:", error);
        setShowGuestMergeModal(true); 
    } finally {
        setGuestPlansToMerge([]);
        setGuestHistoryToMerge([]);
        setIsSyncing(false);
    }
  }, [user, plans, guestHistoryToMerge, workoutHistory, handleDiscardGuestData]);

  const savePlan = useCallback(async (planToSave: WorkoutPlan) => {
      const migratedPlan = migratePlanToV2(planToSave);
      if (!migratedPlan) return;

      setPlans(prevPlans => {
          const isNewPlan = !prevPlans.some(p => p.id === migratedPlan.id);
          const plansWithOrder = prevPlans.map((p, i) => ({ ...p, order: i }));
          let newPlans;

          if (isNewPlan) {
              const maxOrder = plansWithOrder.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
              migratedPlan.order = maxOrder + 1;
              newPlans = [...plansWithOrder, migratedPlan];
          } else {
              newPlans = plansWithOrder.map(p => p.id === migratedPlan.id ? migratedPlan : p);
          }

          if (authStatusRef.current === 'unauthenticated') {
              saveLocalPlans(newPlans);
          }
          
          return newPlans;
      });

      if (user) {
          try {
              const planRef = doc(db, 'users', user.uid, 'plans', migratedPlan.id);
              await setDoc(planRef, migratedPlan, { merge: true });
          } catch (error) {
              console.error("Failed to save plan to Firestore:", error);
          }
      }
  }, [user]);
  
  const importPlan = useCallback((planToImport: WorkoutPlan, source: string = 'file') => {
    const migratedPlan = migratePlanToV2(planToImport);
    if (!migratedPlan) {
        setImportNotification({ message: "Import failed", planName: "The plan data was invalid.", type: 'warning' });
        return;
    }

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
        .map(s => s.name);
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
    const originalPlans = plans;
    const newPlans = plans.filter(p => p.id !== planId);
    setPlans(newPlans);

    if (authStatusRef.current === 'unauthenticated') {
        saveLocalPlans(newPlans);
    }
    
    if (user) {
      try {
        const planRef = doc(db, 'users', user.uid, 'plans', planId);
        await deleteDoc(planRef);
      } catch (error) {
        console.error("Failed to delete plan from Firestore:", error);
        setPlans(originalPlans);
        if (authStatusRef.current === 'unauthenticated') {
            saveLocalPlans(originalPlans);
        }
      }
    }
  }, [user, plans]);

  const reorderPlans = useCallback(async (reorderedPlans: WorkoutPlan[]) => {
      const plansWithOrder = reorderedPlans.map((p, i) => ({ ...p, order: i }));
      setPlans(plansWithOrder);

      if (authStatusRef.current === 'unauthenticated') {
          saveLocalPlans(plansWithOrder);
      }

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
      }
  }, [user]);
  
  const logWorkoutCompletion = useCallback((
    planName: string, 
    durationMs: number, 
    steps: WorkoutStep[], 
    planIds: string[],
    performedSteps: PerformedStep[]
  ) => {
    const now = new Date();
    const newEntry: WorkoutLogEntry = {
        id: now.toISOString(),
        date: now.toISOString(),
        planName: planName,
        durationSeconds: Math.round(durationMs / 1000),
        steps: steps,
        planIds: planIds,
        performedSteps: performedSteps,
    };

    if (user) {
        const historyRef = doc(db, 'users', user.uid, 'history', newEntry.id);
        setDoc(historyRef, newEntry).catch(e => console.error("Failed to save workout log to Firestore:", e));
    } else {
        setWorkoutHistory(prev => {
            const newHistory = [newEntry, ...prev];
            saveLocalHistory(newHistory);
            return newHistory;
        });
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
                saveLocalHistory([]);
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
    
    setActiveWorkout({ 
      plan: metaPlan, 
      currentStepIndex: 0, 
      sourcePlanIds: plansToStart, 
      stepRestartKey: 0,
      sessionLog: [],
      stepStartTime: Date.now(),
    });
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
    setPlansToStart([]);
  }, [plans, plansToStart, settings]);

  const stopWorkout = useCallback(({ completed, durationMs, finishedWorkout }: { completed: boolean; durationMs: number; finishedWorkout: ActiveWorkout }) => {
    if (completed) {
        const finalSessionLog = [...finishedWorkout.sessionLog];
        const lastStep = finishedWorkout.plan.steps[finishedWorkout.currentStepIndex];
        if (lastStep) {
            const stepDuration = Date.now() - finishedWorkout.stepStartTime;
            finalSessionLog.push({ step: lastStep, status: StepStatus.Completed, durationMs: stepDuration });
        }

        logWorkoutCompletion(
            finishedWorkout.plan.name || 'Unnamed Workout',
            durationMs,
            finishedWorkout.plan.steps,
            finishedWorkout.sourcePlanIds,
            finalSessionLog
        );
    }
    setActiveWorkout(null);
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, [logWorkoutCompletion]);

  const pauseWorkout = useCallback(() => setIsWorkoutPaused(true), []);
  const resumeWorkout = useCallback(() => setIsWorkoutPaused(false), []);
  
  const restartWorkout = useCallback(() => {
    setActiveWorkout(prev => prev ? { 
        ...prev, 
        currentStepIndex: 0, 
        stepRestartKey: (prev.stepRestartKey || 0) + 1,
        sessionLog: [],
        stepStartTime: Date.now(),
    } : null);
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, []);

  const nextStep = useCallback((timestamp: number, status: StepStatus) => {
    setActiveWorkout(prev => {
      if (!prev) return null;

      const currentStep = prev.plan.steps[prev.currentStepIndex];
      const durationMs = timestamp - prev.stepStartTime;
      const performedStep: PerformedStep = {
        step: currentStep,
        status,
        durationMs,
      };
      
      const newSessionLog = [...prev.sessionLog, performedStep];

      if (prev.currentStepIndex + 1 >= prev.plan.steps.length) {
        return null; 
      }

      return { 
        ...prev, 
        currentStepIndex: prev.currentStepIndex + 1,
        sessionLog: newSessionLog,
        stepStartTime: timestamp,
      };
    });
    setIsCountdownPaused(false);
  }, []);
  
  const previousStep = useCallback((timestamp: number) => {
    setActiveWorkout(prev => {
      if (!prev || prev.currentStepIndex === 0) return prev;
      
      const newSessionLog = prev.sessionLog.slice(0, -1);
      const lastPerformedStepDuration = newSessionLog.length > 0 ? newSessionLog[newSessionLog.length - 1].durationMs : 0;
      
      return { 
          ...prev, 
          currentStepIndex: prev.currentStepIndex - 1,
          sessionLog: newSessionLog,
          stepStartTime: timestamp - lastPerformedStepDuration
      };
    });
    setIsCountdownPaused(false);
  }, []);

  const pauseStepCountdown = useCallback(() => setIsCountdownPaused(true), []);
  const resumeStepCountdown = useCallback(() => setIsCountdownPaused(false), []);
  
  const restartCurrentStep = useCallback(() => {
    setActiveWorkout(prev => prev ? { 
        ...prev, 
        stepRestartKey: (prev.stepRestartKey || 0) + 1,
        stepStartTime: Date.now(),
    } : null);
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