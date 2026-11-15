import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBKjqOImhiSryfylDv2DkEGtQZeR1QG8oA",
  authDomain: "sport-clock-account-connection.firebaseapp.com",
  projectId: "sport-clock-account-connection",
  storageBucket: "sport-clock-account-connection.firebasestorage.app",
  messagingSenderId: "721205944193",
  appId: "1:721205944193:web:1dc6b014d9c09adb599280",
  measurementId: "G-N7QC8DZPYP"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

export const getGeminiApiKey = (): string | undefined =>
  process.env.GEMINI_API_KEY || process.env.API_KEY;

export const createGeminiClient = (apiKey: string): GoogleGenAI =>
  new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

export const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const PREFERRED_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedDiscoveredModel: { name: string; expiresAt: number } | null = null;

const isModelNotFoundError = (error: any): boolean => {
  const status = error?.status ?? error?.code;
  const msg = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    status === 404 ||
    status === 'NOT_FOUND' ||
    msg.includes('404') ||
    msg.includes('not_found') ||
    msg.includes('is not found') ||
    msg.includes('not supported for generatecontent')
  );
};

async function discoverFallbackFlashModel(ai: GoogleGenAI, tried: Set<string>): Promise<string | null> {
  if (cachedDiscoveredModel && Date.now() < cachedDiscoveredModel.expiresAt && !tried.has(cachedDiscoveredModel.name)) {
    return cachedDiscoveredModel.name;
  }
  try {
    const pager = await ai.models.list();
    const candidates: string[] = [];
    for await (const m of pager) {
      const rawName = (m.name || '').replace(/^models\//, '');
      if (!rawName || tried.has(rawName)) continue;
      const lower = rawName.toLowerCase();
      if (!lower.includes('gemini')) continue;
      if (/(tts|live|image|embedding|veo|lyria|audio|transcribe|robotics|computer-use)/.test(lower)) continue;
      const actions = m.supportedActions || [];
      if (actions.length > 0 && !actions.includes('generateContent')) continue;
      candidates.push(rawName);
    }
    const flashCandidate =
      candidates.find((n) => n.includes('flash') || n.includes('hydrogen')) ||
      candidates[0] ||
      null;
    if (flashCandidate) {
      cachedDiscoveredModel = { name: flashCandidate, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
    }
    return flashCandidate;
  } catch (listErr) {
    console.error('Failed to dynamically list Gemini models:', listErr);
    return null;
  }
}

export async function withGeminiModelFallback<T>(
  ai: GoogleGenAI,
  runWithModel: (model: string) => Promise<T>
): Promise<T> {
  const envModel = process.env.GEMINI_MODEL?.trim();
  const initialCandidates = [
    ...(envModel ? [envModel] : []),
    ...(cachedDiscoveredModel && Date.now() < cachedDiscoveredModel.expiresAt ? [cachedDiscoveredModel.name] : []),
    ...PREFERRED_MODELS,
  ];
  const uniqueCandidates = [...new Set(initialCandidates)];
  const tried = new Set<string>();
  let lastError: any;

  for (const model of uniqueCandidates) {
    tried.add(model);
    try {
      return await runWithModel(model);
    } catch (err: any) {
      lastError = err;
      if (!isModelNotFoundError(err)) {
        throw err;
      }
      console.warn(`Model "${model}" unavailable (404/NOT_FOUND), trying fallback...`);
    }
  }

  const discovered = await discoverFallbackFlashModel(ai, tried);
  if (discovered) {
    console.warn(`Using dynamically discovered Gemini model "${discovered}"`);
    return await runWithModel(discovered);
  }

  throw lastError;
}
