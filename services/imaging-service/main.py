"""
Cardiac MRI → 3D Mesh Service
Accepts DICOM ZIP uploads, runs segmentation, returns GLB mesh.
Physician-initiated visualization only — NOT for diagnosis.
"""

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pipeline import SegmentationBackend, run_pipeline

UPLOAD_DIR = Path("data/uploads")
MESH_DIR = Path("data/meshes")
for d in (UPLOAD_DIR, MESH_DIR):
    d.mkdir(parents=True, exist_ok=True)

JOB_META_NAME = "job.json"

app = FastAPI(
    title="Cardiac Imaging 3D Service",
    description="Physician-initiated visualization. Not for clinical diagnosis.",
    version="0.1.0",
)

cors_origins = os.environ.get("CORS_ORIGINS", "").strip()
origins = [o.strip() for o in cors_origins.split(",") if o.strip()] if cors_origins else ["*"]

API_KEY = os.environ.get("IMAGING_API_KEY", "").strip() or None
MAX_UPLOAD_BYTES = int(float(os.environ.get("MAX_UPLOAD_MB", "512")) * 1024 * 1024)
MAX_JOBS_IN_MEMORY = int(os.environ.get("MAX_JOBS_IN_MEMORY", "500"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/meshes", StaticFiles(directory=str(MESH_DIR)), name="meshes")

# In-memory jobs; replace with Redis/DB for production
jobs: dict[str, dict] = {}


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "preprocessing", "segmenting", "meshing", "done", "error"]
    backend: str
    progress: int
    mesh_url: str | None
    error: str | None


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _job_path(job_id: str) -> Path:
    return UPLOAD_DIR / job_id / JOB_META_NAME


def _persist_job(job_id: str) -> None:
    path = _job_path(job_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(jobs[job_id], f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _update(job_id: str, **kwargs):
    jobs[job_id].update(kwargs)
    jobs[job_id]["updated_at"] = _now()
    _persist_job(job_id)


def _require_api_key(x_api_key: str | None) -> None:
    if not API_KEY:
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")


def _safe_filename(name: str) -> str:
    base = Path(name).name
    return base.replace("\\", "_").replace("/", "_")


def _write_upload_limited(src, dest_path: Path) -> int:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with open(dest_path, "wb") as out:
        while True:
            chunk = src.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"UPLOAD_TOO_LARGE (max {MAX_UPLOAD_BYTES} bytes)")
            out.write(chunk)
    return written


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/v1/imaging/upload", response_model=JobStatus, status_code=202)
async def upload_dicom(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    backend: SegmentationBackend = SegmentationBackend.TOTALSEG,
    x_api_key: str | None = Header(default=None),
):
    _require_api_key(x_api_key)
    if not (file.filename.endswith(".zip") or file.filename.endswith(".nii.gz")):
        raise HTTPException(400, "BAD_FILE_TYPE (.zip DICOM or .nii.gz expected)")

    job_id = str(uuid.uuid4())
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir()

    safe_name = _safe_filename(file.filename)
    dest = job_dir / safe_name
    size = _write_upload_limited(file.file, dest)

    if len(jobs) >= MAX_JOBS_IN_MEMORY:
        for k in list(jobs.keys())[: max(0, len(jobs) - MAX_JOBS_IN_MEMORY + 1)]:
            jobs.pop(k, None)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "backend": backend.value,
        "progress": 0,
        "mesh_url": None,
        "error": None,
        "created_at": _now(),
        "updated_at": _now(),
        "input_name": safe_name,
        "input_bytes": size,
    }
    _persist_job(job_id)

    background_tasks.add_task(
        run_pipeline,
        job_id=job_id,
        src=dest,
        job_dir=job_dir,
        mesh_dir=MESH_DIR,
        backend=backend,
        update_fn=_update,
    )

    return jobs[job_id]


@app.get("/v1/imaging/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str, x_api_key: str | None = Header(default=None)):
    _require_api_key(x_api_key)
    job = jobs.get(job_id)
    if not job:
        p = _job_path(job_id)
        if p.exists():
            try:
                job = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                job = None
    if not job:
        raise HTTPException(404, "JOB_NOT_FOUND")
    return job


@app.get("/v1/imaging/jobs/{job_id}/mesh")
async def download_mesh(job_id: str, x_api_key: str | None = Header(default=None)):
    _require_api_key(x_api_key)
    job = jobs.get(job_id)
    if not job:
        p = _job_path(job_id)
        if p.exists():
            try:
                job = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                job = None
    if not job or job.get("status") != "done":
        raise HTTPException(404, "MESH_NOT_READY")
    path = MESH_DIR / f"{job_id}.glb"
    return FileResponse(path, media_type="model/gltf-binary")


@app.delete("/v1/imaging/jobs/{job_id}", status_code=204)
async def delete_job(job_id: str, x_api_key: str | None = Header(default=None)):
    _require_api_key(x_api_key)
    jobs.pop(job_id, None)
    try:
        shutil.rmtree(UPLOAD_DIR / job_id, ignore_errors=True)
    except Exception:
        pass
    try:
        (MESH_DIR / f"{job_id}.glb").unlink(missing_ok=True)
    except Exception:
        pass
    return JSONResponse(status_code=204, content=None)

