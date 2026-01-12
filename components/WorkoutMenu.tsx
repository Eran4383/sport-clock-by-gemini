

import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { useWorkout } from '../contexts/WorkoutContext';
import { WorkoutPlan, WorkoutStep } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { HoverNumberInput } from './HoverNumberInput';
import { getExerciseInfo, ExerciseInfo, prefetchExercises, generateWorkoutPlan } from '../services/geminiService';
import { WorkoutInfoModal } from './WorkoutInfoModal';
import { WorkoutLog } from './WorkoutLog';
import { getBaseExerciseName, generateCircuitSteps, getStepDisplayName } from '../utils/workout';
import { useAuth } from '../contexts/AuthContext';

const EDITOR_STORAGE_KEY = 'sportsClockPlanEditorDraft';

const ExerciseInfoModal: React.FC<{
  exerciseName: string | null;
  onClose: () => void;
  isVisible: boolean;
}> = ({ exerciseName, onClose, isVisible }) => {
  const [info, setInfo] = useState<ExerciseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'howto' | 'details'>('howto');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [showLoadingMessage, setShowLoadingMessage] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);


  useEffect(() => {
    const fetchInfo = async () => {
      if (!exerciseName) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await getExerciseInfo(exerciseName);
        setInfo(result);
        setActiveVideoId(result.primaryVideoId);
        if (result.instructions.toLowerCase().includes("error") || result.instructions.toLowerCase().includes("failed") || result.instructions.includes("api key") || result.instructions.includes("מפתח api") || result.instructions.includes("שגיאה") || result.instructions.includes("מכסת שימוש")) {
            setError(result.instructions);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Failed to fetch or parse exercise information.";
        setError(errorMessage);
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    if (isVisible && exerciseName) {
        fetchInfo();
    }
  }, [exerciseName, isVisible]);
  
  // Bug Fix: Clear video URL when modal is hidden to stop playback
  useEffect(() => {
    if (isVisible && activeVideoId) {
      setVideoUrl(`https://www.youtube.com/embed/${activeVideoId}?autoplay=1`);
    } else {
      setVideoUrl(null);
    }
  }, [isVisible, activeVideoId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading && isVisible) {
        // Only show the long loading message if loading takes more than 500ms
        timer = setTimeout(() => {
            setShowLoadingMessage(true);
        }, 500);
    } else {
        setShowLoadingMessage(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading, isVisible]);
  
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

  const allVideoIds = useMemo(() => {
    if (!info) return [];
    const ids = [info.primaryVideoId, ...info.alternativeVideoIds].filter((id): id is string => !!id);
    return [...new Set(ids)]; // Remove duplicates
  }, [info]);

  const activeVideoIndex = useMemo(() => {
    if (!activeVideoId) return -1;
    return allVideoIds.indexOf(activeVideoId);
  }, [allVideoIds, activeVideoId]);
  
  const handleNextVideo = () => {
    if (allVideoIds.length === 0) return;
    const nextIndex = (activeVideoIndex + 1) % allVideoIds.length;
    setActiveVideoId(allVideoIds[nextIndex]);
  };
  
  const handlePrevVideo = () => {
    if (allVideoIds.length === 0) return;
    const prevIndex = (activeVideoIndex - 1 + allVideoIds.length) % allVideoIds.length;
    setActiveVideoId(allVideoIds[prevIndex]);
  };

  const isHebrew = useMemo(() => info?.language === 'he', [info]);
  
  const parsedInstructions = useMemo(() => {
    if (!info?.instructions) return [];
    
    const instructionsText = info.instructions.trim();
    let lines: string[];

    // First, try splitting by newline characters, which is the preferred format.
    if (instructionsText.includes('\n')) {
        lines = instructionsText.split('\n');
    } else {
        // Fallback: If no newlines, split by a pattern like "1. ", "2. ", etc.
        // The positive lookahead `(?=...)` splits *before* the number, keeping it for the next step.
        lines = instructionsText.split(/(?=\d+\.\s*)/);
    }
    
    return lines
      .map(line => line.trim().replace(/^\d+\.\s*/, '')) // remove the "1. " part
      .filter(line => line.length > 0);
  }, [info?.instructions]);

  const parsedTips = useMemo(() => {
    if (!info?.tips) return [];
    // This regex strips any leading number and dot (e.g., "1. ") to prevent "• 1. Tip" when rendered in a <ul>.
    return info.tips.map(tip => tip.trim().replace(/^\d+\.?\s*/, ''));
  }, [info?.tips]);

  const TabButton: React.FC<{
    label: string;
    isActive: boolean;
    onMouseDown: () => void;
  }> = ({ label, isActive, onMouseDown }) => (
    <button
      onMouseDown={onMouseDown}
      className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors focus:outline-none cursor-pointer ${
        isActive
          ? 'bg-gray-700 text-white'
          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );
  
  const handleSelectHowToTab = () => setActiveTab('howto');
  const handleSelectDetailsTab = () => setActiveTab('details');


  return (
    <div 
        className={`fixed inset-0 bg-black/70 z-[100] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose} 
        aria-modal="true" 
        role="dialog"
    >
      <div 
        ref={modalRef}
        className={`bg-gray-800 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] absolute top-1/2 left-1/2 transition-all duration-300 ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
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
            <div className="flex-grow flex items-center justify-center text-center" dir="rtl">
              {showLoadingMessage && <p className="text-gray-300 animate-pulse">מצאתי סרטונים, אני מנתח אותם כדי למצוא את הטוב ביותר. תהליך זה עשוי לקחת כדקה, תודה על הסבלנות.</p>}
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="relative z-10 flex border-b border-gray-700 mb-4">
                <TabButton label={isHebrew ? "הדרכה" : "How-To"} isActive={activeTab === 'howto'} onMouseDown={handleSelectHowToTab} />
                <TabButton label={isHebrew ? "פרטים" : "Details"} isActive={activeTab === 'details'} onMouseDown={handleSelectDetailsTab} />
              </div>

              {/* Tab Content */}
              <div className="flex-grow overflow-y-scroll pr-2 min-h-0">
                {/* How-To Tab Pane */}
                <div className={`space-y-4 ${activeTab !== 'howto' ? 'hidden' : ''}`}>
                    {/* Video Embed */}
                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
                        {videoUrl ? (
                            <iframe
                                key={activeVideoId}
                                className="w-full h-full"
                                src={videoUrl}
                                title={`Video tutorial for ${exerciseName}`}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <div className="text-gray-400 text-center p-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.55a1 1 0 01.55.89V14.11a1 1 0 01-1.55.89L15 14M5 18a2 2 0 01-2-2V8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5z" /></svg>
                                <p>{isHebrew ? "סרטון אינו זמין כרגע" : "Video not available at this time"}</p>
                            </div>
                        )}
                    </div>

                    {/* Video Navigation */}
                    {allVideoIds.length > 1 && (
                       <div className="flex justify-center items-center gap-4 mt-2">
                           <button onClick={handleNextVideo} className="p-2 rounded-full hover:bg-gray-700" title={isHebrew ? "הסרטון הבא" : "Next video"}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                           </button>
                           <button onClick={handlePrevVideo} className="p-2 rounded-full hover:bg-gray-700" title={isHebrew ? "הסרטון הקודם" : "Previous video"}>
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                           </button>
                       </div>
                    )}
                    
                    {/* Instructions List */}
                    <h4 className="font-semibold text-lg text-white mt-4">{isHebrew ? "הוראות" : "Instructions"}</h4>
                     {error ? (
                        <p className="text-yellow-400 bg-yellow-900/30 p-3 rounded-md whitespace-pre-wrap select-text">{error}</p>
                     ) : parsedInstructions.length > 1 ? (
                        <ol className="list-decimal list-inside space-y-2 text-gray-200 select-text">
                            {parsedInstructions.map((item, index) => <li key={index}>{item}</li>)}
                        </ol>
                     ) : parsedInstructions.length === 1 ? (
                        <p className="text-gray-200 whitespace-pre-wrap select-text">{parsedInstructions[0]}</p>
                     ) : (
                        <p className="text-gray-400">{isHebrew ? "לא נמצאו הוראות." : "No instructions found."}</p>
                     )}
                </div>

                {/* Details Tab Pane */}
                <div className={`space-y-6 ${activeTab !== 'details' ? 'hidden' : ''}`}>
                    {info && info.tips && info.tips.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-lg text-white mb-2">{isHebrew ? "דגשים" : "Tips"}</h4>
                        <ul className="list-disc list-inside space-y-1 text-gray-300 select-text">
                          {parsedTips.map((tip, index) => <li key={index}>{tip}</li>)}
                        </ul>
                      </div>
                    )}
                    {info && info.generalInfo && (
                      <div>
                        <h4 className="font-semibold text-lg text-white mb-2">{isHebrew ? "מידע כללי" : "General Info"}</h4>
                        <p className="text-gray-300 whitespace-pre-wrap select-text">{info.generalInfo}</p>
                      </div>
                    )}
                </div>
              </div>
            </>
          )}
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
    const shareText = `הי! ✨ קבל תוכנית אימונים מדהימה שבניתי, '${plan.name}'. לחץ על הקישור כדי לייבא אותה ישירות לאפליקציה שלך:`;
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

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6', '#14b8a6', '#f97316'];

const useExerciseColorMap = (steps: WorkoutStep[]): Map<string, string> => {
  return useMemo(() => {
    const map = new Map<string, string>();
    const uniqueExercises: string[] = [];
    
    steps.forEach(step => {
      if (step.type === 'exercise') {
        const baseName = step.name; // Already the base name
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
  onShowInfo: (plan: WorkoutPlan) => void;
  onShare: (plan: WorkoutPlan) => void;
  onTogglePin: (plan: WorkoutPlan) => void; // ADDED
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
  setRef: (el: HTMLDivElement | null) => void;
}> = ({ plan, onSelectPlan, onInitiateDelete, onInspectExercise, onShowInfo, onShare, onTogglePin, isSelected, onToggleSelection, isDraggable, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, isDragTarget, isNewlyImported, index, setRef }) => {
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
      workoutHistory,
  } = useWorkout();
  const [isExpanded, setIsExpanded] = useState(false);
  const exerciseColorMap = useExerciseColorMap(plan.steps);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const showConfirmation = (message: string) => {
      setConfirmationMessage(message);
      setTimeout(() => setConfirmationMessage(null), 2000);
  };

  const isActive = activeWorkout?.sourcePlanIds.includes(plan.id) ?? false;
  
  const relevantLogs = useMemo(() => {
    return workoutHistory
        .filter(log => log.planIds?.includes(plan.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [workoutHistory, plan.id]);

  const lastPerformedText = useMemo(() => {
    if (relevantLogs.length === 0) return null;

    const lastPerformed = new Date(relevantLogs[0].date);
    
    const now = new Date();
    // Reset time part for accurate day difference calculation
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDay = new Date(lastPerformed.getFullYear(), lastPerformed.getMonth(), lastPerformed.getDate());

    const diffTime = today.getTime() - lastDay.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "בוצע היום";
    if (diffDays === 1) return "בוצע אתמול";
    if (diffDays < 7) return `בוצע לפני ${diffDays} ימים`;
    if (diffDays < 30) return `בוצע לפני ${Math.floor(diffDays/7)} שבועות`;

    return `בוצע לאחרונה: ${lastPerformed.toLocaleDateString('he-IL')}`;
  }, [relevantLogs]);

  const last7Performances = useMemo(() => {
    return relevantLogs.slice(0, 7).map(log => new Date(log.date));
  }, [relevantLogs]);


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
      if (activeWorkout) {
        stopWorkout({ completed: false, durationMs: 0, finishedWorkout: activeWorkout });
      }
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
  const animationClass = isNewlyImported ? 'animate-glow' : '';

  return (
      <div 
          ref={setRef}
          className={`rounded-lg transition-all duration-300 ${isDraggable ? 'cursor-grab' : ''} ${dragStyles} ${animationClass} ${plan.isSmartPlan ? 'bg-purple-500/20' : 'bg-gray-700/50'}`}
          style={{ borderLeft: `5px solid ${plan.isSmartPlan ? '#a855f7' : (plan.color || 'transparent')}` }}
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
                  <div className="flex items-center gap-2">
                    {plan.isSmartPlan && <span title="AI Generated Plan">✨</span>}
                    {plan.isPinned && <span className="text-blue-400" title="Pinned Plan">📌</span>}
                    <h3 className="text-xl font-semibold text-white break-words" title={plan.name}>{plan.name}</h3>
                  </div>
                  <div className="text-sm text-gray-400 flex items-center">
                    <span className="truncate">
                        {plan.steps.length} steps, Total: {getTotalDuration(plan)}
                    </span>
                    {lastPerformedText && (
                    <>
                        <span className="mx-2 text-gray-500 shrink-0">|</span>
                        <div className="relative group flex items-center gap-1 shrink-0 whitespace-nowrap">
                            <span>{lastPerformedText}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onShowInfo(plan); }}
                                className="text-gray-400 hover:text-white"
                                aria-label="Show workout statistics"
                                title="Show Stats"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </button>
                            {last7Performances.length > 0 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-gray-900 text-white text-sm rounded-lg shadow-lg p-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
                                    <h4 className="font-bold border-b border-gray-700 pb-1 mb-1 text-center">בוצע לאחרונה:</h4>
                                    <ul className="space-y-1">
                                        {last7Performances.map((date, index) => (
                                            <li key={index} className="text-xs text-gray-300 text-center">
                                                {date.toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-900"></div>
                                </div>
                            )}
                        </div>
                    </>
                    )}
                  </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-1 items-center mt-3 justify-end relative">
               {confirmationMessage && <span className="absolute -top-8 right-0 bg-gray-900 text-white text-xs px-2 py-1 rounded">{confirmationMessage}</span>}
               {/* New Pin Button - Now with correct Push Pin icon */}
               <button
                  onClick={(e) => { e.stopPropagation(); onTogglePin(plan); }}
                  className={`p-2 hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${plan.isPinned ? 'text-blue-400' : 'text-gray-300'}`}
                  aria-label={plan.isPinned ? "Unpin plan" : "Pin plan"}
                  title={plan.isPinned ? "Unpin from top" : "Pin to top"}
                  disabled={!!activeWorkout}
              >
                  {plan.isPinned ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 12V4h1V2H7v2h1v8l-3 5v2h6v7h2v-7h6v-2l-3-5z" transform="rotate(45 12 12)" />
                      </svg>
                  ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M16 12V4h1V2H7v2h1v8l-3 5v2h6v7h2v-7h6v-2l-3-5z" transform="rotate(45 12 12)" />
                      </svg>
                  )}
               </button>
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
                      const color = step.type === 'exercise' ? exerciseColorMap.get(step.name) : 'transparent';
                      
                      return (
                          <li 
                            key={`${step.id}-${index}`} 
                            className={`flex items-center gap-2 transition-all duration-200 rounded p-1 -m-1 ${isCurrent ? 'bg-blue-500/20 font-bold' : 'hover:bg-gray-600/50'}`}
                            title={getStepDisplayName(step)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (step.type === 'exercise') {
                                  onInspectExercise(step.name);
                              }
                            }}
                          >
                              <span className="w-1.5 h-4 rounded" style={{ backgroundColor: color }}></span>
                              <span className="truncate flex-1">
                                  {getStepDisplayName(step)} - <span className="text-gray-400 font-normal">{step.isRepBased ? `${step.reps} חזרות` : `${step.duration} שניות`}</span>
                                  {step.tip && <span className="block text-xs text-yellow-300/80 truncate">💡 {step.tip}</span>}
                              </span>
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
  onSelectPlan: (plan: WorkoutPlan | string) => void;
  onCreateNew: () => void;
  onInitiateDelete: (planId: string) => void;
  onShowLog: () => void;
  onInspectExercise: (exerciseName: string) => void;
  onShowInfo: (plan: WorkoutPlan) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onOpenAiPlanner: () => void;
}> = ({ onSelectPlan, onCreateNew, onInitiateDelete, onShowLog, onInspectExercise, onShowInfo, isPinned, onTogglePin, onOpenAiPlanner }) => {
  const { plans, reorderPlans, startWorkout, importPlan, activeWorkout, recentlyImportedPlanId, isSyncing, forceSync, savePlan } = useWorkout();
  const { settings, updateSettings } = useSettings();
  const { user, authStatus, signIn, signOut } = useAuth();
  
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  // Split state for drag and drop to support two lists
  const dragSource = useRef<{ index: number, listType: 'pinned' | 'unpinned' } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ index: number, listType: 'pinned' | 'unpinned' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportTextVisible, setIsImportTextVisible] = useState(false);
  const [sharingPlan, setSharingPlan] = useState<WorkoutPlan | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'loading' | 'success' | 'partial' | 'error'>('idle');
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [isWarmupSettingsExpanded, setIsWarmupSettingsExpanded] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  
  const planRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastScrolledPlanId = useRef<string | null>(null);

  // Memoize sorted lists to ensure stability
  const pinnedPlans = useMemo(() => plans.filter(p => p.isPinned), [plans]);
  const unpinnedPlans = useMemo(() => plans.filter(p => !p.isPinned), [plans]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Effect to scroll to a newly imported plan
  useEffect(() => {
    if (recentlyImportedPlanId && recentlyImportedPlanId !== lastScrolledPlanId.current) {
        // Use a timeout to allow the DOM to update and the modal to close
        setTimeout(() => {
            const element = planRefs.current[recentlyImportedPlanId];
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lastScrolledPlanId.current = recentlyImportedPlanId;
            }
        }, 300);
    }
  }, [recentlyImportedPlanId]);


  const handleRefreshAll = async () => {
    if (refreshStatus === 'loading' || plans.length === 0) return;

    setRefreshStatus('loading');
    setRefreshFeedback('Checking server for missing exercises...');
    const allExerciseNames = plans.flatMap(plan => plan.steps)
                                  .filter(step => step.type === 'exercise')
                                  .map(step => step.name); // Already base name
    
    const result = await prefetchExercises(allExerciseNames);
    
    if (result.failedCount === 0) {
        setRefreshStatus('success');
        setRefreshFeedback('All exercises are up to date!');
    } else if (result.failedCount > 0 && result.successCount > 0) {
        setRefreshStatus('partial');
        setRefreshFeedback(`Failed to refresh: ${result.failedNames.join(', ')}`);
    } else {
        setRefreshStatus('error');
        setRefreshFeedback(`Failed to refresh all missing exercises: ${result.failedNames.join(', ')}`);
    }
    
    setTimeout(() => {
        setRefreshStatus('idle');
        setRefreshFeedback(null);
    }, 8000);
  };
  
  const getRefreshTooltip = () => {
    if (refreshFeedback) return refreshFeedback;
    switch (refreshStatus) {
        case 'loading': return "Refreshing info in background...";
        case 'success': return "All exercise info is up to date!";
        default: return "Sync all exercises with the database";
    }
  };

  const handleToggleSelection = (planId: string) => {
    setSelectedPlanIds(prev =>
      prev.includes(planId) ? prev.filter(id => id !== id) : [...prev, planId]
    );
  };
  
  const handleStartSelected = () => {
      startWorkout(selectedPlanIds);
      setSelectedPlanIds([]);
  };
  
  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleShare = async (plan: WorkoutPlan) => {
    try {
        const planJson = JSON.stringify(plan);
        const encoder = new TextEncoder();
        const data = encoder.encode(planJson);
        const binaryString = Array.from(data, byte => String.fromCharCode(byte)).join('');
        const base64Data = btoa(binaryString);
        
        const url = new URL(window.location.href);
        url.hash = `import=${base64Data}`;
        url.search = '';
        const shareableLink = url.toString();

        const shareData = {
            title: `Workout Plan: ${plan.name}`,
            text: `Check out the "${plan.name}" workout plan!`,
            url: shareableLink,
        };

        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            setSharingPlan(plan);
        }
    } catch (error) {
        if ((error as DOMException).name !== 'AbortError') {
            console.error("Share failed, falling back to modal:", error);
            setSharingPlan(plan);
        }
    }
  };
  
  const handleTogglePlanPin = (plan: WorkoutPlan) => {
      savePlan({ ...plan, isPinned: !plan.isPinned });
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
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

  const onDragStart = (e: React.DragEvent, index: number, listType: 'pinned' | 'unpinned') => {
    dragSource.current = { index, listType };
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, index: number, listType: 'pinned' | 'unpinned') => {
    e.preventDefault();
    // Only allow dropping in the same list type
    if (!dragSource.current || dragSource.current.listType !== listType) return;

    if (!dragTarget || dragTarget.index !== index || dragTarget.listType !== listType) {
      setDragTarget({ index, listType });
    }
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, index: number, listType: 'pinned' | 'unpinned') => {
    e.preventDefault();
    if (!dragSource.current || dragSource.current.listType !== listType) return;
    
    if (dragSource.current.index === index) {
        setDragTarget(null);
        return;
    }
    
    // We are reordering within the same visual list (pinned or unpinned)
    const sourceList = listType === 'pinned' ? [...pinnedPlans] : [...unpinnedPlans];
    const otherList = listType === 'pinned' ? unpinnedPlans : pinnedPlans;
    
    const [movedItem] = sourceList.splice(dragSource.current.index, 1);
    sourceList.splice(index, 0, movedItem);
    
    // Reconstruct full list to save order
    // Order matters: if 'pinned' changed, put it first then 'unpinned'.
    const newFullList = listType === 'pinned' 
        ? [...sourceList, ...otherList] 
        : [...otherList, ...sourceList];
        
    reorderPlans(newFullList);
    
    dragSource.current = null;
    setDragTarget(null);
  };

  const onDragEnd = () => {
    dragSource.current = null;
    setDragTarget(null);
  };
  
  const onDragLeave = () => {
    setDragTarget(null);
  };

  return (
    <div>
      {sharingPlan && <ShareModal plan={sharingPlan} onClose={() => setSharingPlan(null)} />}
      <div className="flex justify-between items-center mb-4">
        {/* Left Side: Auth display (Guest only) */}
        <div>
           {authStatus !== 'authenticated' && (
            <div className="flex flex-col items-center">
              <p className="text-gray-400 text-xs mb-1">אורח</p>
              <button
                  onClick={signIn}
                  className="bg-white text-gray-700 text-sm py-1 px-3 rounded-full border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-2"
                  aria-label="התחברות עם גוגל"
              >
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                  <span className="whitespace-nowrap">התחברות</span>
              </button>
            </div>
           )}
        </div>

        {/* Right Side: Action buttons & logged-in user display */}
        <div className="flex items-center gap-2">
            {isSyncing && (
                <div className="p-2" title="Syncing...">
                    <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            )}
            {user && (
              <div className="relative" ref={userDropdownRef}>
                <button onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)} className="flex items-center">
                    <img
                        src={user.photoURL!}
                        alt="User profile"
                        className="w-10 h-10 rounded-full border-2 border-gray-600 hover:border-blue-500 transition-colors"
                    />
                </button>
                {isUserDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-56 bg-gray-700 rounded-md shadow-lg py-1 z-10 animate-fadeIn">
                        <div className="px-4 py-2 text-sm text-gray-300 border-b border-gray-600">
                            <p className="font-semibold text-white">{user.displayName}</p>
                            <p className="truncate">{user.email}</p>
                        </div>
                        <button
                            onClick={forceSync}
                            className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600/70"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 9a9 9 0 0114.13-5.23M20 15a9 9 0 01-14.13 5.23" />
                            </svg>
                            <span>Sync Data</span>
                        </button>
                        <button
                            onClick={signOut}
                            className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                             <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                           </svg>
                            <span>Sign Out</span>
                        </button>
                    </div>
                )}
              </div>
            )}
            <button
                onClick={handleRefreshAll}
                className={`p-2 rounded-full hover:bg-gray-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                title={getRefreshTooltip()}
                disabled={refreshStatus === 'loading' || !!activeWorkout}
            >
                {refreshStatus === 'loading' ? (
                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${
                        refreshStatus === 'success' ? 'text-green-400' :
                        refreshStatus === 'partial' ? 'text-yellow-400' :
                        refreshStatus === 'error' ? 'text-red-400' :
                        'text-gray-400'
                    }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9a9 9 0 0114.13-5.23M20 15a9 9 0 01-14.13 5.23" />
                    </svg>
                )}
            </button>
            <button
                onClick={onShowLog}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="View Workout Log"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
            </button>
            <button
                onClick={() => setIsImportTextVisible(true)}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="Import Plan from Text"
                disabled={!!activeWorkout}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            </button>
            <button
                onClick={handleImportClick}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="Import Plan from File(s)"
                disabled={!!activeWorkout}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    <line x1="12" y1="11" x2="12" y2="17"></line>
                    <polyline points="9 14 12 11 15 14"></polyline>
                </svg>
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
        </div>
      </div>

      {isImportTextVisible && <ImportTextModal onImport={(text) => handleJsonImport(text, 'text')} onCancel={() => setIsImportTextVisible(false)} />}
      
      {!activeWorkout && (
          <>
            <div className="flex gap-4 mb-4">
                <button
                    onClick={onOpenAiPlanner}
                    className="flex-1 text-center py-1 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                    ✨ AI Generator
                </button>
                <button
                  onClick={onCreateNew}
                  className="flex-1 text-center py-1 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center text-sm"
                >
                  + New Workout
                </button>
            </div>
             <div className="bg-gray-700/50 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsWarmupSettingsExpanded(prev => !prev)}>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">חימום</span>
                        <button onClick={(e) => { e.stopPropagation(); onSelectPlan('_warmup_'); }} className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                    <label htmlFor="warmup-toggle" className="relative inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" id="warmup-toggle" className="sr-only peer" checked={settings.isWarmupEnabled} onChange={(e) => updateSettings({ isWarmupEnabled: e.target.checked })} />
                        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                </div>
                 {isWarmupSettingsExpanded && (
                     <div className="mt-3 pt-3 border-t border-gray-600 animate-fadeIn" style={{ animationDuration: '0.3s'}}>
                        {settings.isWarmupEnabled && (
                            <>
                                <label htmlFor="warmup-rest" className="text-sm text-gray-400">Rest after warm-up (seconds)</label>
                                <HoverNumberInput
                                    id="warmup-rest"
                                    value={settings.restAfterWarmupDuration}
                                    onChange={(val) => updateSettings({ restAfterWarmupDuration: val })}
                                    min={0}
                                    className="w-full mt-1 bg-gray-600 p-2 rounded-md text-center"
                                />
                            </>
                        )}
                         {settings.warmupSteps.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">Steps:</h4>
                                <ol className="text-gray-300 space-y-1 text-sm">
                                    {settings.warmupSteps.map((step, index) => (
                                        <li key={index} 
                                            className={`flex items-center gap-2 p-1 -m-1 rounded transition-opacity ${step.enabled === false ? 'opacity-50' : ''} ${step.type === 'exercise' ? 'hover:bg-gray-600/50' : ''}`}
                                            title={getStepDisplayName(step)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (step.type === 'exercise') {
                                                    onInspectExercise(step.name);
                                                }
                                            }}
                                            style={{ cursor: step.type === 'exercise' ? 'pointer' : 'default' }}
                                        >
                                            <span className={`w-1.5 h-4 rounded ${step.type === 'exercise' ? 'bg-orange-400' : 'bg-transparent'}`}></span>
                                            <span className="truncate">{getStepDisplayName(step)} - <span className="text-gray-400 font-normal">{step.isRepBased ? `${step.reps} חזרות` : `${step.duration} שניות`}</span></span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                     </div>
                 )}
            </div>
          </>
      )}

      {selectedPlanIds.length > 0 && !activeWorkout && (
          <button
            onClick={handleStartSelected}
            className="w-full mb-4 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors"
          >
              Start Selected ({selectedPlanIds.length})
          </button>
      )}

      <div className="space-y-4">
        {plans.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No workout plans yet. Create one to get started!</p>
        ) : (
          <>
            {pinnedPlans.length > 0 && (
                <div className="mb-4">
                    <h3 className="text-gray-400 text-sm uppercase font-bold mb-2 ml-1">נעוצים</h3>
                    <div className="space-y-2">
                        {pinnedPlans.map((plan, index) => (
                            <PlanListItem 
                                key={plan.id} 
                                plan={plan} 
                                index={index}
                                setRef={el => { if (el) planRefs.current[plan.id] = el; }}
                                onSelectPlan={() => onSelectPlan(plan)}
                                onInitiateDelete={onInitiateDelete}
                                onInspectExercise={onInspectExercise}
                                onShowInfo={onShowInfo}
                                onShare={handleShare}
                                onTogglePin={handleTogglePlanPin}
                                isSelected={selectedPlanIds.includes(plan.id)}
                                onToggleSelection={handleToggleSelection}
                                isDraggable={!activeWorkout}
                                onDragStart={(e) => onDragStart(e, index, 'pinned')}
                                onDragOver={(e) => onDragOver(e, index, 'pinned')}
                                onDrop={(e) => onDrop(e, index, 'pinned')}
                                onDragEnd={onDragEnd}
                                onDragLeave={onDragLeave}
                                isDragTarget={dragTarget?.index === index && dragTarget?.listType === 'pinned'}
                                isNewlyImported={plan.id === recentlyImportedPlanId}
                            />
                        ))}
                    </div>
                </div>
            )}
            
            {(pinnedPlans.length > 0 && unpinnedPlans.length > 0) && (
                <h3 className="text-gray-400 text-sm uppercase font-bold mb-2 ml-1">כל השאר</h3>
            )}

            <div className="space-y-2">
                {unpinnedPlans.map((plan, index) => (
                    <PlanListItem 
                        key={plan.id} 
                        plan={plan} 
                        index={index}
                        setRef={el => { if (el) planRefs.current[plan.id] = el; }}
                        onSelectPlan={() => onSelectPlan(plan)}
                        onInitiateDelete={onInitiateDelete}
                        onInspectExercise={onInspectExercise}
                        onShowInfo={onShowInfo}
                        onShare={handleShare}
                        onTogglePin={handleTogglePlanPin}
                        isSelected={selectedPlanIds.includes(plan.id)}
                        onToggleSelection={handleToggleSelection}
                        isDraggable={!activeWorkout}
                        onDragStart={(e) => onDragStart(e, index, 'unpinned')}
                        onDragOver={(e) => onDragOver(e, index, 'unpinned')}
                        onDrop={(e) => onDrop(e, index, 'unpinned')}
                        onDragEnd={onDragEnd}
                        onDragLeave={onDragLeave}
                        isDragTarget={dragTarget?.index === index && dragTarget?.listType === 'unpinned'}
                        isNewlyImported={plan.id === recentlyImportedPlanId}
                    />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- Plan Editor ---

const PlanEditor: React.FC<{
  plan?: WorkoutPlan;
  onSave: (plan: WorkoutPlan) => void;
  onCancel: () => void;
  isWarmupMode?: boolean;
}> = ({ plan, onSave, onCancel, isWarmupMode = false }) => {
  const { settings } = useSettings();
  const [name, setName] = useState(plan ? plan.name : '');
  const [steps, setSteps] = useState<WorkoutStep[]>(plan ? plan.steps : []);

  const handleAddStep = (type: 'exercise' | 'rest') => {
    const newStep: WorkoutStep = {
      id: Date.now().toString(),
      name: type === 'exercise' ? 'New Exercise' : 'Rest',
      type,
      isRepBased: false,
      duration: type === 'rest' ? settings.defaultRestDuration : settings.defaultExerciseDuration,
      reps: 10,
    };
    setSteps([...steps, newStep]);
  };

  const handleUpdateStep = (index: number, updates: Partial<WorkoutStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };
  
  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index > 0) {
          const newSteps = [...steps];
          [newSteps[index], newSteps[index - 1]] = [newSteps[index - 1], newSteps[index]];
          setSteps(newSteps);
      } else if (direction === 'down' && index < steps.length - 1) {
          const newSteps = [...steps];
          [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
          setSteps(newSteps);
      }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const newPlan: WorkoutPlan = {
      id: plan ? plan.id : Date.now().toString(),
      name,
      steps,
      executionMode: plan?.executionMode || 'linear',
      isLocked: plan?.isLocked,
      isPinned: plan?.isPinned,
      isSmartPlan: plan?.isSmartPlan,
    };
    onSave(newPlan);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h3 className="text-xl font-bold text-white">{plan ? 'Edit Workout' : 'New Workout'}</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-white">Cancel</button>
      </div>
      
      {!isWarmupMode && (
        <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workout Name"
            className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 ring-blue-500 shrink-0"
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {steps.map((step, index) => (
          <div key={step.id} className="bg-gray-700/50 p-3 rounded-lg flex items-center gap-3">
             <div className="flex flex-col gap-1">
                <button onClick={() => handleMoveStep(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-white disabled:opacity-30">▲</button>
                <button onClick={() => handleMoveStep(index, 'down')} disabled={index === steps.length - 1} className="text-gray-400 hover:text-white disabled:opacity-30">▼</button>
             </div>
             
             <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={step.name} 
                        onChange={(e) => handleUpdateStep(index, { name: e.target.value })}
                        className="bg-transparent border-b border-gray-600 focus:border-blue-500 w-full text-white focus:outline-none"
                    />
                    <button onClick={() => handleUpdateStep(index, { type: step.type === 'exercise' ? 'rest' : 'exercise' })} className={`px-2 py-0.5 rounded text-xs uppercase font-bold ${step.type === 'exercise' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {step.type}
                    </button>
                </div>
                <div className="flex gap-4 text-sm text-gray-300 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={step.isRepBased} onChange={(e) => handleUpdateStep(index, { isRepBased: e.target.checked })} />
                        Reps
                    </label>
                    {step.isRepBased ? (
                        <HoverNumberInput 
                             value={step.reps} 
                             onChange={(val) => handleUpdateStep(index, { reps: val })} 
                             min={1} 
                             className="w-16 bg-gray-600 text-center rounded" 
                        />
                    ) : (
                         <div className="flex items-center gap-2">
                             <HoverNumberInput 
                                 value={step.duration} 
                                 onChange={(val) => handleUpdateStep(index, { duration: val })} 
                                 min={1} 
                                 className="w-16 bg-gray-600 text-center rounded" 
                             />
                             <span>sec</span>
                         </div>
                    )}
                </div>
                {step.type === 'exercise' && (
                    <input 
                        type="text"
                        value={step.tip || ''}
                        onChange={(e) => handleUpdateStep(index, { tip: e.target.value })}
                        placeholder="Short tip (e.g., Keep back straight)"
                        className="w-full bg-gray-800 text-gray-400 text-sm p-1 rounded focus:outline-none focus:ring-1 ring-blue-500"
                    />
                )}
             </div>

             <button onClick={() => handleRemoveStep(index)} className="text-red-400 hover:text-red-300 p-2">✕</button>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700 shrink-0">
          <div className="flex gap-2 mb-4">
              <button onClick={() => handleAddStep('exercise')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white font-semibold">+ Exercise</button>
              <button onClick={() => handleAddStep('rest')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white font-semibold">+ Rest</button>
          </div>
          <button onClick={handleSave} className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded text-white font-bold">
              Save Workout
          </button>
      </div>
    </div>
  );
};

// --- AI Planner ---

const AiPlanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { importPlan } = useWorkout();
    const { settings } = useSettings();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            // Transform internal message format to API format
            const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
            const userProfileContext = settings.userProfile ? JSON.stringify(settings.userProfile) : undefined;
            
            const responseText = await generateWorkoutPlan(history, userMsg, userProfileContext);
            setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'model', text: "Error: Could not contact the AI planner." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const extractAndImportPlan = (text: string) => {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const plan = JSON.parse(jsonMatch[1]);
                if (plan && plan.steps) {
                    const newPlan = { ...plan, isSmartPlan: true };
                    importPlan(newPlan, 'ai');
                    onClose();
                } else {
                    alert("Invalid plan format received from AI.");
                }
            } catch (e) {
                alert("Failed to parse plan JSON.");
            }
        } else {
            alert("No valid JSON plan found in this message.");
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-700 shrink-0">
                <h3 className="text-xl font-bold text-white">AI Workout Planner</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
                {messages.length === 0 && (
                     <div className="text-center text-gray-400 mt-10 px-4">
                        <p className="mb-2 text-3xl">🤖</p>
                        <p>Hi! I can help you create a personalized workout plan.</p>
                        <p className="text-sm mt-2">Try: "Create a 10-minute HIIT workout without equipment."</p>
                     </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                         <div className={`max-w-[85%] p-3 rounded-lg whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                             {msg.text.replace(/```json[\s\S]*```/, '[Plan JSON]')}
                         </div>
                         {msg.role === 'model' && msg.text.includes('```json') && (
                             <button 
                                onClick={() => extractAndImportPlan(msg.text)}
                                className="mt-2 text-sm text-green-400 hover:text-green-300 font-bold border border-green-400/30 px-3 py-1 rounded bg-green-400/10"
                             >
                                 Import Plan
                             </button>
                         )}
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start">
                         <div className="bg-gray-700 p-3 rounded-lg flex gap-2">
                             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                         </div>
                    </div>
                )}
            </div>
            
            <div className="flex gap-2 shrink-0">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Describe your workout goal..."
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <button 
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold"
                >
                    Send
                </button>
            </div>
        </div>
    );
};


// --- Main Component ---

export const WorkoutMenu: React.FC<{ isOpen: boolean; setIsOpen: (open: boolean) => void }> = ({ isOpen, setIsOpen }) => {
    const { plans, savePlan, deletePlan, reorderPlans, activeWorkout, nextUpcomingStep } = useWorkout();
    const { settings, updateSettings } = useSettings();
    const [view, setView] = useState<'list' | 'editor' | 'ai' | 'log'>('list');
    const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
    const [inspectExercise, setInspectExercise] = useState<string | null>(null);
    const [infoPlan, setInfoPlan] = useState<WorkoutPlan | null>(null);
    const [isPinned, setIsPinned] = useState(false);

    // Reset view when menu closes
    useEffect(() => {
        if (!isOpen) {
            setView('list');
            setEditingPlan(null);
        }
    }, [isOpen]);

    const handleCreateNew = () => {
        setEditingPlan(null);
        setView('editor');
    };

    const handleEditPlan = (plan: WorkoutPlan | string) => {
        if (typeof plan === 'string') {
            // Handle special cases like warmup editing
            if (plan === '_warmup_') {
                 // Create a fake plan object for the editor to use
                 const warmupPlan: WorkoutPlan = {
                     id: '_warmup_',
                     name: 'Warmup Routine',
                     steps: settings.warmupSteps,
                     executionMode: 'linear'
                 };
                 setEditingPlan(warmupPlan);
                 setView('editor');
            }
        } else {
            setEditingPlan(plan);
            setView('editor');
        }
    };

    const handleSavePlan = (plan: WorkoutPlan) => {
        if (plan.id === '_warmup_') {
            updateSettings({ warmupSteps: plan.steps });
        } else {
            savePlan(plan);
        }
        setView('list');
        setEditingPlan(null);
    };
    
    const handleClose = () => {
        setIsOpen(false);
        setIsPinned(false);
    };

    return (
        <>
            {isOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !isPinned && handleClose()}></div>}
            
            <div className={`fixed top-0 left-0 h-full w-full max-w-md bg-gray-800/90 backdrop-blur-md shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full p-4 overflow-hidden">
                    {/* Header is handled inside components mostly, or consistent here */}
                    {view === 'list' && (
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <h2 className="text-2xl font-bold text-white">Workouts</h2>
                            <button onClick={handleClose} className="p-2 hover:bg-gray-700 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden">
                        {view === 'list' && (
                            <div className="h-full overflow-y-auto pr-1">
                                <PlanList 
                                    onSelectPlan={handleEditPlan}
                                    onCreateNew={handleCreateNew}
                                    onInitiateDelete={deletePlan}
                                    onShowLog={() => setView('log')}
                                    onInspectExercise={setInspectExercise}
                                    onShowInfo={setInfoPlan}
                                    isPinned={isPinned}
                                    onTogglePin={() => setIsPinned(!isPinned)}
                                    onOpenAiPlanner={() => setView('ai')}
                                />
                            </div>
                        )}
                        {view === 'editor' && (
                            <PlanEditor 
                                plan={editingPlan || undefined} 
                                onSave={handleSavePlan} 
                                onCancel={() => setView('list')}
                                isWarmupMode={editingPlan?.id === '_warmup_'}
                            />
                        )}
                        {view === 'ai' && (
                            <AiPlanner onClose={() => setView('list')} />
                        )}
                        {view === 'log' && (
                            <WorkoutLog onBack={() => setView('list')} />
                        )}
                    </div>
                </div>
            </div>

            {inspectExercise && (
                <ExerciseInfoModal 
                    exerciseName={inspectExercise} 
                    isVisible={!!inspectExercise} 
                    onClose={() => setInspectExercise(null)} 
                />
            )}
            
            {infoPlan && (
                <WorkoutInfoModal 
                    plan={infoPlan} 
                    onClose={() => setInfoPlan(null)} 
                />
            )}
        </>
    );
};
