import { buildMinimalDemoGlb } from "./buildMinimalDemoGlb";

let cached: string | undefined;

/** Stable data URL for a minimal GLB (offline; no `public/` asset required). */
export function getDemoEncounterMeshUrl(): string {
  if (cached) return cached;
  const bytes = buildMinimalDemoGlb();
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  cached = `data:model/gltf-binary;base64,${btoa(binary)}`;
  return cached;
}
