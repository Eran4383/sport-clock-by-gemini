export interface WorkoutStep {
  id: string;
  name: string;
  type: 'exercise' | 'rest';
  // If true, this is a rep-based exercise. Otherwise, it's time-based.
  isRepBased: boolean;
  // Duration in seconds for time-based steps.
  duration: number;
  // Number of repetitions for rep-based steps.
  reps: number;
  // Internal property to mark a step as part of the warm-up
  isWarmup?: boolean;
  // Used for warm-up steps to enable/disable them
  enabled?: boolean;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
  color?: string;
  isLocked?: boolean;
  isSmartPlan?: boolean; // To identify AI-generated plans
  // FIX: Add optional 'order' property to allow sorting and reordering of workout plans.
  order?: number;
}

export interface WorkoutLogEntry {
    id: string;
    date: string; // ISO string
    planName: string;
    durationSeconds: number;
    steps: WorkoutStep[];
    planIds?: string[];
}