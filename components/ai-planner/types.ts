export type ModelPreference = 'smart' | 'speed';

export interface ChatPart {
  text: string;
  isPlanLink?: boolean;
  planName?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: ChatPart[];
}

export interface UserProfileContext {
  age?: number;
  fitnessLevel?: string;
  equipment?: string[];
}
