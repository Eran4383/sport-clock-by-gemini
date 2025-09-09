

export interface ExerciseInfo {
    primaryVideoId: string | null;
    alternativeVideoIds: string[];
    instructions: string;
    tips: string[];
    generalInfo: string;
    language: 'en' | 'he' | string;
}

const CACHE_KEY = 'geminiExerciseCache_v3';

// Helper to get the cache object from localStorage
const getCache = (): Record<string, ExerciseInfo> => {
    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        return cachedData ? JSON.parse(cachedData) : {};
    } catch (error) {
        console.error("Failed to read from cache", error);
        // If cache is corrupted, clear it and return an empty object
        localStorage.removeItem(CACHE_KEY);
        return {};
    }
};

// Helper to save data to the cache in localStorage
const saveToCache = (key: string, data: ExerciseInfo) => {
    try {
        const cache = getCache();
        cache[key] = data;
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error)
    {
        console.error("Failed to save to cache", error);
    }
};

/**
 * Checks if all provided exercise names are present in the local storage cache.
 * @param exerciseNames - An array of exercise names to check.
 * @returns An object indicating if all are cached and a list of any that are not.
 */
export const checkCacheStatus = (exerciseNames: string[]): { allCached: boolean; uncachedCount: number } => {
    if (exerciseNames.length === 0) return { allCached: true, uncachedCount: 0 };
    const cache = getCache();
    const uniqueNames = [...new Set(exerciseNames.map(name => name.trim().toLowerCase()))].filter(Boolean);
    if (uniqueNames.length === 0) return { allCached: true, uncachedCount: 0 };
    
    const uncached = uniqueNames.filter(name => !cache[name]);
    return { allCached: uncached.length === 0, uncachedCount: uncached.length };
};


/**
 * Removes a single exercise from the client-side localStorage cache.
 * @param exerciseName - The name of the exercise to clear.
 */
export const clearExerciseFromCache = (exerciseName: string) => {
    const normalizedName = exerciseName.trim().toLowerCase();
    try {
        const cache = getCache();
        if (cache[normalizedName]) {
            delete cache[normalizedName];
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        }
    } catch (error) {
        console.error("Failed to clear exercise from cache", error);
    }
};


const getApiKeyErrorResponse = (): ExerciseInfo => ({
    primaryVideoId: null,
    alternativeVideoIds: [],
    instructions: "מפתח Gemini API אינו מוגדר בשרת.",
    tips: [
        "יש לעבור להגדרות הפרויקט בספק האירוח (למשל, Vercel).",
        "יש למצוא את החלק של 'משתני סביבה' (Environment Variables).",
        "יש לוודא שקיים משתנה בשם API_KEY.",
        "יש לוודא שהמשתנה מופעל עבור סביבת הייצור (Production).",
        "יש לפרוס מחדש את היישום כדי להחיל את השינויים."
    ],
    generalInfo: "תכונות הבינה המלאכותיות של אפליקציה זו דורשות מפתח Gemini API בצד השרת. ללא מפתח זה, לא ניתן לאחזר מידע על תרגילים.",
    language: 'he',
});

const getGenericErrorResponse = (message: string): ExerciseInfo => ({
    primaryVideoId: null,
    alternativeVideoIds: [],
    instructions: `שגיאה: ${message}`,
    tips: [],
    generalInfo: "אירעה שגיאה בלתי צפויה. אנא בדוק את קונסולת המפתחים לפרטים נוספים ונסה שוב מאוחר יותר.",
    language: 'he',
});

export async function getExerciseInfo(exerciseName: string, forceRefresh = false): Promise<ExerciseInfo> {
    const normalizedName = exerciseName.trim().toLowerCase();
    
    if (forceRefresh) {
        // Clear local storage cache before fetching from server
        clearExerciseFromCache(exerciseName);
    } else {
        const cache = getCache();
        // 1. Check cache first
        if (cache[normalizedName]) {
            return cache[normalizedName];
        }
    }
    
    // 2. If not in cache or refreshing, fetch from the server
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ exerciseName, force_refresh: forceRefresh }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.code === 'API_KEY_MISSING') {
                return getApiKeyErrorResponse();
            }
            // The backend often sends a structured error that looks like ExerciseInfo
            // for non-200 responses. If it has the right shape, we can use it directly.
            if (data.instructions && Array.isArray(data.tips)) {
                return data as ExerciseInfo;
            }
            // Fallback for other error structures
            throw new Error(data.message || 'Failed to fetch exercise info from the server.');
        }

        // 3. Save successful response to cache before returning
        saveToCache(normalizedName, data);

        return data as ExerciseInfo;

    } catch (error) {
        console.error("Error fetching exercise info from server:", error);
        if (error instanceof TypeError) { // Network error
             return getGenericErrorResponse("לא ניתן להתחבר לשרת. אנא בדוק את חיבור האינטררנט שלך.");
        }
        const errorMessage = error instanceof Error ? error.message : "אירעה שגיאה לא ידועה.";
        return getGenericErrorResponse(errorMessage);
    }
}

/**
 * Pre-fetches exercise information for a list of exercise names and populates the cache.
 * @param exerciseNames - An array of exercise names to prefetch.
 * @returns A promise that resolves when all fetches are complete.
 */
export function prefetchExercises(exerciseNames: string[]): Promise<void> {
    const cache = getCache();
    // Get unique, normalized names
    const uniqueNames = [...new Set(exerciseNames.map(name => name.trim().toLowerCase()))];
    const namesToFetch = uniqueNames.filter(name => name && !cache[name]); // also filter out empty names

    if (namesToFetch.length === 0) {
        return Promise.resolve();
    }

    console.log(`Prefetching info for ${namesToFetch.length} exercises in the background...`);

    const fetchPromises = namesToFetch.map(name => 
        getExerciseInfo(name, true).catch(e => { // force refresh on prefetch all
            console.error(`Failed to prefetch exercise "${name}":`, e);
            return null; // Don't let one failure stop others
        })
    );
    
    return new Promise<void>((resolve) => {
        Promise.allSettled(fetchPromises).then(() => {
            console.log("Prefetching session complete.");
            resolve();
        });
    });
}

/**
 * Sends a chat message to the AI workout planner backend.
 * @param chatHistory The history of the conversation so far.
 * @param userMessage The latest message from the user.
 * @returns The raw text response from the AI model.
 */
export async function generateWorkoutPlan(chatHistory: { role: 'user' | 'model'; parts: { text: string }[] }[], userMessage: string): Promise<string> {
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chatRequest: {
                    history: chatHistory,
                    message: userMessage,
                },
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            // The backend now sends errors in the 'responseText' field for chat,
            // or 'message' for older/generic errors. We can just return it.
            const errorMessage = data.responseText || data.message || 'An unknown error occurred with the AI planner. Please try again later.';
            // We prepend "Error:" so the UI can potentially identify it.
            return `Error: ${errorMessage}`;
        }

        return data.responseText;

    } catch (error) {
        console.error("Error calling AI planner API:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown network error occurred.";
        return `Error: Could not connect to the AI planner. ${errorMessage}`;
    }
}