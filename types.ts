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
  // Allows disabling a step (primarily for warm-ups) without removing it. Defaults to true.
  isEnabled?: boolean;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
  color?: string;
  isLocked?: boolean;
  isSmartPlan?: boolean; // To identify AI-generated plans
}

export interface WorkoutLogEntry {
    id: string;
    date: string; // ISO string
    planName: string;
    durationSeconds: number;
    steps: WorkoutStep[];
    planIds: string[];
}