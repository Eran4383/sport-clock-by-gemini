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


const handleExerciseInfoRequest = async (exerciseName: string, force_refresh: boolean) => {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
    const normalizedExerciseName = exerciseName.trim().toLowerCase();
    const exerciseCacheKey = `exercise:${normalizedExerciseName}`;

    // STAGE 0: Check our persistent KV cache first.
    if (!force_refresh) {
        try {
            const cachedData = await kv.get(exerciseCacheKey);
            if (cachedData) {
                return { status: 200, body: cachedData };
            }
        } catch (kvError) {
            console.error("Vercel KV 'get' operation failed. This is likely a configuration issue. The app will proceed without server-side caching for this request.", kvError);
        }
    }

    // STAGE 1: Fetch YouTube videos and Gemini text in parallel for efficiency.
    
    // Task 1: Search YouTube for relevant videos.
    const searchYouTube = async () => {
        // A more direct and effective search query.
        const searchQuery = `how to do ${exerciseName} proper form tutorial short`;
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoDuration=short&maxResults=5&key=${youtubeApiKey}`;
        
        try {
            const youtubeResponse = await fetch(youtubeApiUrl);
            if (!youtubeResponse.ok) {
                const errorData = await youtubeResponse.json();
                console.error("YouTube API Error:", errorData);
                return []; // Return empty array on error, don't fail the whole request.
            }
            const youtubeData = await youtubeResponse.json();
            return youtubeData.items.map((item: any) => item.id.videoId).filter(Boolean);
        } catch (error) {
            console.error("Failed to fetch from YouTube API:", error);
            return [];
        }
    };

    // Task 2: Ask Gemini for instructional text.
    const getGeminiText = async () => {
        const textGenerationPrompt = `
          You are an expert fitness coach. For the exercise "${exerciseName}", generate the following information IN THE SAME LANGUAGE as the original exercise name ("${exerciseName}"):
          - "instructions": A clear, step-by-step guide. Each step MUST be on a new line, separated by '\\n'.
          - "tips": 2-4 concise tips for proper form.
          - "generalInfo": A short paragraph about the exercise, its benefits, and primary muscles targeted.
          - "language": The ISO 639-1 code for the language you are writing in.

          Return ONLY a single, valid JSON object with the specified structure. Do not include video information.
        `;
        
        const textResponse = await ai.models.generateContent({
            model: 'gemini-1.5-flash', // Using flash for quick info retrieval
            contents: textGenerationPrompt,
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
                safetySettings: safetySettings,
            },
        });
        const cleanedJsonString = textResponse.text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        if (!cleanedJsonString) {
            throw new Error("Received an empty text response from the AI service.");
        }
        return JSON.parse(cleanedJsonString);
    };

    // Execute both tasks concurrently.
    const [videoIds, textData] = await Promise.all([
        searchYouTube(),
        getGeminiText()
    ]);

    // STAGE 2: Combine the results.
    const finalData = {
        ...textData,
        primaryVideoId: videoIds.length > 0 ? videoIds[0] : null,
        alternativeVideoIds: videoIds.length > 1 ? videoIds.slice(1, 4) : [],
    };
    
    // If we failed to get any videos, update the text to inform the user.
    if (!finalData.primaryVideoId) {
        finalData.instructions = "לא נמצאו סרטוני הדרכה מתאימים עבור תרגיל זה. המידע הכתוב עדיין זמין.";
    }

    // Attempt to save to KV but don't let it block the response.
    try {
        await kv.set(exerciseCacheKey, finalData);
    } catch (kvError) {
        console.error("Vercel KV 'set' operation failed. The response was sent to the user, but it was not cached on the server.", kvError);
    }

    return { status: 200, body: finalData };
}

// --- SYSTEM PROMPT FOR WORKOUT PLANNER ---
// Updated to match 'types.ts' (using 'tip' instead of 'executionTip')
const baseSystemInstruction = `You are a world-class expert in human performance and rehabilitation, with deep knowledge in sports science, physiotherapy, and occupational therapy. Your primary goal is to help users create safe, effective, and personalized plans.

**Interaction Flow:**
1.  **Be Conversational:** Act like a personal coach or therapist. If the user's request is vague (e.g., "give me a plan"), you MUST ask clarifying questions before creating a plan. Ask about their goals, available time, physical condition, available equipment, etc.
2.  **Generate the Plan:** Once you have enough information, generate the plan. It could be a workout plan, a physiotherapy routine, a set of daily activities for occupational therapy, etc.
3.  **Provide a Summary:** FIRST, provide a friendly, human-readable summary of the plan you've created. This summary should appear as regular text.
4.  **Provide the JSON:** AFTER the summary, you MUST provide the plan as a single, valid JSON object enclosed in a markdown code block (\`\`\`json ... \`\`\`). Do NOT include any other text after the JSON block.

**User Profile:**
- The user's profile information may be provided below.
- This information is persistent for the entire conversation. If it exists, you MUST use it to tailor the plan and you MUST NOT ask for information that is already provided in the profile (e.g., don't ask for equipment if it's already listed).

**JSON Rules:**
- The JSON MUST conform to the TypeScript interface provided below.
- The \`type\` for steps can be 'exercise' for physical movements or 'rest' for breaks. Use these categories broadly. For example, a physiotherapy stretch is an 'exercise'.
- **CRITICAL:** The \`name\` property for each step MUST ONLY contain the base name of the activity (e.g., "Squats", "Push-ups", "Gentle Wrist Stretches"). DO NOT include set counts, reps, or durations in the activity name itself.
- **IMPORTANT:** You MUST populate the optional \`tip\` field for every step of type 'exercise'. This should be a VERY short instruction (max 50 characters) displayed during the workout. **IT MUST DESCRIBE THE ACTION EXECUTION (HOW TO DO IT), NOT GENERIC SAFETY ADVICE.** Example: Use "Lower chest to floor" instead of "Keep back straight". Use "Drive knees outward" instead of "Be careful".

**Language:**
- You MUST respond in the same language as the user's last message. This includes all conversational text, the plan summary, and all strings within the JSON object (like \`name\` and \`tip\` fields).

**Workout Plan Interface:**
\`\`\`typescript
interface WorkoutStep {
  id: string; // Should be a unique placeholder like "step_1"
  name: string; // e.g., "Push-ups", "Rest"
  type: 'exercise' | 'rest';
  isRepBased: boolean; // true for reps, false for time-based
  duration: number; // Duration in seconds (if not rep-based)
  reps: number; // Number of reps (if rep-based)
  tip: string; // REQUIRED for type 'exercise'. Short biomechanical execution cue, MAX 50 characters. Matches the 'tip' field in the app.
}

interface WorkoutPlan {
  name: string; // A descriptive name for the plan, e.g., "Full Body Beginner Workout"
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
}
\`\`\`
`;

const handleChatRequest = async (history: any[], message: string, profileContext?: string, modelPreference?: 'smart' | 'speed') => {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
    
    let finalSystemInstruction = baseSystemInstruction;
    if (profileContext) {
        finalSystemInstruction += `\n\n--- IMPORTANT USER PROFILE ---\n${profileContext}\n--- END USER PROFILE ---`;
    }

    // Determine the model to use based on preference.
    // Updated to use the latest experimental models as requested.
    const smartModel = 'gemini-2.0-flash-exp'; // Or 'gemini-1.5-pro' if preferred for stability
    const fastModel = 'gemini-1.5-flash';
    
    // Default to Smart model if not specified or if 'smart' is requested.
    // 'speed' preference explicitly requests the faster model.
    const targetModel = modelPreference === 'speed' ? fastModel : smartModel;

    const generate = async (model: string) => {
        const chat = ai.chats.create({
            model: model,
            history,
            config: {
                safetySettings: safetySettings,
                systemInstruction: finalSystemInstruction,
            },
        });
        return await chat.sendMessage({ message });
    }

    try {
        const response = await generate(targetModel);
        return { status: 200, body: { responseText: response.text } };
    } catch (error: any) {
        console.warn(`Model ${targetModel} failed. Error:`, error.message);
        
        // Strict Fallback Logic:
        // If we tried the smart model and it failed (e.g. 429 quota or 503 overload), 
        // automatically fallback to the fast model to ensure the user gets a result.
        if (targetModel === smartModel) {
             console.log(`Falling back to ${fastModel}...`);
             try {
                const response = await generate(fastModel);
                return { status: 200, body: { 
                    responseText: response.text, 
                    usedFallback: true 
                } };
             } catch (fallbackError: any) {
                 // If fallback also fails, throw the fallback error (likely a broader issue).
                 throw fallbackError;
             }
        }
        
        // If we were already using the fast model or some other fatal error occurred, rethrow.
        throw error;
    }
};


export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  if (!geminiApiKey) {
    console.error(`API_KEY (for Gemini) is not configured on the server.`);
    return res.status(500).json({ 
        message: `The Gemini API key (API_KEY) is not configured. Please set it in your project's environment variables.`,
        code: "API_KEY_MISSING"
    });
  }

  const { exerciseName, force_refresh, chatRequest, checkCache } = req.body;

  try {
      let result;
      if (chatRequest) {
          // Handle AI Planner Chat Request
          const { history, message, profileContext, modelPreference } = chatRequest;
          if (!message || typeof message !== 'string') {
              return res.status(400).json({ message: 'A valid message is required for chat requests.' });
          }
          result = await handleChatRequest(history || [], message, profileContext, modelPreference);
      } else if (checkCache && Array.isArray(checkCache)) {
          // Handle server-side cache check
          const keys = checkCache.map(name => `exercise:${name.trim().toLowerCase()}`);
          if (keys.length === 0) {
              return res.status(200).json({ uncachedNames: [] });
          }
          try {
              const results = await kv.mget(...keys);
              const uncachedNames = checkCache.filter((_, index) => results[index] === null);
              return res.status(200).json({ uncachedNames });
          } catch (kvError) {
               console.error("Vercel KV 'mget' operation failed.", kvError);
               // If KV fails, assume nothing is cached so the client tries to fetch everything.
               return res.status(200).json({ uncachedNames: checkCache });
          }
      } else if (exerciseName) {
          // Handle Exercise Info Request
          if (typeof exerciseName !== 'string') {
              return res.status(400).json({ message: 'A valid exerciseName string is required.' });
          }
          if (!youtubeApiKey) {
              console.error("YOUTUBE_API_KEY is not configured on the server.");
              return res.status(200).json({
                  primaryVideoId: null,
                  alternativeVideoIds: [],
                  instructions: "מפתח YouTube API אינו מוגדר בשרת.",
                  tips: [ "נדרש מפתח YouTube API כדי לחפש ולהציג סרטונים. המפתח חסר כרגע בהגדרות השרת." ],
                  generalInfo: "",
                  language: 'he',
              });
          }
          result = await handleExerciseInfoRequest(exerciseName, force_refresh);
      } else {
        return res.status(400).json({ message: 'Invalid request. Must include exerciseName, chatRequest, or checkCache.' });
      }

      return res.status(result.status).json(result.body);

  } catch (error: any) {
    console.error("Error in API handler:", error);
    
    let errorPayload: any;
    let statusCode: number = 500;

    // Try to parse the error message if it's a JSON string from the API
    try {
        // The error message might be prefixed with text, so find the start of the JSON object.
        const jsonStartIndex = error.message.indexOf('{');
        if (jsonStartIndex > -1) {
            const potentialJson = error.message.substring(jsonStartIndex);
            const parsed = JSON.parse(potentialJson);
            errorPayload = parsed.error || parsed; // Handle cases where it's wrapped in an 'error' object
        }
    } catch (e) {
        // Parsing failed, will use fallback.
    }

    // If we couldn't parse a structured error, create a fallback payload from the error object itself.
    if (!errorPayload) {
        errorPayload = {
            message: error.message || 'An unknown error occurred.',
            status: error.status || 'UNKNOWN',
            code: error.code || 500
        };
    }
    
    statusCode = errorPayload.code || statusCode;


    // Check for Quota Exceeded error
    if (statusCode === 429 || errorPayload.status === 'RESOURCE_EXHAUSTED') {
        const userFriendlyMessage = "מכסת שימוש היומית ב-API נוצלה. שירותי הבינה המלאכותית יחזרו לפעול מחר.";
        const technicalDetails = `פרטים טכניים: ${errorPayload.message}`;

        const clientError = chatRequest 
            ? { responseText: `שגיאה: ${userFriendlyMessage}` }
            : {
                primaryVideoId: null,
                alternativeVideoIds: [],
                instructions: userFriendlyMessage,
                tips: [
                    "זוהי מגבלה זמנית של הגרסה החינמית.", 
                    "ניתן להמשיך להשתמש בשאר תכונות האפליקציה."
                ],
                generalInfo: technicalDetails, // Put technical details here for the user to see.
                language: 'he',
              };
        
        return res.status(429).json(clientError);
    }

    // Handle other generic errors
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