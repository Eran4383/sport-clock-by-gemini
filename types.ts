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
}

export interface WorkoutPlan {
  id: string;
  name: string;
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
  color?: string;
}