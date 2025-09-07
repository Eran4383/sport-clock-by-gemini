
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
    generalInfo: "תכונות הבינה המלאכותית של אפליקציה זו דורשות מפתח Gemini API בצד השרת. ללא מפתח זה, לא ניתן לאחזר מידע על תרגילים.",
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

export async function getExerciseInfo(exerciseName: string): Promise<ExerciseInfo> {
    const normalizedName = exerciseName.trim().toLowerCase();
    const cache = getCache();

    // 1. Check cache first
    if (cache[normalizedName]) {
        return cache[normalizedName];
    }
    
    // 2. If not in cache, fetch from the server
    try {
        const devApiKey = sessionStorage.getItem('dev-api-key');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (devApiKey) {
            headers['x-dev-api-key'] = devApiKey;
        }

        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ exerciseName }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.code === 'API_KEY_MISSING') {
                return getApiKeyErrorResponse();
            }
            // Use the message from the backend for other errors
            throw new Error(data.message || 'Failed to fetch exercise info from the server.');
        }

        // 3. Save successful response to cache before returning
        saveToCache(normalizedName, data);

        return data as ExerciseInfo;

    } catch (error) {
        console.error("Error fetching exercise info from server:", error);
        if (error instanceof TypeError) { // Network error
             return getGenericErrorResponse("לא ניתן להתחבר לשרת. אנא בדוק את חיבור האינטרנט שלך.");
        }
        const errorMessage = error instanceof Error ? error.message : "אירעה שגיאה לא ידועה.";
        return getGenericErrorResponse(errorMessage);
    }
}

/**
 * Pre-fetches exercise information for a list of exercise names and populates the cache.
 * This is a "fire and forget" function that runs in the background.
 * @param exerciseNames - An array of exercise names to prefetch.
 */
export async function prefetchExercises(exerciseNames: string[]): Promise<void> {
    const cache = getCache();
    // Get unique, normalized names
    const uniqueNames = [...new Set(exerciseNames.map(name => name.trim().toLowerCase()))];
    const namesToFetch = uniqueNames.filter(name => name && !cache[name]); // also filter out empty names

    if (namesToFetch.length === 0) {
        return;
    }

    console.log(`Prefetching info for ${namesToFetch.length} exercises in the background...`);

    // Fire and forget, don't await the whole thing in the calling function
    const fetchPromises = namesToFetch.map(name => 
        getExerciseInfo(name).catch(e => {
            console.error(`Failed to prefetch exercise "${name}":`, e);
            return null; // Don't let one failure stop others
        })
    );
    
    // We don't await this promise chain because it's a background task.
    // The UI shouldn't wait for this.
    Promise.allSettled(fetchPromises).then(() => {
        console.log("Prefetching session complete.");
    });
}