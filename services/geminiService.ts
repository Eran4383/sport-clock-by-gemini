import { GoogleGenAI } from "@google/genai";

// This check is to prevent assignment errors in environments where process.env is not defined.
const apiKey = typeof process !== 'undefined' && process.env.API_KEY
  ? process.env.API_KEY
  : "";

if (!apiKey) {
  console.warn("API_KEY environment variable not found. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey });

export async function getExerciseInfo(exerciseName: string): Promise<string> {
    if (!apiKey) {
        return "API key is not configured. Please set the API_KEY environment variable.";
    }
    try {
        const prompt = `Provide a brief, 1-2 paragraph description and simple instructions on how to perform the exercise: "${exerciseName}". Focus on the main points of execution. Do not use markdown formatting.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error fetching exercise info from Gemini:", error);
        return "Sorry, I couldn't fetch information for this exercise at the moment. Please check the console for more details.";
    }
}
