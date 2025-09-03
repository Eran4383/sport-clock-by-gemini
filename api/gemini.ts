
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
    const prompt = `Analyze the exercise "${exerciseName}". Respond in the same language as the exercise name. Your response MUST be a JSON object.

Follow this structure:
1.  "instructions": A brief, clear, step-by-step guide on how to perform the exercise. Each step MUST be on a new line, separated by a "\\n" character.
2.  "tips": An array of 2-4 specific, concise tips for correct form or common mistakes.
3.  "generalInfo": A short paragraph about the exercise, muscles targeted, and benefits.
4.  "language": The ISO 639-1 code for the language of your response (e.g., "he" for Hebrew).
5.  "youtubeVideoId": (Optional) A single, relevant YouTube video ID for a tutorial. Just the ID, not the full URL.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    instructions: { type: Type.STRING, description: "Clear, step-by-step instructions. Each step must be separated by a '\\n' newline character." },
                    tips: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of concise tips." },
                    generalInfo: { type: Type.STRING, description: "General info about the exercise." },
                    language: { type: Type.STRING, description: "ISO 639-1 language code of the response." },
                    youtubeVideoId: { type: Type.STRING, description: "A relevant YouTube video ID for an exercise tutorial." },
                },
                required: ["instructions", "tips", "generalInfo", "language"],
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
