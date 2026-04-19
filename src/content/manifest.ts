export type MeshEntry = {
  id: string;
  lod: "LOD0" | "LOD1" | "LOD2" | "LOD3";
  uri: string;
  sha256: string;
};

export type ContentManifest = {
  contentVersion: string;
  signedAt: string;
  meshes: MeshEntry[];
  review: { clinicalReviewer: string; reviewDate: string; limitations?: string };
};

export async function loadManifest(url = "/content/manifest.free-commercial.json"): Promise<ContentManifest | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as ContentManifest;
  } catch {
    return null;
  }
}

