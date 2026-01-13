import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { kv } from "@vercel/kv";

const geminiApiKey = process.env.API_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

// רשימת המודלים המעודכנת (ינואר 2026)
const MODEL_CHAIN = [
    'gemini-3-pro-preview',     // הכי חכם
    'gemini-3-flash-preview',   // גיבוי מהיר וחכם
    'gemini-2.5-pro',           // גיבוי יציב
    'gemini-2.5-flash'          // רשת ביטחון
];

const handleExerciseInfoRequest = async (exerciseName: string, force_refresh: boolean) => {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
    const normalizedExerciseName = exerciseName.trim().toLowerCase();
    const exerciseCacheKey = `exercise:${normalizedExerciseName}`;

    if (!force_refresh) {
        try {
            const cachedData = await kv.get(exerciseCacheKey);
            if (cachedData) return { status: 200, body: cachedData };
        } catch (kvError) {
            console.error("KV cache error:", kvError);
        }
    }

    const searchYouTube = async () => {
        const searchQuery = `how to do ${exerciseName} proper form tutorial short`;
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoDuration=short&maxResults=5&key=${youtubeApiKey}`;
        try {
            const res = await fetch(youtubeApiUrl);
            if (!res.ok) return [];
            const data = await res.json();
            return data.items.map((item: any) => item.id.videoId).filter(Boolean);
        } catch { return []; }
    };

    const getGeminiText = async () => {
        const textResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Expert coach guide for "${exerciseName}". JSON: instructions (step-by-step \\n), tips (2-4 cues), generalInfo, language (ISO code).`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        instructions: { type: Type.STRING },
                        tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                        generalInfo: { type: Type.STRING },
                        language: { type: Type.STRING },
                    },
                    required: ["instructions", "tips", "generalInfo", "language"],
                },
                safetySettings,
            },
        });
        return JSON.parse(textResponse.text);
    };

    const [videoIds, textData] = await Promise.all([searchYouTube(), getGeminiText()]);
    const finalData = {
        ...textData,
        primaryVideoId: videoIds[0] || null,
        alternativeVideoIds: videoIds.slice(1, 4),
    };

    try { await kv.set(exerciseCacheKey, finalData); } catch {}
    return { status: 200, body: finalData };
}

// --- הוראות המערכת המעודכנות להפרדה בין הסבר ביצוע לטיפים ---
const baseSystemInstruction = `You are a world-class fitness and rehabilitation expert. Your goal is to create detailed, professional workout plans.

**CRITICAL RULES FOR EXERCISE INSTRUCTIONS (The 'tip' field):**
1. **First Set of any Exercise:** You MUST provide a full, step-by-step technical guide on HOW to perform the exercise. Imagine the user is asking "How do I do this?". 
   - Example for Push-ups (First set): "Place hands shoulder-width apart, lower your body until chest nearly touches the floor, then push back up keeping your core tight."
2. **Subsequent Sets (Set 2, 3, etc.):** You should provide short, punchy biomechanical cues or safety reminders.
   - Example for Push-ups (Set 2+): "Keep your elbows at 45 degrees" or "Don't let your lower back sag."
3. **Max Length:** Even for the first set, keep it concise but prioritizing clarity.
4. **Language:** Always respond in the same language the user is using.

**General JSON Rules:**
- JSON MUST conform to the TypeScript interface provided.
- 'type' can be 'exercise' or 'rest'.
- 'name' field MUST only contain the exercise name (e.g., "Push-ups"), NOT the set number.
- 'tip' field is REQUIRED for every 'exercise' step.

**Workout Plan Interface:**
\`\`\`typescript
interface WorkoutStep {
  id: string;
  name: string;
  type: 'exercise' | 'rest';
  isRepBased: boolean;
  duration: number;
  reps: number;
  tip: string; // This is the instructions box.
}

interface WorkoutPlan {
  name: string;
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
}
\`\`\`

**Interaction:**
Always provide a friendly summary in plain text FIRST, and then the JSON block.`;

const handleChatRequest = async (history: any[], message: string, profileContext?: string, modelPreference?: 'smart' | 'speed') => {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
    let finalSystemInstruction = baseSystemInstruction;
    if (profileContext) finalSystemInstruction += `\n\nPROFILE: ${profileContext}`;

    const attemptGeneration = async (modelName: string) => {
        const chat = ai.chats.create({
            model: modelName,
            history,
            config: { safetySettings, systemInstruction: finalSystemInstruction },
        });
        return await chat.sendMessage({ message });
    };

    // מסלול מהיר
    if (modelPreference === 'speed') {
        try {
            const res = await attemptGeneration('gemini-3-flash-preview');
            return { status: 200, body: { responseText: res.text, usedModel: 'gemini-3-flash-preview' } };
        } catch {
            const res = await attemptGeneration('gemini-2.5-flash');
            return { status: 200, body: { responseText: res.text, usedModel: 'gemini-2.5-flash', usedFallback: true } };
        }
    }

    // מסלול חכם (שרשרת מודלים)
    for (const modelName of MODEL_CHAIN) {
        try {
            console.log(`[AI] Trying ${modelName}`);
            const res = await attemptGeneration(modelName);
            return { status: 200, body: { responseText: res.text, usedModel: modelName, isFallback: modelName !== MODEL_CHAIN[0] } };
        } catch (err: any) {
            console.warn(`[AI] ${modelName} failed: ${err.message}`);
            if (modelName === MODEL_CHAIN[MODEL_CHAIN.length - 1]) throw err;
            continue;
        }
    }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!geminiApiKey) return res.status(500).json({ message: "API_KEY Missing" });

  const { exerciseName, force_refresh, chatRequest, checkCache } = req.body;

  try {
      if (chatRequest) {
          const { history, message, profileContext, modelPreference } = chatRequest;
          const result = await handleChatRequest(history || [], message, profileContext, modelPreference);
          return res.status(result!.status).json(result!.body);
      } 
      
      if (checkCache) {
          const keys = checkCache.map((name: string) => `exercise:${name.trim().toLowerCase()}`);
          const results = await kv.mget(...keys);
          const uncachedNames = checkCache.filter((_: any, i: number) => results[i] === null);
          return res.status(200).json({ uncachedNames });
      }

      if (exerciseName) {
          const result = await handleExerciseInfoRequest(exerciseName, force_refresh);
          return res.status(result.status).json(result.body);
      }

      return res.status(400).json({ message: "Invalid Request" });
  } catch (error: any) {
      console.error("Handler Error:", error);
      return res.status(500).json({ responseText: "אירעה שגיאה בשרת ה-AI. נסה שוב מאוחר יותר." });
  }
}