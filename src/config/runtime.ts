/** Build-time / deploy-time configuration (Vite). */
export const runtime = {
  fleetApiUrl: (import.meta.env.VITE_FLEET_API_URL as string | undefined)?.replace(/\/$/, "") ?? "",
  roomId: (import.meta.env.VITE_ROOM_ID as string | undefined) ?? "room-unknown",
  useMedicalAsr: import.meta.env.VITE_USE_MEDICAL_ASR === "1" || import.meta.env.VITE_USE_MEDICAL_ASR === "true",
  contentVersion: (import.meta.env.VITE_CONTENT_VERSION as string | undefined) ?? "1.0.0-mvp",
};
