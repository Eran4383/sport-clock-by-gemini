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
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    const fetchInfo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getExerciseInfo(exerciseName);
        setInfo(result);
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
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
        setPosition({
            x: moveEvent.clientX - startX,
            y: moveEvent.clientY - startY,
        });
    };

    const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // e.preventDefault() might be too aggressive, let's see. It can prevent scrolling.
    const touch = e.touches[0];
    const startX = touch.clientX - position.x;
    const startY = touch.clientY - position.y;

    const handleTouchMove = (moveEvent: TouchEvent) => {
        const moveTouch = moveEvent.touches[0];
        setPosition({
            x: moveTouch.clientX - startX,
            y: moveTouch.clientY - startY,
        });
    };

    const handleTouchEnd = () => {
        document.removeEventListener('touchmove', handleTouchMove as any);
        document.removeEventListener('touchend', handleTouchEnd as any);
    };

    document.addEventListener('touchmove', handleTouchMove as any, { passive: false });
    document.addEventListener('touchend', handleTouchEnd as any);
  };


  const isHebrew = useMemo(() => info?.language === 'he', [info]);
  
  const parsedInstructions = useMemo(() => {
    if (!info?.instructions) return [];
    return info.instructions
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.trim().replace(/^\d+\.\s*/, ''));
  }, [info?.instructions]);

  const embedUrl = useMemo(() => {
    const urlString = info?.videoUrl;
    if (typeof urlString !== 'string' || !urlString.trim()) {
      return null;
    }
    // This regex is designed to be robust and handle various YouTube URL formats.
    const regExp = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = urlString.match(regExp);

    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }

    console.warn("Could not extract a valid YouTube video ID from the provided URL:", urlString);
    return null;
  }, [info?.videoUrl]);


  return (
    <div className="fixed inset-0 bg-black/70 z-[100]" onClick={onClose} aria-modal="true" role="dialog">
      <div 
        ref={modalRef}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] absolute top-1/2 left-1/2"
        style={{ transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)` }}
        onClick={e => e.stopPropagation()}
        dir={isHebrew ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div 
            className="relative flex justify-center items-center p-4 border-b border-gray-700 cursor-move"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
          <h3 className="text-xl font-bold text-white break-all text-center mx-10">{exerciseName}</h3>
          <button onClick={onClose} className="absolute p-1 rounded-full hover:bg-gray-700 top-3 right-3 cursor-pointer">
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
              <div className="flex border-b border-gray-700 mb-4">
                <button
                    onClick={() => setActiveTab('howto')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors focus:outline-none border-0 cursor-pointer ${
                        activeTab === 'howto'
                        ? 'bg-gray-700 text-white'
                        : 'bg-transparent text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                    }`}
                >
                    {isHebrew ? "הדרכה" : "How-To"}
                </button>
                <button
                    onClick={() => setActiveTab('details')}
                    className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors focus:outline-none border-0 cursor-pointer ${
                        activeTab === 'details'
                        ? 'bg-gray-700 text-white'
                        : 'bg-transparent text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                    }`}
                >
                    {isHebrew ? "פרטים" : "Details"}
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-grow overflow-y-auto pr-2 min-h-0">
                {activeTab === 'howto' && (
                  <div className="space-y-4">
                    {/* Video Embed */}
                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
                        {embedUrl ? (
                            <iframe
                                className="w-full h-full"
                                src={embedUrl}
                                title={`Video tutorial for ${exerciseName}`}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <div className="text-gray-400 text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.55a1 1 0 01.55.89V14.11a1 1 0 01-1.55.89L15 14M5 18a2 2 0 01-2-2V8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5z" /></svg>
                                <p>{isHebrew ? "סרטון אינו זמין כרגע" : "Video not available at this time"}</p>
                            </div>
                        )}
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

const ShareModal: React.FC<{
  plan: WorkoutPlan;
  onClose: () => void;
}> = ({ plan, onClose }) => {
    const [copyButtonText, setCopyButtonText] = useState('Copy Link');
    
    const shareLink = useMemo(() => {
        try {
            const planJson = JSON.stringify(plan);
            const encoder = new TextEncoder();
            const data = encoder.encode(planJson);
            const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
            const base64Data = btoa(binaryString);
            
            const url = new URL(window.location.href);
            url.hash = `import=${base64Data}`;
            url.search = '';
            return url.toString();
        } catch (error) {
            console.error("Failed to create share link:", error);
            return '';
        }
    }, [plan]);

    if (!shareLink) {
        return (
            <div className="fixed inset-0 bg-black/70 z-[101] flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
                    <h3 className="text-xl font-bold text-white">Error</h3>
                    <p className="text-gray-300 mt-2">Could not generate a shareable link.</p>
                    <button onClick={onClose} className="mt-4 px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold">
                        Close
                    </button>
                </div>
            </div>
        );
    }
    
    const encodedLink = encodeURIComponent(shareLink);
    const shareText = `Check out this workout plan: ${plan.name}`;
    const encodedText = encodeURIComponent(shareText);

    const shareOptions = [
        { name: 'WhatsApp', url: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedLink}`, 
          icon: <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8"><path d="M16.75 13.96c.25.13.43.2.5.33.07.13.07.55 0 .63-.07.07-.33.25-.43.25-.1 0-1.13-.5-1.63-.88-.5-.35-1.25-.94-1.25-1.5 0-.5.5-.63.6-.75.1-.1.25-.1.38-.1s.25.05.37.28c.13.2.14.3.17.48.03.2.03.3-.04.4zm3.9-6.32c-1.35-1.35-3.15-2.08-5.02-2.08-3.9 0-7.08 3.18-7.08 7.08 0 1.4.43 2.7.88 3.88l-1.03 3.8 3.88-1.03c1.1.43 2.38.65 3.58.65h.03c3.9 0 7.08-3.18 7.08-7.08 0-1.88-.73-3.68-2.1-5.04zm-5.03 11.42h-.02c-1.08 0-2.13-.28-3.05-.8l-.2-.13-2.28 1.18 1.2-2.23-.13-.23c-.58-1-.88-2.15-.88-3.35 0-3.08 2.5-5.58 5.58-5.58 1.5 0 2.9.58 3.95 1.63 1.05 1.05 1.63 2.45 1.63 3.95 0 3.08-2.5 5.58-5.58 5.58z"></path></svg> },
        { name: 'Telegram', url: `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`, 
          icon: <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.1l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.58c-.2 1.03-.73 1.28-1.5 .82L12.2 16.2l-1.99 1.9c-.2.2-.36.36-.7.36.43-.03.62-.2.87-.44z"></path></svg> },
    ];
    
    const copyLink = () => {
        navigator.clipboard.writeText(shareLink).then(() => {
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy Link'), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[101] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start">
                    <h3 className="text-xl font-bold text-white mb-4 break-all pr-4">Share "{plan.name}"</h3>
                     <button onClick={onClose} className="p-1 -mt-2 -mr-2 rounded-full hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                    {shareOptions.map(opt => (
                        <a 
                            key={opt.name}
                            href={opt.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            {opt.icon}
                            <span className="font-semibold">{opt.name}</span>
                        </a>
                    ))}
                </div>
                <div className="mt-6 flex items-center gap-2">
                    <input type="text" readOnly value={shareLink} className="w-full bg-gray-900 text-gray-400 p-2 rounded-md text-sm truncate" />
                    <button onClick={copyLink} title="Copy Link" className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold w-32 transition-colors">
                        {copyButtonText}
                    </button>
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
  onShare: (plan: WorkoutPlan) => void;
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
}> = ({ plan, onSelectPlan, onInitiateDelete, onInspectExercise, onShare, isSelected, onToggleSelection, isDraggable, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, isDragTarget, isNewlyImported, index }) => {
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
              onClick={(e) => {
                  e.stopPropagation();
                  onShare(plan);
              }}
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
                <h3 className="text-xl font-bold text-white mb-4">Import from JSON</h3>
                <textarea
                    ref={textAreaRef}
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    placeholder="Paste your workout plan JSON here..."
                    className="w-full h-48 p-2 bg-gray-900 text-gray-300 rounded-md focus:outline-none focus:ring-2 ring-blue-500"
                ></textarea>
                <div className="flex justify-end gap-4 mt-4">
                    <button onClick={onCancel} className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold">
                        Cancel
                    </button>
                    <button onClick={handleImportClick} className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold">
                        Import
                    </button>
                </div>
            </div>
        </div>
    );
};


const PlanEditor: React.FC<{
  plan: WorkoutPlan | null;
  onSave: (plan: WorkoutPlan) => void;
  onCancel: () => void;
}> = ({ plan: initialPlan, onSave, onCancel }) => {
  const { settings } = useSettings();
  const [plan, setPlan] = useState<WorkoutPlan>(
    initialPlan || {
      id: `plan_${Date.now()}`,
      name: 'New Workout Plan',
      steps: [],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      executionMode: 'linear'
    }
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const updateStep = (index: number, updatedStep: Partial<WorkoutStep>) => {
    const newSteps = [...plan.steps];
    newSteps[index] = { ...newSteps[index], ...updatedStep };
    setPlan({ ...plan, steps: newSteps });
  };
  
  const addStep = (type: 'exercise' | 'rest') => {
    const newStep: WorkoutStep = {
      id: `step_${Date.now()}_${Math.random()}`,
      name: type === 'exercise' ? 'New Exercise' : 'Rest',
      type: type,
      isRepBased: false,
      duration: type === 'exercise' ? settings.defaultExerciseDuration : settings.defaultRestDuration,
      reps: 10,
    };
    setPlan({ ...plan, steps: [...plan.steps, newStep] });
  };
  
  const addSet = () => {
      const exerciseStep: WorkoutStep = {
          id: `step_${Date.now()}_ex_${Math.random()}`,
          name: 'New Exercise Set',
          type: 'exercise',
          isRepBased: false,
          duration: settings.defaultExerciseDuration,
          reps: 10,
      };
      const restStep: WorkoutStep = {
          id: `step_${Date.now()}_rest_${Math.random()}`,
          name: 'Rest',
          type: 'rest',
          isRepBased: false,
          duration: settings.defaultRestDuration,
          reps: 0,
      };
      setPlan({ ...plan, steps: [...plan.steps, exerciseStep, restStep] });
  }

  const removeStep = (index: number) => {
    setPlan({ ...plan, steps: plan.steps.filter((_, i) => i !== index) });
  };
  
  const handleDragStart = (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
      
      const newSteps = [...plan.steps];
      const draggedItem = newSteps[draggedIndex];
      // Remove the item from its original position
      newSteps.splice(draggedIndex, 1);
      // Insert it at the new position
      newSteps.splice(index, 0, draggedItem);
      
      setPlan({ ...plan, steps: newSteps });
      setDraggedIndex(index);
  };
  
  const handleDragEnd = () => {
      setDraggedIndex(null);
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
        <div className="flex justify-between items-start mb-4">
            <input
                type="text"
                value={plan.name}
                onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                className="text-2xl font-bold text-white bg-transparent focus:outline-none focus:bg-gray-700/50 rounded-md p-1 -m-1 w-full"
            />
            <div className="flex items-center gap-2 ml-4">
                <label htmlFor="planColor" className="sr-only">Plan color</label>
                <input
                    type="color"
                    id="planColor"
                    value={plan.color || '#3b82f6'}
                    onChange={e => setPlan({ ...plan, color: e.target.value })}
                    className="w-8 h-8 p-0 bg-transparent border-none rounded-md cursor-pointer"
                    title="Set plan color"
                />
            </div>
        </div>
      
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
        {plan.steps.map((step, index) => (
          <div 
            key={step.id} 
            className="bg-gray-700/50 p-3 rounded-lg flex items-start gap-3"
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-grow space-y-2">
              <input
                type="text"
                value={step.name}
                onChange={(e) => updateStep(index, { name: e.target.value })}
                className="w-full bg-transparent focus:outline-none focus:bg-gray-600/50 rounded-md p-1 -m-1 font-semibold"
              />
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name={`type-${step.id}`} checked={!step.isRepBased} onChange={() => updateStep(index, { isRepBased: false })} className="form-radio bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500"/>
                  Time
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name={`type-${step.id}`} checked={step.isRepBased} onChange={() => updateStep(index, { isRepBased: true })} className="form-radio bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500"/>
                  Reps
                </label>
              </div>
              {step.isRepBased ? (
                <div className="flex items-center gap-2">
                    <HoverNumberInput
                      value={step.reps}
                      onChange={(reps) => updateStep(index, { reps })}
                      min={1}
                      className="w-16 bg-gray-600 text-white text-center rounded-md p-1"
                    />
                    <span>reps</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                    <HoverNumberInput
                      value={step.duration}
                      onChange={(duration) => updateStep(index, { duration })}
                      min={0}
                      className="w-16 bg-gray-600 text-white text-center rounded-md p-1"
                    />
                    <span>seconds</span>
                </div>
              )}
            </div>
            <button onClick={() => removeStep(index)} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
            </button>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-3 gap-3 mt-4">
        <button onClick={() => addStep('exercise')} className="py-2 bg-gray-600 rounded-md hover:bg-gray-500">Add Exercise</button>
        <button onClick={() => addStep('rest')} className="py-2 bg-gray-600 rounded-md hover:bg-gray-500">Add Rest</button>
        <button onClick={addSet} className="py-2 bg-gray-600 rounded-md hover:bg-gray-500">Add Set</button>
      </div>

      <div className="flex justify-end gap-4 mt-6">
        <button onClick={onCancel} className="px-6 py-2 rounded-md font-semibold text-white bg-gray-500/50 hover:bg-gray-500/70">Cancel</button>
        <button onClick={() => onSave(plan)} className="px-6 py-2 rounded-md font-semibold text-white bg-blue-600 hover:bg-blue-700">Save</button>
      </div>
    </div>
  );
};

export const WorkoutMenu: React.FC<{ isOpen: boolean; setIsOpen: (open: boolean) => void; }> = ({ isOpen, setIsOpen }) => {
  const { 
    plans,
    savePlan,
    importPlan,
    deletePlan,
    startWorkout,
    activeWorkout,
    reorderPlans,
    recentlyImportedPlanId,
    clearWorkoutHistory,
  } = useWorkout();
  
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [infoModalExercise, setInfoModalExercise] = useState<string | null>(null);
  const [planToShare, setPlanToShare] = useState<WorkoutPlan | null>(null);
  const [isImportTextModalOpen, setIsImportTextModalOpen] = useState(false);
  const [isLogVisible, setIsLogVisible] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleEditPlan = (plan: WorkoutPlan) => {
    setEditingPlan(plan);
    setIsCreatingNew(false);
  };
  
  const handleCreateNew = () => {
    setEditingPlan(null);
    setIsCreatingNew(true);
  };

  const handleSavePlan = (plan: WorkoutPlan) => {
    savePlan(plan);
    setEditingPlan(null);
    setIsCreatingNew(false);
  };
  
  const handleCancelEdit = () => {
    setEditingPlan(null);
    setIsCreatingNew(false);
  };

  const confirmDelete = () => {
    if (planToDelete) {
      deletePlan(planToDelete);
      setPlanToDelete(null);
    }
  };

  const handleToggleSelection = (planId: string) => {
    setSelectedPlanIds(prev =>
      prev.includes(planId)
        ? prev.filter(id => id !== planId)
        : [...prev, planId]
    );
  };

  const handleStartSelected = () => {
    if (selectedPlanIds.length > 0) {
      startWorkout(selectedPlanIds);
      setIsOpen(false);
      setSelectedPlanIds([]);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const plan = JSON.parse(text);
            // Basic validation
            if (plan && typeof plan.name === 'string' && Array.isArray(plan.steps)) {
                importPlan(plan, 'file');
            } else {
                alert("Invalid workout plan file format.");
            }
        } catch (error) {
            console.error("Error parsing imported file:", error);
            alert("Could not import the plan. The file may be corrupted.");
        } finally {
            // Reset the input so the same file can be imported again
            if(fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
  };
  
  const handleTextImport = (jsonText: string) => {
      try {
          const plan = JSON.parse(jsonText);
          if (plan && typeof plan.name === 'string' && Array.isArray(plan.steps)) {
              importPlan(plan, 'text');
              setIsImportTextModalOpen(false);
          } else {
              alert("Invalid workout plan JSON structure.");
          }
      } catch (error) {
          console.error("Error parsing imported JSON:", error);
          alert("Could not import the plan. The JSON may be invalid.");
      }
  };


  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    
    const newPlans = [...plans];
    const draggedPlan = newPlans[draggedIndex];
    newPlans.splice(draggedIndex, 1);
    newPlans.splice(dropIndex, 0, draggedPlan);
    
    reorderPlans(newPlans);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleClose = () => setIsOpen(false);

  const handleMouseLeave = () => {
    if (isOpen) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 30000); // 30 seconds
    }
  };
  
    // Touch handlers for swipe-to-close gesture
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null; // reset end coordinate
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    // Swipe left to close
    if (distance > minSwipeDistance) {
        handleClose();
    }
    // Reset
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <>
      <div className="absolute top-4 left-4 menu-container group">
        <button 
          onClick={() => isOpen ? handleClose() : setIsOpen(true)} 
          aria-label="Open workout menu"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-opacity duration-1000 focus:outline-none opacity-0 group-hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40"
          onClick={handleClose}
        ></div>
      )}

      {planToDelete && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={() => setPlanToDelete(null)}>
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white">Are you sure?</h3>
            <p className="text-gray-300 mt-2">This will permanently delete the workout plan. This action cannot be undone.</p>
            <div className="flex justify-center gap-4 mt-6">
              <button onClick={() => setPlanToDelete(null)} className="px-6 py-2 rounded-md font-semibold text-white bg-gray-600 hover:bg-gray-500">Cancel</button>
              <button onClick={confirmDelete} className="px-6 py-2 rounded-md font-semibold text-white bg-red-600 hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {infoModalExercise && (
          <ExerciseInfoModal exerciseName={infoModalExercise} onClose={() => setInfoModalExercise(null)} />
      )}
      
      {planToShare && (
          <ShareModal plan={planToShare} onClose={() => setPlanToShare(null)} />
      )}

      {isImportTextModalOpen && (
        <ImportTextModal 
            onImport={handleTextImport} 
            onCancel={() => setIsImportTextModalOpen(false)} 
        />
      )}

      <div 
        className={`fixed top-0 left-0 h-full w-full max-w-md bg-gray-800/80 backdrop-blur-md shadow-2xl z-50 transform transition-all ease-in-out ${isOpen ? 'duration-500' : 'duration-[1500ms]'} ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="p-4 overflow-y-auto h-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Workouts</h2>
              <button onClick={handleClose} aria-label="Close workout menu" className="p-2 rounded-full hover:bg-gray-500/30">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {isCreatingNew || editingPlan ? (
              <PlanEditor 
                plan={editingPlan} 
                onSave={handleSavePlan}
                onCancel={handleCancelEdit}
              />
            ) : isLogVisible ? (
              <WorkoutLog onBack={() => setIsLogVisible(false)} />
            ) : (
              <div>
                <div className="space-y-3">
                  {plans.map((plan, index) => (
                    <PlanListItem 
                      key={plan.id} 
                      plan={plan} 
                      index={index}
                      onSelectPlan={handleEditPlan}
                      onInitiateDelete={setPlanToDelete}
                      onInspectExercise={setInfoModalExercise}
                      onShare={setPlanToShare}
                      isSelected={selectedPlanIds.includes(plan.id)}
                      onToggleSelection={handleToggleSelection}
                      isDraggable={!activeWorkout && plans.length > 1}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      onDragLeave={handleDragLeave}
                      isDragTarget={dragOverIndex === index}
                      isNewlyImported={plan.id === recentlyImportedPlanId}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                    <button 
                        onClick={handleCreateNew} 
                        className="py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                        disabled={!!activeWorkout}
                    >
                      New Plan
                    </button>
                     <button
                        onClick={() => setIsLogVisible(true)}
                        className="py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Workout Log
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Import File
                    </button>
                     <button
                        onClick={() => setIsImportTextModalOpen(true)}
                        className="py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Import Text
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".json"
                      onChange={handleFileImport}
                    />
                </div>

                {selectedPlanIds.length > 0 && (
                    <div className="mt-4 sticky bottom-0 py-2 bg-gray-800/80 backdrop-blur-sm">
                        <button 
                            onClick={handleStartSelected}
                            className="w-full py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors"
                        >
                            Start ({selectedPlanIds.length}) Workout{selectedPlanIds.length > 1 ? 's' : ''}
                        </button>
                    </div>
                )}
              </div>
            )}
        </div>
      </div>
    </>
  );
};
