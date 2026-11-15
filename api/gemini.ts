import { doc, getDoc } from "firebase/firestore";
import { db, getGeminiApiKey } from "./_geminiClient.js";
import { handleExerciseInfoRequest } from "./_exerciseInfo.js";
import { handleChatRequest } from "./_chatPlanner.js";

function parseRequestBody(rawBody: any): Record<string, any> | null {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }
  return typeof rawBody === 'object' ? rawBody : {};
}

export default async function handler(req: any, res: any) {
  if (typeof res?.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY / API_KEY is not configured on the server.");
    return res.status(500).json({
      message: "The Gemini API key (GEMINI_API_KEY) is not configured. Please set it in your project's environment variables.",
      code: "API_KEY_MISSING",
    });
  }

  const body = parseRequestBody(req.body);
  if (body === null) {
    return res.status(400).json({
      responseText: 'שגיאה: גוף הבקשה שנשלח אינו בפורמט JSON תקין.',
      message: 'Invalid JSON request body.',
    });
  }

  const { exerciseName, force_refresh, chatRequest, checkCache } = body;

  try {
    let result;
    if (chatRequest) {
      const { history, message, profileContext, modelPreference } = chatRequest;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          responseText: 'שגיאה: נדרשת הודעה תקינה לבקשת הצ\'אט.',
          message: 'A valid message is required for chat requests.',
        });
      }
      result = await handleChatRequest(history || [], message, profileContext || '', modelPreference || 'smart');
    } else if (checkCache && Array.isArray(checkCache)) {
      const uncachedNames = [];
      try {
        for (const name of checkCache) {
          const normalized = String(name).trim().toLowerCase();
          const docRef = doc(db, "exercise_cache", normalized);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            uncachedNames.push(name);
          }
        }
        return res.status(200).json({ uncachedNames });
      } catch (fsError) {
        console.error("Firestore cache 'check' operation failed.", fsError);
        return res.status(200).json({ uncachedNames: checkCache });
      }
    } else if (exerciseName) {
      if (typeof exerciseName !== 'string') {
        return res.status(400).json({ message: 'A valid exerciseName string is required.' });
      }
      if (!process.env.YOUTUBE_API_KEY) {
        console.error("YOUTUBE_API_KEY is not configured on the server.");
        return res.status(200).json({
          primaryVideoId: null,
          alternativeVideoIds: [],
          instructions: "מפתח YouTube API אינו מוגדר בשרת.",
          tips: ["נדרש מפתח YouTube API כדי לחפש ולהציג סרטונים. המפתח חסר כרגע בהגדרות השרת."],
          generalInfo: "",
          language: 'he',
        });
      }
      result = await handleExerciseInfoRequest(exerciseName, Boolean(force_refresh));
    } else {
      return res.status(400).json({ message: 'Invalid request. Must include exerciseName, chatRequest, or checkCache.' });
    }

    return res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error("Error in API handler:", error);

    const errMsg = typeof error?.message === 'string' ? error.message : String(error || 'An unknown error occurred.');
    let errorPayload: any;

    try {
      const jsonStartIndex = errMsg.indexOf('{');
      if (jsonStartIndex > -1) {
        const parsed = JSON.parse(errMsg.substring(jsonStartIndex));
        errorPayload = parsed.error || parsed;
      }
    } catch {
      // Ignore JSON parse failure
    }

    if (!errorPayload) {
      errorPayload = {
        message: errMsg,
        status: error?.status || 'UNKNOWN',
        code: typeof error?.code === 'number' ? error.code : (typeof error?.status === 'number' ? error.status : 500),
      };
    }

    const statusCode: number = typeof errorPayload.code === 'number' ? errorPayload.code : 500;

    if (statusCode === 429 || errorPayload.status === 'RESOURCE_EXHAUSTED') {
      const userFriendlyMessage = "מכסת השימוש היומית ב-API נוצלה. שירותי הבינה המלאכותית יחזרו לפעול מחר.";
      const clientError = chatRequest
        ? { responseText: `שגיאה: ${userFriendlyMessage}` }
        : {
            primaryVideoId: null,
            alternativeVideoIds: [],
            instructions: userFriendlyMessage,
            tips: ["זוהי מגבלה זמנית של הגרסה החינמית.", "ניתן להמשיך להשתמש בשאר תכונות האפליקציה."],
            generalInfo: `פרטים טכניים: ${errorPayload.message}`,
            language: 'he',
          };
      return res.status(429).json(clientError);
    }

    const genericErrorMessage = `אירעה שגיאה: ${errorPayload.message}`;
    const clientError = chatRequest
      ? { responseText: `שגיאה: ${genericErrorMessage}` }
      : {
          primaryVideoId: null,
          alternativeVideoIds: [],
          instructions: genericErrorMessage,
          tips: ["אנא נסה שוב מאוחר יותר.", "אם הבעיה נמשכת, בדוק את קונסולת המפתחים."],
          generalInfo: "לא ניתן היה לאחזר מידע עבור תרגיל זה.",
          language: 'he',
        };

    return res.status(statusCode < 400 ? 500 : statusCode).json(clientError);
  }
}