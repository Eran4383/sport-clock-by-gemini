import { useState } from 'react';
import { useWorkout } from '../../contexts/WorkoutContext';
import { useSettings } from '../../contexts/SettingsContext';
import { generateWorkoutPlan } from '../../services/geminiService';
import { ChatMessage, ModelPreference } from './types';

export function useAiWorkoutGenerator(
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  stopListening: () => void
) {
  const { importPlan } = useWorkout();
  const { settings } = useSettings();
  const [isLoading, setIsLoading] = useState(false);

  const buildProfileContext = () => {
    if (!settings.userProfile) return '';
    const { userProfile } = settings;
    const parts = [];
    if (userProfile.birthDate) {
      const age = new Date().getFullYear() - new Date(userProfile.birthDate).getFullYear();
      if (age > 0 && age < 120) parts.push(`Age: ${age}`);
    }
    if (userProfile.fitnessLevel) parts.push(`Fitness: ${userProfile.fitnessLevel}`);
    const eq = userProfile.equipment?.filter(e => e.available).map(e => e.name);
    if (eq && eq.length > 0) parts.push(`Equipment: ${eq.join(', ')}`);
    return parts.join('; ');
  };

  const sendMessage = async (input: string, modelPreference: ModelPreference) => {
    if (!input.trim() || isLoading) return;
    stopListening();

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: input }] };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const profileContext = buildProfileContext();
      const responseText = await generateWorkoutPlan(messages, input, profileContext, modelPreference);
      if (responseText.startsWith('Error: ')) {
        setMessages([...newMessages, { role: 'model', parts: [{ text: responseText.slice(7) }] }]);
        return;
      }

      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = responseText.match(jsonRegex);
      const conversationalText = responseText.replace(jsonRegex, '').trim();
      const finalMsgs = [...newMessages];

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
      setMessages([...newMessages, { role: 'model', parts: [{ text: err?.message || 'שגיאה בעיבוד' }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, sendMessage };
}
