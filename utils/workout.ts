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
