import { Type } from "@google/genai";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createGeminiClient, db, getGeminiApiKey, safetySettings, withGeminiModelFallback } from "./_geminiClient.js";

export const handleExerciseInfoRequest = async (exerciseName, forceRefresh) => {
  const apiKey = getGeminiApiKey();
  const ai = createGeminiClient(apiKey);
  const normalizedExerciseName = exerciseName.trim().toLowerCase();

  if (!forceRefresh) {
    try {
      const docRef = doc(db, "exercise_cache", normalizedExerciseName);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { status: 200, body: docSnap.data() };
      }
    } catch (fsError) {
      console.error("Firestore cache 'get' operation failed:", fsError);
    }
  }

  const searchYouTube = async () => {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) return [];
    const searchQuery = `how to do ${exerciseName} proper form tutorial short`;
    const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoDuration=short&maxResults=5&key=${youtubeApiKey}`;

    try {
      const youtubeResponse = await fetch(youtubeApiUrl);
      if (!youtubeResponse.ok) {
        const errorData = await youtubeResponse.json();
        console.error("YouTube API Error:", errorData);
        return [];
      }
      const youtubeData = await youtubeResponse.json();
      return (youtubeData.items || []).map((item) => item.id?.videoId).filter(Boolean);
    } catch (error) {
      console.error("Failed to fetch from YouTube API:", error);
      return [];
    }
  };

  const getGeminiText = async () => {
    const textGenerationPrompt = `
      You are an expert fitness coach. For the exercise "${exerciseName}", generate the following information IN THE SAME LANGUAGE as the original exercise name ("${exerciseName}"):
      - "instructions": A clear, step-by-step guide. Each step MUST be on a new line, separated by '\\n'.
      - "tips": 2-4 concise tips for proper form.
      - "generalInfo": A short paragraph about the exercise, its benefits, and primary muscles targeted.
      - "language": The ISO 639-1 code for the language you are writing in.

      Return ONLY a single, valid JSON object with the specified structure. Do not include video information.
    `;

    const textResponse = await withGeminiModelFallback(ai, (model) =>
      ai.models.generateContent({
        model,
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
          safetySettings,
        },
      })
    );

    const cleanedJsonString = (textResponse.text ?? "")
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
    if (!cleanedJsonString) {
      throw new Error("Received an empty text response from the AI service.");
    }
    return JSON.parse(cleanedJsonString);
  };

  const [videoIds, textData] = await Promise.all([searchYouTube(), getGeminiText()]);

  const finalData = {
    ...textData,
    primaryVideoId: videoIds.length > 0 ? videoIds[0] : null,
    alternativeVideoIds: videoIds.length > 1 ? videoIds.slice(1, 4) : [],
  };

  if (!finalData.primaryVideoId) {
    finalData.instructions = "לא נמצאו סרטוני הדרכה מתאימים עבור תרגיל זה. המידע הכתוב עדיין זמין.";
  }

  try {
    const docRef = doc(db, "exercise_cache", normalizedExerciseName);
    await setDoc(docRef, finalData);
  } catch (fsError) {
    console.error("Firestore cache 'set' operation failed:", fsError);
  }

  return { status: 200, body: finalData };
};
