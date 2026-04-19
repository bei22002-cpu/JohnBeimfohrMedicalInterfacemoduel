import { useCallback, useEffect, useRef, useState } from "react";

/** Web Speech API — Chrome/Edge typically supported. */
export function useVoiceCommand(onResult: (text: string) => void, enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const W = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition; SpeechRecognition?: new () => SpeechRecognition };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0][0].transcript;
      onResultRef.current(text);
    };
    r.onerror = (ev: SpeechRecognitionErrorEvent) => setError(ev.error ?? "speech error");
    r.onend = () => setError(null);
    recRef.current = r;
    return () => {
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!supported || !recRef.current) return;
    try {
      recRef.current.start();
    } catch {
      setError("Could not start — use text input.");
    }
  }, [supported]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  return { supported, error, start, stop };
}
