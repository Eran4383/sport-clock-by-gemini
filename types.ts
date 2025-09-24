export interface WorkoutStep {
  id: string;
  name: string; // Now the base name, e.g., "Push-ups"
  type: 'exercise' | 'rest';
  isRepBased: boolean;
  duration: number;
  reps: number;
  isWarmup?: boolean;
  enabled?: boolean;
  // New structured data for sets, replacing "(Set X/Y)" in the name
  set?: {
    current: number;
    total: number;
  };
}

export interface WorkoutPlan {
  id: string;
  name: string;
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
  color?: string;
  isLocked?: boolean;
  isSmartPlan?: boolean;
  order?: number;
  // Internal schema version to help with migrations
  version?: number;
}

export enum StepStatus {
  Completed = 'completed',
  Skipped = 'skipped',
}

export interface PerformedStep {
  step: WorkoutStep;
  status: StepStatus;
  durationMs: number;
}


export interface WorkoutLogEntry {
    id: string;
    date: string; // ISO string
    planName: string;
    durationSeconds: number;
    steps: WorkoutStep[]; // The originally planned steps
    planIds?: string[];
    performedSteps: PerformedStep[]; // The new, detailed log of what actually happened
}