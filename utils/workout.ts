import { WorkoutStep } from '../types';

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
            const totalSets = exerciseSetCounts.get(step.name) || 1;
            
            if (totalSets > 1) {
                const currentSet = (currentSetCounters.get(step.name) || 0) + 1;
                currentSetCounters.set(step.name, currentSet);
                
                step.name = `${step.name} (Set ${currentSet}/${totalSets})`;
            }
            formattedSteps.push(step);

        } else if (step.type === 'rest') {
            const prevStep = i > 0 ? steps[i - 1] : null;
            const nextStep = i + 1 < steps.length ? steps[i + 1] : null;

            // An inter-set rest is one that's between two identical exercises.
            if (prevStep && prevStep.type === 'exercise' && 
                nextStep && nextStep.type === 'exercise' && 
                prevStep.name === nextStep.name) {
                
                const baseName = prevStep.name;
                const totalSets = exerciseSetCounts.get(baseName) || 1;
                const currentSet = currentSetCounters.get(baseName) || 0;

                if (currentSet > 0 && totalSets > 1) {
                    // Use a standard name for rests between sets for consistency.
                    step.name = `Rest (סט ${currentSet}/${totalSets})`;
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