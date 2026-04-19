"""
Cardiac MRI → 3D Mesh Service
Accepts DICOM ZIP uploads, runs segmentation, returns GLB mesh.
Physician-initiated visualization only — NOT for diagnosis.
"""

import shutil
import uuid
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pipeline import SegmentationBackend, run_pipeline

UPLOAD_DIR = Path("data/uploads")
MESH_DIR = Path("data/meshes")
for d in (UPLOAD_DIR, MESH_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Cardiac Imaging 3D Service",
    description="Physician-initiated visualization. Not for clinical diagnosis.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
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


def _update(job_id: str, **kwargs):
    jobs[job_id].update(kwargs)


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/v1/imaging/upload", response_model=JobStatus, status_code=202)
async def upload_dicom(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    backend: SegmentationBackend = SegmentationBackend.TOTALSEG,
):
    if not (file.filename.endswith(".zip") or file.filename.endswith(".nii.gz")):
        raise HTTPException(400, "Upload a .zip of DICOM slices or a .nii.gz file.")

    job_id = str(uuid.uuid4())
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir()

    dest = job_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "backend": backend.value,
        "progress": 0,
        "mesh_url": None,
        "error": None,
    }

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
async def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


@app.get("/v1/imaging/jobs/{job_id}/mesh")
async def download_mesh(job_id: str):
    job = jobs.get(job_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "Mesh not ready")
    path = MESH_DIR / f"{job_id}.glb"
    return FileResponse(path, media_type="model/gltf-binary")

