import { WorkoutStep, WorkoutPlan } from '../types';

/**
 * Extracts the base name of an exercise, stripping set/rep counts.
 * e.g., "Push-ups (Set 1/3)" -> "Push-ups"
 */
export const getBaseExerciseName = (name: string): string => {
  const match = name.match(/(.+?)\s*\((Set|Rep|סט)\s*\d+/i);
  return match ? match[1].trim() : name;
};

/**
 * Re-orders a list of workout steps from a linear to a circuit structure.
 */
export const generateCircuitSteps = (steps: WorkoutStep[]): WorkoutStep[] => {
  if (!steps || steps.length === 0) return [];

  const exerciseGroups = new Map<string, WorkoutStep[][]>();
  const exerciseOrder: string[] = [];

  let i = 0;
  while (i < steps.length) {
    const currentStep = steps[i];
    if (currentStep.type === 'exercise') {
      const baseName = getBaseExerciseName(currentStep.name);
      
      let setBlock: WorkoutStep[] = [currentStep];
      
      // Check for an immediate rest step that belongs to this exercise
      if (i + 1 < steps.length && steps[i + 1].type === 'rest') {
        setBlock.push(steps[i + 1]);
        i++; // Also consume the rest step
      }
      
      if (!exerciseGroups.has(baseName)) {
        exerciseGroups.set(baseName, []);
        exerciseOrder.push(baseName);
      }
      exerciseGroups.get(baseName)!.push(setBlock);
      
      i++;
    } else {
      // Ignore standalone rest steps at the beginning of the list for circuit logic
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
 * Processes steps from an AI-generated plan to add set numbering for better UI grouping.
 * AI plans use repeated base exercise names for sets, which this function converts
 * to the "(Set X/Y)" format used by the manual Set Builder.
 * @param steps - The array of WorkoutStep from the AI.
 * @returns A new array of WorkoutStep with formatted names.
 */
export const processAndFormatAiSteps = (steps: WorkoutStep[]): WorkoutStep[] => {
    // 1. Count total sets for each unique exercise.
    const exerciseSetCounts = new Map<string, number>();
    for (const step of steps) {
        if (step.type === 'exercise') {
            exerciseSetCounts.set(step.name, (exerciseSetCounts.get(step.name) || 0) + 1);
        }
    }

    // 2. Iterate through the steps and rename them based on set counts.
    const formattedSteps: WorkoutStep[] = [];
    const currentSetCounters = new Map<string, number>();

    for (let i = 0; i < steps.length; i++) {
        const step = { ...steps[i] }; // Create a mutable copy.

        if (step.type === 'exercise') {
            const baseName = step.name; // Original name
            const totalSets = exerciseSetCounts.get(baseName) || 1;
            
            if (totalSets > 1) {
                const currentSet = (currentSetCounters.get(baseName) || 0) + 1;
                currentSetCounters.set(baseName, currentSet);
                
                step.name = `${baseName} (Set ${currentSet}/${totalSets})`;
            }
            formattedSteps.push(step);

        } else if (step.type === 'rest') {
            const prevStep = i > 0 ? steps[i - 1] : null;
            
            // If the previous step was an exercise, format the rest name to match its set count.
            // This works for both linear and circuit style plans.
            if (prevStep && prevStep.type === 'exercise') {
                const prevStepBaseName = prevStep.name; // Use the original name from the input array
                const totalSets = exerciseSetCounts.get(prevStepBaseName) || 1;
                
                if (totalSets > 1) {
                    const currentSetOfPrev = currentSetCounters.get(prevStepBaseName) || 0;
                    // Format the rest if it's not after the absolute final set of that exercise
                    if (currentSetOfPrev < totalSets) {
                        step.name = `Rest (סט ${currentSetOfPrev}/${totalSets})`;
                    }
                }
            }
            formattedSteps.push(step);
        } else {
            // For any other step types (though none exist yet).
            formattedSteps.push(step);
        }
    }

    return formattedSteps;
};

/**
 * Compares two workout steps for deep equality, ignoring their IDs.
 * @param step1 The first workout step.
 * @param step2 The second workout step.
 * @returns True if the steps are functionally identical.
 */
const areStepsEqual = (step1: Omit<WorkoutStep, 'id'>, step2: Omit<WorkoutStep, 'id'>): boolean => {
    return (
        step1.name === step2.name &&
        step1.type === step2.type &&
        step1.isRepBased === step2.isRepBased &&
        step1.duration === step2.duration &&
        step1.reps === step2.reps
    );
};

/**
 * Compares two workout plans for deep equality, ignoring properties like id, color, order.
 * It focuses on the functional content of the plan: name, mode, and steps.
 * @param plan1 The first workout plan.
 * @param plan2 The second workout plan.
 * @returns True if the plans are functionally identical.
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