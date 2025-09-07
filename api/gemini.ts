import { GoogleGenAI, Type } from "@google/genai";

const geminiApiKey = process.env.API_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

// Simple in-memory cache for YouTube search results to avoid redundant API calls
const youtubeCache = new Map<string, any>();

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

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const { exerciseName } = req.body;

  if (!exerciseName || typeof exerciseName !== 'string') {
    return res.status(400).json({ message: 'A valid exerciseName is required in the request body.' });
  }

  try {
    // ===== FALLBACK PATH (No YouTube API Key) =====
    // If YouTube key is missing, fall back to text-only generation from Gemini's internal knowledge.
    if (!youtubeApiKey) {
        console.warn("YOUTUBE_API_KEY is missing. Falling back to text-only generation from Gemini's knowledge base.");
        
        const textOnlyPrompt = `
          You are an expert fitness coach. For the exercise "${exerciseName}", generate the following information IN THE SAME LANGUAGE as the original exercise name ("${exerciseName}"):
          - "instructions": A clear, step-by-step guide on how to perform the exercise correctly, as an array of strings. Each string in the array should be a single step.
          - "tips": 2-4 concise tips for proper form and common mistakes to avoid.
          - "generalInfo": A short paragraph about the exercise, its benefits, and primary muscles targeted. At the end of this paragraph, add the following sentence in the target language: "Video tutorials require additional configuration."
          - "language": The ISO 639-1 code for the language used (e.g., 'he' for Hebrew, 'en' for English).

          Return everything as a single, valid JSON object.
        `;

        const textOnlyResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: textOnlyPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                        generalInfo: { type: Type.STRING },
                        language: { type: Type.STRING },
                    },
                    required: ["instructions", "tips", "generalInfo", "language"],
                },
            },
        });
        
        const responseText = textOnlyResponse.text;
        const cleanedJsonString = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        if (!cleanedJsonString) {
            throw new Error("Received an empty response from the AI service for text-only generation.");
        }
    
        const data = JSON.parse(cleanedJsonString);
        
        // Add the video fields manually to conform to the ExerciseInfo interface
        const finalData = {
            ...data,
            primaryVideoId: null,
            alternativeVideoIds: [],
        };
        
        return res.status(200).json(finalData);
    }

    // ===== FULL PATH (with YouTube API Key) =====

    // STAGE 1: Get the best search query from Gemini
    const searchQueryPrompt = `
      Translate the exercise name "${exerciseName}" into the best possible English search query for finding a short, instructional video on YouTube.
      CRITICAL: The translation must be in the context of sports, anatomy, and physiotherapy to ensure professional and accurate terminology. 
      For example, "פיתול" should become "torso rotation tutorial" or a similar specific term, not just "twist". 
      The output should be ONLY the search query string and nothing else.
    `;
    
    const queryGenerationResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: searchQueryPrompt,
    });
    const searchQuery = queryGenerationResponse.text.trim();

    if (!searchQuery) {
        throw new Error("Gemini failed to generate a search query.");
    }

    // STAGE 2: Search YouTube using the generated query
    let videoResults;
    if (youtubeCache.has(searchQuery)) {
        videoResults = youtubeCache.get(searchQuery);
    } else {
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoDuration=short&maxResults=5&key=${youtubeApiKey}`;
        const youtubeResponse = await fetch(youtubeApiUrl);
        if (!youtubeResponse.ok) {
            const errorData = await youtubeResponse.json();
            console.error("YouTube API Error:", errorData);
            throw new Error(`YouTube API request failed with status: ${youtubeResponse.status}`);
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
          instructions: ["No suitable instructional video was found for this exercise."],
          tips: ["Try searching for a different variation of the exercise.", "Check your spelling."],
          generalInfo: `We could not locate a high-quality, short instructional video for "${exerciseName}" at this time.`,
          language: 'en'
      });
    }

    // STAGE 3: Let Gemini choose the best video and generate content
    const videoSelectionPrompt = `
      You are an expert fitness coach. For the exercise "${exerciseName}", I have found these potential YouTube videos:
      ${JSON.stringify(videoResults, null, 2)}

      Your tasks are:
      1.  **Select the single BEST video** from this list. The best video is a short (ideally under 120 seconds), direct, high-quality instructional tutorial focusing on proper form. Avoid long workouts, vlogs, or videos that are not primarily instructional.
      2.  **Based on the content of your selected video**, generate the following information IN THE SAME LANGUAGE as the original exercise name ("${exerciseName}"):
          - "instructions": A clear, step-by-step guide as an array of strings, with each string being a single step.
          - "tips": 2-4 concise tips for proper form.
          - "generalInfo": A short paragraph about the exercise, its benefits, and primary muscles targeted.
      3.  Provide a list of up to 3 other good video IDs from the provided list as alternatives for the user. Do not include your primary selection in this list.
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
                    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
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
    return res.status(200).json(data);

  } catch (error: any) {
    console.error("Error in API handler:", error);
    const errorMessage = error.message || 'An error occurred while processing your request.';
    return res.status(500).json({ message: errorMessage });
  }
}