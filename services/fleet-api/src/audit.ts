import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type AuditEvent = {
  ts: string;
  type: "device_register" | "heartbeat" | "asr_request" | "asr_result" | "policy_fetch";
  deviceId: string;
  roomId?: string;
  /** Never log PHI — metadata only */
  meta?: Record<string, string | number | boolean | undefined>;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function appendAudit(ev: AuditEvent) {
  const dir = path.join(config.dataDir, "audit");
  ensureDir(dir);
  const line = JSON.stringify(ev) + "\n";
  const day = ev.ts.slice(0, 10);
  fs.appendFileSync(path.join(dir, `audit-${day}.jsonl`), line, "utf8");
}
