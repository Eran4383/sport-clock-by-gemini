import React, { useState } from 'react';
import { useWorkout } from '../../contexts/WorkoutContext';
import { useSettings } from '../../contexts/SettingsContext';
import { generateWorkoutPlan } from '../../services/geminiService';
import { ChatMessage, ModelPreference } from './types';

interface FailedRequestState {
  history: ChatMessage[];
  input: string;
  modelPreference: ModelPreference;
}

export function useAiWorkoutGenerator(
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  stopListening: () => void
) {
  const { importPlan } = useWorkout();
  const { settings } = useSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [lastFailed, setLastFailed] = useState<FailedRequestState | null>(null);

  const buildProfileContext = () => {
    if (!settings.userProfile) return '';
    const { userProfile } = settings;
    const parts: string[] = [];
    if (userProfile.birthDate) {
      const age = new Date().getFullYear() - new Date(userProfile.birthDate).getFullYear();
      if (age > 0 && age < 120) parts.push(`Age: ${age}`);
    }
    if (userProfile.fitnessLevel) parts.push(`Fitness level: ${userProfile.fitnessLevel}`);
    const eq = userProfile.equipment?.filter(e => e.available).map(e => e.name);
    if (eq && eq.length > 0) parts.push(`Available equipment: ${eq.join(', ')}`);
    return parts.join('; ');
  };

  const executeChatTurn = async (
    baseHistory: ChatMessage[],
    displayMessages: ChatMessage[],
    input: string,
    modelPreference: ModelPreference
  ) => {
    setIsLoading(true);
    setLastFailed(null);

    try {
      const profileContext = buildProfileContext();
      const responseText = await generateWorkoutPlan(baseHistory, input, profileContext, modelPreference);

      if (responseText.startsWith('Error: ')) {
        setLastFailed({ history: baseHistory, input, modelPreference });
        setMessages([...displayMessages, { role: 'model', parts: [{ text: responseText.slice(7) }] }]);
        return;
      }

      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = responseText.match(jsonRegex);
      const conversationalText = responseText.replace(jsonRegex, '').trim();
      const finalMsgs = [...displayMessages];

      if (conversationalText) finalMsgs.push({ role: 'model', parts: [{ text: conversationalText }] });

      if (match && match[1]) {
        try {
          const planJson = JSON.parse(match[1]);
          planJson.isSmartPlan = true;
          planJson.color = '#a855f7';
          importPlan(planJson, 'ai');
          finalMsgs.push({ role: 'model', parts: [{ text: '', isPlanLink: true, planName: planJson.name }] });
        } catch {
          finalMsgs.push({ role: 'model', parts: [{ text: 'האימון נוצר אך חלה שגיאה בעיבודו. נסה שוב.' }] });
        }
      } else if (!conversationalText) {
        finalMsgs.push({ role: 'model', parts: [{ text: responseText }] });
      }

      setMessages(finalMsgs);
    } catch (err: any) {
      setLastFailed({ history: baseHistory, input, modelPreference });
      setMessages([...displayMessages, { role: 'model', parts: [{ text: err?.message || 'שגיאה בעיבוד הבקשה.' }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (input: string, modelPreference: ModelPreference) => {
    if (!input.trim() || isLoading) return;
    stopListening();

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: input }] };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    await executeChatTurn(messages, newMessages, input, modelPreference);
  };

  const retryLastMessage = async () => {
    if (!lastFailed || isLoading) return;
    stopListening();
    const retryDisplay = [...lastFailed.history, { role: 'user' as const, parts: [{ text: lastFailed.input }] }];
    setMessages(retryDisplay);
    await executeChatTurn(lastFailed.history, retryDisplay, lastFailed.input, lastFailed.modelPreference);
  };

  return { isLoading, sendMessage, retryLastMessage, canRetry: Boolean(lastFailed) };
}
