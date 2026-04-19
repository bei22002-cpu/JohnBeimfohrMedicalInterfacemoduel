import { useCallback, useRef, useState } from "react";
import { getDeviceId, registerDeviceIfNeeded, transcribeAudioBlob } from "../fleet/fleetClient";

type Opts = {
  onText: (text: string) => void;
  enabled: boolean;
};

/**
 * Hold-to-record → upload to fleet-api → Azure Speech (BAA-covered when deployed per policy).
 * Requires HTTPS or localhost for getUserMedia; room PCs should use wired + TLS.
 */
export function useMedicalHoldToRecord({ onText, enabled }: Opts) {
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(typeof MediaRecorder !== "undefined");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    const r = recRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!enabled || !supported) return;
    const deviceId = getDeviceId() ?? (await registerDeviceIfNeeded());
    if (!deviceId) {
      setError("Device not registered — check fleet API / CORS.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        try {
          const text = await transcribeAudioBlob(blob, deviceId);
          if (text.trim()) onText(text.trim());
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "ASR_NOT_CONFIGURED") setError("Medical ASR not configured on server (set Azure keys).");
          else setError("Transcription failed — try typed command.");
        }
      };
      recRef.current = rec;
      rec.start();
    } catch {
      setError("Microphone permission denied.");
    }
  }, [enabled, onText, supported]);

  return { supported, error, start, stop };
}
