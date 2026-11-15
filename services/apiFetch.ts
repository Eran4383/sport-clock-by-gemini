export interface SafeApiResult {
  ok: boolean;
  status: number;
  data: any;
  isNonJsonError: boolean;
  rawText: string;
}

export async function postGeminiJson(payload: Record<string, any>): Promise<SafeApiResult> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let data: any = null;
  let isNonJsonError = false;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      isNonJsonError = true;
      data = {
        message: `השרת החזיר תגובה לא תקינה (HTTP ${res.status || 500}).`,
        rawSnippet: rawText.slice(0, 140),
      };
    }
  } else {
    isNonJsonError = true;
    data = { message: `התקבלה תשובה ריקה מהשרת (HTTP ${res.status || 500}).` };
  }

  return { ok: res.ok, status: res.status, data, isNonJsonError, rawText };
}

const isErrorChatText = (text: string): boolean =>
  text.startsWith('שגיאה:') ||
  text.startsWith('Error:') ||
  text.includes('אירעה שגיאה') ||
  text.includes('Could not connect to the AI planner');

export interface ApiChatHistoryItem {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export function sanitizeChatHistoryForApi(
  chatHistory: { role: 'user' | 'model'; parts: { text?: string; isPlanLink?: boolean }[] }[]
): ApiChatHistoryItem[] {
  if (!Array.isArray(chatHistory)) return [];
  const cleaned: ApiChatHistoryItem[] = [];

  for (const msg of chatHistory) {
    if (msg?.role !== 'user' && msg?.role !== 'model') continue;
    const textParts = (Array.isArray(msg.parts) ? msg.parts : [])
      .filter((p) => p && typeof p.text === 'string' && !p.isPlanLink)
      .map((p) => (p.text || '').trim())
      .filter((t) => t.length > 0 && !(msg.role === 'model' && isErrorChatText(t)));

    if (textParts.length === 0) continue;

    const combined = textParts.join('\n');
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === msg.role) {
      prev.parts = [{ text: `${prev.parts[0].text}\n${combined}` }];
    } else {
      cleaned.push({ role: msg.role, parts: [{ text: combined }] });
    }
  }

  while (cleaned.length > 0 && cleaned[0].role !== 'user') {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
    cleaned.pop();
  }

  return cleaned;
}
