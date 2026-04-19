import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { config } from "../config.js";

function ffmpegToWav(inputPath: string, outWav: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-i", inputPath, "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", outWav], {
      stdio: "ignore",
    });
    p.on("error", (err) => reject(err));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

/**
 * One-shot recognition from disk file (WAV preferred). WebM/Opus transcoded via ffmpeg if available.
 */
export async function transcribeFileToText(filePath: string, mime: string): Promise<string> {
  if (!config.azureSpeechKey || !config.azureSpeechRegion) {
    throw new Error("ASR_NOT_CONFIGURED");
  }

  let wavPath = filePath;
  let tempWav: string | null = null;
  if (mime.includes("webm") || mime.includes("ogg")) {
    tempWav = path.join(os.tmpdir(), `cviz-${Date.now()}.wav`);
    await ffmpegToWav(filePath, tempWav);
    wavPath = tempWav;
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(config.azureSpeechKey, config.azureSpeechRegion);
  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000");
  speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1200");

  const audioConfig = sdk.AudioConfig.fromWavFileInput(wavPath);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  try {
    const text = await new Promise<string>((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => {
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            resolve(result.text ?? "");
            return;
          }
          if (result.reason === sdk.ResultReason.NoMatch) {
            resolve("");
            return;
          }
          const ce = sdk.CancellationDetails.fromResult(result);
          reject(new Error(`ASR: ${ce.reason} ${ce.errorDetails}`));
        },
        (err) => reject(err),
      );
    });
    return text;
  } finally {
    recognizer.close();
    if (tempWav) {
      try {
        fs.unlinkSync(tempWav);
      } catch {
        /* ignore */
      }
    }
  }
}
