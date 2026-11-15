import { createGeminiClient, getGeminiApiKey, safetySettings, withGeminiModelFallback } from "./_geminiClient.js";

const BASE_SYSTEM_INSTRUCTION = `You are a world-class expert in human performance and rehabilitation, with deep knowledge in sports science, physiotherapy, and occupational therapy. Your primary goal is to help users create safe, effective, and personalized plans.

**Interaction Flow:**
1.  **Be Conversational:** Act like a personal coach or therapist. If the user's request is vague (e.g., "give me a plan"), you MUST ask clarifying questions before creating a plan. Ask about their goals, available time, physical condition, available equipment, etc.
2.  **Generate the Plan:** Once you have enough information, generate the plan. It could be a workout plan, a physiotherapy routine, a set of daily activities for occupational therapy, etc.
3.  **Provide a Summary:** FIRST, provide a friendly, human-readable summary of the plan you've created. This summary should appear as regular text.
4.  **Provide the JSON:** AFTER the summary, you MUST provide the plan as a single, valid JSON object enclosed in a markdown code block (\`\`\`json ... \`\`\`). Do NOT include any other text after the JSON block.

**JSON Rules:**
- The JSON MUST conform to the TypeScript interface provided below.
- The \`type\` for steps can be 'exercise' for physical movements or 'rest' for breaks. Use these categories broadly. For example, a physiotherapy stretch is an 'exercise'.
- **CRITICAL:** The \`name\` property for each step MUST ONLY contain the base name of the activity (e.g., "Squats", "Push-ups", "Gentle Wrist Stretches"). DO NOT include set counts, reps, or durations in the activity name itself.

**Language:**
- You MUST respond in the same language as the user's last message. This includes all conversational text, the plan summary, and all strings within the JSON object (like \`name\` fields for the plan and its steps).

**Workout Plan Interface:**
\`\`\`typescript
interface WorkoutStep {
  id: string; // Should be a unique placeholder like "step_1"
  name: string; // e.g., "Push-ups", "Rest"
  type: 'exercise' | 'rest';
  isRepBased: boolean; // true for reps, false for time-based
  duration: number; // Duration in seconds (if not rep-based)
  reps: number; // Number of reps (if rep-based)
}

interface WorkoutPlan {
  name: string; // A descriptive name for the plan, e.g., "Full Body Beginner Workout"
  steps: WorkoutStep[];
  executionMode?: 'linear' | 'circuit';
}
\`\`\`
`;

const isErrorLikeText = (text) =>
  text.startsWith('שגיאה:') ||
  text.startsWith('Error:') ||
  text.includes('אירעה שגיאה') ||
  text.includes('Could not connect to the AI planner');

export const sanitizeChatHistory = (rawHistory) => {
  if (!Array.isArray(rawHistory)) return [];
  const cleaned = [];

  for (const entry of rawHistory) {
    const role = entry?.role;
    if (role !== 'user' && role !== 'model') continue;
    const rawParts = Array.isArray(entry?.parts) ? entry.parts : [];
    const textParts = rawParts
      .filter((part) => part && typeof part.text === 'string' && !part.isPlanLink)
      .map((part) => part.text.trim())
      .filter((txt) => txt.length > 0 && !(role === 'model' && isErrorLikeText(txt)));

    if (textParts.length === 0) continue;

    const combinedText = textParts.join('\n');
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === role) {
      last.parts = [{ text: `${last.parts[0].text}\n${combinedText}` }];
    } else {
      cleaned.push({ role, parts: [{ text: combinedText }] });
    }
  }

  while (cleaned.length > 0 && cleaned[0].role !== 'user') {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
    cleaned.pop();
  }

  return cleaned;
};

export const handleChatRequest = async (history, message, profileContext = '', modelPreference = 'smart') => {
  const apiKey = getGeminiApiKey();
  const ai = createGeminiClient(apiKey);
  const sanitizedHistory = sanitizeChatHistory(history);
  const systemInstruction = profileContext?.trim()
    ? `${BASE_SYSTEM_INSTRUCTION}\n\n**User Profile Context (use this to personalize the workout):**\n${profileContext.trim()}`
    : BASE_SYSTEM_INSTRUCTION;

  const response = await withGeminiModelFallback(
    ai,
    async (model) => {
      const chat = ai.chats.create({
        model,
        history: sanitizedHistory,
        config: {
          safetySettings,
          systemInstruction,
        },
      });
      return chat.sendMessage({ message });
    },
    modelPreference === 'speed' ? 'speed' : 'smart'
  );

  return { status: 200, body: { responseText: response.text ?? "" } };
};
