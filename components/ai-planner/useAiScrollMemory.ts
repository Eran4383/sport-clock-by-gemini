import { useEffect, useRef, useState } from 'react';

const SCROLL_POS_KEY = 'sportsClockAiUserScrollPos';
const HAS_SCROLLED_KEY = 'sportsClockAiHasUserScrolled';

export function useAiScrollMemory(
  chatContainerRef: React.RefObject<HTMLDivElement | null>,
  messagesCount: number
) {
  const isProgrammaticScrollRef = useRef(true);
  const [showScrollControls, setShowScrollControls] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Restore saved position or scroll to bottom on entry
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;

    const restoreOrScrollBottom = () => {
      const hasUserScrolled = sessionStorage.getItem(HAS_SCROLLED_KEY) === 'true';
      const savedPos = sessionStorage.getItem(SCROLL_POS_KEY);
      if (hasUserScrolled && savedPos !== null) {
        const parsed = parseFloat(savedPos);
        if (!isNaN(parsed)) {
          el.scrollTop = parsed;
          return;
        }
      }
      el.scrollTop = el.scrollHeight;
    };

    restoreOrScrollBottom();
    const r1 = requestAnimationFrame(restoreOrScrollBottom);
    const t1 = setTimeout(restoreOrScrollBottom, 50);
    const t2 = setTimeout(restoreOrScrollBottom, 150);
    const t3 = setTimeout(() => {
      restoreOrScrollBottom();
      isProgrammaticScrollRef.current = false;
    }, 300);

    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [chatContainerRef]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const nearBottom = target.scrollHeight - target.clientHeight - target.scrollTop <= 45;
    setIsNearBottom(nearBottom);
    setShowScrollControls(target.scrollTop > 100 || !nearBottom);

    if (isProgrammaticScrollRef.current) return;

    if (nearBottom) {
      sessionStorage.removeItem(HAS_SCROLLED_KEY);
      sessionStorage.removeItem(SCROLL_POS_KEY);
    } else {
      sessionStorage.setItem(HAS_SCROLLED_KEY, 'true');
      sessionStorage.setItem(SCROLL_POS_KEY, target.scrollTop.toString());
    }
  };

  const scrollToTop = () => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      sessionStorage.removeItem(HAS_SCROLLED_KEY);
      sessionStorage.removeItem(SCROLL_POS_KEY);
    }
  };

  const clearScrollMemory = () => {
    sessionStorage.removeItem(HAS_SCROLLED_KEY);
    sessionStorage.removeItem(SCROLL_POS_KEY);
    scrollToBottom();
  };

  return {
    handleScroll,
    scrollToTop,
    scrollToBottom,
    clearScrollMemory,
    showScrollControls,
    isNearBottom,
  };
}
