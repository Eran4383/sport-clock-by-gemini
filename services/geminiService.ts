
import { getBaseExerciseName } from '../utils/workout';
import { getLocalCache, saveToLocalCache, clearExerciseFromLocalCache } from './storageService';

export interface ExerciseInfo {
    primaryVideoId: string | null;
    alternativeVideoIds: string[];
    instructions: string;
    tips: string[];
    generalInfo: string;
    language: 'en' | 'he' | string;
}

// A set of generic terms that don't need specific AI/video lookup.
const GENERIC_TERMS = new Set(['warmup', 'stretches', 'cooldown', 'rest', 'חימום', 'מתיחות', 'מנוחה']);

/**
 * Returns a standardized, hardcoded response for generic exercise terms.
 * This avoids making API calls for terms that are too broad.
 * @param term - The generic term (e.g., "חימום").
 * @returns A standard ExerciseInfo object.
 */
const getGenericExerciseResponse = (term: string): ExerciseInfo => {
    const isHebrew = ['חימום', 'מתיחות', 'מנוחה'].includes(term.toLowerCase());
    return {
        primaryVideoId: null,
        alternativeVideoIds: [],
        instructions: isHebrew 
            ? "זוהי פעילות כללית. בצע את התנועות המועדפות עליך למשך הזמן שהוקצב."
            : "This is a general activity. Perform your preferred movements for the allotted time.",
        tips: isHebrew
            ? ["הקשב לגופך.", "התמקד בטכניקה נכונה."]
            : ["Listen to your body.", "Focus on proper form."],
        generalInfo: isHebrew
            ? `אין מידע ספציפי או סרטון עבור "${term}" מכיוון שזוהי קטגוריה רחבה.`
            : `No specific information or video is available for "${term}" as it is a broad category.`,
        language: isHebrew ? 'he' : 'en',
    };
};

/**
 * Checks if all provided exercise names are present in the local storage cache.
 * @param exerciseNames - An array of exercise names to check.
 * @returns An object indicating if all are cached and a list of any that are not.
 */
export const checkCacheStatus = (exerciseNames: string[]): { allCached: boolean; uncachedCount: number } => {
    if (exerciseNames.length === 0) return { allCached: true, uncachedCount: 0 };
    const cache = getLocalCache();
    const uniqueNames = [...new Set(exerciseNames.map(name => name.trim().toLowerCase()))].filter(Boolean);
    if (uniqueNames.length === 0) return { allCached: true, uncachedCount: 0 };
    
    const uncached = uniqueNames.filter(name => !cache[name]);
    return { allCached: uncached.length === 0, uncachedCount: uncached.length };
};

/**
 * Checks the cache status for a list of individual exercises.
 * @param exerciseNames - An array of exercise names.
 * @returns A Map where keys are normalized exercise names and values are booleans (true if cached).
 */
export const getCacheStatusForExercises = (exerciseNames: string[]): Map<string, boolean> => {
    const cache = getLocalCache();
    const statusMap = new Map<string, boolean>();
    const uniqueNames = [...new Set(exerciseNames.map(name => getBaseExerciseName(name).trim().toLowerCase()))].filter(Boolean);
    uniqueNames.forEach(name => {
        statusMap.set(name, cache.hasOwnProperty(name));
    });
    return statusMap;
};


/**
 * Removes a single exercise from the client-side localStorage cache.
 * @param exerciseName - The name of the exercise to clear.
 */
export const clearExerciseFromCache = (exerciseName: string) => {
    clearExerciseFromLocalCache(exerciseName);
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
    const normalizedName = getBaseExerciseName(exerciseName).trim().toLowerCase();

    // Short-circuit for generic terms to avoid unnecessary API calls
    if (GENERIC_TERMS.has(normalizedName)) {
        return getGenericExerciseResponse(normalizedName);
    }
    
    if (forceRefresh) {
        // Clear local storage cache before fetching from server to ensure it gets updated
        clearExerciseFromCache(normalizedName);
    } else {
        const cache = getLocalCache();
        // 1. Check local cache first for speed
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
            body: JSON.stringify({ exerciseName: normalizedName, force_refresh: forceRefresh }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.code === 'API_KEY_MISSING') {
                return getApiKeyErrorResponse();
            }
            if (data.instructions && Array.isArray(data.tips)) {
                return data as ExerciseInfo;
            }
            // Throw with status code if possible for better handling
            const error = new Error(data.message || 'Failed to fetch exercise info from the server.');
            (error as any).status = res.status;
            throw error;
        }

        // 3. Save successful response to local cache before returning
        saveToLocalCache(normalizedName, data);

        return data as ExerciseInfo;

    } catch (error: any) {
        console.error("Error fetching exercise info from server:", error);
        if (error instanceof TypeError) { // Network error
             return getGenericErrorResponse("לא ניתן להתחבר לשרת. אנא בדוק את חיבור האינטררנט שלך.");
        }
        
        // Pass specific error messages through
        const errorMessage = error instanceof Error ? error.message : "אירעה שגיאה לא ידועה.";
        
        // Return a structured error response for specific status codes if needed by UI components
        if (error.status === 429) {
             const quotaError = getGenericErrorResponse(errorMessage);
             quotaError.instructions = "מכסת ה-API היומית נוצלה.";
             return quotaError;
        }

        return getGenericErrorResponse(errorMessage);
    }
}

/**
 * Asks the server which of the provided exercise names are NOT in the Vercel KV cache.
 * @param exerciseNames An array of normalized, unique exercise names.
 * @returns A promise that resolves to an array of names that need to be fetched.
 */
async function findUncachedExercisesOnServer(exerciseNames: string[]): Promise<string[]> {
    if (exerciseNames.length === 0) {
        return [];
    }
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkCache: exerciseNames }),
        });

        if (!res.ok) {
            console.error('Server error checking cache status. Assuming all are uncached.');
            // Fallback: If the check fails, assume everything needs to be fetched.
            return exerciseNames;
        }

        const data = await res.json();
        return data.uncachedNames || [];
    } catch (error) {
        console.error('Network error checking cache status:', error);
        // Fallback: On network error, assume everything needs to be fetched.
        return exerciseNames;
    }
}

/**
 * Pre-fetches exercise information for a list of exercise names and populates all caches.
 * This function now intelligently checks the server-side cache first to avoid
 * refetching data that already exists, solving the local-cache-only problem.
 * @param exerciseNames - An array of all exercise names from the user's plans.
 * @returns A promise that resolves with the status of the prefetch operation.
 */
export async function prefetchExercises(exerciseNames: string[]): Promise<{ successCount: number; failedCount: number; failedNames: string[] }> {
    // Get unique, normalized, non-empty names that are not generic terms.
    const uniqueNames = [...new Set(exerciseNames.map(name => getBaseExerciseName(name).trim().toLowerCase()))]
        .filter(Boolean)
        .filter(name => !GENERIC_TERMS.has(name));

    if (uniqueNames.length === 0) {
        // Return success if there's nothing to do (e.g., only generic exercises)
        return { successCount: exerciseNames.length, failedCount: 0, failedNames: [] };
    }

    console.log(`Checking server cache for ${uniqueNames.length} unique exercises...`);
    const namesToFetch = await findUncachedExercisesOnServer(uniqueNames);
    
    const alreadyCachedCount = uniqueNames.length - namesToFetch.length;
    console.log(`${alreadyCachedCount} exercises are already cached on the server. Fetching info for the remaining ${namesToFetch.length}.`);

    if (namesToFetch.length === 0) {
        return { successCount: uniqueNames.length, failedCount: 0, failedNames: [] };
    }

    console.log(`Prefetching info for ${namesToFetch.length} exercises sequentially to respect API rate limits...`);

    let successCount = 0;
    const failedNames: string[] = [];

    // Process sequentially to avoid API rate limits.
    for (const name of namesToFetch) {
        try {
            // Force refresh is true to ensure it fetches from Gemini/YT and populates the KV cache.
            // It will also populate the local cache via the saveToLocalCache call inside getExerciseInfo.
            const result = await getExerciseInfo(name, true);
            
            // Check if the result indicates a quota error (even if it didn't throw in getExerciseInfo)
            if (result.instructions && result.instructions.includes("מכסת שימוש")) {
                 console.warn("Quota exceeded detected in response. Stopping prefetch.");
                 failedNames.push(name);
                 // Add remaining names to failed list
                 const currentIndex = namesToFetch.indexOf(name);
                 if (currentIndex > -1) {
                     failedNames.push(...namesToFetch.slice(currentIndex + 1));
                 }
                 break;
            }

            successCount++;
            // Add a delay to be cautious with the API's rate limit.
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        } catch (e: any) {
            console.error(`Failed to prefetch exercise "${name}":`, e);
            failedNames.push(name);
            
            // Stop if quota exceeded based on status code
            if (e.status === 429) {
                 console.warn("Quota exceeded (429). Stopping prefetch.");
                 // Add remaining names to failed list
                 const currentIndex = namesToFetch.indexOf(name);
                 if (currentIndex > -1) {
                     failedNames.push(...namesToFetch.slice(currentIndex + 1));
                 }
                 break; 
            }
        }
    }
    
    console.log("Prefetching session complete.");
    return {
        successCount: alreadyCachedCount + successCount,
        failedCount: failedNames.length,
        failedNames,
    };
}


/**
 * Sends a chat message to the AI workout planner backend.
 * @param chatHistory The history of the conversation so far.
 * @param userMessage The latest message from the user.
 * @param userProfileContext Optional string containing user's profile info.
 * @returns The raw text response from the AI model.
 */
export async function generateWorkoutPlan(
    chatHistory: { role: 'user' | 'model'; parts: { text: string }[] }[], 
    userMessage: string,
    userProfileContext?: string
): Promise<string> {
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
                    profileContext: userProfileContext,
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
