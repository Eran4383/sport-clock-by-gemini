import { getBaseExerciseName } from '../utils/workout';
import { getLocalCache, saveToLocalCache, clearExerciseFromLocalCache } from './storageService';
import { postGeminiJson, sanitizeChatHistoryForApi } from './apiFetch';

export interface ExerciseInfo {
  primaryVideoId: string | null;
  alternativeVideoIds: string[];
  instructions: string;
  tips: string[];
  generalInfo: string;
  language: 'en' | 'he' | string;
}

const GENERIC_TERMS = new Set(['warmup', 'stretches', 'cooldown', 'rest', 'חימום', 'מתיחות', 'מנוחה']);

const getGenericExerciseResponse = (term: string): ExerciseInfo => {
  const isHebrew = ['חימום', 'מתיחות', 'מנוחה'].includes(term.toLowerCase());
  return {
    primaryVideoId: null,
    alternativeVideoIds: [],
    instructions: isHebrew
      ? 'זוהי פעילות כללית. בצע את התנועות המועדפות עליך למשך הזמן שהוקצב.'
      : 'This is a general activity. Perform your preferred movements for the allotted time.',
    tips: isHebrew ? ['הקשב לגופך.', 'התמקד בטכניקה נכונה.'] : ['Listen to your body.', 'Focus on proper form.'],
    generalInfo: isHebrew
      ? `אין מידע ספציפי או סרטון עבור "${term}" מכיוון שזוהי קטגוריה רחבה.`
      : `No specific information or video is available for "${term}" as it is a broad category.`,
    language: isHebrew ? 'he' : 'en',
  };
};

export const checkCacheStatus = (exerciseNames: string[]): { allCached: boolean; uncachedCount: number } => {
  if (exerciseNames.length === 0) return { allCached: true, uncachedCount: 0 };
  const cache = getLocalCache();
  const uniqueNames = [...new Set(exerciseNames.map(n => n.trim().toLowerCase()))].filter(Boolean);
  if (uniqueNames.length === 0) return { allCached: true, uncachedCount: 0 };
  const uncached = uniqueNames.filter(name => !cache[name]);
  return { allCached: uncached.length === 0, uncachedCount: uncached.length };
};

export const getCacheStatusForExercises = (exerciseNames: string[]): Map<string, boolean> => {
  const cache = getLocalCache();
  const statusMap = new Map<string, boolean>();
  const uniqueNames = [...new Set(exerciseNames.map(n => getBaseExerciseName(n).trim().toLowerCase()))].filter(Boolean);
  uniqueNames.forEach(name => statusMap.set(name, Object.prototype.hasOwnProperty.call(cache, name)));
  return statusMap;
};

export const clearExerciseFromCache = (exerciseName: string) => clearExerciseFromLocalCache(exerciseName);

const getApiKeyErrorResponse = (): ExerciseInfo => ({
  primaryVideoId: null,
  alternativeVideoIds: [],
  instructions: 'מפתח Gemini API אינו מוגדר בשרת.',
  tips: ['יש לוודא שהמשתנה GEMINI_API_KEY או API_KEY מוגדר בסביבת השרת.', 'לאחר העדכון יש לפרוס מחדש את היישום.'],
  generalInfo: 'תכונות הבינה המלאכותית של אפליקציה זו דורשות מפתח Gemini API בצד השרת.',
  language: 'he',
});

const getGenericErrorResponse = (message: string): ExerciseInfo => ({
  primaryVideoId: null,
  alternativeVideoIds: [],
  instructions: `שגיאה: ${message}`,
  tips: [],
  generalInfo: 'אירעה שגיאה בלתי צפויה. אנא נסה שוב בעוד רגע.',
  language: 'he',
});

export async function getExerciseInfo(exerciseName: string, forceRefresh = false): Promise<ExerciseInfo> {
  const normalizedName = getBaseExerciseName(exerciseName).trim().toLowerCase();
  if (GENERIC_TERMS.has(normalizedName)) return getGenericExerciseResponse(normalizedName);

  if (forceRefresh) {
    clearExerciseFromCache(normalizedName);
  } else {
    const cache = getLocalCache();
    if (cache[normalizedName]) return cache[normalizedName];
  }

  try {
    const { ok, data, isNonJsonError } = await postGeminiJson({
      exerciseName: normalizedName,
      force_refresh: forceRefresh,
    });

    if (!ok || isNonJsonError) {
      if (data?.code === 'API_KEY_MISSING') return getApiKeyErrorResponse();
      if (data?.instructions && Array.isArray(data?.tips)) return data as ExerciseInfo;
      throw new Error(data?.message || 'שגיאה באחזור מידע התרגיל מהשרת.');
    }

    saveToLocalCache(normalizedName, data);
    return data as ExerciseInfo;
  } catch (error) {
    console.error('Error fetching exercise info from server:', error);
    if (error instanceof TypeError) {
      return getGenericErrorResponse('לא ניתן להתחבר לשרת. אנא בדוק את חיבור האינטרנט שלך.');
    }
    return getGenericErrorResponse(error instanceof Error ? error.message : 'אירעה שגיאה לא ידועה.');
  }
}

async function findUncachedExercisesOnServer(exerciseNames: string[]): Promise<string[]> {
  if (exerciseNames.length === 0) return [];
  try {
    const { ok, data, isNonJsonError } = await postGeminiJson({ checkCache: exerciseNames });
    if (!ok || isNonJsonError) return exerciseNames;
    return data?.uncachedNames || [];
  } catch {
    return exerciseNames;
  }
}

export async function prefetchExercises(
  exerciseNames: string[]
): Promise<{ successCount: number; failedCount: number; failedNames: string[] }> {
  const uniqueNames = [...new Set(exerciseNames.map(n => getBaseExerciseName(n).trim().toLowerCase()))]
    .filter(Boolean)
    .filter(name => !GENERIC_TERMS.has(name));

  if (uniqueNames.length === 0) {
    return { successCount: exerciseNames.length, failedCount: 0, failedNames: [] };
  }

  const namesToFetch = await findUncachedExercisesOnServer(uniqueNames);
  const alreadyCachedCount = uniqueNames.length - namesToFetch.length;
  if (namesToFetch.length === 0) {
    return { successCount: uniqueNames.length, failedCount: 0, failedNames: [] };
  }

  let successCount = 0;
  const failedNames: string[] = [];

  for (const name of namesToFetch) {
    try {
      await getExerciseInfo(name, true);
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.error(`Failed to prefetch exercise "${name}":`, e);
      failedNames.push(name);
    }
  }

  return {
    successCount: alreadyCachedCount + successCount,
    failedCount: failedNames.length,
    failedNames,
  };
}

export async function generateWorkoutPlan(
  chatHistory: { role: 'user' | 'model'; parts: { text?: string; isPlanLink?: boolean }[] }[],
  userMessage: string,
  profileContext = '',
  modelPreference: 'smart' | 'speed' = 'smart'
): Promise<string> {
  try {
    const sanitizedHistory = sanitizeChatHistoryForApi(chatHistory);
    const { ok, status, data, isNonJsonError } = await postGeminiJson({
      chatRequest: {
        history: sanitizedHistory,
        message: userMessage,
        profileContext,
        modelPreference,
      },
    });

    if (!ok || isNonJsonError) {
      const errorMessage =
        data?.responseText ||
        data?.message ||
        `שגיאת שרת זמנית (HTTP ${status || 500}). אנא נסה שוב.`;
      return `Error: ${errorMessage}`;
    }

    if (typeof data?.responseText !== 'string') {
      return 'Error: התקבלה תשובה לא תקינה ממתכנן האימונים. נסה שוב.';
    }

    return data.responseText;
  } catch (error) {
    console.error('Error calling AI planner API:', error);
    const msg = error instanceof Error ? error.message : 'שגיאת רשת לא ידועה.';
    return `Error: לא ניתן להתחבר למתכנן האימונים (${msg}).`;
  }
}