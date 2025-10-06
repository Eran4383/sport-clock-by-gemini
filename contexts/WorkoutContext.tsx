

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutStep, WorkoutLogEntry, StepStatus, PerformedStep } from '../types';
import { prefetchExercises } from '../services/geminiService';
import { getBaseExerciseName, generateCircuitSteps, processAndFormatAiSteps, arePlansDeeplyEqual, migratePlanToV2 } from '../utils/workout';
import { useSettings } from './SettingsContext';
import { getLocalPlans, saveLocalPlans, getLocalHistory, saveLocalHistory } from '../services/storageService';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { collection, doc, writeBatch, query, orderBy, setDoc, deleteDoc, onSnapshot, Unsubscribe, getDocs } from 'firebase/firestore';
import { useLogger } from './LoggingContext';

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
  saveManualSession: (name: string, durationMs: number, performedSteps: PerformedStep[]) => void;
  isManualSessionActive: boolean;
  startManualSession: () => void;
  cancelManualSession: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

export const WorkoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const { user, authStatus } = useAuth();
  const { logAction } = useLogger();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const [recentlyImportedPlanId, setRecentlyImportedPlanId] = useState<string | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLogEntry[]>([]);
  const [plansToStart, setPlansToStart] = useState<string[]>([]);
  const [importNotification, setImportNotification] = useState<ImportNotificationData | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isManualSessionActive, setIsManualSessionActive] = useState(false);
  
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
        logAction('AUTH_STATE_AUTHENTICATED', { uid: user.uid });
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
                logAction('GUEST_DATA_DETECTED', { planCount: newGuestPlans.length, historyCount: newGuestHistory.length });
                setGuestPlansToMerge(newGuestPlans);
                setGuestHistoryToMerge(newGuestHistory);
                setShowGuestMergeModal(true);
            } else {
                logAction('GUEST_DATA_NONE_DETECTED');
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
            logAction('ERROR_FIRESTORE_PLANS_LISTENER', { message: error.message });
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
            logAction('ERROR_FIRESTORE_HISTORY_LISTENER', { message: error.message });
            console.error("Firestore history listener error:", error);
        });

    } else if (authStatus === 'unauthenticated') {
        logAction('AUTH_STATE_UNAUTHENTICATED');
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
  }, [user, authStatus, logAction]);


  const forceSync = useCallback(async () => {
    if (!user) return;
    logAction('SYNC_FORCE_ATTEMPT');
    setIsSyncing(true);
    try {
        const plansCollection = collection(db, 'users', user.uid, 'plans');
        const remoteSnapshot = await getDocs(query(plansCollection, orderBy('order', 'asc')));
        const remotePlans = remoteSnapshot.docs.map(doc => migratePlanToV2(doc.data())).filter((p): p is WorkoutPlan => !!p);
        setPlans(remotePlans);
        logAction('SYNC_FORCE_SUCCESS', { planCount: remotePlans.length });
    } catch (error) {
        logAction('ERROR_SYNC_FORCE', { message: (error as Error).message });
        console.error("Manual sync failed:", error);
    } finally {
        setIsSyncing(false);
    }
  }, [user, logAction]);
  
  const handleDiscardGuestData = useCallback(() => {
    logAction('GUEST_DATA_DISCARDED');
    setShowGuestMergeModal(false);
    setGuestPlansToMerge([]);
    setGuestHistoryToMerge([]);
  }, [logAction]);

  const handleMergeGuestData = useCallback(async (options: GuestMergeOptions) => {
    logAction('GUEST_DATA_MERGE_ATTEMPT', options);
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
        logAction('GUEST_DATA_MERGE_SUCCESS');
        
        if (mergePlans && plansToUpload.length > 0) {
            saveLocalPlans([...plans, ...plansToUpload]);
        }
        if (mergeHistory && guestHistoryToMerge.length > 0) {
            saveLocalHistory([...workoutHistory, ...guestHistoryToMerge]);
        }
        
    } catch (error) {
        logAction('ERROR_GUEST_DATA_MERGE', { message: (error as Error).message });
        console.error("Failed to merge guest data:", error);
        setShowGuestMergeModal(true); 
    } finally {
        setGuestPlansToMerge([]);
        setGuestHistoryToMerge([]);
        setIsSyncing(false);
    }
  }, [user, plans, guestHistoryToMerge, workoutHistory, handleDiscardGuestData, logAction]);

  const savePlan = useCallback(async (planToSave: WorkoutPlan) => {
      logAction('PLAN_SAVE_ATTEMPT', { planId: planToSave.id, planName: planToSave.name });
      const migratedPlan = migratePlanToV2(planToSave);
      if (!migratedPlan) {
          logAction('ERROR_PLAN_SAVE_MIGRATION_FAILED', { planId: planToSave.id });
          return;
      }

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
              logAction('ERROR_PLAN_SAVE_FIRESTORE', { planId: migratedPlan.id, message: (error as Error).message });
              console.error("Failed to save plan to Firestore:", error);
          }
      }
  }, [user, logAction]);
  
  const importPlan = useCallback((planToImport: WorkoutPlan, source: string = 'file') => {
    logAction('PLAN_IMPORT_ATTEMPT', { planName: planToImport.name, source });
    const migratedPlan = migratePlanToV2(planToImport);
    if (!migratedPlan) {
        logAction('ERROR_PLAN_IMPORT_MIGRATION_FAILED', { planName: planToImport.name });
        setImportNotification({ message: "Import failed", planName: "The plan data was invalid.", type: 'warning' });
        return;
    }

    const isDuplicate = plans.some(existingPlan => arePlansDeeplyEqual(migratedPlan, existingPlan));

    if (isDuplicate) {
        logAction('PLAN_IMPORT_DUPLICATE', { planName: migratedPlan.name });
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
  }, [savePlan, plans, logAction]);

  useEffect(() => {
    const handleImportFromUrl = () => {
        const hash = window.location.hash;
        if (hash.startsWith('#import=')) {
            logAction('URL_IMPORT_DETECTED');
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
                logAction('ERROR_URL_IMPORT', { message: (e as Error).message });
                console.error("Failed to import from URL", e);
                alert("Could not import workout plan from the link. The link may be invalid or corrupted.");
            } finally {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    };
    handleImportFromUrl();
  }, [importPlan, logAction]);


  const deletePlan = useCallback(async (planId: string) => {
    logAction('PLAN_DELETE_ATTEMPT', { planId });
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
        logAction('ERROR_PLAN_DELETE_FIRESTORE', { planId, message: (error as Error).message });
        console.error("Failed to delete plan from Firestore:", error);
        setPlans(originalPlans);
        if (authStatusRef.current === 'unauthenticated') {
            saveLocalPlans(originalPlans);
        }
      }
    }
  }, [user, plans, logAction]);

  const reorderPlans = useCallback(async (reorderedPlans: WorkoutPlan[]) => {
      logAction('PLANS_REORDERED', { count: reorderedPlans.length });
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
            logAction('ERROR_PLANS_REORDER_FIRESTORE', { message: (error as Error).message });
            console.error("Failed to reorder plans in Firestore:", error);
        }
      }
  }, [user, logAction]);
  
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
    logAction('WORKOUT_LOGGED', { planName, duration: newEntry.durationSeconds, performedStepCount: performedSteps.length });

    if (user) {
        const historyRef = doc(db, 'users', user.uid, 'history', newEntry.id);
        setDoc(historyRef, newEntry).catch(e => {
            logAction('ERROR_LOG_SAVE_FIRESTORE', { message: (e as Error).message });
            console.error("Failed to save workout log to Firestore:", e)
        });
    } else {
        setWorkoutHistory(prev => {
            const newHistory = [newEntry, ...prev];
            saveLocalHistory(newHistory);
            return newHistory;
        });
    }
  }, [user, logAction]);
  
  const startManualSession = useCallback(() => {
    logAction('MANUAL_SESSION_START');
    setIsManualSessionActive(true);
  }, [logAction]);

  const cancelManualSession = useCallback(() => {
    logAction('MANUAL_SESSION_CANCEL');
    setIsManualSessionActive(false);
  }, [logAction]);

  const saveManualSession = useCallback((name: string, durationMs: number, performedSteps: PerformedStep[]) => {
    const now = new Date();
    const newEntry: WorkoutLogEntry = {
        id: now.toISOString(),
        date: now.toISOString(),
        planName: name,
        durationSeconds: Math.round(durationMs / 1000),
        steps: performedSteps.map(p => p.step), // Extract original steps from performed steps
        planIds: ['manual_session'], // Special ID for manual sessions
        performedSteps: performedSteps,
    };
    logAction('MANUAL_WORKOUT_LOGGED', { planName: name, duration: newEntry.durationSeconds, performedStepCount: performedSteps.length });

    if (user) {
        const historyRef = doc(db, 'users', user.uid, 'history', newEntry.id);
        setDoc(historyRef, newEntry).catch(e => {
            logAction('ERROR_LOG_SAVE_FIRESTORE', { message: (e as Error).message });
            console.error("Failed to save manual workout log to Firestore:", e)
        });
    } else {
        setWorkoutHistory(prev => {
            const newHistory = [newEntry, ...prev];
            saveLocalHistory(newHistory);
            return newHistory;
        });
    }
    cancelManualSession();
  }, [user, logAction, cancelManualSession]);

  const clearWorkoutHistory = useCallback(() => {
    if (window.confirm("Are you sure you want to delete your entire workout history? This action cannot be undone.")) {
        logAction('HISTORY_CLEAR_ATTEMPT');
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
                    logAction('HISTORY_CLEAR_SUCCESS_FIRESTORE');
                } catch (error) {
                    logAction('ERROR_HISTORY_CLEAR_FIRESTORE', { message: (error as Error).message });
                    console.error("Failed to clear Firestore history:", error);
                } finally {
                    setIsSyncing(false);
                }
            } else {
                setWorkoutHistory([]);
                saveLocalHistory([]);
                logAction('HISTORY_CLEAR_SUCCESS_LOCAL');
            }
        };
        performClear();
    }
  }, [user, logAction]);

  const startWorkout = useCallback((planIds: string[]) => {
    logAction('WORKOUT_PREPARE', { planIds });
    if (planIds.length === 0) return;
    setPlansToStart(planIds);
  }, [logAction]);
  
  const clearPreparingWorkout = useCallback(() => {
    logAction('WORKOUT_PREPARE_CLEARED');
    setPlansToStart([]);
  }, [logAction]);
  
  const commitStartWorkout = useCallback(() => {
    if (plansToStart.length === 0) return;
    
    logAction('WORKOUT_START_COMMIT', { plansToStart });
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
    
    const newActiveWorkout: ActiveWorkout = { 
      plan: metaPlan, 
      currentStepIndex: 0, 
      sourcePlanIds: plansToStart, 
      stepRestartKey: 0,
      sessionLog: [],
      stepStartTime: Date.now(),
    };
    
    setActiveWorkout(newActiveWorkout);
    logAction('WORKOUT_STARTED', { planName: newActiveWorkout.plan.name, stepCount: newActiveWorkout.plan.steps.length });

    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
    setPlansToStart([]);
  }, [plans, plansToStart, settings, logAction]);

  const stopWorkout = useCallback(({ completed, durationMs, finishedWorkout }: { completed: boolean; durationMs: number; finishedWorkout: ActiveWorkout }) => {
    logAction('WORKOUT_STOPPED', { completed, durationMs, planName: finishedWorkout.plan.name });
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
  }, [logWorkoutCompletion, logAction]);

  const pauseWorkout = useCallback(() => {
      logAction('WORKOUT_PAUSED_GLOBAL');
      setIsWorkoutPaused(true);
  }, [logAction]);

  const resumeWorkout = useCallback(() => {
      logAction('WORKOUT_RESUMED_GLOBAL');
      setIsWorkoutPaused(false);
  }, [logAction]);
  
  const restartWorkout = useCallback(() => {
    logAction('WORKOUT_RESTARTED');
    setActiveWorkout(prev => prev ? { 
        ...prev, 
        currentStepIndex: 0, 
        stepRestartKey: (prev.stepRestartKey || 0) + 1,
        sessionLog: [],
        stepStartTime: Date.now(),
    } : null);
    setIsWorkoutPaused(false);
    setIsCountdownPaused(false);
  }, [logAction]);

  const nextStep = useCallback((timestamp: number, status: StepStatus) => {
    setActiveWorkout(prev => {
      if (!prev) return null;
      logAction('WORKOUT_NEXT_STEP', { currentIndex: prev.currentStepIndex, nextIndex: prev.currentStepIndex + 1, status });

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
  }, [logAction]);
  
  const previousStep = useCallback((timestamp: number) => {
    setActiveWorkout(prev => {
      if (!prev || prev.currentStepIndex === 0) return prev;
      logAction('WORKOUT_PREVIOUS_STEP', { currentIndex: prev.currentStepIndex, prevIndex: prev.currentStepIndex - 1 });
      
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
  }, [logAction]);

  const pauseStepCountdown = useCallback(() => {
      logAction('WORKOUT_PAUSED_STEP_COUNTDOWN');
      setIsCountdownPaused(true);
  }, [logAction]);

  const resumeStepCountdown = useCallback(() => {
      logAction('WORKOUT_RESUMED_STEP_COUNTDOWN');
      setIsCountdownPaused(false);
  }, [logAction]);
  
  const restartCurrentStep = useCallback(() => {
    logAction('WORKOUT_RESTARTED_STEP');
    setActiveWorkout(prev => prev ? { 
        ...prev, 
        stepRestartKey: (prev.stepRestartKey || 0) + 1,
        stepStartTime: Date.now(),
    } : null);
    setIsCountdownPaused(false);
  }, [logAction]);

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
    saveManualSession,
    isManualSessionActive,
    startManualSession,
    cancelManualSession,
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