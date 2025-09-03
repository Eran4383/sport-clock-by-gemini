export interface ExerciseInfo {
    instructions: string;
    tips: string[];
    generalInfo: string;
    language: 'en' | 'he' | string;
}

const getApiKeyErrorResponse = (): ExerciseInfo => ({
    instructions: "API Key Not Configured on Server",
    tips: [
        "1. Go to your project settings on your hosting provider (e.g., Vercel).",
        "2. Find the 'Environment Variables' section.",
        "3. Ensure there is a variable named API_KEY with your Gemini API key as the value.",
        "4. Make sure the variable is enabled for the Production environment.",
        "5. Redeploy your application to apply the changes."
    ],
    generalInfo: "The AI features of this app require a server-side API key. If you've just added it, a redeploy is necessary.",
    language: 'en',
});

const getGenericErrorResponse = (message: string): ExerciseInfo => ({
    instructions: message,
    tips: [],
    generalInfo: "An unexpected error occurred. Please check the developer console for more details and try again later.",
    language: 'en',
});

export async function getExerciseInfo(exerciseName: string): Promise<ExerciseInfo> {
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ exerciseName }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.code === 'API_KEY_MISSING') {
                return getApiKeyErrorResponse();
            }
            // Use the message from the backend for other errors
            throw new Error(data.message || 'Failed to fetch exercise info from the server.');
        }

        return data as ExerciseInfo;

    } catch (error) {
        console.error("Error fetching exercise info from server:", error);
        if (error instanceof TypeError) { // Network error
             return getGenericErrorResponse("Could not connect to the server. Please check your internet connection.");
        }
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return getGenericErrorResponse(`Error: ${errorMessage}`);
    }
}
