import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { WorkoutStep } from '../types';
import { getLocalSettings, saveLocalSettings } from '../services/storageService';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';

// --- Types and Defaults (moved from hooks/useSettings.ts) ---

export interface Settings {
  showSessionTimer: boolean;
  showWorkoutTimer: boolean;
  showCountdown: boolean;
  showCycleCounter: boolean;
  stealthModeEnabled: boolean;
  countdownDuration: number;
  countdownRestDuration: number;
  allSoundsEnabled: boolean;
  playSoundAtHalfway: boolean;
  playSoundAtEnd: boolean;
  playSoundOnRestart: boolean;
  volume: number;
  isMuted: boolean;
  countdownSize: number;
  stopwatchSize: number;
  countdownControlsSize: number;
  stopwatchControlsSize: number;
  showCountdownControls: boolean;
  showStopwatchControls: boolean;
  defaultExerciseDuration: number;
  defaultRestDuration: number;
  showNextExercise: boolean;
  backgroundColor: string;
  halfwayColor: string;
  restBackgroundColor: string;
  showRestTitleOnDefaultCountdown: boolean;
  preWorkoutCountdownDuration: number;
  settingsCategoryOrder: string[];
  isWarmupEnabled: boolean;
  warmupSteps: WorkoutStep[];
  restAfterWarmupDuration: number;
  syncSettingsAcrossDevices: boolean;
}

const defaultSettings: Settings = {
  showSessionTimer: true,
  showWorkoutTimer: true,
  showCountdown: true,
  showCycleCounter: true,
  stealthModeEnabled: false,
  countdownDuration: 40,
  countdownRestDuration: 3,
  allSoundsEnabled: true,
  playSoundAtHalfway: true,
  playSoundAtEnd: true,
  playSoundOnRestart: true,
  volume: 0.5,
  isMuted: false,
  countdownSize: 100,
  stopwatchSize: 100,
  countdownControlsSize: 100,
  stopwatchControlsSize: 100,
  showCountdownControls: true,
  showStopwatchControls: true,
  defaultExerciseDuration: 40,
  defaultRestDuration: 20,
  showNextExercise: true,
  backgroundColor: '#000000',
  halfwayColor: '#FF0000',
  restBackgroundColor: '#FFFFFF',
  showRestTitleOnDefaultCountdown: true,
  preWorkoutCountdownDuration: 10,
  settingsCategoryOrder: ['sounds', 'countdown', 'stopwatch', 'cycles', 'workoutDisplay', 'displaySizes', 'displayColors', 'account'],
  isWarmupEnabled: false,
  warmupSteps: [],
  restAfterWarmupDuration: 15,
  syncSettingsAcrossDevices: true,
};

// --- Context Definition ---

export type SettingsContextType = {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);


// --- Provider Implementation ---

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authStatus } = useAuth();

  const getInitialSettings = (): Settings => {
    const localSettings = getLocalSettings();
    return localSettings ? { ...defaultSettings, ...localSettings } : defaultSettings;
  };

  const [settings, setSettings] = useState<Settings>(getInitialSettings);
  
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Effect to handle Firestore synchronization for authenticated users
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const usersCollection = db.collection('users');

    const setupFirestoreListener = (uid: string) => {
        const settingsDocRef = usersCollection.doc(uid).collection('settings').doc('main');
        unsubscribe = settingsDocRef.onSnapshot((doc) => {
            if (doc.exists) {
                const remoteSettings = doc.data() as Partial<Settings>;
                setSettings(current => ({ ...defaultSettings, ...current, ...remoteSettings }));
            } else {
                settingsDocRef.set(settings, { merge: true });
            }
        });
    };

    if (authStatus === 'authenticated' && user) {
        const settingsDocRef = usersCollection.doc(user.uid).collection('settings').doc('main');
        
        settingsDocRef.get().then(doc => {
            const remoteSyncEnabled = doc.data()?.syncSettingsAcrossDevices ?? true; // Default to sync
            
            if (remoteSyncEnabled) {
                // If sync is on, get the latest from local storage first for responsiveness,
                // then set up the listener which will overwrite with remote data.
                setSettings(getInitialSettings());
                setupFirestoreListener(user.uid);
            } else {
                // If sync is off on the remote, just use local settings.
                setSettings(getInitialSettings());
            }
        }).catch(err => {
            console.error("Error getting initial sync setting, defaulting to local.", err);
            setSettings(getInitialSettings());
        });

    } else if (authStatus === 'unauthenticated') {
        if (unsubscribe) unsubscribe();
        setSettings(getInitialSettings());
    }

    return () => {
        if (unsubscribe) unsubscribe();
    };
    // `settings` is intentionally omitted from the dependency array to avoid re-running on every change.
    // The listener and initial load logic should only run when auth status changes.
  }, [user, authStatus]);


  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    // 1. Calculate the new state from the current state
    const updatedSettings = { ...settings, ...newSettings };
    
    // 2. Set the new state locally for immediate UI response
    setSettings(updatedSettings);
    
    // 3. Perform side effects (saving to local storage and/or Firestore)
    
    // Always save the full, updated settings to local storage.
    // This ensures that if the user toggles sync off, they retain their current settings locally.
    saveLocalSettings(updatedSettings);
    
    // Handle Firestore saving for logged-in users
    const currentUser = userRef.current;
    if (currentUser) {
        const settingsDocRef = db.collection('users').doc(currentUser.uid).collection('settings').doc('main');
        const syncIsEnabled = updatedSettings.syncSettingsAcrossDevices;

        // Case A: The sync setting itself is being changed. We MUST update Firestore.
        if (newSettings.hasOwnProperty('syncSettingsAcrossDevices')) {
            if (newSettings.syncSettingsAcrossDevices === true) {
                // Sync is being turned ON. Push the entire current local state to remote
                // to make it the new source of truth for all devices.
                settingsDocRef.set(updatedSettings);
            } else {
                // Sync is being turned OFF. Just update the flag on remote so other
                // devices know not to sync anymore.
                settingsDocRef.set({ syncSettingsAcrossDevices: false }, { merge: true });
            }
        } 
        // Case B: A different setting was changed, and sync is enabled.
        else if (syncIsEnabled) {
            settingsDocRef.set(newSettings, { merge: true });
        }
        // Case C: A different setting was changed, and sync is disabled. Do nothing to Firestore.
    }
  }, [settings]);

  return React.createElement(SettingsContext.Provider, { value: { settings, updateSettings } }, children);
};


// --- Hook for consuming context ---

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};