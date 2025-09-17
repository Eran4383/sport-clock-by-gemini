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
import { AI_CHAT_HISTORY_KEY } from '../services/storageService';

const EDITOR_STORAGE_KEY = 'sportsClockPlanEditorDraft';
const AI_PLANNER_CONTEXT_KEY = 'sportsClockAiPlannerContext';

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
}> = ({ plan, onSelectPlan, onInitiateDelete, onInspectExercise, onShowInfo, onShare, isSelected, onToggleSelection, isDraggable, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, isDragTarget, isNewlyImported, index, setRef }) => {
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
  
  const lastPerformedText = useMemo(() => {
    const relevantLogs = workoutHistory
        .filter(log => log.planIds?.includes(plan.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
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
  }, [workoutHistory, plan.id]);

  const lastPerformedTooltip = useMemo(() => {
    const relevantLogs = workoutHistory
        .filter(log => log.planIds?.includes(plan.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (relevantLogs.length === 0) return undefined;

    const lastLogDate = new Date(relevantLogs[0].date);
    const lastLogDayStart = new Date(lastLogDate.getFullYear(), lastLogDate.getMonth(), lastLogDate.getDate()).getTime();
    const lastLogDayEnd = lastLogDayStart + 24 * 60 * 60 * 1000;

    const logsOnLastDay = relevantLogs.filter(log => {
        const logTime = new Date(log.date).getTime();
        return logTime >= lastLogDayStart && logTime < lastLogDayEnd;
    });

    if (logsOnLastDay.length === 0) return undefined;

    const dateString = new Date(logsOnLastDay[0].date).toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    
    const times = logsOnLastDay
        .map(log => new Date(log.date).toLocaleTimeString('he-IL', {
            hour: '2-digit',
            minute: '2-digit'
        }))
        .join('\n');

    return `${dateString}\n${times}`;
  }, [workoutHistory, plan.id]);


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
                    <h3 className="text-xl font-semibold text-white break-words" title={plan.name}>{plan.name}</h3>
                  </div>
                  <div className="text-sm text-gray-400 flex items-center">
                    <span className="truncate">
                        {plan.steps.length} steps, Total: {getTotalDuration(plan)}
                    </span>
                    {lastPerformedText && (
                    <>
                        <span className="mx-2 text-gray-500 shrink-0">|</span>
                        <span 
                            className="flex items-center gap-1 shrink-0 whitespace-nowrap"
                            title={lastPerformedTooltip}
                        >
                            <span 
                                className="cursor-pointer hover:underline"
                                onClick={(e) => { e.stopPropagation(); onShowInfo(plan); }}
                            >
                                {lastPerformedText}
                            </span>
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
                        </span>
                    </>
                    )}
                  </div>
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
                              <span className="truncate flex-1">{getStepDisplayName(step)} - <span className="text-gray-400 font-normal">{step.isRepBased ? `${step.reps} חזרות` : `${step.duration} שניות`}</span></span>
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
  const { plans, reorderPlans, startWorkout, importPlan, activeWorkout, recentlyImportedPlanId, isSyncing, forceSync } = useWorkout();
  const { settings, updateSettings } = useSettings();
  const { user, authStatus, signIn, signOut } = useAuth();
  
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const dragItemIndex = useRef<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
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
    // FIX: Corrected the logic to properly add/remove a planId from the selection.
    // The original code had a scoping issue with the `id` variable and incorrect filter logic.
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
      {sharingPlan && <ShareModal plan={sharingPlan} onClose={() => setSharingPlan(null)} />}
      <div className="flex justify-between items-center mb-4">
        {/* Left Side: Title */}
        <h2 className="text-2xl font-bold text-white">אימונים</h2>

        {/* Right Side: Action buttons & all auth displays */}
        <div className="flex items-center gap-1">
            {authStatus !== 'authenticated' && (
              <div className="flex flex-col items-center text-center">
                <p className="text-gray-400 text-xs mb-1">אורח</p>
                <button
                    onClick={signIn}
                    className="bg-white text-gray-700 p-1.5 rounded-full border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex items-center"
                    title="התחברות עם גוגל"
                    aria-label="התחברות עם גוגל"
                >
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                </button>
                <p className="text-white font-bold text-xs mt-1">התחברות</p>
              </div>
            )}
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
                        <span className="font-semibold text-white">Warm-up Routine</span>
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
          plans.map((plan, index) => (
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
                name: name,
                type: 'exercise',
                isRepBased,
                duration: isRepBased ? 0 : duration,
                reps: isRepBased ? reps : 0,
                set: { current: i + 1, total: sets },
            };
            newSteps.push(exerciseStep);
            
            if (rest > 0 && i < sets - 1) { // No rest after the last set
                const restStep: WorkoutStep = {
                    id: `${Date.now()}-set-${i}-rest`,
                    name: 'Rest',
                    type: 'rest',
                    isRepBased: false,
                    duration: rest,
                    reps: 0,
                    set: { current: i + 1, total: sets }, // Associate rest with the preceding set
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
    isWarmupEditor?: boolean;
}> = ({ step, index, updateStep, removeStep, isExpanded, onToggleExpand, color, settings, updateSettings, isWarmupEditor = false }) => {
    
    const PinButton: React.FC<{onClick: () => void; isActive: boolean; title: string}> = ({ onClick, isActive, title }) => (
        <button onClick={onClick} title={title} className={`p-1 rounded-full ${isActive ? 'text-blue-400' : 'text-gray-500 hover:text-white'}`}>
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 9.586V4a1 1 0 011-1z" clipRule="evenodd" /><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
        </button>
    );

    const stepBgClass = step.type === 'rest' ? 'bg-gray-700/80' : 'bg-gray-700/50';
    const displayName = getStepDisplayName(step);

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
                {isWarmupEditor && step.type === 'exercise' && (
                    <label onClick={e => e.stopPropagation()} className="relative inline-flex items-center cursor-pointer mr-2 shrink-0">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={step.enabled !== false}
                            onChange={e => updateStep(index, { enabled: e.target.checked })}
                        />
                        <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                )}
                <span className="text-gray-400 font-bold">#{index + 1}</span>
                <div className="flex-grow min-w-0">
                    <p className={`font-semibold text-white truncate transition-opacity ${step.enabled === false ? 'opacity-50' : ''}`} title={displayName}>{displayName}</p>
                    <p className={`text-sm text-gray-400 transition-opacity ${step.enabled === false ? 'opacity-50' : ''}`}>
                        {step.type === 'rest' ? 'מנוחה' : (step.isRepBased ? `${step.reps} חזרות` : `${step.duration} שניות`)}
                    </p>
                </div>
                <button className="p-2 text-gray-400 hover:text-white shrink-0">
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
  onAddSet: () => void;
  color?: string;
  settings: ReturnType<typeof useSettings>['settings'];
  updateSettings: ReturnType<typeof useSettings>['updateSettings'];
  expandedSteps: Record<string, boolean>;
  onToggleStepExpand: (stepId: string) => void;
}> = ({ steps, startIndex, updateStep, removeStep, removeSetGroup, isExpanded, onToggleExpand, onAddSet, color, settings, updateSettings, expandedSteps, onToggleStepExpand }) => {
    
    if (steps.length === 0) return null;

    const baseName = steps[0].name;
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
                    <button
                        onClick={onAddSet}
                        className="w-full mt-2 py-2 text-sm bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 transition-colors"
                    >
                        + Add Set
                    </button>
                </div>
            )}
        </div>
    );
};

// This function groups steps into individual steps or sets of steps for rendering in the editor.
const groupStepsForEditor = (steps: WorkoutStep[]): (WorkoutStep | WorkoutStep[])[] => {
    const grouped: (WorkoutStep | WorkoutStep[])[] = [];
    let i = 0;
    while (i < steps.length) {
        const step = steps[i];
        
        // Check if this step is the start of a set
        if (step.set && step.set.current === 1) {
            const baseName = step.name;
            const totalSets = step.set.total;
            const potentialSet: WorkoutStep[] = [];
            let j = i;
            let currentSetNumber = 1;

            // Try to gather all steps belonging to this set
            while(j < steps.length && currentSetNumber <= totalSets) {
                const currentExercise = steps[j];
                // Check if the current step is the correct exercise for the set
                if(currentExercise.name === baseName && currentExercise.set?.current === currentSetNumber) {
                     potentialSet.push(currentExercise);
                     j++;
                     // Check for an associated rest step
                     if (j < steps.length && steps[j].type === 'rest' && currentSetNumber < totalSets) {
                         potentialSet.push(steps[j]);
                         j++;
                     }
                     currentSetNumber++;
                } else {
                    break; // Pattern broken
                }
            }
            
            // Validate that we found all sets for this exercise group
            if (potentialSet.filter(s => s.type === 'exercise').length === totalSets) {
                grouped.push(potentialSet);
                i = j; // Move index past the processed group
                continue;
            }
        }

        // If not a set or pattern was broken, add step individually
        grouped.push(step);
        i++;
    }
    return grouped;
};

const PlanEditor: React.FC<{
  plan: WorkoutPlan | null;
  onBack: () => void;
  isWarmupEditor?: boolean;
}> = ({ plan, onBack, isWarmupEditor = false }) => {
    const { savePlan } = useWorkout();
    const { settings, updateSettings } = useSettings();

    const [editedPlan, setEditedPlan] = useState<WorkoutPlan | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const exerciseColorMap = useExerciseColorMap(editedPlan?.steps || []);
    
    // Drag and Drop state
    const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    useEffect(() => {
        const savedDraft = localStorage.getItem(EDITOR_STORAGE_KEY);
        if (savedDraft) {
            setEditedPlan(JSON.parse(savedDraft));
        } else if (plan) {
            setEditedPlan(JSON.parse(JSON.stringify(plan)));
        } else {
            setEditedPlan({
                id: `new_${Date.now()}`,
                name: '',
                steps: [],
                executionMode: 'linear',
                color: '#808080',
                version: 2,
            });
        }
        setExpandedGroups({}); // Collapse all on load
    }, [plan]);

     // Auto-save draft to local storage
    useEffect(() => {
        if (editedPlan) {
            localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(editedPlan));
        }
    }, [editedPlan]);

    // Pre-fetch exercise info in the background while the user is editing
    useEffect(() => {
        if (!editedPlan?.steps) return;

        const handler = setTimeout(() => {
            const exerciseNames = editedPlan.steps
                .filter(s => s.type === 'exercise')
                .map(s => s.name);
            
            if (exerciseNames.length > 0) {
                prefetchExercises(exerciseNames);
            }
        }, 2000); // Debounce for 2 seconds after last edit

        return () => {
            clearTimeout(handler);
        };
    }, [editedPlan?.steps]);


    const handleSave = () => {
        if (!editedPlan || editedPlan.steps.length === 0) {
            alert('Please add at least one step to the plan.');
            return;
        }
        
        const planToSave = { ...editedPlan, version: 2 };

        if (isWarmupEditor) {
            updateSettings({ warmupSteps: planToSave.steps });
        } else {
             if (planToSave.name.trim() === '') {
                const uniqueExercises = [...new Set(planToSave.steps
                    .filter(s => s.type === 'exercise')
                    .map(s => s.name)
                )];
                
                if (uniqueExercises.length > 0) {
                    planToSave.name = `אימון ${uniqueExercises.slice(0, 2).join(' ו')}`;
                } else {
                    planToSave.name = 'אימון מנוחה';
                }
            }

            if (planToSave.id.startsWith('new_')) {
                planToSave.id = Date.now().toString();
            }
            savePlan(planToSave);
        }

        localStorage.removeItem(EDITOR_STORAGE_KEY);
        onBack();
    };
    
    const handleBackWithConfirm = () => {
        const hasUnsavedChanges = localStorage.getItem(EDITOR_STORAGE_KEY) !== null;
        if(hasUnsavedChanges) {
            if(window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
                 localStorage.removeItem(EDITOR_STORAGE_KEY);
                 onBack();
            }
        } else {
            onBack();
        }
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
            if (step.type === 'exercise' && step.set) {
                setCounts.set(step.name, (setCounts.get(step.name) || 0) + 1);
            }
        });

        const setCounters = new Map<string, number>();
        return steps.map(step => {
            if (step.type === 'exercise' && step.set) {
                const total = setCounts.get(step.name);
                if (total) {
                    const currentCount = (setCounters.get(step.name) || 0) + 1;
                    setCounters.set(step.name, currentCount);
                    return { ...step, set: { current: currentCount, total } };
                }
            }
            return step;
        });
    };

    const removeStep = (index: number) => {
        if (!editedPlan) return;

        const stepToRemove = editedPlan.steps[index];
        let numToRemove = 1;

        if (stepToRemove.type === 'exercise' && stepToRemove.set && index + 1 < editedPlan.steps.length) {
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

    const handleAddSet = (startIndex: number, groupItem: WorkoutStep[]) => {
        if (!editedPlan) return;

        const lastExerciseStep = [...groupItem].reverse().find(s => s.type === 'exercise');
        if (!lastExerciseStep) return;

        const restStepTemplate = groupItem.find(s => s.type === 'rest');
        const newStepsToAdd: WorkoutStep[] = [];

        if (restStepTemplate) {
             const newRestStep: WorkoutStep = {
                id: `${Date.now()}-rest-from-set`,
                type: 'rest', name: 'Rest', isRepBased: false,
                duration: restStepTemplate.duration, reps: 0,
            };
            newStepsToAdd.push(newRestStep);
        }

        const newExerciseStep: WorkoutStep = {
            id: `${Date.now()}-ex-from-set`,
            type: 'exercise', name: lastExerciseStep.name,
            isRepBased: lastExerciseStep.isRepBased,
            duration: lastExerciseStep.duration, reps: lastExerciseStep.reps,
            set: { current: 0, total: 0 } // Placeholder, will be renumbered
        };
        newStepsToAdd.push(newExerciseStep);

        const currentSteps = [...editedPlan.steps];
        currentSteps.splice(startIndex + groupItem.length, 0, ...newStepsToAdd);
        
        const finalSteps = renumberAllSets(currentSteps);
        
        setEditedPlan(p => p ? { ...p, steps: finalSteps } : null);
    };

    const handleDragStart = (e: React.DragEvent, groupIndex: number) => {
        setDraggedGroupIndex(groupIndex);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, groupIndex: number) => {
        e.preventDefault();
        if (groupIndex !== draggedGroupIndex) {
            setDropTargetIndex(groupIndex);
        }
    };
    
    const handleDragLeave = () => {
        setDropTargetIndex(null);
    };

    const handleDrop = () => {
        if (draggedGroupIndex === null || dropTargetIndex === null || !editedPlan) return;
        
        const grouped = groupStepsForEditor(editedPlan.steps);
        const draggedGroup = grouped.splice(draggedGroupIndex, 1)[0];
        grouped.splice(dropTargetIndex, 0, draggedGroup);

        const newStepsFlat = grouped.flat();
        const finalSteps = renumberAllSets(newStepsFlat);
        
        setEditedPlan(p => p ? { ...p, steps: finalSteps } : null);

        setDraggedGroupIndex(null);
        setDropTargetIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedGroupIndex(null);
        setDropTargetIndex(null);
    };

    if (!editedPlan) {
        return null;
    }
    
    const groupedRenderItems = groupStepsForEditor(editedPlan.steps);
    let stepIndexCounter = 0;

    const editorTitle = isWarmupEditor ? 'Edit Warm-up' : (plan ? 'Edit Plan' : 'Create Plan');

    return (
        <div>
            <div className="flex items-center mb-6">
                <button onClick={handleBackWithConfirm} className="p-2 rounded-full hover:bg-gray-500/30 mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="text-2xl font-bold text-white">{editorTitle}</h2>
            </div>
            
            <div className="space-y-6">
                {!isWarmupEditor && (
                    <>
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
                    </>
                )}


                <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                   {groupedRenderItems.map((item, index) => {
                       const isBeingDragged = draggedGroupIndex === index;
                       const isDropTarget = dropTargetIndex === index;
                       const showTopIndicator = isDropTarget && draggedGroupIndex !== null && draggedGroupIndex > index;
                       const showBottomIndicator = isDropTarget && draggedGroupIndex !== null && draggedGroupIndex < index;

                       const groupContent = () => {
                           if (Array.isArray(item)) {
                               const startIndex = stepIndexCounter;
                               stepIndexCounter += item.length;
                               const groupId = `group-${item[0].id}`;
                               const color = exerciseColorMap.get(item[0].name);

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
                                       onAddSet={() => handleAddSet(startIndex, item)}
                                       color={color}
                                       settings={settings}
                                       updateSettings={updateSettings}
                                       expandedSteps={expandedGroups}
                                       onToggleStepExpand={toggleGroupExpansion}
                                   />
                               );
                           } else {
                               const step = item;
                               const stepIndex = stepIndexCounter;
                               stepIndexCounter++;
                               const color = step.type === 'exercise' ? exerciseColorMap.get(step.name) : undefined;
                               
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
                                       isWarmupEditor={isWarmupEditor}
                                   />
                               );
                           }
                       };

                       return (
                           <div key={`group-wrapper-${index}`}>
                               {showTopIndicator && <div className="h-2 my-1 bg-blue-500/50 rounded-full" />}
                               <div
                                 draggable
                                 onDragStart={(e) => handleDragStart(e, index)}
                                 onDragOver={(e) => handleDragOver(e, index)}
                                 onDrop={handleDrop}
                                 onDragEnd={handleDragEnd}
                                 onDragLeave={handleDragLeave}
                                 className={`transition-opacity duration-200 cursor-grab ${isBeingDragged ? 'opacity-40' : 'opacity-100'}`}
                               >
                                   {groupContent()}
                               </div>
                               {showBottomIndicator && <div className="h-2 my-1 bg-blue-500/50 rounded-full" />}
                           </div>
                       );
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

interface DumbbellSet {
    id: number;
    weight: string;
    quantity: string;
}

interface BandSet {
    id: number;
    resistance: string;
    quantity: string;
}

interface QuestionnaireAnswers {
    goal: string;
    level: string;
    age: number;
    time: number;
    equipment: string;
    dumbbells: DumbbellSet[];
    bands: BandSet[];
    extra: string;
}

const AiPlannerQuestionnaire: React.FC<{
  onSubmit: (answers: QuestionnaireAnswers, prompt: string) => void;
  onSkip: () => void;
  initialAnswers?: QuestionnaireAnswers | null;
}> = ({ onSubmit, onSkip, initialAnswers }) => {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<QuestionnaireAnswers>(initialAnswers || {
        goal: '',
        level: '',
        age: 30,
        time: 45,
        equipment: '',
        dumbbells: [{ id: Date.now(), weight: '', quantity: '' }],
        bands: [{ id: Date.now(), resistance: '', quantity: '' }],
        extra: '',
    });

    const goals = ['בניית שריר', 'ירידה במשקל', 'שיפור סיבולת', 'כושר כללי'];
    const levels = ['מתחיל', 'בינוני', 'מתקדם'];
    const equipmentTags = ['משקולות', 'גומיות התנגדות', 'מזרן', 'TRX', 'כדור פיזיו'];

    const handleAnswer = <K extends keyof QuestionnaireAnswers>(key: K, value: QuestionnaireAnswers[K]) => {
        setAnswers(prev => ({ ...prev, [key]: value }));
    };
    
    // Dumbbell handlers
    const handleDumbbellChange = (id: number, field: 'weight' | 'quantity', value: string) => {
        handleAnswer('dumbbells', answers.dumbbells.map(d => d.id === id ? { ...d, [field]: value } : d));
    };
    const handleAddDumbbellSet = () => {
        handleAnswer('dumbbells', [...answers.dumbbells, { id: Date.now(), weight: '', quantity: '' }]);
    };
    const handleRemoveDumbbellSet = (id: number) => {
        if (answers.dumbbells.length > 1) {
            handleAnswer('dumbbells', answers.dumbbells.filter(d => d.id !== id));
        }
    };
    
    // Band handlers
    const handleBandChange = (id: number, field: 'resistance' | 'quantity', value: string) => {
        handleAnswer('bands', answers.bands.map(b => b.id === id ? { ...b, [field]: value } : b));
    };
    const handleAddBandSet = () => {
        handleAnswer('bands', [...answers.bands, { id: Date.now(), resistance: '', quantity: '' }]);
    };
    const handleRemoveBandSet = (id: number) => {
        if (answers.bands.length > 1) {
            handleAnswer('bands', answers.bands.filter(b => b.id !== id));
        }
    };


    const handleEquipmentTagClick = (tag: string) => {
        const currentEquipment = answers.equipment.split(',').map(s => s.trim()).filter(Boolean);
        const newEquipment = currentEquipment.includes(tag)
            ? currentEquipment.filter(t => t !== tag)
            : [...currentEquipment, tag];
        handleAnswer('equipment', newEquipment.join(', '));
    };

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);
    
    const handleSubmit = () => {
        const eqList = answers.equipment.split(',').map(s => s.trim()).filter(Boolean);
        let equipmentPrompt = "";

        if (eqList.length === 0) {
            equipmentPrompt = "משקל גוף בלבד";
        } else {
            const equipmentParts = eqList.map(eq => {
                if (eq === 'משקולות') {
                    const validSets = answers.dumbbells.filter(d => d.weight.trim() && d.quantity.trim());
                    if (validSets.length > 0) {
                        return `משקולות (${validSets.map(d => `${d.quantity.trim()}x ${d.weight.trim()}`).join(', ')})`;
                    }
                    return 'משקולות'; // Return the base name if no details are provided
                }
                if (eq === 'גומיות התנגדות') {
                    const validSets = answers.bands.filter(b => b.resistance.trim() && b.quantity.trim());
                    if (validSets.length > 0) {
                        return `גומיות התנגדות (${validSets.map(b => `${b.quantity.trim()}x ${b.resistance.trim()}`).join(', ')})`;
                    }
                    return 'גומיות התנגדות'; // Return the base name if no details are provided
                }
                return eq; // For other equipment, just return the name
            });
            
            equipmentPrompt = equipmentParts.join(', ');
        }

        const compiledPrompt = `
אני רוצה תוכנית אימונים. הנה הפרטים שלי:
- מטרה: ${answers.goal}
- רמת כושר: ${answers.level}
- גיל: ${answers.age}
- זמן פנוי לאימון: ${answers.time} דקות
- ציוד זמין: ${equipmentPrompt || 'משקל גוף בלבד'}
- בקשות נוספות: ${answers.extra.trim() || 'אין'}
`;
        onSubmit(answers, compiledPrompt.trim());
    };
    
    const isNextDisabled = () => {
        switch(step) {
            case 0: return !answers.goal;
            case 1: return !answers.level;
            case 2: return !answers.age || answers.age < 10 || answers.age > 100;
            default: return false;
        }
    };

    const totalSteps = 6;
    const commonButtonClass = 'w-full p-4 rounded-lg text-white font-semibold transition-colors';

    const renderStepContent = () => {
        switch (step) {
            case 0: // Goal
                return (
                    <>
                        <h3 className="text-xl font-semibold text-white mb-6">מה המטרה העיקרית שלך?</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {goals.map(option => (
                                <button key={option} onClick={() => { handleAnswer('goal', option); handleNext(); }}
                                    className={`${commonButtonClass} ${answers.goal === option ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-700/50 hover:bg-gray-700'}`}>
                                    {option}
                                </button>
                            ))}
                        </div>
                    </>
                );
            case 1: // Level
                return (
                    <>
                        <h3 className="text-xl font-semibold text-white mb-6">מה רמת הכושר שלך?</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                             {levels.map(option => (
                                <button key={option} onClick={() => { handleAnswer('level', option); handleNext(); }}
                                    className={`${commonButtonClass} ${answers.level === option ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-700/50 hover:bg-gray-700'}`}>
                                    {option}
                                </button>
                            ))}
                        </div>
                    </>
                );
            case 2: // Age
                return (
                     <>
                        <h3 className="text-xl font-semibold text-white mb-6">מה הגיל שלך?</h3>
                        <input type="number" value={answers.age} onChange={(e) => handleAnswer('age', parseInt(e.target.value, 10) || 0)}
                            className="w-40 mx-auto bg-gray-800 text-white p-3 text-2xl text-center rounded-lg focus:outline-none focus:ring-2 ring-blue-500 [appearance:textfield]"
                            min="10" max="100" />
                    </>
                );
            case 3: // Time
                 return (
                     <>
                        <h3 className="text-xl font-semibold text-white mb-4">כמה זמן יש לך לאימון?</h3>
                        <p className="text-4xl font-bold text-center text-white mb-6 tabular-nums">{answers.time} דקות</p>
                        <input type="range" min="0" max="120" step="1" value={answers.time}
                            onChange={(e) => handleAnswer('time', parseInt(e.target.value, 10))}
                            className="w-full h-3 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                     </>
                 );
            case 4: // Equipment
                return (
                    <>
                        <h3 className="text-xl font-semibold text-white mb-4">איזה ציוד זמין לך?</h3>
                        <div className="flex flex-wrap gap-2 justify-center mb-4">
                            {equipmentTags.map(tag => (
                                <button key={tag} onClick={() => handleEquipmentTagClick(tag)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                                        answers.equipment.split(',').map(s => s.trim()).includes(tag)
                                        ? 'bg-blue-500 text-white' 
                                        : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                                    }`}>
                                    {tag}
                                </button>
                            ))}
                        </div>
                        <input type="text" value={answers.equipment} onChange={(e) => handleAnswer('equipment', e.target.value)}
                            placeholder="או כתוב ציוד אחר..."
                            className="w-full bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 ring-blue-500 text-center" />

                        {answers.equipment.includes('משקולות') && (
                            <div className="mt-4 animate-fadeIn text-right">
                                <label className="text-sm text-gray-300 block mb-2">אילו משקולות יש ברשותך?</label>
                                <div className="space-y-2">
                                    {answers.dumbbells.map((dumbbell) => (
                                        <div key={dumbbell.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                            <input type="text" placeholder="משקל (לדוגמה: 5 קג)" 
                                                   className="min-w-0 bg-gray-900 text-white p-2 rounded-md text-sm focus:outline-none focus:ring-1 ring-blue-500"
                                                   value={dumbbell.weight}
                                                   onChange={(e) => handleDumbbellChange(dumbbell.id, 'weight', e.target.value)} />
                                            <input type="text" placeholder="כמות" 
                                                   className="w-16 bg-gray-900 text-white p-2 rounded-md text-sm focus:outline-none focus:ring-1 ring-blue-500 text-center"
                                                   value={dumbbell.quantity}
                                                   onChange={(e) => handleDumbbellChange(dumbbell.id, 'quantity', e.target.value)} />
                                            <button onClick={() => handleRemoveDumbbellSet(dumbbell.id)}
                                                    disabled={answers.dumbbells.length <= 1}
                                                    aria-label="Remove dumbbell set"
                                                    className="p-2 text-gray-400 hover:text-red-500 rounded-full disabled:opacity-50 disabled:cursor-not-allowed">
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleAddDumbbellSet}
                                        className="mt-2 text-sm text-blue-400 hover:text-blue-300 font-semibold">
                                    + הוסף סוג
                                </button>
                            </div>
                        )}
                        {answers.equipment.includes('גומיות התנגדות') && (
                             <div className="mt-4 animate-fadeIn text-right">
                                <label className="text-sm text-gray-300 block mb-2">אילו גומיות התנגדות יש לך?</label>
                                 <div className="space-y-2">
                                    {answers.bands.map((band) => (
                                        <div key={band.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                            <input type="text" placeholder="התנגדות (למשל: קלה, אדומה)" 
                                                   className="min-w-0 bg-gray-900 text-white p-2 rounded-md text-sm focus:outline-none focus:ring-1 ring-blue-500"
                                                   value={band.resistance}
                                                   onChange={(e) => handleBandChange(band.id, 'resistance', e.target.value)} />
                                            <input type="text" placeholder="כמות" 
                                                   className="w-16 bg-gray-900 text-white p-2 rounded-md text-sm focus:outline-none focus:ring-1 ring-blue-500 text-center"
                                                   value={band.quantity}
                                                   onChange={(e) => handleBandChange(band.id, 'quantity', e.target.value)} />
                                            <button onClick={() => handleRemoveBandSet(band.id)}
                                                    disabled={answers.bands.length <= 1}
                                                    aria-label="Remove resistance band set"
                                                    className="p-2 text-gray-400 hover:text-red-500 rounded-full disabled:opacity-50 disabled:cursor-not-allowed">
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleAddBandSet}
                                        className="mt-2 text-sm text-blue-400 hover:text-blue-300 font-semibold">
                                    + הוסף סוג
                                </button>
                            </div>
                        )}
                    </>
                );
            case 5: // Extra Info
                return (
                     <>
                        <h3 className="text-xl font-semibold text-white mb-4">יש משהו נוסף שחשוב לך לציין?</h3>
                        <p className="text-gray-400 text-sm mb-4">(לדוגמה: דגש על רגליים, להימנע מקפיצות, כאבי גב וכו')</p>
                        <textarea value={answers.extra} onChange={(e) => handleAnswer('extra', e.target.value)}
                            placeholder="אופציונלי..."
                            className="w-full bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 ring-blue-500 resize-none h-24" />
                    </>
                );
            default: return null;
        }
    };

    return (
        <div className="p-4 flex flex-col h-full" dir="rtl">
            <div className="flex-grow overflow-y-auto pr-2 min-h-0">
                 <div className="text-center animate-fadeIn">
                    { step < totalSteps && <p className="text-sm text-gray-400 mb-2">שלב {step + 1} מתוך {totalSteps}</p> }
                    {renderStepContent()}
                </div>
            </div>
            <div className="mt-auto pt-4 border-t border-gray-700/50">
                <div className="flex justify-between items-center">
                    {step < totalSteps - 1 ? (
                        <button onClick={handleNext} disabled={isNextDisabled()}
                            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            הבא
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={isNextDisabled()}
                            className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            צור לי תוכנית!
                        </button>
                    )}
                     <button onClick={handleBack} disabled={step === 0}
                        className="px-6 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        הקודם
                    </button>
                </div>
                <div className="text-center mt-4">
                    <button onClick={onSkip} className="text-sm text-gray-400 hover:text-white hover:underline">
                        דלג ופתח צ'אט
                    </button>
                </div>
            </div>
        </div>
    );
};

const ContextSummaryBar: React.FC<{
    context: QuestionnaireAnswers;
    onEdit: () => void;
}> = ({ context, onEdit }) => {
    const summary = [
        context.goal,
        `${context.time} דקות`,
        context.level,
        context.equipment.split(',').map(s=>s.trim()).filter(Boolean)[0] || 'משקל גוף'
    ].filter(Boolean).join(' • ');

    return (
        <div className="bg-gray-800 px-4 py-1.5 rounded-full mb-4 flex justify-between items-center gap-4 text-sm" dir="rtl">
            <p className="text-gray-300 truncate"><span className="font-semibold text-gray-200">האימון הנוכחי:</span> {summary}</p>
            <button onClick={onEdit} className="text-blue-400 hover:underline font-semibold shrink-0">
                ערוך
            </button>
        </div>
    );
};

const AiPlannerModal: React.FC<{ onClose: () => void; }> = ({ onClose }) => {
    type ChatPart = { text: string; isPlanLink?: boolean; planName?: string };
    type ChatMessage = { role: 'user' | 'model'; parts: ChatPart[] };
    
    const { importPlan } = useWorkout();

    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        try {
            const saved = localStorage.getItem(AI_CHAT_HISTORY_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    
    const [plannerContext, setPlannerContext] = useState<QuestionnaireAnswers | null>(() => {
        const saved = localStorage.getItem(AI_PLANNER_CONTEXT_KEY);
        try {
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    const [showQuestionnaire, setShowQuestionnaire] = useState(() => {
        const savedChat = localStorage.getItem(AI_CHAT_HISTORY_KEY);
        return !savedChat || JSON.parse(savedChat).length === 0;
    });

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(messages));
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            
            const computedStyle = getComputedStyle(textarea);
            const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
            const paddingTop = parseFloat(computedStyle.paddingTop);
            const paddingBottom = parseFloat(computedStyle.paddingBottom);
            const maxHeight = (lineHeight * 5) + paddingTop + paddingBottom;

            textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
            textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    }, [input]);

    const handleNewChat = () => {
        setMessages([]);
        setPlannerContext(null);
        setShowQuestionnaire(true);
        localStorage.removeItem(AI_CHAT_HISTORY_KEY);
        localStorage.removeItem(AI_PLANNER_CONTEXT_KEY);
    };
    
    const callApiAndGetResponse = async (currentMessages: ChatMessage[], latestMessage: string) => {
        setIsLoading(true);
        try {
            const history = currentMessages.slice(0, -1).map(msg => ({
                role: msg.role,
                parts: msg.parts.map(p => ({text: p.text}))
            }));
            const responseText = await generateWorkoutPlan(history, latestMessage);
            
            if (responseText.startsWith('Error: ')) {
                const userFriendlyMessage = responseText.substring('Error: '.length);
                setMessages(prev => [...prev, { role: 'model', parts: [{ text: userFriendlyMessage }] }]);
                return;
            }

            const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = responseText.match(jsonRegex);
            const conversationalText = responseText.replace(jsonRegex, '').trim();
            
            let finalModelMessages: ChatMessage[] = [];

            if (conversationalText) {
                finalModelMessages.push({ role: 'model', parts: [{ text: conversationalText }]});
            }

            if (match && match[1]) {
                try {
                    const planJson = JSON.parse(match[1]);
                    planJson.isSmartPlan = true;
                    planJson.color = '#a855f7';
                    importPlan(planJson, 'ai');
                    finalModelMessages.push({ role: 'model', parts: [{ text: '', isPlanLink: true, planName: planJson.name }]});
                } catch (e) {
                    console.error("Failed to parse AI-generated JSON:", e);
                    finalModelMessages.push({ role: 'model', parts: [{ text: "I tried to generate a plan, but there was an error in the format. Could you please clarify your request? The full response is below for debugging:\n\n" + responseText }] });
                }
            } else if (!conversationalText) {
                 finalModelMessages.push({ role: 'model', parts: [{ text: responseText }]});
            }
            
            setMessages(prev => [...prev, ...finalModelMessages]);

        } catch (error) {
            console.error("AI Planner error:", error);
            const errorMessage = error instanceof Error ? error.message : "Sorry, something went wrong.";
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: errorMessage }] }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = () => {
        if (!input.trim() || isLoading) return;
        const userMessage: ChatMessage = { role: 'user', parts: [{ text: input }] };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        const currentInput = input;
        setInput('');
        callApiAndGetResponse(updatedMessages, currentInput);
    };
    
    const handleQuestionnaireSubmit = (answers: QuestionnaireAnswers, prompt: string) => {
        setPlannerContext(answers);
        localStorage.setItem(AI_PLANNER_CONTEXT_KEY, JSON.stringify(answers));
        setShowQuestionnaire(false);
        
        const userMessage: ChatMessage = { role: 'user', parts: [{ text: prompt }] };
        setMessages([userMessage]);
        callApiAndGetResponse([userMessage], prompt);
    };

    const handleSkipQuestionnaire = () => {
        setShowQuestionnaire(false);
        // If there was previous context, clear it since we are skipping to free chat
        if (plannerContext) {
            setPlannerContext(null);
            localStorage.removeItem(AI_PLANNER_CONTEXT_KEY);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/90 z-[100] flex flex-col p-4" aria-modal="true" role="dialog">
             <div className="flex justify-between items-center mb-4 text-white">
                <h2 className="text-xl font-bold flex items-center gap-2">✨ מתכנן אימונים חכם</h2>
                <div className="flex items-center gap-2">
                    <button onClick={handleNewChat} title="התחל שיחה חדשה" className="p-2 rounded-full hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                    </button>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            {showQuestionnaire ? (
                <AiPlannerQuestionnaire 
                    initialAnswers={plannerContext}
                    onSubmit={handleQuestionnaireSubmit}
                    onSkip={handleSkipQuestionnaire} 
                />
            ) : (
            <>
                {plannerContext && (
                    <ContextSummaryBar
                        context={plannerContext}
                        onEdit={() => setShowQuestionnaire(true)}
                    />
                )}
                <div className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-prose p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                {msg.parts.map((part, partIndex) => 
                                    part.isPlanLink ? (
                                        <div key={partIndex} dir="auto">
                                            <p>הוספתי את תוכנית "{part.planName}" לרשימה שלך.</p>
                                            <button onClick={onClose} className="mt-2 font-bold text-blue-300 hover:text-blue-200 underline">
                                                הצג תוכנית
                                            </button>
                                        </div>
                                    ) : (
                                        <p key={partIndex} className="whitespace-pre-wrap" dir="auto">{part.text}</p>
                                    )
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="max-w-sm p-3 rounded-lg bg-gray-700 text-gray-200">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                    </div>
                                    <span className="text-sm italic text-gray-400">בונה לך את האימון המושלם, כמה רגעים...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="flex gap-2">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="כתוב הודעה..."
                        className="flex-grow bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 ring-blue-500 resize-none"
                        dir="auto"
                        disabled={isLoading}
                    />
                    <button onClick={handleSend} disabled={isLoading || !input.trim()} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        שלח
                    </button>
                </div>
            </>
            )}
        </div>
    );
};


export const WorkoutMenu: React.FC<{ isOpen: boolean; setIsOpen: (open: boolean) => void; }> = ({ isOpen, setIsOpen }) => {
  const [isPinned, setIsPinned] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null | string>(null);
  const [view, setView] = useState<'list' | 'editor' | 'log'>('list');
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [exerciseToInspect, setExerciseToInspect] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [infoPlan, setInfoPlan] = useState<WorkoutPlan | null>(null);
  const { activeWorkout, plans, deletePlan } = useWorkout();
  const { settings, updateSettings } = useSettings();
  const modalMutedApp = useRef(false);
  const [isAiPlannerOpen, setIsAiPlannerOpen] = useState(false);

  // When the menu is closed, reset its internal view to the main plan list.
  // This ensures that when it's reopened, it doesn't show a sub-page like the log or editor.
  useEffect(() => {
    if (!isOpen) {
        // Use a timeout to avoid a jarring content flash while the menu is animating out.
        const timer = setTimeout(() => {
            setView('list');
            // Also clear any lingering editor state
            setEditingPlan(null);
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Mute app sounds when the exercise modal is visible and restore on close.
  useEffect(() => {
    if (isModalVisible) {
      // Modal is opening.
      if (!settings.isMuted) {
        modalMutedApp.current = true;
        updateSettings({ isMuted: true });
      }
    } else {
      // Modal is closing.
      if (modalMutedApp.current) {
        modalMutedApp.current = false;
        updateSettings({ isMuted: false });
      }
    }
  }, [isModalVisible, settings.isMuted, updateSettings]);
  
  const planToDelete = useMemo(() => {
    return plans.find(p => p.id === confirmDeletePlanId) || null;
  }, [confirmDeletePlanId, plans]);
  
  const planToEdit = useMemo(() => {
    if(editingPlan === null) return null;
    if(typeof editingPlan === 'string' && editingPlan === '_warmup_') {
        return {
            id: '_warmup_',
            name: 'Warm-up Routine',
            steps: settings.warmupSteps,
            color: '#f97316', // Orange for warm-up
            version: 2,
        } as WorkoutPlan
    }
    return editingPlan as WorkoutPlan;
  }, [editingPlan, settings.warmupSteps]);

  // Touch gesture state and handlers for swipe-to-close
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
    const distance = touchStartX.current - touchEndX.current; // Swipe left to close
    if (distance > minSwipeDistance) {
        handleClose();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Auto-close logic
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  
    // FIX: The handleClose function was missing and was not being called.
    const handleClose = () => {
        setIsOpen(false);
        setIsPinned(false);
    };

  const handleMouseLeave = () => {
    // Don't auto-close if pinned or during a workout
    if (isOpen && !isPinned && !activeWorkout) {
      closeTimerRef.current = setTimeout(() => {
        // FIX: handleClose was undefined. Now it is defined and called correctly.
        handleClose();
      }, 5000);
    }
  };
  
  const handleSelectPlan = (plan: WorkoutPlan | string) => {
    setEditingPlan(plan);
    setView('editor');
  };

  const handleCreateNew = () => {
    setEditingPlan(null);
    setView('editor');
  };

  const handleBackFromEditor = () => {
    setEditingPlan(null);
    setView('list');
  };

  const handleInitiateDelete = (planId: string) => {
    setConfirmDeletePlanId(planId);
  };

  const handleConfirmDelete = () => {
    if (confirmDeletePlanId) {
      deletePlan(confirmDeletePlanId);
    }
    setConfirmDeletePlanId(null);
  };

  const handleInspectExercise = (exerciseName: string) => {
    setExerciseToInspect(exerciseName);
    setIsModalVisible(true);
  };
  
  const handleShowInfo = (plan: WorkoutPlan) => {
      setInfoPlan(plan);
  };

  // FIX: Added the missing return statement and JSX for the component.
  // The component was previously returning `void`, causing a type error. This implementation
  // renders the workout menu panel, its content based on the current view (list, editor, log),
  // and all associated modals.
  return (
    <>
      <ExerciseInfoModal 
        isVisible={isModalVisible} 
        exerciseName={exerciseToInspect} 
        onClose={() => setIsModalVisible(false)} 
      />
      {confirmDeletePlanId && planToDelete && (
          <ConfirmDeleteModal 
            planName={planToDelete.name} 
            onConfirm={handleConfirmDelete} 
            onCancel={() => setConfirmDeletePlanId(null)} 
          />
      )}
      {infoPlan && (
          <WorkoutInfoModal plan={infoPlan} onClose={() => setInfoPlan(null)} />
      )}
      {isAiPlannerOpen && <AiPlannerModal onClose={() => setIsAiPlannerOpen(false)} />}
      
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => !isPinned && handleClose()}
        ></div>
      )}

      {/* Menu Trigger */}
      <div className="absolute top-4 left-4 menu-container group">
        <button 
          onClick={() => isOpen ? handleClose() : setIsOpen(true)} 
          aria-label="Open workout menu"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-opacity duration-1000 focus:outline-none opacity-0 group-hover:opacity-100"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
      </div>
      
      {/* Main Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-full max-w-sm bg-gray-800/80 backdrop-blur-md shadow-2xl z-50 transform transition-all ease-in-out ${isOpen ? 'duration-500' : 'duration-[1500ms]'} ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="p-6 overflow-y-auto h-full text-white">
          {view === 'list' && (
            <PlanList
              onSelectPlan={handleSelectPlan}
              onCreateNew={handleCreateNew}
              onInitiateDelete={handleInitiateDelete}
              onShowLog={() => setView('log')}
              onInspectExercise={handleInspectExercise}
              onShowInfo={handleShowInfo}
              isPinned={isPinned}
              onTogglePin={() => setIsPinned(!isPinned)}
              onOpenAiPlanner={() => setIsAiPlannerOpen(true)}
            />
          )}
          {view === 'editor' && (
            <PlanEditor 
              plan={planToEdit} 
              onBack={handleBackFromEditor}
              isWarmupEditor={editingPlan === '_warmup_'}
            />
          )}
          {view === 'log' && (
            <WorkoutLog onBack={() => setView('list')} />
          )}
        </div>
      </div>
    </>
  );
};