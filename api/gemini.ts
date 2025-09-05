import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY;

// Helper function to extract YouTube video ID from various URL formats
function extractYouTubeId(url: string | null): string | null {
  if (!url || typeof url !== 'string') return null;

  // It might be the ID already
  if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
    return url;
  }
  
  // Regular expression to find the video ID from various YouTube URL formats.
  const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  
  return match ? match[1] : null;
}


export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  if (!apiKey) {
    console.error("API_KEY is not configured on the server.");
    return res.status(500).json({ 
        message: "API key not configured on the server. Please set the API_KEY environment variable in your project settings.",
        code: "API_KEY_MISSING"
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const { exerciseName } = req.body;

  if (!exerciseName || typeof exerciseName !== 'string') {
    return res.status(400).json({ message: 'A valid exerciseName is required in the request body.' });
  }

  try {
    const prompt = `For the exercise "${exerciseName}", provide a detailed analysis. Your entire response MUST be a single JSON object. The response content should be in the same language as the exercise name provided.

The JSON object must contain these exact keys:
1.  "videoId": A string. Provide the 11-character YouTube video ID for a high-quality, instructional video demonstrating the exercise. Example: "dQw4w9WgXcQ". DO NOT provide a full URL. If no relevant video is found, this value MUST be null.
2.  "instructions": A string containing a clear, step-by-step guide on how to perform the exercise correctly.
3.  "tips": An array of strings. Each string should be a concise, helpful tip for maintaining proper form or avoiding common mistakes. Provide 2-4 tips.
4.  "generalInfo": A string containing a short paragraph that describes the exercise, its benefits, and the primary muscles targeted.
5.  "language": A string with the ISO 639-1 code for the language of your response (e.g., "en" for English, "he" for Hebrew).`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    videoId: { type: Type.STRING, description: "An 11-character YouTube video ID, or null.", nullable: true },
                    instructions: { type: Type.STRING, description: "Clear, step-by-step instructions." },
                    tips: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of concise tips." },
                    generalInfo: { type: Type.STRING, description: "General info about the exercise." },
                    language: { type: Type.STRING, description: "ISO 639-1 language code of the response." },
                },
                required: ["videoId", "instructions", "tips", "generalInfo", "language"],
            },
        },
    });

    const responseText = response.text;
    
    const cleanedJsonString = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

    if (!cleanedJsonString) {
        throw new Error("Received an empty response from the AI service.");
    }
    
    let data;
    try {
        data = JSON.parse(cleanedJsonString);
    } catch (parseError) {
        console.error("Failed to parse JSON response from Gemini:", cleanedJsonString);
        throw new Error("Received invalid JSON from the AI service.");
    }

    // Sanitize the videoId field to ensure it's either a valid 11-character ID or null.
    // This handles cases where Gemini might return a full URL or an invalid string.
    data.videoId = extractYouTubeId(data.videoId);

    return res.status(200).json(data);

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    const errorMessage = error.message || 'An error occurred while fetching data from the AI service.';
    return res.status(500).json({ message: errorMessage });
  }
}
