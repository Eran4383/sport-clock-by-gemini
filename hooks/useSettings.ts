


import { useState, useEffect, useCallback } from 'react';
import { WorkoutStep } from '../types';
import { getLocalSettings, saveLocalSettings } from '../services/storageService';
import { useLogger } from '../contexts/LoggingContext';

export interface CustomSound {
  name: string;
  dataUrl: string;
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
  settingsCategoryOrder: ['sounds', 'customSounds', 'countdown', 'stopwatch', 'workoutDisplay', 'displaySizes', 'displayColors', 'developer'],
  customSounds: {},
  isWarmupEnabled: false,
  warmupSteps: [],
  restAfterWarmupDuration: 15,
  showLogSessionButton: true,
};

const getInitialSettings = (): Settings => {
  const localSettings = getLocalSettings();
  // Ensure the developer category is present for existing users
  if (localSettings && !localSettings.settingsCategoryOrder?.includes('developer')) {
    localSettings.settingsCategoryOrder = [...(localSettings.settingsCategoryOrder || defaultSettings.settingsCategoryOrder), 'developer'];
  }
  // Ensure the customSounds category is present for existing users
  if (localSettings && !localSettings.settingsCategoryOrder?.includes('customSounds')) {
      const soundsIndex = localSettings.settingsCategoryOrder?.indexOf('sounds') ?? -1;
      if (soundsIndex > -1) {
          localSettings.settingsCategoryOrder?.splice(soundsIndex + 1, 0, 'customSounds');
      } else {
          localSettings.settingsCategoryOrder = [
              'sounds', 
              'customSounds', 
              ...(localSettings.settingsCategoryOrder || defaultSettings.settingsCategoryOrder)
          ];
      }
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