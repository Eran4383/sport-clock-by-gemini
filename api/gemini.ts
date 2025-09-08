import { GoogleGenAI, Type } from "@google/genai";

const geminiApiKey = process.env.API_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

// Simple in-memory cache for YouTube search results to avoid redundant API calls
const youtubeCache = new Map<string, any>();
// Simple in-memory cache for the final Gemini analysis result to improve speed for repeated requests
const geminiResultCache = new Map<string, any>();

interface YouTubeVideo {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // The Gemini API key is mandatory for all operations.
  if (!geminiApiKey) {
    console.error(`API_KEY (for Gemini) is not configured on the server.`);
    return res.status(500).json({ 
        message: `The Gemini API key (API_KEY) is not configured. Please set it in your project's environment variables.`,
        code: "API_KEY_MISSING"
    });
  }

  // The YouTube API key is now also mandatory for the full functionality.
  // Instead of a silent fallback, we return a specific, helpful error message.
  if (!youtubeApiKey) {
    console.error("YOUTUBE_API_KEY is not configured on the server.");
    return res.status(500).json({
        primaryVideoId: null,
        alternativeVideoIds: [],
        instructions: "מפתח YouTube API אינו מוגדר בשרת.",
        tips: [
            "יש לוודא שהגדרת משתנה סביבה בשם YOUTUBE_API_KEY.",
            "יש לוודא שהמשתנה מופעל עבור סביבת הייצור (Production).",
            "יש לבצע פריסה מחדש (Redeploy) של האפליקציה לאחר הוספת המפתח."
        ],
        generalInfo: "נדרש מפתח YouTube API כדי לחפש ולהציג סרטונים. המפתח חסר כרגע בהגדרות השרת.",
        language: 'he',
    });
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const { exerciseName, force_refresh } = req.body;

  if (!exerciseName || typeof exerciseName !== 'string') {
    return res.status(400).json({ message: 'A valid exerciseName is required in the request body.' });
  }

  const normalizedExerciseName = exerciseName.trim().toLowerCase();

  // STAGE 0: Check the final result cache first.
  if (!force_refresh && geminiResultCache.has(normalizedExerciseName)) {
      return res.status(200).json(geminiResultCache.get(normalizedExerciseName));
  }


  try {
    // STAGE 1: Get the best search query from Gemini
    const searchQueryPrompt = `
      Translate the exercise name "${exerciseName}" into the best possible English search query for finding a short, instructional video on YouTube.
      CRITICAL: The translation must be in the context of sports, anatomy, and physiotherapy to ensure professional and accurate terminology. 
      For example, "פיתול" should become "torso rotation tutorial" or a similar specific term, not just "twist". 
      Give STRONG preference to channels known for clear, animated, anatomical tutorials like "Passion4Profession".
      The output should be ONLY the search query string and nothing else.
    `;
    
    const queryGenerationResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: searchQueryPrompt,
      config: {
        // This is a simple, fast task. Disable thinking to speed it up.
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const searchQuery = queryGenerationResponse.text.trim();

    if (!searchQuery) {
        throw new Error("Gemini failed to generate a search query.");
    }
    
    // STAGE 2: Search YouTube using the generated query
    let videoResults;
    if (!force_refresh && youtubeCache.has(searchQuery)) {
        videoResults = youtubeCache.get(searchQuery);
    } else {
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoDuration=short&maxResults=5&key=${youtubeApiKey}`;
        const youtubeResponse = await fetch(youtubeApiUrl);
        if (!youtubeResponse.ok) {
            const errorData = await youtubeResponse.json();
            console.error("YouTube API Error:", errorData);
            // Pass a more informative error to the client
            const errorDetails = errorData.error?.message || `YouTube API request failed with status: ${youtubeResponse.status}`;
            throw new Error(`YouTube API Error: ${errorDetails}`);
        }
        const youtubeData = await youtubeResponse.json();
        videoResults = youtubeData.items.map((item: YouTubeVideo) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description
        }));
        youtubeCache.set(searchQuery, videoResults); // Cache the result
    }

    if (!videoResults || videoResults.length === 0) {
      return res.status(200).json({
          primaryVideoId: null,
          alternativeVideoIds: [],
          instructions: "לא נמצאו סרטוני הדרכה מתאימים עבור תרגיל זה.",
          tips: ["נסה לחפש וריאציה אחרת של התרגיל.", "ודא שהשם מאוית נכון."],
          generalInfo: `לא הצלחנו לאתר סרטון הדרכה קצר ואיכותי עבור "${exerciseName}" בשלב זה.`,
          language: 'he'
      });
    }

    // STAGE 3: Let Gemini choose the best video and generate content
    const videoSelectionPrompt = `
      You are an expert fitness coach. For the exercise "${exerciseName}", I have found these potential YouTube videos:
      ${JSON.stringify(videoResults, null, 2)}

      Your tasks are:
      1.  **Select the single BEST video** from this list. The best video is a short (ideally under 120 seconds), direct, high-quality instructional tutorial focusing on proper form. Give strong preference to animated, anatomical videos (like from 'Passion4Profession') over videos with real people. Avoid long intros, vlogs, or full workout routines.
      2.  **Based on the content of your selected video**, generate the following information IN THE SAME LANGUAGE as the original exercise name ("${exerciseName}"):
          - "instructions": A clear, step-by-step guide. Each step MUST be on a new line, separated by '\\n'.
          - "tips": 2-4 concise tips for proper form.
          - "generalInfo": A short paragraph about the exercise, its benefits, and primary muscles targeted.
      3.  Provide a list of up to 3 other good video IDs from the provided list as alternatives. Do not include your primary selection in this list.
      4.  Return everything as a single, valid JSON object with the specified structure.

      If NONE of the provided videos are suitable instructional tutorials, all video ID fields MUST be null.
    `;
    
    const finalResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: videoSelectionPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    primaryVideoId: { type: Type.STRING, description: "The ID of the best video chosen.", nullable: true },
                    alternativeVideoIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of other good video IDs." },
                    instructions: { type: Type.STRING },
                    tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                    generalInfo: { type: Type.STRING },
                    language: { type: Type.STRING, description: "ISO 639-1 language code." },
                },
                required: ["primaryVideoId", "alternativeVideoIds", "instructions", "tips", "generalInfo", "language"],
            },
        },
    });

    const responseText = finalResponse.text;
    const cleanedJsonString = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    if (!cleanedJsonString) {
        throw new Error("Received an empty final response from the AI service.");
    }
    
    const data = JSON.parse(cleanedJsonString);

    // Cache the final successful result before returning
    geminiResultCache.set(normalizedExerciseName, data);

    return res.status(200).json(data);

  } catch (error: any) {
    console.error("Error in API handler:", error);
    
    let errorMessage = error.message || 'An error occurred while processing your request.';
    let tips = ["אנא נסה שוב מאוחר יותר.", "בדוק את קונסולת המפתחים לפרטים טכניים."];

    // Check for specific YouTube API error patterns to provide more helpful advice.
    if (errorMessage.includes("YouTube API Error")) {
        const lowerCaseError = errorMessage.toLowerCase();
        if (lowerCaseError.includes("api key not valid") || lowerCaseError.includes("permission") || lowerCaseError.includes("denied") || lowerCaseError.includes("restricted")) {
            errorMessage = "שגיאה באימות מפתח YouTube API.";
            tips = [
                "ודא שהעתקת את המפתח הנכון.",
                "ודא ש-YouTube Data API v3 מופעל בפרויקט שלך ב-Google Cloud.",
                "חשוב: בדוק את הגבלות המפתח (Restrictions). אם הגדרת הגבלת 'Websites', שנה אותה ל-'None'. הגבלת אתרים לא תעבוד עבור קריאות מהשרת.",
                "לאחר שינוי הגדרות המפתח, יש להמתין מספר דקות עד שהשינוי ייכנס לתוקף."
            ];
        }
    }

    const clientError = {
        primaryVideoId: null,
        alternativeVideoIds: [],
        instructions: `אירעה שגיאה: ${errorMessage}`,
        tips: tips,
        generalInfo: "לא ניתן היה לאחזר מידע עבור תרגיל זה עקב שגיאה בצד השרת.",
        language: 'he',
    };
    return res.status(500).json(clientError);
  }
}