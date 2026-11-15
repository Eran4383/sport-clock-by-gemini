import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ModelPreference } from './types';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useAiScrollMemory } from './useAiScrollMemory';
import { useAiWorkoutGenerator } from './useAiWorkoutGenerator';
import { ChatHeader } from './ChatHeader';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInputBar } from './ChatInputBar';
import { FloatingScrollButtons } from './FloatingScrollButtons';
import { AiProfilePanel } from './AiProfilePanel';

const AI_CHAT_KEY = 'sportsClockAiChatHistory_v2';

export const AiPlannerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(AI_CHAT_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [modelPreference, setModelPreference] = useState<ModelPreference>('smart');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  const { isListening, speechNotice, toggleListening, stopListening } =
    useSpeechRecognition(input, setInput);

  const {
    handleScroll,
    scrollToTop,
    scrollToBottom,
    clearScrollMemory,
    showScrollControls,
    isNearBottom,
  } = useAiScrollMemory(chatContainerRef, messages.length);

  const { isLoading, sendMessage, retryLastMessage, canRetry } =
    useAiWorkoutGenerator(messages, setMessages, stopListening);

  useEffect(() => {
    localStorage.setItem(AI_CHAT_KEY, JSON.stringify(messages));
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopy = (text: string, index: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(console.error);
  };

  const handleNewChat = () => {
    stopListening();
    setMessages([]);
    localStorage.removeItem(AI_CHAT_KEY);
    clearScrollMemory();
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const currentInput = input;
    setInput('');
    sendMessage(currentInput, modelPreference);
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/95 z-[100] flex flex-col p-4 select-text"
      aria-modal="true"
      role="dialog"
      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      <AiProfilePanel isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      <ChatHeader
        onOpenProfile={() => setIsProfileOpen(true)}
        onNewChat={handleNewChat}
        onClose={onClose}
      />

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2 select-text relative"
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        {messages.length === 0 && (
          <div className="text-center text-gray-400 p-8 select-text cursor-text" dir="rtl" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
            <p className="text-lg select-text font-bold text-gray-300">ברוכים הבאים למתכנן האימונים החכם! ⚡</p>
            <p className="mt-2 select-text text-sm">תאר את האימון שברצונך לבנות בהקלדה או בלחיצה על המיקרופון:</p>
            <em className="block mt-2 select-text text-indigo-300 text-sm">"בנה לי אימון HIIT של 15 דקות ללא ציוד"</em>
          </div>
        )}

        {messages.map((msg, idx) => (
          <ChatMessageItem
            key={idx}
            message={msg}
            index={idx}
            copiedIndex={copiedIndex}
            onCopy={handleCopy}
            onCloseModal={onClose}
            onRetry={canRetry && idx === messages.length - 1 ? retryLastMessage : undefined}
            onNewChat={handleNewChat}
          />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-sm p-3 rounded-lg bg-gray-700 text-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm italic text-gray-400">בונה לך את האימון המושלם, כמה רגעים...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <FloatingScrollButtons
        show={showScrollControls}
        isNearBottom={isNearBottom}
        onScrollToTop={scrollToTop}
        onScrollToBottom={scrollToBottom}
      />

      <ChatInputBar
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        modelPreference={modelPreference}
        setModelPreference={setModelPreference}
        isListening={isListening}
        speechNotice={speechNotice}
        onToggleListening={toggleListening}
        onSend={handleSend}
      />
    </div>
  );
};
