import { runtime } from "../config/runtime";

const DEVICE_KEY = "cviz_device_id";

export function getDeviceId(): string | null {
  try {
    return sessionStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

export function setDeviceId(id: string) {
  try {
    sessionStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* kiosk may block */
  }
}

export async function registerDeviceIfNeeded(): Promise<string | null> {
  const base = runtime.fleetApiUrl;
  if (!base) return null;
  const existing = getDeviceId();
  if (existing) return existing;
  const res = await fetch(`${base}/v1/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: runtime.roomId }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { deviceId?: string };
  if (j.deviceId) setDeviceId(j.deviceId);
  return j.deviceId ?? null;
}

export async function sendHeartbeat(meta: { gpuOk?: boolean; micOk?: boolean; renderBenchMs?: number }) {
  const id = getDeviceId();
  const base = runtime.fleetApiUrl;
  if (!base || !id) return;
  await fetch(`${base}/v1/devices/${id}/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentVersion: runtime.contentVersion,
      ...meta,
    }),
  }).catch(() => {});
}

export async function transcribeAudioBlob(blob: Blob, deviceId: string): Promise<string> {
  const base = runtime.fleetApiUrl;
  if (!base) throw new Error("NO_FLEET_URL");
  const fd = new FormData();
  fd.append("audio", blob, "clip.webm");
  fd.append("deviceId", deviceId);
  const res = await fetch(`${base}/v1/asr/transcribe`, { method: "POST", body: fd });
  if (res.status === 503) throw new Error("ASR_NOT_CONFIGURED");
  if (!res.ok) throw new Error(`ASR_HTTP_${res.status}`);
  const j = (await res.json()) as { text?: string };
  return j.text ?? "";
}

export async function postLatencyAudit(payload: { parseMs?: number; frameMs?: number; commandHash?: string }) {
  const id = getDeviceId();
  const base = runtime.fleetApiUrl;
  if (!base || !id) return;
  await fetch(`${base}/v1/audit/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: id, type: "latency", ...payload }),
  }).catch(() => {});
}
