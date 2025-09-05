import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY;

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
1.  "videoUrl": A string. Search YouTube for a relevant, high-quality tutorial video. The value must be a standard watch link (e.g., "https://www.youtube.com/watch?v=VIDEO_ID" or "https://youtu.be/VIDEO_ID"). If no suitable YouTube video can be found, this value MUST be an empty string ("").
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
                    videoUrl: { type: Type.STRING, description: "A standard YouTube watch link URL, or an empty string." },
                    instructions: { type: Type.STRING, description: "Clear, step-by-step instructions." },
                    tips: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of concise tips." },
                    generalInfo: { type: Type.STRING, description: "General info about the exercise." },
                    language: { type: Type.STRING, description: "ISO 639-1 language code of the response." },
                },
                required: ["videoUrl", "instructions", "tips", "generalInfo", "language"],
            },
        },
    });

    const responseText = response.text;
    
    // Clean potential markdown fences and trim whitespace.
    const cleanedJsonString = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

    if (!cleanedJsonString) {
        throw new Error("Received an empty response from the AI service.");
    }
    
    // Instead of parsing and re-serializing, send the cleaned JSON string directly.
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(cleanedJsonString);

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    const errorMessage = error.message || 'An error occurred while fetching data from the AI service.';
    return res.status(500).json({ message: errorMessage });
  }
}