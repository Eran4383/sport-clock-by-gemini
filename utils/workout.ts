import { WorkoutStep, WorkoutPlan } from '../types';

/**
 * Parses a step name string (e.g., "Push-ups (Set 1/3)") into a structured object.
 * This is the core of the migration logic from the old data model to the new one.
 * @param name The original name string of the step.
 * @returns An object with the base name and an optional set object.
 */
export const parseStepName = (name: string): { name: string; set?: { current: number; total: number } } => {
    const match = name.match(/(.+?)\s*\((Set|סט)\s*(\d+)\/(\d+)\)/i);
    if (match) {
        return {
            name: match[1].trim(),
            set: {
                current: parseInt(match[3], 10),
                total: parseInt(match[4], 10),
            },
        };
    }
    return { name };
};


/**
 * Extracts the base name of an exercise. This function now uses the new parsing logic
 * for backward compatibility but is superseded by simply accessing `step.name` on migrated steps.
 */
export const getBaseExerciseName = (name: string): string => {
  return parseStepName(name).name;
};

/**
 * Constructs the full display name for a workout step, including set information if available.
 * @param step The workout step object.
 * @returns A string suitable for display in the UI.
 */
export const getStepDisplayName = (step: WorkoutStep): string => {
    if (step.set) {
        // A simple check for any Hebrew character in the name to decide the language for "Set".
        const setLabel = /[\u0590-\u05FF]/.test(step.name) ? 'סט' : 'Set';
        return `${step.name} (${setLabel} ${step.set.current}/${step.set.total})`;
    }
    return step.name;
};

/**
 * Migrates a workout plan from the old string-based set format to the new
 * structured `set` object format.
 * @param plan The workout plan to migrate.
 * @returns A new workout plan object conforming to the latest data structure.
 */
export const migratePlanToV2 = (plan: any): WorkoutPlan => {
    if (plan.version === 2) {
        return plan as WorkoutPlan;
    }

    const migratedSteps = plan.steps.map((step: any) => {
        if (step.type === 'exercise') {
            const { name, set } = parseStepName(step.name);
            return { ...step, name, set };
        }
        // For rest steps, we also parse them to handle names like "Rest (סט 1/3)"
        const { name, set } = parseStepName(step.name);
        return { ...step, name, set };
    });

    return { ...plan, steps: migratedSteps, version: 2 };
};


/**
 * Re-orders a list of workout steps from a linear to a circuit structure.
 * This logic is now simpler as it relies on the base name directly.
 */
export const generateCircuitSteps = (steps: WorkoutStep[]): WorkoutStep[] => {
  if (!steps || steps.length === 0) return [];

  const exerciseGroups = new Map<string, WorkoutStep[][]>();
  const exerciseOrder: string[] = [];

  let i = 0;
  while (i < steps.length) {
    const currentStep = steps[i];
    if (currentStep.type === 'exercise') {
      const baseName = currentStep.name; // Use the base name directly
      
      let setBlock: WorkoutStep[] = [currentStep];
      
      if (i + 1 < steps.length && steps[i + 1].type === 'rest') {
        setBlock.push(steps[i + 1]);
        i++;
      }
      
      if (!exerciseGroups.has(baseName)) {
        exerciseGroups.set(baseName, []);
        exerciseOrder.push(baseName);
      }
      exerciseGroups.get(baseName)!.push(setBlock);
      
      i++;
    } else {
      i++;
    }
  }

  const circuitSteps: WorkoutStep[] = [];
  let maxSets = 0;
  exerciseGroups.forEach(sets => {
    if (sets.length > maxSets) {
      maxSets = sets.length;
    }
  });

  for (let setIndex = 0; setIndex < maxSets; setIndex++) {
    for (const baseName of exerciseOrder) {
      const sets = exerciseGroups.get(baseName);
      if (sets && setIndex < sets.length) {
        circuitSteps.push(...sets[setIndex]);
      }
    }
  }

  return circuitSteps;
};

/**
 * Processes steps from an AI-generated plan to add the structured `set` object.
 * AI plans use repeated base exercise names, which this function converts.
 * @param steps - The array of WorkoutStep from the AI.
 * @returns A new array of WorkoutStep with the `set` object populated.
 */
export const processAndFormatAiSteps = (steps: WorkoutStep[]): WorkoutStep[] => {
    const exerciseSetCounts = new Map<string, number>();
    for (const step of steps) {
        if (step.type === 'exercise') {
            exerciseSetCounts.set(step.name, (exerciseSetCounts.get(step.name) || 0) + 1);
        }
    }

    const formattedSteps: WorkoutStep[] = [];
    const currentSetCounters = new Map<string, number>();

    for (const step of steps) {
        const newStep = { ...step };

        if (newStep.type === 'exercise') {
            const totalSets = exerciseSetCounts.get(newStep.name) || 1;
            if (totalSets > 1) {
                const currentSet = (currentSetCounters.get(newStep.name) || 0) + 1;
                currentSetCounters.set(newStep.name, currentSet);
                newStep.set = { current: currentSet, total: totalSets };
            }
        }
        formattedSteps.push(newStep);
    }
    return formattedSteps;
};

/**
 * Compares two workout steps for deep equality, ignoring their IDs.
 * Now uses the structured `set` object for more reliable comparison.
 */
const areStepsEqual = (step1: Omit<WorkoutStep, 'id'>, step2: Omit<WorkoutStep, 'id'>): boolean => {
    if (
        step1.name.trim() !== step2.name.trim() ||
        step1.type !== step2.type ||
        step1.isRepBased !== step2.isRepBased ||
        step1.set?.current !== step2.set?.current ||
        step1.set?.total !== step2.set?.total
    ) {
        return false;
    }

    if (step1.isRepBased) {
        return step1.reps === step2.reps;
    }
    
    return step1.duration === step2.duration;
};

/**
 * Compares two workout plans for deep equality, ignoring properties like id, color, order.
 * It focuses on the functional content of the plan.
 */
export const arePlansDeeplyEqual = (plan1: WorkoutPlan, plan2: WorkoutPlan): boolean => {
    if (plan1.name.trim() !== plan2.name.trim()) return false;
    if ((plan1.executionMode || 'linear') !== (plan2.executionMode || 'linear')) return false;
    if (plan1.steps.length !== plan2.steps.length) return false;

    for (let i = 0; i < plan1.steps.length; i++) {
        if (!areStepsEqual(plan1.steps[i], plan2.steps[i])) {
            return false;
        }
    }

    return true;
};