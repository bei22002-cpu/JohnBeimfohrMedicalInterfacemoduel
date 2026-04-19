import { useCallback, useRef, useState } from "react";
import { MeshViewer3D } from "./MeshViewer3D";

type Backend = "totalseg" | "nnunet" | "slicer";

type JobStatus = {
  job_id: string;
  status: "queued" | "preprocessing" | "segmenting" | "meshing" | "done" | "error";
  backend: string;
  progress: number;
  mesh_url: string | null;
  error: string | null;
};

const STATUS_LABELS: Record<JobStatus["status"], string> = {
  queued: "Queued…",
  preprocessing: "Converting DICOM → NIfTI…",
  segmenting: "Running segmentation — this takes a few minutes…",
  meshing: "Building 3D mesh…",
  done: "Done ✓",
  error: "Failed",
};

const BACKEND_INFO: Record<Backend, { label: string; note: string }> = {
  totalseg: { label: "TotalSegmentator", note: "Recommended · auto-downloads weights · GPU optional" },
  nnunet: { label: "nnU-Net", note: "More accurate · requires weight download + nnUNet_results env var" },
  slicer: { label: "3D Slicer CLI", note: "Not supported in container by default (fallbacks to totalseg)" },
};

export function DicomUploader({
  apiBase = "/imaging",
  onDone,
}: {
  apiBase?: string;
  onDone?: (meshUrl: string, jobId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [backend, setBackend] = useState<Backend>("totalseg");
  const [dragging, setDragging] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const pollJob = useCallback(
    (jobId: string) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${apiBase}/v1/imaging/jobs/${jobId}`);
          const data: JobStatus = await res.json();
          setJob(data);
          if (data.status === "done" && data.mesh_url) {
            onDone?.(`${apiBase}${data.mesh_url}`, jobId);
          }
          if (data.status === "done" || data.status === "error") stopPoll();
        } catch {
          /* keep polling */
        }
      }, 2000);
    },
    [apiBase, onDone],
  );

  const upload = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setUploading(true);
      setJob(null);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`${apiBase}/v1/imaging/upload?backend=${backend}`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(await res.text());
        const data: JobStatus = await res.json();
        setJob(data);
        pollJob(data.job_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setJob({
          job_id: "",
          status: "error",
          backend,
          progress: 0,
          mesh_url: null,
          error: msg,
        });
      } finally {
        setUploading(false);
      }
    },
    [apiBase, backend, pollJob],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void upload(file);
    },
    [upload],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void upload(file);
  };

  const meshUrl = job?.mesh_url ? `${apiBase}${job.mesh_url}` : null;
  const wizardStep: 1 | 2 | 3 = meshUrl ? 3 : job ? 2 : 1;

  return (
    <div className="imaging">
      <ol className="imaging-wizard" aria-label="Encounter mesh workflow">
        {(
          [
            { step: 1 as const, label: "Configure & upload" },
            { step: 2 as const, label: "Process" },
            { step: 3 as const, label: "Review mesh" },
          ] as const
        ).map(({ step, label }) => (
          <li
            key={step}
            className={`imaging-wizard-step ${wizardStep === step ? "current" : ""} ${wizardStep > step ? "done" : ""}`}
            aria-current={wizardStep === step ? "step" : undefined}
          >
            <span className="imaging-wizard-n" aria-hidden>
              {step}
            </span>
            <span className="imaging-wizard-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="imaging-top">
        <div className="imaging-title">Physician-initiated 3D reconstruction (not for diagnosis)</div>
        <div className="imaging-sub">Upload a DICOM zip or a .nii.gz volume. Output is an illustrative GLB mesh.</div>
      </div>

      <div className="imaging-backends">
        {(Object.entries(BACKEND_INFO) as [Backend, { label: string; note: string }][]).map(([key, { label, note }]) => (
          <button
            key={key}
            onClick={() => setBackend(key)}
            disabled={uploading || job?.status === "segmenting"}
            className={`btn ${backend === key ? "active" : ""}`}
            title={note}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {!meshUrl && (
        <div
          className={`drop ${dragging ? "drop-on" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="drop-title">Drop a DICOM .zip or .nii.gz</div>
          <div className="drop-sub">or click to browse</div>
          <input ref={inputRef} type="file" accept=".zip,.nii.gz" style={{ display: "none" }} onChange={onFileChange} />
        </div>
      )}

      {job && (
        <div className="job">
          <div className="job-head">
            <div className="job-meta">{fileName ?? "Upload"} · {BACKEND_INFO[backend]?.label ?? job.backend}</div>
            <div className={`pill ${job.status}`}>{STATUS_LABELS[job.status]}</div>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${job.progress}%` }} />
          </div>
          {job.error && <div className="err">{job.error}</div>}
        </div>
      )}

      {meshUrl && (
        <div className="viewer">
          <MeshViewer3D meshUrl={meshUrl} />
          <div className="viewer-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setJob(null);
                setFileName(null);
                stopPoll();
              }}
            >
              ← Upload another
            </button>
            <a className="btn" href={`${apiBase}/v1/imaging/jobs/${job?.job_id}/mesh`}>
              ↓ Download GLB
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

