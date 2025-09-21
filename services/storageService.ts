// FIX: The Settings interface was moved to SettingsContext.ts. Updated the import path.
import { Settings } from '../contexts/SettingsContext';
import { WorkoutPlan, WorkoutLogEntry } from '../types';
import { ExerciseInfo } from './geminiService';
import { getBaseExerciseName } from '../utils/workout';

// Constants for localStorage keys
const SETTINGS_KEY = 'sportsClockSettings';
const WORKOUT_PLANS_KEY = 'sportsClockWorkoutPlans';
const WORKOUT_HISTORY_KEY = 'sportsClockWorkoutHistory';
const EXERCISE_CACHE_KEY = 'geminiExerciseCache_v3';
const EDITOR_DRAFT_KEY = 'sportsClockPlanEditorDraft';
export const AI_CHAT_HISTORY_KEY = 'sportsClockAiChatHistory_v2';

// --- Generic Helpers ---
const getItem = <T>(key: string): T | null => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Error reading from localStorage key “${key}”:`, error);
    return null;
  }
};

const setItem = <T>(key: string, value: T): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing to localStorage key “${key}”:`, error);
  }
};

// --- Settings ---
export const getLocalSettings = (): Partial<Settings> | null => {
  return getItem<Partial<Settings>>(SETTINGS_KEY);
};

export const saveLocalSettings = (settings: Settings): void => {
  setItem(SETTINGS_KEY, settings);
};

// --- Workout Plans ---
export const getLocalPlans = (): WorkoutPlan[] => {
  return getItem<WorkoutPlan[]>(WORKOUT_PLANS_KEY) || [];
};

export const saveLocalPlans = (plans: WorkoutPlan[]): void => {
  setItem(WORKOUT_PLANS_KEY, plans);
};

// --- Workout History ---
export const getLocalHistory = (): WorkoutLogEntry[] => {
  return getItem<WorkoutLogEntry[]>(WORKOUT_HISTORY_KEY) || [];
};

export const saveLocalHistory = (history: WorkoutLogEntry[]): void => {
  setItem(WORKOUT_HISTORY_KEY, history);
};

// --- Gemini Exercise Info Cache ---
export const getLocalCache = (): Record<string, ExerciseInfo> => {
    return getItem<Record<string, ExerciseInfo>>(EXERCISE_CACHE_KEY) || {};
};

export const saveToLocalCache = (key: string, data: ExerciseInfo) => {
    try {
        const cache = getLocalCache();
        cache[key] = data;
        setItem(EXERCISE_CACHE_KEY, cache);
    } catch (error)
    {
        console.error("Failed to save to cache", error);
    }
};

export const clearExerciseFromLocalCache = (exerciseName: string) => {
    const normalizedName = getBaseExerciseName(exerciseName).trim().toLowerCase();
    try {
        const cache = getLocalCache();
        if (cache[normalizedName]) {
            delete cache[normalizedName];
            setItem(EXERCISE_CACHE_KEY, cache);
            console.log(`Cleared "${normalizedName}" from local cache.`);
        }
    } catch (error) {
        console.error("Failed to clear exercise from cache", error);
    }
};

// --- Plan Editor Draft ---
export const getEditorDraft = (): WorkoutPlan | null => {
    return getItem<WorkoutPlan>(EDITOR_DRAFT_KEY);
};

export const saveEditorDraft = (plan: WorkoutPlan): void => {
    setItem(EDITOR_DRAFT_KEY, plan);
};

export const clearEditorDraft = (): void => {
    window.localStorage.removeItem(EDITOR_DRAFT_KEY);
};

// --- AI Chat History ---
export const clearAiChatHistory = (): void => {
    window.localStorage.removeItem(AI_CHAT_HISTORY_KEY);
};