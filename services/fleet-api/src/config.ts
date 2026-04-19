export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  /** Comma-separated origins; empty = reflect request origin (dev only). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  azureSpeechKey: process.env.AZURE_SPEECH_KEY ?? "",
  azureSpeechRegion: process.env.AZURE_SPEECH_REGION ?? "",
  contentVersion: process.env.CONTENT_VERSION ?? "1.0.0-mvp",
  /** When true, do not log request bodies or transcripts to stdout. */
  hipaaMinimalLogging: process.env.HIPAA_MINIMAL_LOGGING === "1",
  dataDir: process.env.DATA_DIR ?? "./data",
};
