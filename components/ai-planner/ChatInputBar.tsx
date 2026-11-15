import React, { useRef, useEffect, useState } from 'react';
import { ModelPreference } from './types';

interface ChatInputBarProps {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  modelPreference: ModelPreference;
  setModelPreference: (m: ModelPreference) => void;
  isListening: boolean;
  speechNotice: string | null;
  onToggleListening: () => void;
  onSend: () => void;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  input,
  setInput,
  isLoading,
  modelPreference,
  setModelPreference,
  isListening,
  speechNotice,
  onToggleListening,
  onSend,
}) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const computedStyle = getComputedStyle(textarea);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
      const paddingTop = parseFloat(computedStyle.paddingTop);
      const paddingBottom = parseFloat(computedStyle.paddingBottom);
      const maxHeight = lineHeight * 5 + paddingTop + paddingBottom;

      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [input]);

  return (
    <div className="flex gap-2 items-end bg-gray-900/60 p-2.5 rounded-2xl border border-gray-700/80 relative">
      {speechNotice && (
        <div className="absolute -top-11 right-2 bg-gray-800/95 text-amber-300 text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 shadow-xl flex items-center gap-2 animate-in fade-in select-none z-30 backdrop-blur-sm">
          {isListening && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>}
          <span>{speechNotice}</span>
        </div>
      )}

      {showModelSelector && (
        <div className="absolute bottom-16 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-2 w-56 z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="text-xs text-gray-500 mb-2 px-2 uppercase tracking-wider font-bold">בחר מודל</div>
          <button
            onClick={() => { setModelPreference('smart'); setShowModelSelector(false); }}
            className={`w-full text-left px-3 py-3 rounded-lg text-sm flex items-center gap-3 transition-colors ${modelPreference === 'smart' ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-gray-300 hover:bg-gray-700'}`}
          >
            <span className="text-xl">🧠</span>
            <div className="text-right flex-1">
              <div className="font-bold">Smart Pro</div>
              <div className="text-[10px] opacity-70">חשיבה עמוקה ודיוק</div>
            </div>
          </button>
          <button
            onClick={() => { setModelPreference('speed'); setShowModelSelector(false); }}
            className={`w-full text-left px-3 py-3 rounded-lg text-sm flex items-center gap-3 mt-1 transition-colors ${modelPreference === 'speed' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'text-gray-300 hover:bg-gray-700'}`}
          >
            <span className="text-xl">⚡</span>
            <div className="text-right flex-1">
              <div className="font-bold">Flash Speed</div>
              <div className="text-[10px] opacity-70">מהיר וחסכוני</div>
            </div>
          </button>
        </div>
      )}

      <button
        onClick={() => setShowModelSelector(!showModelSelector)}
        className={`p-3 mb-0.5 rounded-xl transition-all border shrink-0 ${
          modelPreference === 'smart'
            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
        }`}
        title="בחר מודל AI"
      >
        {modelPreference === 'smart' ? '🧠' : '⚡'}
      </button>

      {/* Integrated typing box with microphone inside */}
      <div className="flex-grow relative flex items-center bg-gray-800 rounded-xl border border-gray-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/40 transition-all">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={
            isListening
              ? 'מקשיב... דבר עכשיו (הקלדה קולית)'
              : modelPreference === 'smart'
              ? 'שאל את המאמן (מודל חכם)...'
              : 'בקשה מהירה לבניית אימון...'
          }
          className="w-full bg-transparent text-white p-3 pr-3.5 pl-11 focus:outline-none resize-none max-h-32 overflow-y-auto font-sans leading-relaxed text-sm select-text"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          dir="rtl"
          disabled={isLoading}
        />

        <button
          type="button"
          onClick={onToggleListening}
          disabled={isLoading}
          className={`absolute left-1.5 bottom-1.5 p-2 rounded-lg transition-all cursor-pointer ${
            isListening
              ? 'bg-red-600 text-white shadow-lg shadow-red-500/50 animate-pulse ring-2 ring-red-400'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/80'
          }`}
          title={isListening ? 'עצור הקלטה קולית' : 'הקלדה קולית באמצעות מיקרופון'}
          aria-label={isListening ? 'עצור הקלטה קולית' : 'הקלדה קולית באמצעות מיקרופון'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        </button>
      </div>

      <button
        onClick={onSend}
        disabled={isLoading || !input.trim()}
        className="p-3 mb-0.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-600/30 shrink-0 cursor-pointer flex items-center justify-center"
        title="שלח הודעה"
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 transform rotate-180">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        )}
      </button>
    </div>
  );
};
