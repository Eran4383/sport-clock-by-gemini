export const formatTime = (timeInMs: number): string => {
  const totalSeconds = Math.floor(timeInMs / 1000);
  
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
};

export const formatRelativeDate = (isoDateString?: string): string | null => {
    if (!isoDateString) return null;
    try {
        const date = new Date(isoDateString);
        const now = new Date();

        // Use start of day for comparison to avoid time-of-day issues
        const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const diffTime = startOfToday.getTime() - startDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'היום';
        if (diffDays === 1) return 'אתמול';
        if (diffDays > 1 && diffDays < 7) return `לפני ${diffDays} ימים`;
        
        return date.toLocaleDateString('he-IL', {
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    } catch (e) {
        console.error("Invalid date for formatRelativeDate:", isoDateString, e);
        return null;
    }
};
