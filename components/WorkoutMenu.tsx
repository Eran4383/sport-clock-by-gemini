

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

// === Missing Components Implementation ===

const ConfirmDeleteModal: React.FC<{
    planName: string;
    onConfirm: () => void;
    onCancel: () => void;
  }> = ({ planName, onConfirm, onCancel }) => (
      <div className="fixed inset-0 bg-black/70 z-[101] flex items-center justify-center p-4" onClick={onCancel}>
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-white mb-2">Delete Plan?</h3>
              <p className="text-gray-300 mb-6">Are you sure you want to delete "{planName}"?</p>
              <div className="flex gap-4 justify-center">
                  <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white font-semibold">Cancel</button>
                  <button onClick={onConfirm} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-semibold">Delete</button>
              </div>
          </div>
      </div>
  );
  
const AiPlannerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { settings } = useSettings();
    const { importPlan } = useWorkout();
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; parts: { text: string }[] }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input;
        setInput('');
        const newMessages = [...messages, { role: 'user' as const, parts: [{ text: userMsg }] }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            // Build user profile context
            let profileContext = `Age: ${new Date().getFullYear() - new Date(settings.userProfile?.birthDate || new Date().getFullYear()).getFullYear()}`;
            profileContext += `, Fitness Level: ${settings.userProfile?.fitnessLevel}`;
            if (settings.userProfile?.equipment) {
                 profileContext += `, Equipment: ${settings.userProfile.equipment.filter(e => e.available).map(e => e.name).join(', ')}`;
            }
            
            const responseText = await generateWorkoutPlan(newMessages, userMsg, profileContext);
            
            const aiMessage = { role: 'model' as const, parts: [{ text: responseText }] };
            setMessages(prev => [...prev, aiMessage]);

            // Check for JSON plan
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                try {
                    const planData = JSON.parse(jsonMatch[1]);
                    if (planData && Array.isArray(planData.steps)) {
                         if (window.confirm(`AI generated plan "${planData.name}". Import it?`)) {
                            importPlan(planData, 'ai');
                            onClose();
                         }
                    }
                } catch (e) {
                    console.error("Failed to parse AI plan", e);
                }
            }

        } catch (e) {
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: "Error connecting to AI service." }] }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[101] flex flex-col p-4 animate-fadeIn">
            <div className="flex justify-between items-center mb-4 text-white">
                <h2 className="text-xl font-bold">AI Workout Planner</h2>
                <button onClick={onClose} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-900 rounded-lg p-4 mb-4 space-y-4">
                {messages.length === 0 && <p className="text-gray-500 text-center mt-10">Describe your workout goal...</p>}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                            <p className="whitespace-pre-wrap text-sm">{m.parts[0].text.replace(/```json[\s\S]*?```/, '[Plan JSON Data]')}</p>
                        </div>
                    </div>
                ))}
                {isLoading && <div className="text-gray-500 italic text-sm">Thinking...</div>}
                <div ref={messagesEndRef} />
            </div>
            <div className="flex gap-2">
                <input 
                    className="flex-1 p-3 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 ring-blue-500"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Type here..."
                    disabled={isLoading}
                />
                <button onClick={handleSend} disabled={isLoading} className="p-3 bg-blue-600 text-white rounded-lg disabled:opacity-50 font-semibold">Send</button>
            </div>
        </div>
    );
};

// PlanListItem
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
  onTogglePin: (plan: WorkoutPlan) => void;
}> = ({ plan, onSelectPlan, onInitiateDelete, onInspectExercise, onShowInfo, onShare, isSelected, onToggleSelection, isDraggable, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, isDragTarget, isNewlyImported, index, setRef, onTogglePin }) => {
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
               <button
                  onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(plan);
                  }}
                  className={`p-2 hover:bg-gray-600/50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${plan.isPinned ? 'text-blue-400' : 'text-gray-300'}`}
                  aria-label={plan.isPinned ? "Unpin plan" : "Pin plan"}
                  title={plan.isPinned ? "בטל נעיצה" : "נעץ תוכנית (יופיע בראש הרשימה)"}
                  disabled={!!activeWorkout}
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" transform="rotate(45 10 10)" />
                  </svg>
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

const PlanList: React.FC<any> = ({ onSelectPlan, onCreateNew, onInitiateDelete, onShowLog, onInspectExercise, onShowInfo, isPinned, onTogglePin, onOpenAiPlanner }) => {
  const { plans, reorderPlans, startWorkout, recentlyImportedPlanId, activeWorkout, savePlan } = useWorkout();
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleToggleSelection = (id: string) => {
      setSelectedPlans(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleStartSelected = () => {
      startWorkout(selectedPlans);
      setSelectedPlans([]);
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
  };

  const onDrop = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
      const newPlans = [...plans];
      const [moved] = newPlans.splice(draggedIndex, 1);
      newPlans.splice(index, 0, moved);
      reorderPlans(newPlans);
      setDraggedIndex(null);
  };

  return (
      <div className="space-y-4">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">My Plans</h2>
              <div className="flex gap-2">
                  <button onClick={onOpenAiPlanner} className="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700" title="AI Planner">
                       <span className="text-xl">✨</span>
                  </button>
                  <button onClick={onShowLog} className="p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600" title="History">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                  <button onClick={onTogglePin} className={`p-2 rounded-full ${isPinned ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:bg-gray-700'}`} title="Pin Menu">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
                  </button>
              </div>
          </div>
          
          <button onClick={onCreateNew} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors mb-4 flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              Create New Plan
          </button>
          
          <div className="space-y-3">
               {/* Warmup Special Item */}
               <div 
                  className="rounded-lg bg-orange-900/20 border border-orange-500/30 p-3 cursor-pointer hover:bg-orange-900/30 transition-colors"
                  onClick={() => onSelectPlan('_warmup_')}
               >
                  <h3 className="text-lg font-semibold text-orange-400">Warm-up Routine</h3>
                  <p className="text-xs text-gray-400">Default warm-up before any workout</p>
               </div>

              {plans.map((plan, index) => (
                  <PlanListItem
                      key={plan.id}
                      index={index}
                      plan={plan}
                      onSelectPlan={onSelectPlan}
                      onInitiateDelete={onInitiateDelete}
                      onInspectExercise={onInspectExercise}
                      onShowInfo={onShowInfo}
                      onShare={(p) => {/* implement share if needed */}}
                      isSelected={selectedPlans.includes(plan.id)}
                      onToggleSelection={handleToggleSelection}
                      isDraggable={true}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onDragEnd={() => setDraggedIndex(null)}
                      onDragLeave={() => {}}
                      isDragTarget={draggedIndex === index}
                      isNewlyImported={plan.id === recentlyImportedPlanId}
                      setRef={() => {}}
                      onTogglePin={(p) => savePlan({ ...p, isPinned: !p.isPinned })}
                  />
              ))}
          </div>

          {selectedPlans.length > 0 && !activeWorkout && (
              <div className="fixed bottom-0 left-0 w-full max-w-sm p-4 bg-gray-900 border-t border-gray-800 z-50">
                  <button onClick={handleStartSelected} className="w-full py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 shadow-lg">
                      Start {selectedPlans.length} Selected Plans
                  </button>
              </div>
          )}
      </div>
  );
}

const PlanEditor: React.FC<{ plan: WorkoutPlan | null, onBack: () => void, isWarmupEditor?: boolean }> = ({ plan, onBack, isWarmupEditor }) => {
  const { savePlan } = useWorkout();
  const { settings, updateSettings } = useSettings();
  const [name, setName] = useState(plan?.name || '');
  const [steps, setSteps] = useState<WorkoutStep[]>(plan?.steps || []);
  const [executionMode, setExecutionMode] = useState<'linear'|'circuit'>(plan?.executionMode || 'linear');

  const handleSave = () => {
      if (!name.trim()) return alert("Name required");
      if (steps.length === 0) return alert("Add at least one step");

      if (isWarmupEditor) {
          updateSettings({ warmupSteps: steps });
      } else {
          const newPlan: WorkoutPlan = {
              id: plan?.id || Date.now().toString(),
              name,
              steps,
              executionMode,
              version: 2
          };
          savePlan(newPlan);
      }
      onBack();
  };

  const addStep = (type: 'exercise' | 'rest') => {
      const newStep: WorkoutStep = {
          id: Date.now().toString(),
          name: type === 'exercise' ? 'New Exercise' : 'Rest',
          type,
          isRepBased: false,
          duration: 30,
          reps: 10
      };
      setSteps([...steps, newStep]);
  };

  const updateStep = (index: number, updates: Partial<WorkoutStep>) => {
      const newSteps = [...steps];
      newSteps[index] = { ...newSteps[index], ...updates };
      setSteps(newSteps);
  };

  const removeStep = (index: number) => {
      setSteps(steps.filter((_, i) => i !== index));
  };

  return (
      <div className="pb-20">
          <div className="flex items-center mb-6">
              <button onClick={onBack} className="mr-3 p-1 rounded-full hover:bg-gray-700 text-white">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="text-xl font-bold text-white">{plan ? 'Edit Plan' : 'New Plan'}</h2>
          </div>
          
          <div className="space-y-4">
              {!isWarmupEditor && (
                  <>
                      <div>
                          <label className="block text-gray-400 text-sm mb-1">Plan Name</label>
                          <input 
                              className="w-full p-2 bg-gray-700 text-white rounded focus:ring-2 ring-blue-500 outline-none" 
                              value={name} 
                              onChange={e => setName(e.target.value)} 
                          />
                      </div>
                      <div>
                           <label className="block text-gray-400 text-sm mb-1">Execution Mode</label>
                           <div className="flex bg-gray-700 rounded p-1">
                               <button onClick={() => setExecutionMode('linear')} className={`flex-1 py-1 rounded ${executionMode === 'linear' ? 'bg-blue-600 text-white' : 'text-gray-300'}`}>Linear</button>
                               <button onClick={() => setExecutionMode('circuit')} className={`flex-1 py-1 rounded ${executionMode === 'circuit' ? 'bg-blue-600 text-white' : 'text-gray-300'}`}>Circuit</button>
                           </div>
                      </div>
                  </>
              )}
              
              <div className="border-t border-gray-700 pt-4">
                  <h3 className="text-lg font-semibold text-white mb-3">Steps</h3>
                  <div className="space-y-2">
                      {steps.map((step, index) => (
                          <div key={step.id || index} className="bg-gray-700/50 p-3 rounded flex flex-col gap-2">
                              <div className="flex justify-between items-center">
                                  <input 
                                      className="bg-transparent text-white font-medium focus:outline-none border-b border-transparent focus:border-blue-500 w-full"
                                      value={step.name} 
                                      onChange={e => updateStep(index, { name: e.target.value })} 
                                  />
                                  <button onClick={() => removeStep(index)} className="text-red-400 hover:text-red-300 ml-2">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                  </button>
                              </div>
                              <div className="flex gap-2 text-sm">
                                  {step.type === 'exercise' && (
                                      <button onClick={() => updateStep(index, { isRepBased: !step.isRepBased })} className={`px-2 py-1 rounded ${step.isRepBased ? 'bg-blue-900 text-blue-200' : 'bg-green-900 text-green-200'}`}>
                                          {step.isRepBased ? 'Reps' : 'Time'}
                                      </button>
                                  )}
                                  <div className="flex items-center gap-1 bg-gray-600 rounded px-2">
                                      <span className="text-gray-300">{step.isRepBased ? 'Count:' : 'Seconds:'}</span>
                                      <HoverNumberInput 
                                          value={step.isRepBased ? step.reps : step.duration} 
                                          onChange={v => updateStep(index, step.isRepBased ? { reps: v } : { duration: v })}
                                          className="w-12 bg-transparent text-white text-center focus:outline-none"
                                      />
                                  </div>
                                  <input 
                                      placeholder="Tip..." 
                                      className="bg-gray-600 text-gray-200 rounded px-2 flex-1 focus:outline-none focus:ring-1 ring-blue-500"
                                      value={step.tip || ''}
                                      onChange={e => updateStep(index, { tip: e.target.value })}
                                  />
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="flex gap-2 mt-4">
                  <button onClick={() => addStep('exercise')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-medium">+ Exercise</button>
                  <button onClick={() => addStep('rest')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-medium">+ Rest</button>
              </div>
              
              <div className="pt-6">
                   <button onClick={handleSave} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg">Save Plan</button>
              </div>
          </div>
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
            name: 'חימום',
            steps: settings.warmupSteps,
            color: '#f97316', // Orange for warm-up
            version: 2,
        } as WorkoutPlan
    }
    return editingPlan as WorkoutPlan;
  }, [editingPlan, settings.warmupSteps]);

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
      localStorage.removeItem(EDITOR_STORAGE_KEY);
      setEditingPlan(null);
      setView('editor');
  };

  const handleSelectPlan = (plan: WorkoutPlan | string) => {
      localStorage.removeItem(EDITOR_STORAGE_KEY);
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

  const handleInspectExercise = (exerciseName: string) => {
    if (isModalVisible && exerciseToInspect === exerciseName) {
        return;
    }
    setExerciseToInspect(exerciseName);
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

      <ExerciseInfoModal 
          exerciseName={exerciseToInspect}
          onClose={handleCloseModal}
          isVisible={isModalVisible}
      />

      {infoPlan && <WorkoutInfoModal plan={infoPlan} onClose={() => setInfoPlan(null)} />}

      {isAiPlannerOpen && <AiPlannerModal onClose={() => setIsAiPlannerOpen(false)} />}

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
                    onShowInfo={setInfoPlan}
                    isPinned={isPinned}
                    onTogglePin={() => setIsPinned(!isPinned)}
                    onOpenAiPlanner={() => setIsAiPlannerOpen(true)}
                />
            )}
            {view === 'editor' && (
                <PlanEditor 
                    plan={planToEdit} 
                    onBack={handleBack} 
                    isWarmupEditor={typeof editingPlan === 'string' && editingPlan === '_warmup_'}
                />
            )}
            {view === 'log' && (
                <WorkoutLog onBack={handleBack} />
            )}
          </div>
        </div>
    </>
  );
};
