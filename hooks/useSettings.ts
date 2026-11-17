


import { useState, useEffect, useCallback } from 'react';
import { WorkoutStep } from '../types';
import { getLocalSettings, saveLocalSettings } from '../services/storageService';
import { useLogger } from '../contexts/LoggingContext';

export interface CustomSound {
  name: string;
  dataUrl: string;
}

export interface UserEquipmentItem {
  name: string;
  available: boolean;
}

export interface UserProfile {
  birthDate?: string;
  fitnessLevel?: 'beginner' | 'intermediate' | 'advanced';
  equipment?: UserEquipmentItem[];
}

export interface Settings {
  showTimer: boolean;
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
  customSounds?: {
    start?: CustomSound;
    end?: CustomSound;
    notification?: CustomSound;
    tick?: CustomSound;
  };
  isWarmupEnabled: boolean;
  warmupSteps: WorkoutStep[];
  restAfterWarmupDuration: number;
  showLogSessionButton: boolean;
  keepScreenAwake: boolean;
  userProfile?: UserProfile;
}

const defaultSettings: Settings = {
  showTimer: true,
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
  settingsCategoryOrder: ['sounds', 'workoutDisplay', 'countdown', 'stopwatch', 'displaySizes', 'displayColors', 'customSounds', 'developer'],
  customSounds: {},
  isWarmupEnabled: false,
  warmupSteps: [],
  restAfterWarmupDuration: 15,
  showLogSessionButton: true,
  keepScreenAwake: true,
};

const ORDER_MIGRATION_KEY = 'settings_order_v2_migrated';

const getInitialSettings = (): Settings => {
  const localSettings = getLocalSettings();
  if (localSettings) {
    const order = Array.isArray(localSettings.settingsCategoryOrder)
      ? [...localSettings.settingsCategoryOrder]
      : [...defaultSettings.settingsCategoryOrder];

    if (!order.includes('developer')) {
      order.push('developer');
    }

    if (!order.includes('customSounds')) {
      const devIndex = order.indexOf('developer');
      order.splice(devIndex > -1 ? devIndex : order.length, 0, 'customSounds');
    }

    if (!order.includes('workoutDisplay')) {
      const soundsIndex = order.indexOf('sounds');
      order.splice(soundsIndex > -1 ? soundsIndex + 1 : 0, 0, 'workoutDisplay');
    }

    try {
      if (!localStorage.getItem(ORDER_MIGRATION_KEY)) {
        const customIdx = order.indexOf('customSounds');
        const workoutIdx = order.indexOf('workoutDisplay');
        if (workoutIdx > -1 && customIdx > -1 && workoutIdx !== customIdx) {
          order.splice(workoutIdx, 1);
          const adjustedCustomIdx = order.indexOf('customSounds');
          order.splice(adjustedCustomIdx, 0, 'workoutDisplay');
        }
        const newCustomIdx = order.indexOf('customSounds');
        if (newCustomIdx > -1) {
          order.splice(newCustomIdx, 1);
        }
        const devIdx = order.indexOf('developer');
        order.splice(devIdx > -1 ? devIdx : order.length, 0, 'customSounds');
        localStorage.setItem(ORDER_MIGRATION_KEY, 'true');
      }
    } catch {
      // Ignore storage access errors
    }

    localSettings.settingsCategoryOrder = order;
  }
  return localSettings ? { ...defaultSettings, ...localSettings } : defaultSettings;
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(getInitialSettings);
  const { logAction } = useLogger();

  useEffect(() => {
    saveLocalSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    logAction('SETTINGS_UPDATED', newSettings);
    setSettings(prevSettings => ({ ...prevSettings, ...newSettings }));
  }, [logAction]);

  return { settings, updateSettings };
};