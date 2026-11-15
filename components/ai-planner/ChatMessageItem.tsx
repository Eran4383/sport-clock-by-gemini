import React from 'react';
import { ChatMessage } from './types';

interface ChatMessageItemProps {
  message: ChatMessage;
  index: number;
  copiedIndex: number | null;
  onCopy: (text: string, index: number) => void;
  onCloseModal: () => void;
  onRetry?: () => void;
  onNewChat?: () => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  index,
  copiedIndex,
  onCopy,
  onCloseModal,
  onRetry,
  onNewChat,
}) => {
  const fullText = message.parts.map(p => p.text).filter(Boolean).join('\n');
  const isError =
    message.role === 'model' &&
    (fullText.startsWith('שגיאה:') ||
      fullText.startsWith('Error:') ||
      fullText.includes('אירעה שגיאה') ||
      fullText.includes('לא ניתן להתחבר למתכנן'));
  const isCopied = copiedIndex === index;

  if (isError) {
    return (
      <div className="flex justify-start select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
        <div
          className="max-w-prose p-3.5 rounded-xl bg-red-950/85 border border-red-500/50 text-red-200 select-text cursor-text shadow-lg"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        >
          <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-red-800/40 select-none text-xs font-bold text-red-400">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>הודעת שגיאה</span>
          </div>
          <div className="space-y-1 select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
            {message.parts.map((part, partIndex) => (
              <p key={partIndex} className="whitespace-pre-wrap select-text cursor-text leading-relaxed font-sans" dir="auto" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                {part.text}
              </p>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-red-800/40 flex flex-wrap justify-end items-center gap-2 select-none">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm whitespace-nowrap shrink-0"
              >
                <span>נסה שוב</span>
              </button>
            )}
            {onNewChat && (
              <button
                type="button"
                onClick={onNewChat}
                className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-gray-600 whitespace-nowrap shrink-0"
              >
                <span>צ'אט חדש</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onCopy(fullText, index)}
              className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-red-900/90 hover:bg-red-800 text-white flex items-center gap-1.5 transition-colors cursor-pointer font-medium shadow-sm border border-red-700/60 whitespace-nowrap shrink-0"
              title="העתק את הודעת השגיאה"
            >
              <span>{isCopied ? 'הועתק!' : 'העתק שגיאה'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
        <div
          className="max-w-prose p-3 rounded-xl bg-blue-600 text-white select-text cursor-text shadow"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        >
          <div className="space-y-1 select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
            {message.parts.map((part, partIndex) => (
              <p key={partIndex} className="whitespace-pre-wrap select-text cursor-text leading-relaxed font-sans" dir="auto" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                {part.text}
              </p>
            ))}
          </div>
          {fullText && (
            <div className="mt-2.5 pt-1.5 border-t border-blue-500/40 flex justify-end items-center select-none">
              <button
                type="button"
                onClick={() => onCopy(fullText, index)}
                className="px-2.5 py-1 rounded-md bg-blue-700/90 hover:bg-blue-700 text-blue-100 transition-all text-xs flex items-center gap-1.5 cursor-pointer select-none shadow-sm"
                title="העתק הודעה"
              >
                <span className={isCopied ? 'text-green-200 font-bold' : ''}>{isCopied ? 'הועתק!' : 'העתק'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
      <div
        className="max-w-prose p-3.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 select-text cursor-text shadow"
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        <div className="space-y-1 select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
          {message.parts.map((part, partIndex) =>
            part.isPlanLink ? (
              <div key={partIndex} dir="auto" className="my-1.5 p-2.5 bg-purple-900/40 border border-purple-500/30 rounded-lg select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                <p className="select-text text-purple-200 font-medium" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>✨ הוספתי את תוכנית "{part.planName}" לרשימה שלך.</p>
                <button onClick={onCloseModal} className="mt-2 inline-flex items-center gap-1 font-bold text-purple-300 hover:text-purple-100 underline cursor-pointer">
                  <span>הצג תוכנית</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : (
              <p key={partIndex} className="whitespace-pre-wrap select-text cursor-text leading-relaxed font-sans" dir="auto" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                {part.text}
              </p>
            )
          )}
        </div>
        {fullText && (
          <div className="mt-2.5 pt-1.5 border-t border-gray-700/60 flex justify-end items-center select-none">
            <button
              type="button"
              onClick={() => onCopy(fullText, index)}
              className="px-2.5 py-1 rounded-md bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white transition-all text-xs flex items-center gap-1.5 cursor-pointer select-none border border-gray-650 shadow-sm"
              title="העתק טקסט"
            >
              <span className={isCopied ? 'text-green-400 font-bold' : ''}>{isCopied ? 'הועתק!' : 'העתק'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
