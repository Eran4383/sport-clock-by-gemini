import { useState, useRef, useEffect } from 'react';

export function useSpeechRecognition(
  input: string,
  setInput: React.Dispatch<React.SetStateAction<string>>
) {
  const [isListening, setIsListening] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setSpeechNotice(null);
  };

  const toggleListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechNotice('הדפדפן אינו תומך בהקלדה קולית (מומלץ Chrome/Edge/Safari)');
      setTimeout(() => setSpeechNotice(null), 4000);
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'he-IL';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      baseTextRef.current = input;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechNotice('מקשיב... דבר עכשיו (הקלדה בעברית)');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const base = baseTextRef.current.trim();
        const combined = base ? `${base} ${transcript}` : transcript;
        setInput(combined);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechNotice('יש לאשר גישה למיקרופון בהגדרות הדפדפן');
        } else if (event.error === 'no-speech') {
          setSpeechNotice('לא נקלט דיבור');
        } else {
          setSpeechNotice(`שגיאת מיקרופון: ${event.error}`);
        }
        setTimeout(() => setSpeechNotice(null), 3500);
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        setSpeechNotice(null);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Speech recognition failed to start:', err);
      setSpeechNotice('לא ניתן להפעיל את המיקרופון');
      setTimeout(() => setSpeechNotice(null), 3000);
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  return { isListening, speechNotice, toggleListening, stopListening };
}
