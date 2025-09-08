import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkout } from '../contexts/WorkoutContext';
import { WorkoutPlan, WorkoutStep } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { HoverNumberInput } from './HoverNumberInput';
import { getExerciseInfo, ExerciseInfo, clearExerciseFromCache } from '../services/geminiService';
import { WorkoutLog } from './WorkoutLog';
import { getBaseExerciseName, generateCircuitSteps } from '../utils/workout';

const ExerciseInfoModal: React.FC<{
  exerciseName: string;
  onClose: () => void;
  isVisible: boolean;
  forceRefresh: boolean;
}> = ({ exerciseName, onClose, isVisible, forceRefresh }) => {
  const [info, setInfo] = useState<ExerciseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'howto' | 'details'>('howto');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);


  useEffect(() => {
    const fetchInfo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getExerciseInfo(exerciseName, forceRefresh);
        setInfo(result);
        setActiveVideoId(result.primaryVideoId);
        if (result.instructions.toLowerCase().includes("error") || result.instructions.toLowerCase().includes("failed") || result.instructions.includes("api key") || result.instructions.includes("מפתח api")) {
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
    if (exerciseName && isVisible) {
        fetchInfo();
    }
  }, [exerciseName, forceRefresh, isVisible]);
  
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
    return info.instructions
      .split('\n')
      .map(line => line.trim().replace(/^\d+\.\s*/, ''))
      .filter(line => line.length > 0);
  }, [info?.instructions]);

  const parsedTips = useMemo(() => {
    if (!info?.tips) return [];
    // This regex strips any leading number and dot (e.g., "1. ") to prevent "• 1. Tip" when rendered in a <ul>.
    return info.tips.map(tip => tip.trim().replace(/^\d+\.?\s*/, ''));
  }, [info?.tips]);

  const embedUrl = useMemo(() => {
    if (activeVideoId && typeof activeVideoId === 'string' && activeVideoId.trim().length === 11) {
      return `https://www.youtube.com/embed/${activeVideoId}`;
    }
    return null;
  }, [activeVideoId]);

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
            <div className="flex-grow flex items-center justify-center" dir="rtl">
              <p className="text-gray-300 animate-pulse">אני מחפש סרטון הדרכה מתאים...</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="relative z-10 flex border-b border-gray-700 mb-4">
                <TabButton label={isHebrew ? "הדרכה" : "How-To"} isActive={activeTab === 'howto'} onMouseDown={handleSelectHowToTab} />
                <TabButton label={isHebrew ? "פרטים" : "Details"} isActive={activeTab === 'details'} onMouseDown={handleSelectDetailsTab} />
              </div>

              {/* Tab Content */}
              <div className="flex-grow overflow-y-auto pr-2 min-h-0">
                {/* How-To Tab Pane */}
                <div className={`space-y-4 ${activeTab !== 'howto' ? 'hidden' : ''}`}>
                    {/* Video Embed */}
                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
                        {embedUrl ? (
                            <iframe
                                key={activeVideoId}
                                className="w-full h-full"
                                src={embedUrl}
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
                        <p className="text-yellow-400 bg-yellow-900/30 p-3 rounded-md">{error}</p>
                     ) : parsedInstructions.length > 1 ? (
                        <ol className="list-decimal list-inside space-y-2 text-gray-200">
                            {parsedInstructions.map((item, index) => <li key={index}>{item}</li>)}
                        </ol>
                     ) : parsedInstructions.length === 1 ? (
                        <p className="text-gray-200">{parsedInstructions[0]}</p>
                     ) : (
                        <p className="text-gray-400">{isHebrew ? "לא נמצאו הוראות." : "No instructions found."}</p>
                     )}
                </div>

                {/* Details Tab Pane */}
                <div className={`space-y-6 ${activeTab !== 'details' ? 'hidden' : ''}`}>
                    {info && info.tips && info.tips.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-lg text-white mb-2">{isHebrew ? "דגשים" : "Tips"}</h4>
                        <ul className="list-disc list-inside space-y-1 text-gray-300">
                          {parsedTips.map((tip, index) => <li key={index}>{tip}</li>)}
                        </ul>
                      </div>
                    )}
                    {info && info.generalInfo && (
                      <div>
                        <h4 className="font-semibold text-lg text-white mb-2">{isHebrew ? "מידע כללי" : "General Info"}</h4>
                        <p className="text-gray-300 whitespace-pre-wrap">{info.generalInfo}</p>
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
  onInspectExercise: (exerciseName: string, forceRefresh?: boolean) => void;
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
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; exerciseName: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoveThreshold = 10; // pixels
  const touchStartCoords = useRef({ x: 0, y: 0 });

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
  
  // Context Menu Handlers
  const handleContextMenu = (e: React.MouseEvent, exerciseName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, exerciseName });
  };
  
  const handleTouchStart = (e: React.TouchEvent, exerciseName: string) => {
    e.stopPropagation();
    touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    longPressTimer.current = setTimeout(() => {
        setContextMenu({ visible: true, x: e.touches[0].clientX, y: e.touches[0].clientY, exerciseName });
        longPressTimer.current = null;
    }, 500); // 500ms for long press
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartCoords.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartCoords.current.y);
    if (dx > touchMoveThreshold || dy > touchMoveThreshold) {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }
    if (contextMenu?.visible) {
        e.preventDefault();
        e.stopPropagation();
    }
  };
  
  useEffect(() => {
    if (contextMenu?.visible) {
        const close = () => setContextMenu(null);
        window.addEventListener('click', close, { once: true });
        window.addEventListener('contextmenu', close, { once: true });
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('contextmenu', close);
        };
    }
  }, [contextMenu?.visible]);

  const handleRefreshExercise = async () => {
    if (!contextMenu) return;
    onInspectExercise(contextMenu.exerciseName, true);
    setContextMenu(null);
  };


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
    <>
      {contextMenu?.visible && (
          <div
              style={{ top: contextMenu.y, left: contextMenu.x, position: 'fixed', zIndex: 110 }}
              className="bg-gray-900 border border-gray-700 rounded-md shadow-lg py-1 animate-fadeIn"
              onClick={(e) => e.stopPropagation()} // Prevent this from closing the menu
          >
              <button
                  onClick={handleRefreshExercise}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-blue-600 hover:text-white"
              >
                  רענן מידע על התרגיל
              </button>
          </div>
      )}
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
                            onContextMenu={(e) => {
                              if (step.type === 'exercise' && !isActive) {
                                handleContextMenu(e, getBaseExerciseName(step.name));
                              }
                            }}
                            onTouchStart={(e) => {
                              if (step.type === 'exercise' && !isActive) {
                                handleTouchStart(e, getBaseExerciseName(step.name));
                              }
                            }}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
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
    </>
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
  onInspectExercise: (exerciseName: string, forceRefresh?: boolean) => void;
  isPinned: boolean;
  onTogglePin: () => void;
}> = ({ onSelectPlan, onCreateNew, onInitiateDelete, onShowLog, onInspectExercise, isPinned, onTogglePin }) => {
  const { plans, reorderPlans, startWorkout, importPlan, activeWorkout, recentlyImportedPlanId } = useWorkout();
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const dragItemIndex = useRef<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportTextVisible, setIsImportTextVisible] = useState(false);
  const [sharingPlan, setSharingPlan] = useState<WorkoutPlan | null>(null);

  const handleToggleSelection = (planId: string) => {
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
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          Workout Plans
        </h2>
        <div className="flex items-center gap-2">
            <button
                onClick={onShowLog}
                className="p-2 rounded-full hover:bg-gray-500/30 text-gray-400"
                title="View Workout Log"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
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
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M4 12v-6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2zm11-4a1 1 0 10-2 0v1.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L13 9.586V8z" /></svg>
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
          <button 
            onClick={onCreateNew}
            className="w-full text-center py-1.5 mb-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!!activeWorkout}
          >
            + Create New Plan
          </button>
      )}

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
  onAddSet: () => void;
  color?: string;
  settings: ReturnType<typeof useSettings>['settings'];
  updateSettings: ReturnType<typeof useSettings>['updateSettings'];
  expandedSteps: Record<string, boolean>;
  onToggleStepExpand: (stepId: string) => void;
}> = ({ steps, startIndex, updateStep, removeStep, removeSetGroup, isExpanded, onToggleExpand, onAddSet, color, settings, updateSettings, expandedSteps, onToggleStepExpand }) => {
    
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
    
    // Drag and Drop state
    const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

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
        if (!editedPlan || editedPlan.steps.length === 0) {
            alert('Please add at least one step to the plan.');
            return;
        }
        
        const planToSave = { ...editedPlan };

        if (planToSave.name.trim() === '') {
            const uniqueExercises = [...new Set(planToSave.steps
                .filter(s => s.type === 'exercise')
                .map(s => getBaseExerciseName(s.name))
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

    const handleAddSet = (startIndex: number, groupItem: WorkoutStep[]) => {
        if (!editedPlan) return;

        // Find the last exercise in the set to use as a template
        const lastExerciseStep = [...groupItem].reverse().find(s => s.type === 'exercise');
        if (!lastExerciseStep) return;

        // Find an existing rest step in the set to use as a template
        const restStepTemplate = groupItem.find(s => s.type === 'rest');

        const newStepsToAdd: WorkoutStep[] = [];

        // 1. Add a rest step if the set has rests. This adds the rest before the new exercise, which is correct for inter-set rest.
        if (restStepTemplate) {
             const newRestStep: WorkoutStep = {
                id: `${Date.now()}-rest-from-set`,
                type: 'rest',
                name: restStepTemplate.name, // Placeholder, will be renumbered
                isRepBased: false,
                duration: restStepTemplate.duration,
                reps: 0,
            };
            newStepsToAdd.push(newRestStep);
        }

        // 2. Add the new exercise step.
        const newExerciseStep: WorkoutStep = {
            id: `${Date.now()}-ex-from-set`,
            type: 'exercise',
            name: lastExerciseStep.name, // Placeholder, will be renumbered
            isRepBased: lastExerciseStep.isRepBased,
            duration: lastExerciseStep.duration,
            reps: lastExerciseStep.reps,
        };
        newStepsToAdd.push(newExerciseStep);

        const currentSteps = [...editedPlan.steps];
        // Insert the new steps right after the current set group in the main array
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
        
        const grouped = groupSteps(editedPlan.steps);
        const draggedGroup = grouped.splice(draggedGroupIndex, 1)[0];
        grouped.splice(dropTargetIndex, 0, draggedGroup);

        const newStepsFlat = grouped.flat();
        const finalSteps = renumberAllSets(newStepsFlat);
        
        setEditedPlan(p => p ? { ...p, steps: finalSteps } : null);

        // Reset state
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
                       const isBeingDragged = draggedGroupIndex === index;
                       const isDropTarget = dropTargetIndex === index;
                       const showTopIndicator = isDropTarget && draggedGroupIndex !== null && draggedGroupIndex > index;
                       const showBottomIndicator = isDropTarget && draggedGroupIndex !== null && draggedGroupIndex < index;

                       const groupContent = () => {
                           if (Array.isArray(item)) {
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


export const WorkoutMenu: React.FC<{ isOpen: boolean; setIsOpen: (open: boolean) => void; }> = ({ isOpen, setIsOpen }) => {
  const [isPinned, setIsPinned] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [view, setView] = useState<'list' | 'editor' | 'log'>('list');
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [exerciseToInspect, setExerciseToInspect] = useState<{name: string, refresh: boolean} | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { activeWorkout, plans, deletePlan } = useWorkout();
  const { settings, updateSettings } = useSettings();
  const modalMutedApp = useRef(false);

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
  
  // Effect to clear inspect state after modal's closing animation
  useEffect(() => {
    if (!isModalVisible) {
        const timer = setTimeout(() => {
            setExerciseToInspect(null);
        }, 300); // Should match modal's transition duration
        return () => clearTimeout(timer);
    }
  }, [isModalVisible]);

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

  const handleInspectExercise = (exerciseName: string, forceRefresh = false) => {
    setExerciseToInspect({ name: exerciseName, refresh: forceRefresh });
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
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

      {exerciseToInspect && (
        <ExerciseInfoModal 
            exerciseName={exerciseToInspect.name}
            forceRefresh={exerciseToInspect.refresh}
            onClose={handleCloseModal}
            isVisible={isModalVisible}
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
                    onInspectExercise={handleInspectExercise}
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