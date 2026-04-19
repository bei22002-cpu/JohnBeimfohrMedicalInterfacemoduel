import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { appendAudit, type AuditEvent } from "./audit.js";
import { transcribeFileToText } from "./asr/azureSpeech.js";

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 12 * 1024 * 1024 } });

type DeviceRecord = {
  id: string;
  roomId: string;
  registeredAt: string;
  lastHeartbeat?: string;
  contentVersionAck?: string;
};

const devices = new Map<string, DeviceRecord>();

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "256kb" }));

const corsMw =
  config.corsOrigins.length > 0
    ? cors({ origin: config.corsOrigins, credentials: true })
    : cors({ origin: true, credentials: true });
app.use(corsMw);

const limiter = rateLimit({ windowMs: 60_000, max: 300 });
app.use(limiter);

function log(...args: unknown[]) {
  if (config.hipaaMinimalLogging) return;
  console.log(...args);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, contentVersion: config.contentVersion });
});

app.post("/v1/devices/register", (req, res) => {
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : "unknown-room";
  const id = uuidv4();
  const rec: DeviceRecord = { id, roomId, registeredAt: new Date().toISOString() };
  devices.set(id, rec);
  const ev: AuditEvent = { ts: rec.registeredAt, type: "device_register", deviceId: id, roomId, meta: { contentVersion: config.contentVersion } };
  appendAudit(ev);
  log("device registered", id, roomId);
  res.json({ deviceId: id, contentVersion: config.contentVersion });
});

app.post("/v1/devices/:id/heartbeat", (req, res) => {
  const id = req.params.id;
  const d = devices.get(id);
  if (!d) return res.status(404).json({ error: "UNKNOWN_DEVICE" });
  d.lastHeartbeat = new Date().toISOString();
  d.contentVersionAck = typeof req.body?.contentVersion === "string" ? req.body.contentVersion : undefined;
  appendAudit({
    ts: d.lastHeartbeat,
    type: "heartbeat",
    deviceId: id,
    roomId: d.roomId,
    meta: {
      gpuOk: req.body?.gpuOk === true,
      micOk: req.body?.micOk === true,
      renderMs: typeof req.body?.renderBenchMs === "number" ? req.body.renderBenchMs : undefined,
    },
  });
  res.json({ ok: true, serverContentVersion: config.contentVersion });
});

app.get("/v1/policy/content-version", (_req, res) => {
  appendAudit({ ts: new Date().toISOString(), type: "policy_fetch", deviceId: "anonymous" });
  res.json({ contentVersion: config.contentVersion, minClient: "0.1.0" });
});

app.post("/v1/audit/events", (req, res) => {
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : "unknown";
  appendAudit({
    ts: new Date().toISOString(),
    type: "asr_request",
    deviceId,
    meta: {
      parseMs: typeof req.body?.parseMs === "number" ? req.body.parseMs : undefined,
      frameMs: typeof req.body?.frameMs === "number" ? req.body.frameMs : undefined,
      commandHash: typeof req.body?.commandHash === "string" ? req.body.commandHash : undefined,
      eventType: typeof req.body?.type === "string" ? req.body.type : "latency",
    },
  });
  res.json({ ok: true });
});

app.post("/v1/asr/transcribe", upload.single("audio"), async (req, res) => {
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : "unknown";
  const file = req.file;
  if (!file) return res.status(400).json({ error: "MISSING_AUDIO" });

  appendAudit({ ts: new Date().toISOString(), type: "asr_request", deviceId, meta: { bytes: file.size, mime: file.mimetype } });

  try {
    const text = await transcribeFileToText(file.path, file.mimetype);
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
    if (!config.hipaaMinimalLogging) {
      appendAudit({ ts: new Date().toISOString(), type: "asr_result", deviceId, meta: { charCount: text.length } });
    }
    res.json({ text });
  } catch (e) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASR_NOT_CONFIGURED") {
      return res.status(503).json({ error: "ASR_NOT_CONFIGURED" });
    }
    console.error("asr error", msg);
    res.status(500).json({ error: "ASR_FAILED" });
  }
});

app.listen(config.port, () => {
  console.log(`fleet-api listening on :${config.port} contentVersion=${config.contentVersion}`);
});
