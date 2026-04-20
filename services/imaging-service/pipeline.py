"""
Pipeline: DICOM/NIfTI → segmentation mask → marching-cubes mesh → GLB

Backends:
  - totalseg  : TotalSegmentator
  - nnunet    : nnU-Net v2
  - slicer    : 3D Slicer CLI (fallbacks)
"""

import logging
import os
import shutil
import subprocess
import zipfile
from enum import Enum
from pathlib import Path
from typing import Callable

import nibabel as nib
import numpy as np
import trimesh
from skimage.filters import gaussian
from skimage.measure import marching_cubes

log = logging.getLogger("pipeline")

CARDIAC_LABELS = {
    1: {"name": "Left Ventricle", "color": [0.85, 0.15, 0.15, 0.9]},
    2: {"name": "Right Ventricle", "color": [0.20, 0.45, 0.85, 0.9]},
    3: {"name": "Left Atrium", "color": [0.95, 0.50, 0.10, 0.9]},
    4: {"name": "Right Atrium", "color": [0.15, 0.70, 0.35, 0.9]},
    5: {"name": "Myocardium", "color": [0.80, 0.70, 0.20, 0.6]},
    6: {"name": "Aorta", "color": [0.75, 0.15, 0.55, 0.85]},
    7: {"name": "Pulmonary Artery", "color": [0.30, 0.75, 0.90, 0.85]},
}


class SegmentationBackend(str, Enum):
    TOTALSEG = "totalseg"
    NNUNET = "nnunet"
    SLICER = "slicer"


MAX_ZIP_FILES = int(os.environ.get("MAX_ZIP_FILES", "6000"))
MAX_ZIP_TOTAL_BYTES = int(float(os.environ.get("MAX_ZIP_TOTAL_MB", "2048")) * 1024 * 1024)
MAX_ZIP_MEMBER_BYTES = int(float(os.environ.get("MAX_ZIP_MEMBER_MB", "256")) * 1024 * 1024)


def _safe_extract_zip(z: zipfile.ZipFile, dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    infos = z.infolist()
    if len(infos) > MAX_ZIP_FILES:
        raise RuntimeError(f"ZIP_TOO_MANY_FILES ({len(infos)} > {MAX_ZIP_FILES})")

    total = 0
    dest_root = dest_dir.resolve()
    for info in infos:
        # Block directories and weird absolute paths
        name = info.filename
        if not name or name.endswith("/"):
            continue
        if info.file_size > MAX_ZIP_MEMBER_BYTES:
            raise RuntimeError(f"ZIP_MEMBER_TOO_LARGE ({info.file_size} bytes)")
        total += info.file_size
        if total > MAX_ZIP_TOTAL_BYTES:
            raise RuntimeError(f"ZIP_TOO_LARGE ({total} bytes)")

        out_path = (dest_dir / name).resolve()
        if dest_root not in out_path.parents and out_path != dest_root:
            raise RuntimeError("ZIP_PATH_TRAVERSAL_BLOCKED")

    for info in infos:
        name = info.filename
        if not name or name.endswith("/"):
            continue
        # Extract explicitly to avoid zip-slip.
        out_path = dest_dir / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with z.open(info, "r") as src, open(out_path, "wb") as dst:
            shutil.copyfileobj(src, dst)


def _extract_zip_to_nifti(zip_path: Path, out_dir: Path) -> Path:
    dcm_dir = out_dir / "dicom"
    dcm_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        _safe_extract_zip(z, dcm_dir)

    nii_dir = out_dir / "nifti"
    nii_dir.mkdir(exist_ok=True)
    try:
        subprocess.run(["dcm2niix", "-z", "y", "-o", str(nii_dir), str(dcm_dir)], check=True, capture_output=True)
        nii_files = list(nii_dir.glob("*.nii.gz"))
        if not nii_files:
            raise RuntimeError("dcm2niix produced no output")
        return nii_files[0]
    except (FileNotFoundError, subprocess.CalledProcessError):
        log.warning("dcm2niix not found, trying dicom2nifti")
        import dicom2nifti

        dicom2nifti.convert_directory(str(dcm_dir), str(nii_dir), compression=True)
        nii_files = list(nii_dir.glob("*.nii.gz"))
        if not nii_files:
            raise RuntimeError("dicom2nifti produced no output")
        return nii_files[0]


def _merge_totalseg_labels(seg_dir: Path, out_dir: Path) -> Path:
    label_map = {
        "heart_ventricle_left.nii.gz": 1,
        "heart_ventricle_right.nii.gz": 2,
        "heart_atrium_left.nii.gz": 3,
        "heart_atrium_right.nii.gz": 4,
        "heart_myocardium.nii.gz": 5,
        "aorta.nii.gz": 6,
        "pulmonary_artery.nii.gz": 7,
    }
    combined = None
    affine = None
    for fname, label_id in label_map.items():
        p = seg_dir / fname
        if not p.exists():
            continue
        img = nib.load(str(p))
        data = np.asarray(img.get_fdata(), dtype=np.uint8)
        if combined is None:
            combined = np.zeros_like(data, dtype=np.uint8)
            affine = img.affine
        combined[data > 0] = label_id
    if combined is None:
        raise RuntimeError("TotalSegmentator produced no cardiac labels")
    out = out_dir / "combined_labels.nii.gz"
    nib.save(nib.Nifti1Image(combined, affine), str(out))
    return out


def _run_totalsegmentator(nii_in: Path, out_dir: Path) -> Path:
    seg_dir = out_dir / "seg_totalseg"
    seg_dir.mkdir(exist_ok=True)
    subprocess.run(
        [
            "TotalSegmentator",
            "-i",
            str(nii_in),
            "-o",
            str(seg_dir),
            "--task",
            "heartchambers_highres",
            "--ml",
            "--fast",
        ],
        check=True,
    )
    return _merge_totalseg_labels(seg_dir, out_dir)


def _run_nnunet(nii_in: Path, out_dir: Path) -> Path:
    seg_dir = out_dir / "seg_nnunet"
    seg_dir.mkdir(exist_ok=True)
    case_in = seg_dir / "cardiac_0000.nii.gz"
    shutil.copy(nii_in, case_in)

    results_dir = os.environ.get("nnUNet_results", "")
    if not results_dir or not Path(results_dir).exists():
        log.warning("nnUNet_results missing — falling back to TotalSegmentator")
        return _run_totalsegmentator(nii_in, out_dir)

    subprocess.run(
        ["nnUNetv2_predict", "-i", str(seg_dir), "-o", str(seg_dir), "-d", "027", "-c", "3d_fullres"],
        check=True,
    )
    pred = seg_dir / "cardiac.nii.gz"
    if not pred.exists():
        raise RuntimeError("nnU-Net produced no output")
    return pred


def _run_slicer(nii_in: Path, out_dir: Path) -> Path:
    slicer_exe = os.environ.get("SLICER_PATH", "")
    if not slicer_exe or not Path(slicer_exe).exists():
        log.warning("SLICER_PATH not set — falling back to TotalSegmentator")
        return _run_totalsegmentator(nii_in, out_dir)
    raise RuntimeError("Slicer backend not implemented in container; use totalseg/nnunet.")


def _labels_to_glb(label_nii: Path, out_glb: Path) -> None:
    img = nib.load(str(label_nii))
    data = np.asarray(img.get_fdata(), dtype=np.uint8)
    voxsz = img.header.get_zooms()[:3]

    scene = trimesh.Scene()
    for label_id, meta in CARDIAC_LABELS.items():
        mask = (data == label_id).astype(np.float32)
        if mask.sum() < 100:
            continue
        mask = gaussian(mask, sigma=0.8)
        verts, faces, _, _ = marching_cubes(mask, level=0.5, spacing=voxsz)
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
        if len(mesh.faces) > 50_000:
            mesh = mesh.simplify_quadric_decimation(50_000)
        r, g, b, a = meta["color"]
        mesh.visual = trimesh.visual.ColorVisuals(
            mesh=mesh,
            vertex_colors=np.tile([int(r * 255), int(g * 255), int(b * 255), int(a * 255)], (len(mesh.vertices), 1)),
        )
        scene.add_geometry(mesh, node_name=meta["name"])
    if not scene.geometry:
        raise RuntimeError("No mesh geometry extracted")
    out_glb.parent.mkdir(parents=True, exist_ok=True)
    scene.export(str(out_glb))


BACKEND_FN = {
    SegmentationBackend.TOTALSEG: _run_totalsegmentator,
    SegmentationBackend.NNUNET: _run_nnunet,
    SegmentationBackend.SLICER: _run_slicer,
}


def run_pipeline(job_id: str, src: Path, job_dir: Path, mesh_dir: Path, backend: SegmentationBackend, update_fn: Callable) -> None:
    try:
        update_fn(job_id, status="preprocessing", progress=10)
        if src.suffix == ".zip":
            nii_path = _extract_zip_to_nifti(src, job_dir)
        else:
            nii_path = src

        update_fn(job_id, status="segmenting", progress=30)
        label_nii = BACKEND_FN[backend](nii_path, job_dir)

        update_fn(job_id, status="meshing", progress=75)
        out_glb = mesh_dir / f"{job_id}.glb"
        _labels_to_glb(label_nii, out_glb)

        update_fn(job_id, status="done", progress=100, mesh_url=f"/meshes/{job_id}.glb")
    except Exception as exc:
        log.exception("Pipeline failed")
        update_fn(job_id, status="error", error=str(exc))

