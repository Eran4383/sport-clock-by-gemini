

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkout } from '../contexts/WorkoutContext';
import { WorkoutPlan, WorkoutStep } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { HoverNumberInput } from './HoverNumberInput';
import { getExerciseInfo, ExerciseInfo } from '../services/geminiService';
import { WorkoutLog } from './WorkoutLog';

const ExerciseInfoModal: React.FC<{
  exerciseName: string;
  onClose: () => void;
}> = ({ exerciseName, onClose }) => {
  const [info, setInfo] = useState<ExerciseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'howto' | 'details'>('howto');

  useEffect(() => {
    const fetchInfo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getExerciseInfo(exerciseName);
        setInfo(result);
        // Check if the primary instruction is an error message
        if (result.instructions.toLowerCase().includes("error") || result.instructions.toLowerCase().includes("failed") || result.instructions.includes("api key")) {
            setError(result.generalInfo);
        }
      } catch (e) {
        setError("Failed to fetch or parse exercise information.");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInfo();
  }, [exerciseName]);

  const isHebrew = useMemo(() => info?.language === 'he', [info]);
  
  // Helper to parse instruction text into a list
  const parsedInstructions = useMemo(() => {
    if (!info?.instructions) return [];
    // Split by newline, then filter out empty lines, then trim leading numbers/bullets
    return info.instructions
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.trim().replace(/^\d+\.\s*/, '')); // remove "1. "
  }, [info?.instructions]);

  const youtubeSearchQuery = useMemo(() => encodeURIComponent(`${getBaseExerciseName(exerciseName)} exercise tutorial`), [exerciseName]);
  const embedUrl = `https://www.youtube.com/embed?listType=search&list=${youtubeSearchQuery}`;

  const TabButton: React.FC<{
    label: string;
    isActive: boolean;
    onClick: () => void;
  }> = ({ label, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors focus:outline-none ${
        isActive
          ? 'bg-gray-700 text-white'
          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" onClick={onClose} aria-modal="true" role="dialog">
      <div 
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
        dir={isHebrew ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="relative flex justify-center items-center p-4 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white break-all text-center mx-10">{exerciseName}</h3>
          <button onClick={onClose} className="absolute p-1 rounded-full hover:bg-gray-700 top-3 right-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-grow overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-gray-300 animate-pulse">Loading Exercise Info...</p>
            </div>
          ) : error ? (
            <p className="text-red-400">{error}</p>
          ) : info ? (
            <>
              {/* Tabs */}
              <div className="relative z-10 flex border-b border-gray-700 mb-4">
                <TabButton label={isHebrew ? "הדרכה" : "How-To"} isActive={activeTab === 'howto'} onClick={() => setActiveTab('howto')} />
                <TabButton label={isHebrew ? "פרטים" : "Details"} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
              </div>

              {/* Tab Content */}
              <div className="flex-grow overflow-y-auto pr-2 min-h-0">
                {activeTab === 'howto' && (
                  <div className="space-y-4">
                    {/* YouTube Embed */}
                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                       <iframe
                            className="w-full h-full"
                            src={embedUrl}
                            title={`YouTube video player for ${exerciseName}`}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                    {/* Instructions List */}
                    <h4 className="font-semibold text-lg text-white mt-4">{isHebrew ? "הוראות" : "Instructions"}</h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-200">
                        {parsedInstructions.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  </div>
                )}
                
                {activeTab === 'details' && (
                  <div className="space-y-6">
                    {info.tips && info.tips.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-lg text-white mb-2">{isHebrew ? "דגשים" : "Tips"}</h4>
                        <ul className="list-disc list-inside space-y-1 text-gray-300">
                          {info.tips.map((tip, index) => <li key={index}>{tip}</li>)}
                        </ul>
                      </div>
                    )}
                    {info.generalInfo && (
                      <div>
                        <h4 className="font-semibold text-lg text-white mb-2">{isHebrew ? "מידע כללי" : "General Info"}</h4>
                        <p className="text-gray-300 whitespace-pre-wrap">{info.generalInfo}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};


/**
 * Extracts the base name of an exercise, stripping set/rep counts.
 * e.g., "Push-ups (Set 1/3)" -> "Push-ups"
 */
const getBaseExerciseName = (name: string): string => {
  const match = name.match(/(.+?)\s*\((Set|Rep|סט)\s*\d+/i);
  return match ? match[1].trim() : name;
};

/**
 * Re-orders a list of workout steps from a linear to a circuit structure.
 * This is a copy of the function in WorkoutContext for display purposes.
 */
const generateCircuitSteps = (steps: WorkoutStep[]): WorkoutStep[] => {
  if (!steps || steps.length === 0) return [];

  const exerciseGroups = new Map<string, WorkoutStep[][]>();
  const exerciseOrder: string[] = [];

  let i = 0;
  while (i < steps.length) {
    const currentStep = steps[i];
    if (currentStep.type === 'exercise') {
      const baseName = getBaseExerciseName(currentStep.name);
      
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

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6', '#14b8a6', '#f97316'];

const useExerciseColorMap = (steps: WorkoutStep[]): Map<string, string> => {
  return useMemo(() => {
    const map = new Map<string, string>();
    const uniqueExercises: string[] = [];
    
    steps.forEach(step => {
      if (step.type === 'exercise') {
        const baseName = getBaseExerciseName(step.name);
        if (!uniqueExercises.includes(baseName)) {
          uniqueExercises.push(baseName);
        }
      }
    });
    
    uniqueExercises.forEach((name, index) => {
      map.set(name, COLORS[index % COLORS.length]);
    });

    return map;
  }, [steps]);
};

const PlanListItem: React.FC<{
  plan: WorkoutPlan;
  onSelectPlan: (plan: WorkoutPlan) => void;
  onInitiateDelete: (planId: string) => void;
  onInspectExercise: (exerciseName: string) => void;
  isSelected: boolean;
  onToggleSelection: (planId: string) => void;
  isDraggable: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
  isDragTarget: boolean;
  isNewlyImported: boolean;
  index: number;
}> = ({ plan, onSelectPlan, onInitiateDelete, onInspectExercise, isSelected, onToggleSelection, isDraggable, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, isDragTarget, isNewlyImported, index }) => {
  const { 
      activeWorkout,
      currentStep,
      isCountdownPaused,
      startWorkout, 
      stopWorkout, 
      pauseStepCountdown, 
      resumeStepCountdown, 
      restartCurrentStep, 
      savePlan,
  } = useWorkout();
  const [isExpanded, setIsExpanded] = useState(false);
  const exerciseColorMap = useExerciseColorMap(plan.steps);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const showConfirmation = (message: string) => {
      setConfirmationMessage(message);
      setTimeout(() => setConfirmationMessage(null), 2000);
  };

  const isActive = activeWorkout?.sourcePlanIds.includes(plan.id) ?? false;

  useEffect(() => {
    // Automatically expand the active workout plan
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);

  const displayedSteps = useMemo(() => {
    if (plan.executionMode === 'circuit') {
        return generateCircuitSteps(plan.steps);
    }
    return plan.steps;
  }, [plan.steps, plan.executionMode]);

  const getTotalDuration = (plan: WorkoutPlan) => {
    const totalSeconds = plan.steps.reduce((sum, step) => sum + (step.isRepBased ? 0 : step.duration), 0);
    if (isNaN(totalSeconds)) return '00:00';
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };
  
  const handleToggleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode = plan.executionMode === 'circuit' ? 'linear' : 'circuit';
    savePlan({ ...plan, executionMode: newMode });
  };

  const handleStop = (e: React.MouseEvent) => {
      e.stopPropagation();
      stopWorkout({ completed: false });
  }
  
  const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectPlan(plan);
  };
  
  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        const planJson = JSON.stringify(plan, null, 2);
        const blob = new Blob([planJson], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Sanitize file name
        const fileName = `${plan.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to export plan:", error);
        alert("Could not export the plan.");
    }
  };

  const handleCopyJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        const planJson = JSON.stringify(plan, null, 2); // Pretty print
        navigator.clipboard.writeText(planJson).then(() => {
            showConfirmation("JSON Copied!");
        });
    } catch (error) {
        console.error("Failed to copy JSON:", error);
        alert("Could not copy JSON.");
    }
  };
  
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        const planJson = JSON.stringify(plan);
        // Use TextEncoder to correctly handle UTF-8 characters for btoa
        const encoder = new TextEncoder();
        const data = encoder.encode(planJson);
        const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
        const base64Data = btoa(binaryString);
        
        const url = new URL(window.location.href);
        url.hash = `import=${base64Data}`;
        url.search = '';
        
        const shareableLink = url.toString();
        
        navigator.clipboard.writeText(shareableLink).then(() => {
            showConfirmation("Link Copied!");
        });
    } catch (error) {
        console.error("Failed to create share link:", error);
        alert("Could not create a share link.");
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInitiateDelete(plan.id);
  };

  const handleTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCountdownPaused) {
      resumeStepCountdown();
    } else {
      pauseStepCountdown();
    }
  };
  
  const handleRestart = (e: React.MouseEvent) => {
      e.stopPropagation();
      restartCurrentStep();
  }
  
  const handleToggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    savePlan({ ...plan, isLocked: !plan.isLocked });
  };

  const dragStyles = isDragTarget ? 'border-2 border-dashed border-blue-400' : 'border-2 border-transparent';
  const animationClass = isNewlyImported ? 'animate-flash' : '';

  return (
    <div 
        className={`bg-gray-700/50 rounded-lg transition-all duration-300 ${isDraggable ? 'cursor-grab' : ''} ${dragStyles} ${animationClass}`}
        style={{ borderLeft: `5px solid ${plan.color || 'transparent'}` }}
        draggable={isDraggable}
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onDragEnd={onDragEnd}
        onDragLeave={onDragLeave}
    >
      <div className="p-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0 flex items-start gap-3">
            {!activeWorkout && (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelection(plan.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="form-checkbox h-5 w-5 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 shrink-0 mt-1"
                    aria-label={`Select plan ${plan.name}`}
                />
            )}
            <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-white break-words" title={plan.name}>{plan.name}</h3>
                <p className="text-sm text-gray-400">
                  {plan.steps.length} steps, Total: {getTotalDuration(plan)}
                </p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-1 items-center mt-3 justify-end relative">
             {confirmationMessage && <span className="absolute -top-8 right-0 bg-gray-900 text-white text-xs px-2 py-1 rounded">{confirmationMessage}</span>}
             <button
                onClick={handleToggleLock}
                className={`p-2 hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${plan.isLocked ? 'text-yellow-400' : 'text-gray-300'}`}
                aria-label={plan.isLocked ? "Un-lock plan" : "Lock plan"}
                title={plan.isLocked ? "תוכנית נעולה (לחץ לפתיחה)" : "נעל תוכנית למניעת מחיקה"}
                disabled={!!activeWorkout}
            >
                {plan.isLocked ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 9a3 3 0 100-6 3 3 0 000 6z" /></svg>
                )}
            </button>
            <button
                onClick={handleToggleMode}
                className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={plan.executionMode === 'circuit' ? "Switch to Linear Mode" : "Switch to Circuit Mode"}
                title={plan.executionMode === 'circuit' ? "Circuit Mode" : "Linear Mode"}
                disabled={!!activeWorkout}
            >
                {plan.executionMode === 'circuit' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 15a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                )}
            </button>
            <button
                onClick={handleCopyJson}
                className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Copy plan as JSON"
                title="Copy Plan as JSON"
                disabled={!!activeWorkout}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
            <button
              onClick={handleShare}
              className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Share plan via link"
              title="Share Plan"
              disabled={!!activeWorkout}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
            </button>
            <button
              onClick={handleExport}
              className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Export plan to file"
              title="Export Plan"
              disabled={!!activeWorkout}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
            <button
              onClick={handleEdit}
              className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Edit plan"
              title="Edit Plan"
              disabled={!!activeWorkout || plan.isLocked}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-500/10 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete plan"
              title="Delete Plan"
              disabled={!!activeWorkout || plan.isLocked}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
            </button>
        </div>
        
         {isActive ? (
             <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={handleStop} className="py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors text-sm">Stop</button>
                <button onClick={handleTogglePause} className="py-2 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-600 transition-colors text-sm">{isCountdownPaused ? 'Resume' : 'Pause'}</button>
                <button onClick={handleRestart} className="py-2 bg-gray-500 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors text-sm" title="Restart current step">Restart</button>
             </div>
         ) : (
            <button 
                onClick={(e) => { e.stopPropagation(); startWorkout([plan.id]); }}
                className="w-full mt-3 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                disabled={!!activeWorkout}
            >
                Start Workout
            </button>
         )}
      </div>
      {isExpanded && (
        <div className="border-t border-gray-600/50 px-3 pb-3 pt-2">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Steps:</h4>
            <ol className="text-gray-300 space-y-1">
                {displayedSteps.map((step, index) => {
                    const isCurrent = isActive && step.id === currentStep?.id;
                    const color = step.type === 'exercise' ? exerciseColorMap.get(getBaseExerciseName(step.name)) : 'transparent';
                    
                    return (
                        <li 
                          key={`${step.id}-${index}`} 
                          className={`flex items-center gap-2 transition-all duration-200 rounded p-1 -m-1 ${isCurrent ? 'bg-blue-500/20 font-bold' : 'hover:bg-gray-600/50'}`}
                          title={step.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (step.type === 'exercise') {
                                onInspectExercise(getBaseExerciseName(step.name));
                            }
                          }}
                        >
                            <span className="w-1.5 h-4 rounded" style={{ backgroundColor: color }}></span>
                            <span className="truncate">{step.name} - <span className="text-gray-400 font-normal">{step.isRepBased ? `${step.reps} reps` : `${step.duration}s`}</span></span>
                        </li>
                    )
                })}
            </ol>
        </div>
      )}
    </div>
  );
};

const ImportTextModal: React.FC<{ onImport: (text: string) => void; onCancel: () => void; }> = ({ onImport, onCancel }) => {
    const [jsonText, setJsonText] = useState('');
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        // Auto-focus the textarea when the modal appears
        textAreaRef.current?.focus();
    }, []);
    
    const handleImportClick = () => {
        if (jsonText.trim()) {
            onImport(jsonText);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={onCancel} aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white">Import Plan from Text</h3>
                <p className="text-gray-300 mt-2">Paste the JSON content of a workout plan below.</p>
                <textarea
                    ref={textAreaRef}
                    value={jsonText}
                    onChange={e => setJsonText(e.target.value)}
                    className="w-full h-48 mt-4 p-2 bg-gray-900 text-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 ring-blue-500"
                    placeholder='{ "id": "...", "name": "...", "steps": [...] }'
                />
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onCancel} className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold">Cancel</button>
                    <button onClick={handleImportClick} className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold">Import</button>
                </div>
            </div>
        </div>
    );
};

const PlanList: React.FC<{
  onSelectPlan: (plan: WorkoutPlan) => void;
  onCreateNew: () => void;
  onInitiateDelete: (planId: string) => void;
  onShowLog: () => void;
  onInspectExercise: (exerciseName: string) => void;
  isPinned: boolean;
  onTogglePin: () => void;
}> = ({ onSelectPlan, onCreateNew, onInitiateDelete, onShowLog, onInspectExercise, isPinned, onTogglePin }) => {
  const { plans, reorderPlans, startWorkout, importPlan, activeWorkout, recentlyImportedPlanId } = useWorkout();
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const dragItemIndex = useRef<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportTextVisible, setIsImportTextVisible] = useState(false);

  const handleToggleSelection = (planId: string) => {
    // FIX: Changed `id` to `planId` to correctly add a new plan to the selection. `id` was undefined in this context.
    setSelectedPlanIds(prev =>
      prev.includes(planId) ? prev.filter(id => id !== planId) : [...prev, planId]
    );
  };
  
  const handleStartSelected = () => {
      startWorkout(selectedPlanIds);
      setSelectedPlanIds([]);
  };
  
  const handleImportClick = () => {
      fileInputRef.current?.click();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                handleJsonImport(text, 'file');
            } catch (error) {
                console.error("Failed to read file:", error);
                alert(`Could not read the file: ${file.name}`);
            }
        };
        reader.readAsText(file);
    });

    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleJsonImport = (jsonText: string, source: string) => {
    try {
        const importedPlan = JSON.parse(jsonText);
        // Basic validation
        if (importedPlan && typeof importedPlan.name === 'string' && Array.isArray(importedPlan.steps)) {
            importPlan(importedPlan, source);
            setIsImportTextVisible(false); // Close modal on success
        } else {
            throw new Error("Invalid plan structure.");
        }
    } catch (error) {
        console.error("Failed to import plan:", error);
        alert("Could not import plan. The file may be corrupted or in the wrong format.");
    }
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    dragItemIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (index !== dragTargetIndex) {
      setDragTargetIndex(index);
    }
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragItemIndex.current === null || dragItemIndex.current === index) {
      return;
    }
    const draggedItem = plans[dragItemIndex.current];
    const newPlans = [...plans];
    newPlans.splice(dragItemIndex.current, 1);
    newPlans.splice(index, 0, draggedItem);
    reorderPlans(newPlans);
    dragItemIndex.current = null;
    setDragTargetIndex(null);
  };

  const onDragEnd = () => {
    dragItemIndex.current = null;
    setDragTargetIndex(null);
  };
  
  const onDragLeave = () => {
    setDragTargetIndex(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Workout Plans</h2>
        <div className="flex items-center gap-2">
            <button
                onClick={onShowLog}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="View Workout Log"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
            </button>
            <button
                onClick={() => setIsImportTextVisible(true)}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="Import Plan from Text"
                disabled={!!activeWorkout}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clipRule="evenodd" /></svg>
            </button>
            <button
                onClick={handleImportClick}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="Import Plan from File(s)"
                disabled={!!activeWorkout}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </button>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json,application/json"
                className="hidden"
                multiple
            />

            <button 
                onClick={onTogglePin}
                className={`p-2 rounded-full hover:bg-gray-500/30 ${isPinned ? 'text-blue-400' : 'text-gray-400'}`}
                title={isPinned ? 'Unpin Menu' : 'Pin Menu (Keep open during workout)'}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" transform="rotate(45 10 10)" />
                  {isPinned && <path d="M10 18a8 8 0 100-16 8 8 0 000 16z" opacity="0.1" />}
                </svg>
            </button>
            <button 
              onClick={onCreateNew}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
              disabled={!!activeWorkout}
            >
              + Create New
            </button>
        </div>
      </div>

      {isImportTextVisible && <ImportTextModal onImport={(text) => handleJsonImport(text, 'text')} onCancel={() => setIsImportTextVisible(false)} />}

      {selectedPlanIds.length > 0 && !activeWorkout && (
          <button
            onClick={handleStartSelected}
            className="w-full mb-4 py-2.5 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors"
          >
              Start Selected ({selectedPlanIds.length})
          </button>
      )}

      <div className="space-y-4">
        {plans.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No workout plans yet. Create one to get started!</p>
        ) : (
          plans.map((plan, index) => (
            <PlanListItem 
                key={plan.id} 
                plan={plan} 
                index={index}
                onSelectPlan={onSelectPlan}
                onInitiateDelete={onInitiateDelete}
                onInspectExercise={onInspectExercise}
                isSelected={selectedPlanIds.includes(plan.id)}
                onToggleSelection={handleToggleSelection}
                isDraggable={!activeWorkout}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onDragLeave={onDragLeave}
                isDragTarget={dragTargetIndex === index}
                isNewlyImported={plan.id === recentlyImportedPlanId}
            />
          ))
        )}
      </div>
    </div>
  );
};

const SetBuilder: React.FC<{ onAddSets: (steps: WorkoutStep[]) => void }> = ({ onAddSets }) => {
    const [name, setName] = useState('Exercise');
    const [isRepBased, setIsRepBased] = useState(false);
    const [duration, setDuration] = useState(40);
    const [reps, setReps] = useState(10);
    const [sets, setSets] = useState(3);
    const [rest, setRest] = useState(20);
    
    const handleAdd = () => {
        const newSteps: WorkoutStep[] = [];
        for (let i = 0; i < sets; i++) {
            const exerciseStep: WorkoutStep = {
                id: `${Date.now()}-set-${i}-ex`,
                name: `${name} (Set ${i + 1}/${sets})`,
                type: 'exercise',
                isRepBased,
                duration: isRepBased ? 0 : duration,
                reps: isRepBased ? reps : 0,
            };
            newSteps.push(exerciseStep);
            
            if (rest > 0 && i < sets - 1) { // No rest after the last set
                const restStep: WorkoutStep = {
                    id: `${Date.now()}-set-${i}-rest`,
                    name: `Rest (סט ${i + 1}/${sets})`,
                    type: 'rest',
                    isRepBased: false,
                    duration: rest,
                    reps: 0,
                };
                newSteps.push(restStep);
            }
        }
        onAddSets(newSteps);
    };
    
    const commonInputClass = "w-full bg-gray-600 p-2 rounded-md focus:outline-none focus:ring-1 ring-blue-500 text-center";

    return (
        <div className="bg-gray-700/50 p-3 rounded-lg space-y-3 mt-4">
            <h4 className="text-md font-semibold text-center text-gray-300">Set Builder</h4>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Exercise Name" title="Name of the exercise for this set" className={`${commonInputClass} text-left`} />
            <div className="flex gap-2">
                <button onClick={() => setIsRepBased(false)} className={`flex-1 py-1 rounded ${!isRepBased ? 'bg-blue-500' : 'bg-gray-600'}`}>Time</button>
                <button onClick={() => setIsRepBased(true)} className={`flex-1 py-1 rounded ${isRepBased ? 'bg-blue-500' : 'bg-gray-600'}`}>Reps</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
                {isRepBased ? (
                     <HoverNumberInput value={reps} onChange={setReps} min={1} title="Number of repetitions per set" className={commonInputClass} />
                ) : (
                    <HoverNumberInput value={duration} onChange={setDuration} min={1} title="Duration in seconds per set" className={commonInputClass} />
                )}
                <HoverNumberInput value={sets} onChange={setSets} min={1} title="Total number of sets to perform" className={commonInputClass} placeholder="Sets"/>
            </div>
            <HoverNumberInput value={rest} onChange={setRest} min={0} title="Rest time in seconds between sets" className={commonInputClass} placeholder="Rest between sets (s)" />
            <button onClick={handleAdd} className="w-full py-2 bg-blue-500/80 hover:bg-blue-500 rounded-lg">+ Add to Plan</button>
        </div>
    );
};

const EditableStepItem: React.FC<{
    step: WorkoutStep;
    index: number;
    updateStep: (index: number, newStep: Partial<WorkoutStep>) => void;
    removeStep: (index: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
    color?: string;
    settings: ReturnType<typeof useSettings>['settings'];
    updateSettings: ReturnType<typeof useSettings>['updateSettings'];
}> = ({ step, index, updateStep, removeStep, isExpanded, onToggleExpand, color, settings, updateSettings }) => {
    
    const PinButton: React.FC<{onClick: () => void; isActive: boolean; title: string}> = ({ onClick, isActive, title }) => (
        <button onClick={onClick} title={title} className={`p-1 rounded-full ${isActive ? 'text-blue-400' : 'text-gray-500 hover:text-white'}`}>
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 9.586V4a1 1 0 011-1z" clipRule="evenodd" /><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
        </button>
    );

    const stepBgClass = step.type === 'rest' ? 'bg-gray-700/80' : 'bg-gray-700/50';

    return (
        <div className={`${stepBgClass} rounded-lg relative`} style={{ borderLeft: `3px solid ${color || 'transparent'}` }}>
            {!isExpanded && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeStep(index);
                    }}
                    className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-full z-10"
                    title="Remove step"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}
            <div className="p-3 flex items-center gap-2 cursor-pointer" onClick={onToggleExpand}>
                <span className="text-gray-400 font-bold">#{index + 1}</span>
                <div className="flex-grow">
                    <p className="font-semibold text-white truncate" title={step.name}>{step.name}</p>
                    <p className="text-sm text-gray-400">
                        {step.type === 'rest' ? 'Rest' : (step.isRepBased ? `${step.reps} reps` : `${step.duration}s`)}
                    </p>
                </div>
                <button className="p-2 text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
            {isExpanded && (
                <div className="p-3 border-t border-gray-600/50 space-y-3">
                   <div className="flex items-center gap-2">
                       <input 
                           type="text"
                           value={step.name}
                           onChange={e => updateStep(index, { name: e.target.value })}
                           className="flex-grow bg-gray-600 p-2 rounded-md focus:outline-none focus:ring-1 ring-blue-500"
                           title="Name of this step (e.g., Push-ups)"
                       />
                       <button onClick={() => removeStep(index)} className="p-2 text-gray-400 hover:text-red-500" title="Remove step">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                       </button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3">
                       <div>
                           <label className="text-sm text-gray-400">Type</label>
                           <div className="flex rounded-md border border-gray-500 overflow-hidden mt-1">
                               <button onClick={() => updateStep(index, { type: 'exercise' })} className={`flex-1 px-2 py-1 text-sm ${step.type === 'exercise' ? 'bg-blue-500' : 'bg-transparent'}`}>Exercise</button>
                               <button onClick={() => updateStep(index, { type: 'rest' })} className={`flex-1 px-2 py-1 text-sm ${step.type === 'rest' ? 'bg-blue-500' : 'bg-transparent'}`}>Rest</button>
                           </div>
                       </div>
                        {step.type === 'exercise' && (
                            <div>
                                <label className="text-sm text-gray-400">Mode</label>
                                <div className="flex rounded-md border border-gray-500 overflow-hidden mt-1">
                                    <button onClick={() => updateStep(index, { isRepBased: false })} className={`flex-1 px-2 py-1 text-sm ${!step.isRepBased ? 'bg-blue-500' : 'bg-transparent'}`}>Time</button>
                                    <button onClick={() => updateStep(index, { isRepBased: true })} className={`flex-1 px-2 py-1 text-sm ${step.isRepBased ? 'bg-blue-500' : 'bg-transparent'}`}>Reps</button>
                                </div>
                            </div>
                        )}
                   </div>
                   
                   <div>
                        <label className="text-sm text-gray-400">{step.isRepBased ? 'Reps' : 'Duration (s)'}</label>
                        {step.isRepBased ? (
                            <HoverNumberInput min={1} value={step.reps} onChange={newValue => updateStep(index, { reps: newValue })} title="Number of repetitions" className="w-full mt-1 bg-gray-600 text-center p-2 rounded-md" />
                        ) : (
                            <div className="flex items-center gap-2 mt-1">
                                <HoverNumberInput min={1} value={step.duration} onChange={newValue => updateStep(index, { duration: newValue })} title={step.type === 'exercise' ? 'Exercise duration in seconds' : 'Rest duration in seconds'} className="w-full bg-gray-600 text-center p-2 rounded-md" />
                                <PinButton 
                                    onClick={() => updateSettings(step.type === 'exercise' ? { defaultExerciseDuration: step.duration } : { defaultRestDuration: step.duration })}
                                    isActive={step.type === 'exercise' ? settings.defaultExerciseDuration === step.duration : settings.defaultRestDuration === step.duration}
                                    title="Set as default time for new steps"
                                />
                            </div>
                        )}
                   </div>
                </div>
            )}
        </div>
    );
};

const EditableSetGroup: React.FC<{
  steps: WorkoutStep[];
  startIndex: number;
  updateStep: (index: number, newStep: Partial<WorkoutStep>) => void;
  removeStep: (index: number) => void;
  removeSetGroup: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  color?: string;
  settings: ReturnType<typeof useSettings>['settings'];
  updateSettings: ReturnType<typeof useSettings>['updateSettings'];
  expandedSteps: Record<string, boolean>;
  onToggleStepExpand: (stepId: string) => void;
}> = ({ steps, startIndex, updateStep, removeStep, removeSetGroup, isExpanded, onToggleExpand, color, settings, updateSettings, expandedSteps, onToggleStepExpand }) => {
    
    if (steps.length === 0) return null;

    const baseName = getBaseExerciseName(steps[0].name);
    const numSets = steps.filter(s => s.type === 'exercise').length;
    
    return (
        <div className="bg-gray-900/40 rounded-lg relative" style={{ borderLeft: `3px solid ${color || 'transparent'}` }}>
             {!isExpanded && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeSetGroup();
                    }}
                    className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-full z-10"
                    title={`Delete all ${numSets} sets of ${baseName}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}
            <div className="p-3 flex items-center gap-2 cursor-pointer" onClick={onToggleExpand}>
                <div className="flex-grow">
                    <p className="font-semibold text-white truncate" title={`${baseName} (Set)`}>{baseName}</p>
                    <p className="text-sm text-gray-400">{numSets} sets</p>
                </div>
                <button className="p-2 text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
            {isExpanded && (
                <div className="p-3 border-t border-gray-600/50 space-y-2">
                    {steps.map((step, localIndex) => (
                        <EditableStepItem
                            key={step.id}
                            step={step}
                            index={startIndex + localIndex}
                            updateStep={updateStep}
                            removeStep={removeStep}
                            isExpanded={!!expandedSteps[step.id]}
                            onToggleExpand={() => onToggleStepExpand(step.id)}
                            color="transparent" // No individual color border
                            settings={settings}
                            updateSettings={updateSettings}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// This function groups steps into individual steps or sets of steps.
const groupSteps = (steps: WorkoutStep[]): (WorkoutStep | WorkoutStep[])[] => {
    const grouped: (WorkoutStep | WorkoutStep[])[] = [];
    let i = 0;
    while (i < steps.length) {
        const step = steps[i];
        const match = step.name.match(/(.+?)\s*\((Set|סט)\s*(\d+)\/(\d+)\)/i);
        
        if (match && parseInt(match[3], 10) === 1) {
            // This looks like the start of a set
            const baseName = match[1].trim();
            const totalSets = parseInt(match[4], 10);
            
            const potentialSet: WorkoutStep[] = [];
            let currentSetNumber = 1;
            let j = i;

            while (j < steps.length && currentSetNumber <= totalSets) {
                const exerciseStep = steps[j];
                const exerciseMatch = exerciseStep.name.match(new RegExp(`^${baseName}\\s*\\((Set|סט)\\s*(\\d+)\\/(\\d+)\\)$`, 'i'));

                if (exerciseStep.type === 'exercise' && exerciseMatch && parseInt(exerciseMatch[2], 10) === currentSetNumber && parseInt(exerciseMatch[3], 10) === totalSets) {
                    potentialSet.push(exerciseStep);
                    j++;

                    if (j < steps.length && steps[j].type === 'rest' && currentSetNumber < totalSets) {
                        potentialSet.push(steps[j]);
                        j++;
                    }
                    currentSetNumber++;
                } else {
                    break; // Pattern broken
                }
            }

            if (potentialSet.filter(s => s.type === 'exercise').length === totalSets) {
                // The pattern is valid, we found a full set
                grouped.push(potentialSet);
                i = j; // Move the main index past the processed set
                continue;
            }
        }

        // If it's not a set or the pattern broke, add the step individually
        grouped.push(step);
        i++;
    }
    return grouped;
};

const PlanEditor: React.FC<{
  plan: WorkoutPlan | null;
  onBack: () => void;
}> = ({ plan, onBack }) => {
    const { savePlan } = useWorkout();
    const { settings, updateSettings } = useSettings();

    const [editedPlan, setEditedPlan] = useState<WorkoutPlan | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const exerciseColorMap = useExerciseColorMap(editedPlan?.steps || []);

    useEffect(() => {
        if (plan) {
            setEditedPlan(JSON.parse(JSON.stringify(plan)));
        } else {
            setEditedPlan({
                id: `new_${Date.now()}`,
                name: '',
                steps: [],
                executionMode: 'linear',
                color: '#808080',
            });
        }
        setExpandedGroups({}); // Collapse all on load
    }, [plan]);


    const handleSave = () => {
        if (!editedPlan || editedPlan.name.trim() === '' || editedPlan.steps.length === 0) {
            alert('Please provide a name and at least one step.');
            return;
        }
        
        const planToSave = { ...editedPlan };
        if (planToSave.id.startsWith('new_')) {
            planToSave.id = Date.now().toString();
        }

        savePlan(planToSave);
        onBack();
    };

    const toggleGroupExpansion = (groupId: string) => {
        setExpandedGroups(prev => ({...prev, [groupId]: !prev[groupId]}));
    };
    
    const updateStep = (index: number, newStep: Partial<WorkoutStep>) => {
        if (!editedPlan) return;
        const newSteps = [...editedPlan.steps];
        newSteps[index] = { ...newSteps[index], ...newStep };
        setEditedPlan(p => p ? { ...p, steps: newSteps } : null);
    };
    
    const addStep = (type: 'exercise' | 'rest') => {
      if (!editedPlan) return;

      const stepsToAdd: WorkoutStep[] = [];
      const lastStep = editedPlan.steps.length > 0 ? editedPlan.steps[editedPlan.steps.length - 1] : null;

      // If adding an exercise and the last step was also an exercise, add a rest step first.
      if (type === 'exercise' && lastStep && lastStep.type === 'exercise') {
          const restStep: WorkoutStep = {
              id: `${Date.now()}-rest`,
              type: 'rest',
              name: 'Rest',
              isRepBased: false,
              duration: settings.defaultRestDuration,
              reps: 0,
          };
          stepsToAdd.push(restStep);
      }

      const newStep: WorkoutStep = {
          id: `${Date.now()}-${type}`,
          type: type,
          name: type === 'exercise' ? 'Exercise' : 'Rest',
          isRepBased: false,
          duration: type === 'exercise' ? settings.defaultExerciseDuration : settings.defaultRestDuration,
          reps: 10,
      };
      stepsToAdd.push(newStep);

      setEditedPlan(p => p ? { ...p, steps: [...p.steps, ...stepsToAdd] } : null);
    };

    const renumberAllSets = (steps: WorkoutStep[]): WorkoutStep[] => {
        const setCounts = new Map<string, number>();
        steps.forEach(step => {
            if (step.type === 'exercise') {
                const baseName = getBaseExerciseName(step.name);
                if (baseName !== step.name) {
                    setCounts.set(baseName, (setCounts.get(baseName) || 0) + 1);
                }
            }
        });

        const setCounters = new Map<string, number>();
        return steps.map((step, idx) => {
            if (step.type === 'exercise') {
                const baseName = getBaseExerciseName(step.name);
                const total = setCounts.get(baseName);
                if (total) {
                    const currentCount = (setCounters.get(baseName) || 0) + 1;
                    setCounters.set(baseName, currentCount);
                    return { ...step, name: `${baseName} (Set ${currentCount}/${total})` };
                }
            }
            
            const restMatch = step.name.match(/^(Rest|מנוחה)\s*\((Set|סט)\s*\d+\/\d+\)/i);
            if (step.type === 'rest' && restMatch) {
                if (idx > 0) {
                    const prevStep = steps[idx - 1];
                    if (prevStep.type === 'exercise') {
                        const baseName = getBaseExerciseName(prevStep.name);
                        const total = setCounts.get(baseName);
                        const currentCount = setCounters.get(baseName);
                        if (total && currentCount) {
                             return { ...step, name: `Rest (סט ${currentCount}/${total})` };
                        }
                    }
                }
            }
            return step;
        });
    };

    const removeStep = (index: number) => {
        if (!editedPlan) return;

        const stepToRemove = editedPlan.steps[index];
        let numToRemove = 1;

        const isExerciseInSet = stepToRemove.type === 'exercise' && /\((Set|סט)\s*\d+\/\d+\)/i.test(stepToRemove.name);

        if (isExerciseInSet && index + 1 < editedPlan.steps.length) {
            const nextStep = editedPlan.steps[index + 1];
            if (nextStep.type === 'rest') {
                numToRemove = 2;
            }
        }
        
        const newSteps = editedPlan.steps.filter((_, i) => i < index || i >= (index + numToRemove));
        const finalSteps = renumberAllSets(newSteps);
        
        setEditedPlan(p => p ? { ...p, steps: finalSteps } : null);
    };

    const removeSetGroup = (startIndex: number, count: number) => {
        if (!editedPlan) return;

        const newSteps = editedPlan.steps.filter((_, i) => i < startIndex || i >= (startIndex + count));
        const finalSteps = renumberAllSets(newSteps);
        
        setEditedPlan(p => p ? { ...p, steps: finalSteps } : null);
    };


    const addStepsFromBuilder = (steps: WorkoutStep[]) => {
        if (!editedPlan || steps.length === 0) return;

        const newSteps = [...editedPlan.steps];
        const lastStep = newSteps.length > 0 ? newSteps[newSteps.length - 1] : null;
        const firstNewStep = steps[0];
        
        const groupId = `group-${steps[0].id}`; // Use first step's ID as group ID
        setExpandedGroups(prev => ({...prev, [groupId]: false })); // Add new set collapsed

        // If the last existing step was an exercise, and the first new step is also an exercise,
        // add a rest step in between.
        if (lastStep && lastStep.type === 'exercise' && firstNewStep.type === 'exercise') {
            const restStep: WorkoutStep = {
                id: `${Date.now()}-rest-builder`,
                type: 'rest',
                name: 'Rest',
                isRepBased: false,
                duration: settings.defaultRestDuration,
                reps: 0,
            };
            newSteps.push(restStep);
        }

        newSteps.push(...steps);

        setEditedPlan(p => p ? { ...p, steps: newSteps } : null);
    };

    if (!editedPlan) {
        return null;
    }
    
    const groupedRenderItems = groupSteps(editedPlan.steps);
    let stepIndexCounter = 0;

    return (
        <div>
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-500/30 mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="text-2xl font-bold text-white">{plan ? 'Edit Plan' : 'Create Plan'}</h2>
            </div>
            
            <div className="space-y-6">
                <input 
                    type="text"
                    placeholder="Workout Plan Name"
                    title="The name for your workout plan"
                    value={editedPlan.name}
                    onChange={e => setEditedPlan(p => p ? { ...p, name: e.target.value } : null)}
                    className="w-full bg-gray-600 text-white p-3 rounded-lg text-lg focus:outline-none focus:ring-2 ring-blue-500"
                />

                <div className="flex items-center gap-3 bg-gray-600 p-2 rounded-lg">
                    <label htmlFor="planColor" className="text-white font-semibold">Plan Color</label>
                    <input 
                        type="color"
                        id="planColor"
                        value={editedPlan.color || '#808080'}
                        onChange={e => setEditedPlan(p => p ? { ...p, color: e.target.value } : null)}
                        className="w-10 h-10 p-0 bg-transparent border-none rounded-md cursor-pointer"
                        title="Choose a color for this plan"
                    />
                </div>

                <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                   {groupedRenderItems.map((item, index) => {
                       if (Array.isArray(item)) {
                           // It's a set group
                           const startIndex = stepIndexCounter;
                           stepIndexCounter += item.length;
                           const groupId = `group-${item[0].id}`;
                           const color = exerciseColorMap.get(getBaseExerciseName(item[0].name));

                           return (
                               <EditableSetGroup
                                   key={groupId}
                                   steps={item}
                                   startIndex={startIndex}
                                   updateStep={updateStep}
                                   removeStep={removeStep}
                                   removeSetGroup={() => removeSetGroup(startIndex, item.length)}
                                   isExpanded={!!expandedGroups[groupId]}
                                   onToggleExpand={() => toggleGroupExpansion(groupId)}
                                   color={color}
                                   settings={settings}
                                   updateSettings={updateSettings}
                                   expandedSteps={expandedGroups}
                                   onToggleStepExpand={toggleGroupExpansion}
                               />
                           );
                       } else {
                           // It's a single step
                           const step = item;
                           const stepIndex = stepIndexCounter;
                           stepIndexCounter++;
                           const color = step.type === 'exercise' ? exerciseColorMap.get(getBaseExerciseName(step.name)) : undefined;
                           
                           return (
                               <EditableStepItem
                                   key={step.id}
                                   step={step}
                                   index={stepIndex}
                                   updateStep={updateStep}
                                   removeStep={removeStep}
                                   isExpanded={!!expandedGroups[step.id]}
                                   onToggleExpand={() => toggleGroupExpansion(step.id)}
                                   color={color}
                                   settings={settings}
                                   updateSettings={updateSettings}
                               />
                           );
                       }
                   })}
                </div>
                
                <div className="flex gap-4">
                    <button onClick={() => addStep('exercise')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500/80 rounded-lg">+ Add Exercise</button>
                    <button onClick={() => addStep('rest')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500/80 rounded-lg">+ Add Rest</button>
                </div>
                
                <SetBuilder onAddSets={addStepsFromBuilder} />

                <button onClick={handleSave} className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors text-lg">
                    Save Plan
                </button>
            </div>
        </div>
    );
};

const ConfirmDeleteModal: React.FC<{
  planName: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ planName, onConfirm, onCancel }) => (
    <div 
        className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center"
        onClick={onCancel}
        aria-modal="true"
        role="dialog"
    >
        <div 
            className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
        >
            <h3 className="text-xl font-bold text-white">Confirm Deletion</h3>
            <p className="text-gray-300 mt-2">Are you sure you want to delete the plan "{planName}"?</p>
            <div className="mt-6 flex justify-end gap-4">
                <button 
                    onClick={onCancel}
                    className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold"
                >
                    Cancel
                </button>
                <button 
                    onClick={onConfirm}
                    className="px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700 font-semibold"
                >
                    Delete
                </button>
            </div>
        </div>
    </div>
);


export const WorkoutMenu: React.FC<{ isOpen: boolean; setIsOpen: (open: boolean) => void; }> = ({ isOpen, setIsOpen }) => {
  const [isPinned, setIsPinned] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [view, setView] = useState<'list' | 'editor' | 'log'>('list');
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [inspectingExercise, setInspectingExercise] = useState<string | null>(null);
  const { activeWorkout, plans, deletePlan } = useWorkout();

  const planToDelete = useMemo(() => {
    return plans.find(p => p.id === confirmDeletePlanId) || null;
  }, [confirmDeletePlanId, plans]);

  // Touch handlers for swipe-to-close gesture
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
      touchEndX.current = null;
      touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
      touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
      if (!touchStartX.current || !touchEndX.current) return;
      const distance = touchEndX.current - touchStartX.current;
      // Swipe left to close, respecting the pin
      if (distance < -minSwipeDistance && !isPinned) {
          setIsOpen(false);
      }
      touchStartX.current = null;
      touchEndX.current = null;
  };

  useEffect(() => {
    if (!isOpen) {
        setIsPinned(false); // Unpin when manually closed
        setTimeout(() => {
             setView('list');
             setEditingPlan(null);
        }, 500); 
    }
  }, [isOpen]);
  
  const handleCreateNew = () => {
      setEditingPlan(null);
      setView('editor');
  };

  const handleSelectPlan = (plan: WorkoutPlan) => {
      setEditingPlan(plan);
      setView('editor');
  };

  const handleBack = () => {
      setView('list');
      setEditingPlan(null);
  };
  
  const handleConfirmDelete = () => {
    if (confirmDeletePlanId) {
        deletePlan(confirmDeletePlanId);
        setConfirmDeletePlanId(null);
    }
  };

  useEffect(() => {
      if(activeWorkout && !isPinned) {
          setIsOpen(false);
      }
  }, [activeWorkout, isPinned]);


  return (
    <>
      <div className="absolute top-4 left-4 menu-container group">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          aria-label="Open workout planner"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-opacity duration-1000 focus:outline-none opacity-0 group-hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => !isPinned && setIsOpen(false)}
        ></div>
      )}

      {planToDelete && (
          <ConfirmDeleteModal 
              planName={planToDelete.name}
              onConfirm={handleConfirmDelete}
              onCancel={() => setConfirmDeletePlanId(null)}
          />
      )}

      {inspectingExercise && (
        <ExerciseInfoModal 
            exerciseName={inspectingExercise}
            onClose={() => setInspectingExercise(null)}
        />
      )}

      <div 
        className={`fixed top-0 left-0 h-full w-full max-w-sm bg-gray-800/80 backdrop-blur-md shadow-2xl z-50 transform transition-all ease-in-out ${isOpen ? 'duration-500' : 'duration-[1500ms]'} ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        >
          <div className="p-6 overflow-y-auto h-full">
            {view === 'list' && (
                <PlanList 
                    onSelectPlan={handleSelectPlan} 
                    onCreateNew={handleCreateNew} 
                    onInitiateDelete={setConfirmDeletePlanId}
                    onShowLog={() => setView('log')}
                    onInspectExercise={setInspectingExercise}
                    isPinned={isPinned}
                    onTogglePin={() => setIsPinned(!isPinned)}
                />
            )}
            {view === 'editor' && (
                <PlanEditor plan={editingPlan} onBack={handleBack} />
            )}
            {view === 'log' && (
                <WorkoutLog onBack={handleBack} />
            )}
          </div>
        </div>
    </>
  );
};