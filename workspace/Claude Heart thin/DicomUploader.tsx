/**
 * DicomUploader.tsx
 * Upload a DICOM ZIP → poll job status → render 3D mesh viewer
 *
 * Usage in your app:
 *   import DicomUploader from "@/components/DicomUploader";
 *   <DicomUploader apiBase="http://localhost:8000" />
 */

import React, { useCallback, useRef, useState } from "react";
import MeshViewer3D from "./MeshViewer3D";

type Backend = "totalseg" | "nnunet" | "slicer";

type JobStatus = {
  job_id:    string;
  status:    "queued" | "preprocessing" | "segmenting" | "meshing" | "done" | "error";
  backend:   string;
  progress:  number;
  mesh_url:  string | null;
  error:     string | null;
};

const STATUS_LABELS: Record<JobStatus["status"], string> = {
  queued:        "Queued…",
  preprocessing: "Converting DICOM → NIfTI…",
  segmenting:    "Running segmentation — this takes a few minutes…",
  meshing:       "Building 3D mesh…",
  done:          "Done ✓",
  error:         "Failed",
};

const BACKEND_INFO: Record<Backend, { label: string; note: string }> = {
  totalseg: { label: "TotalSegmentator", note: "Recommended · auto-downloads weights · GPU optional" },
  nnunet:   { label: "nnU-Net",          note: "More accurate · requires weight download + nnUNet_results env var" },
  slicer:   { label: "3D Slicer CLI",    note: "SlicerHeart extension · requires local Slicer install + SLICER_PATH" },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function DicomUploader({ apiBase = "http://localhost:8000" }: { apiBase?: string }) {
  const inputRef              = useRef<HTMLInputElement>(null);
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const [backend,   setBackend]   = useState<Backend>("totalseg");
  const [dragging,  setDragging]  = useState(false);
  const [job,       setJob]       = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName,  setFileName]  = useState<string | null>(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); };

  const pollJob = useCallback((jobId: string) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${apiBase}/v1/imaging/jobs/${jobId}`);
        const data: JobStatus = await res.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") stopPoll();
      } catch {
        // network hiccup — keep polling
      }
    }, 2000);
  }, [apiBase]);

  const upload = useCallback(async (file: File) => {
    setFileName(file.name);
    setUploading(true);
    setJob(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${apiBase}/v1/imaging/upload?backend=${backend}`, {
        method: "POST",
        body:   form,
      });
      if (!res.ok) throw new Error(await res.text());
      const data: JobStatus = await res.json();
      setJob(data);
      pollJob(data.job_id);
    } catch (err: any) {
      setJob({
        job_id: "", status: "error", backend,
        progress: 0, mesh_url: null, error: err.message,
      });
    } finally {
      setUploading(false);
    }
  }, [apiBase, backend, pollJob]);

  // drag-and-drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  const meshUrl = job?.mesh_url ? `${apiBase}${job.mesh_url}` : null;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      display: "flex", flexDirection: "column", gap: 20,
      padding: 24, color: "#ccd0dd",
    }}>

      {/* ── backend selector ─────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, color: "#6668aa", letterSpacing: 1.2, marginBottom: 8 }}>
          SEGMENTATION BACKEND
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(Object.entries(BACKEND_INFO) as [Backend, { label: string; note: string }][]).map(([key, { label, note }]) => (
            <button
              key={key}
              onClick={() => setBackend(key)}
              disabled={uploading || (job?.status === "segmenting")}
              style={{
                padding: "8px 16px", borderRadius: 7, cursor: "pointer",
                fontSize: 12, letterSpacing: 0.5,
                border: backend === key ? "1px solid #5285e0" : "1px solid #2a2d3a",
                background: backend === key ? "rgba(82,133,224,0.15)" : "rgba(255,255,255,0.03)",
                color: backend === key ? "#7aabff" : "#888",
                transition: "all 0.15s",
              }}
              title={note}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#4a4d60", marginTop: 6 }}>
          {BACKEND_INFO[backend].note}
        </div>
      </div>

      {/* ── drop zone ────────────────────────────────────────────────── */}
      {!meshUrl && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? "#5285e0" : "#2a2d3a"}`,
            borderRadius: 12, padding: "48px 24px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
            cursor: "pointer", transition: "border-color 0.2s",
            background: dragging ? "rgba(82,133,224,0.07)" : "rgba(255,255,255,0.02)",
          }}
        >
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none"
            stroke={dragging ? "#5285e0" : "#444"} strokeWidth="1.5">
            <path d="M12 2v13M8 7l4-5 4 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: 14, color: "#8888aa", textAlign: "center" }}>
            Drop a <strong style={{ color: "#ccd0dd" }}>DICOM .zip</strong> or <strong style={{ color: "#ccd0dd" }}>.nii.gz</strong> here
          </div>
          <div style={{ fontSize: 11, color: "#4a4d60" }}>
            or click to browse
          </div>
          <input ref={inputRef} type="file" accept=".zip,.nii.gz" style={{ display: "none" }} onChange={onFileChange} />
        </div>
      )}

      {/* ── job progress ─────────────────────────────────────────────── */}
      {job && (
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid #2a2d3a",
          borderRadius: 10, padding: "14px 18px", display: "flex",
          flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#8888aa" }}>
              {fileName} · {BACKEND_INFO[backend as Backend]?.label ?? job.backend}
            </span>
            <span style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 4,
              background: job.status === "error" ? "rgba(220,60,60,0.2)" :
                          job.status === "done"  ? "rgba(40,200,100,0.2)" :
                                                   "rgba(82,133,224,0.15)",
              color:      job.status === "error" ? "#e05252" :
                          job.status === "done"  ? "#4dd47e" : "#7aabff",
            }}>
              {STATUS_LABELS[job.status]}
            </span>
          </div>

          {/* progress bar */}
          <div style={{ height: 4, background: "#1e2030", borderRadius: 2 }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${job.progress}%`,
              background: job.status === "error" ? "#e05252" :
                          job.status === "done"  ? "#4dd47e" : "#5285e0",
              transition: "width 0.5s ease",
            }} />
          </div>

          {job.error && (
            <div style={{
              fontSize: 12, color: "#e05252",
              background: "rgba(220,60,60,0.08)", borderRadius: 6,
              padding: "8px 12px",
            }}>
              {job.error}
            </div>
          )}

          {job.status === "done" && !meshUrl && (
            <a href={`${apiBase}/v1/imaging/jobs/${job.job_id}/mesh`}
              style={{ fontSize: 12, color: "#7aabff" }}>
              ↓ Download GLB mesh
            </a>
          )}
        </div>
      )}

      {/* ── 3D viewer ────────────────────────────────────────────────── */}
      {meshUrl && (
        <>
          <div style={{ height: 560, borderRadius: 12, overflow: "hidden" }}>
            <MeshViewer3D meshUrl={meshUrl} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => { setJob(null); setFileName(null); stopPoll(); }}
              style={{
                padding: "8px 16px", borderRadius: 7, fontSize: 12,
                border: "1px solid #2a2d3a", background: "transparent",
                color: "#8888aa", cursor: "pointer",
              }}
            >
              ← Upload another
            </button>
            <a
              href={`${apiBase}/v1/imaging/jobs/${job?.job_id}/mesh`}
              style={{
                padding: "8px 16px", borderRadius: 7, fontSize: 12,
                border: "1px solid #2a2d3a", background: "transparent",
                color: "#7aabff", cursor: "pointer", textDecoration: "none",
              }}
            >
              ↓ Download GLB
            </a>
          </div>
        </>
      )}
    </div>
  );
}
