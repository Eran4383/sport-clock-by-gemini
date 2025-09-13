


import { useState, useEffect, useCallback } from 'react';
import { WorkoutStep } from '../types';
import { getLocalSettings, saveLocalSettings } from '../services/storageService';

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
  isWarmupEnabled: boolean;
  warmupSteps: WorkoutStep[];
  restAfterWarmupDuration: number;
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
  settingsCategoryOrder: ['sounds', 'countdown', 'stopwatch', 'workoutDisplay', 'displaySizes', 'displayColors'],
  isWarmupEnabled: false,
  warmupSteps: [],
  restAfterWarmupDuration: 15,
};

const getInitialSettings = (): Settings => {
  const localSettings = getLocalSettings();
  return localSettings ? { ...defaultSettings, ...localSettings } : defaultSettings;
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(getInitialSettings);

  useEffect(() => {
    saveLocalSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prevSettings => ({ ...prevSettings, ...newSettings }));
  }, []);

  return { settings, updateSettings };
};