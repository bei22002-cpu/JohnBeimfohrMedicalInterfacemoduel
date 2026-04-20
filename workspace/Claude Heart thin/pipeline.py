"""
Pipeline: DICOM/NIfTI → segmentation mask → marching-cubes mesh → GLB

Three swappable backends:
  - totalseg  : TotalSegmentator  (pip install totalsegmentator)
  - nnunet    : nnU-Net Task027   (requires model weights download)
  - slicer    : 3D Slicer CLI     (requires Slicer install + SlicerHeart)

Each backend produces a NIfTI label map.  The mesh step is shared.
"""

import os, shutil, subprocess, zipfile, logging
from enum import Enum
from pathlib import Path
from typing import Callable

import numpy as np
import nibabel as nib
import trimesh
from skimage.measure import marching_cubes
from skimage.filters import gaussian

log = logging.getLogger("pipeline")

# ── label definitions (cardiac MRI targets) ──────────────────────────────────
CARDIAC_LABELS = {
    1: {"name": "Left Ventricle",   "color": [0.85, 0.15, 0.15, 0.9]},
    2: {"name": "Right Ventricle",  "color": [0.20, 0.45, 0.85, 0.9]},
    3: {"name": "Left Atrium",      "color": [0.95, 0.50, 0.10, 0.9]},
    4: {"name": "Right Atrium",     "color": [0.15, 0.70, 0.35, 0.9]},
    5: {"name": "Myocardium",       "color": [0.80, 0.70, 0.20, 0.6]},
    6: {"name": "Aorta",            "color": [0.75, 0.15, 0.55, 0.85]},
    7: {"name": "Pulmonary Artery", "color": [0.30, 0.75, 0.90, 0.85]},
}


class SegmentationBackend(str, Enum):
    TOTALSEG = "totalseg"
    NNUNET   = "nnunet"
    SLICER   = "slicer"


# ── helpers ───────────────────────────────────────────────────────────────────

def _extract_zip_to_nifti(zip_path: Path, out_dir: Path) -> Path:
    """Unzip DICOM folder and convert to NIfTI with dcm2niix."""
    dcm_dir = out_dir / "dicom"
    dcm_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(dcm_dir)

    nii_dir = out_dir / "nifti"
    nii_dir.mkdir(exist_ok=True)
    # dcm2niix is the gold standard; fallback to dicom2nifti (pure python)
    try:
        subprocess.run(
            ["dcm2niix", "-z", "y", "-o", str(nii_dir), str(dcm_dir)],
            check=True, capture_output=True,
        )
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


def _run_totalsegmentator(nii_in: Path, out_dir: Path) -> Path:
    """
    TotalSegmentator cardiac task.
    pip install totalsegmentator
    First run downloads weights (~1 GB) automatically.
    """
    seg_dir = out_dir / "seg_totalseg"
    seg_dir.mkdir(exist_ok=True)
    subprocess.run(
        [
            "TotalSegmentator",
            "-i", str(nii_in),
            "-o", str(seg_dir),
            "--task", "heartchambers_highres",   # cardiac-specific task
            "--ml",                               # multi-label output
            "--fast",                             # lower GPU mem
        ],
        check=True,
    )
    # TotalSegmentator writes individual label NIfTIs; merge them
    return _merge_totalseg_labels(seg_dir, out_dir)


def _merge_totalseg_labels(seg_dir: Path, out_dir: Path) -> Path:
    """Merge individual TotalSegmentator outputs into a single label map."""
    label_map = {
        "heart_ventricle_left.nii.gz":   1,
        "heart_ventricle_right.nii.gz":  2,
        "heart_atrium_left.nii.gz":      3,
        "heart_atrium_right.nii.gz":     4,
        "heart_myocardium.nii.gz":       5,
        "aorta.nii.gz":                  6,
        "pulmonary_artery.nii.gz":       7,
    }
    combined = None
    affine   = None
    for fname, label_id in label_map.items():
        path = seg_dir / fname
        if not path.exists():
            continue
        img  = nib.load(str(path))
        data = np.asarray(img.get_fdata(), dtype=np.uint8)
        if combined is None:
            combined = np.zeros_like(data, dtype=np.uint8)
            affine   = img.affine
        combined[data > 0] = label_id

    if combined is None:
        raise RuntimeError("TotalSegmentator produced no cardiac labels")

    out = out_dir / "combined_labels.nii.gz"
    nib.save(nib.Nifti1Image(combined, affine), str(out))
    return out


def _run_nnunet(nii_in: Path, out_dir: Path) -> Path:
    """
    nnU-Net cardiac segmentation.
    Requires:  pip install nnunetv2
    Weights:   nnUNetv2_download_pretrained_model_by_url  (Task027_ACDC)
    Set env:   nnUNet_results=/path/to/weights

    Falls back to TotalSegmentator if weights are missing.
    """
    seg_dir = out_dir / "seg_nnunet"
    seg_dir.mkdir(exist_ok=True)

    # nnU-Net expects CaseName_0000.nii.gz
    case_in = seg_dir / "cardiac_0000.nii.gz"
    shutil.copy(nii_in, case_in)

    results_dir = os.environ.get("nnUNet_results", "")
    if not results_dir or not Path(results_dir).exists():
        log.warning("nnUNet_results not set or missing — falling back to TotalSegmentator")
        return _run_totalsegmentator(nii_in, out_dir)

    subprocess.run(
        [
            "nnUNetv2_predict",
            "-i",  str(seg_dir),
            "-o",  str(seg_dir),
            "-d",  "027",           # ACDC cardiac dataset
            "-c",  "3d_fullres",
            "--save_probabilities",
        ],
        check=True,
    )
    pred = seg_dir / "cardiac.nii.gz"
    if not pred.exists():
        raise RuntimeError("nnU-Net produced no output")
    return pred


def _run_slicer(nii_in: Path, out_dir: Path) -> Path:
    """
    3D Slicer CLI via SlicerHeart extension.
    Requires Slicer installed and SLICER_PATH env var set.
    Falls back to TotalSegmentator if Slicer is unavailable.
    """
    slicer_exe = os.environ.get("SLICER_PATH", "")
    if not slicer_exe or not Path(slicer_exe).exists():
        log.warning("SLICER_PATH not set — falling back to TotalSegmentator")
        return _run_totalsegmentator(nii_in, out_dir)

    seg_out = out_dir / "seg_slicer" / "segmentation.nii.gz"
    seg_out.parent.mkdir(exist_ok=True)

    # Minimal Slicer Python script for cardiac segmentation
    script = f"""
import slicer, sys
vol = slicer.util.loadVolume('{nii_in}')
seg = slicer.mrmlScene.AddNewNodeByClass('vtkMRMLSegmentationNode')
logic = slicer.modules.heartvalvesegmentation.widgetRepresentation().self().logic
logic.run(vol, seg)
slicer.util.exportNode(seg, '{seg_out}')
sys.exit(0)
"""
    script_file = out_dir / "slicer_script.py"
    script_file.write_text(script)

    subprocess.run(
        [slicer_exe, "--no-main-window", "--python-script", str(script_file)],
        check=True, timeout=600,
    )
    if not seg_out.exists():
        raise RuntimeError("Slicer produced no segmentation output")
    return seg_out


# ── mesh extraction (shared) ──────────────────────────────────────────────────

def _labels_to_glb(label_nii: Path, out_glb: Path) -> None:
    """
    Per-label marching cubes → individual meshes → one GLB with named nodes.
    """
    img    = nib.load(str(label_nii))
    data   = np.asarray(img.get_fdata(), dtype=np.uint8)
    voxsz  = img.header.get_zooms()[:3]     # mm per voxel

    scene = trimesh.Scene()

    for label_id, meta in CARDIAC_LABELS.items():
        mask = (data == label_id).astype(np.float32)
        if mask.sum() < 100:                # skip absent/tiny structures
            continue

        # smooth slightly before marching cubes to reduce staircase artefacts
        mask = gaussian(mask, sigma=0.8)

        try:
            verts, faces, _, _ = marching_cubes(mask, level=0.5, spacing=voxsz)
        except Exception as e:
            log.warning(f"Marching cubes failed for label {label_id}: {e}")
            continue

        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)

        # decimate to keep file size reasonable (target ~50k faces per structure)
        if len(mesh.faces) > 50_000:
            mesh = mesh.simplify_quadric_decimation(50_000)

        r, g, b, a = meta["color"]
        mesh.visual = trimesh.visual.ColorVisuals(
            mesh=mesh,
            vertex_colors=np.tile([int(r*255), int(g*255), int(b*255), int(a*255)],
                                  (len(mesh.vertices), 1))
        )
        scene.add_geometry(mesh, node_name=meta["name"])

    if not scene.geometry:
        raise RuntimeError("No mesh geometry was extracted — check segmentation output")

    scene.export(str(out_glb))
    log.info(f"GLB written → {out_glb} ({out_glb.stat().st_size // 1024} KB)")


# ── public entry point ────────────────────────────────────────────────────────

BACKEND_FN = {
    SegmentationBackend.TOTALSEG: _run_totalsegmentator,
    SegmentationBackend.NNUNET:   _run_nnunet,
    SegmentationBackend.SLICER:   _run_slicer,
}


def run_pipeline(
    job_id:    str,
    src:       Path,
    job_dir:   Path,
    mesh_dir:  Path,
    backend:   SegmentationBackend,
    update_fn: Callable,
) -> None:
    """
    Full pipeline: upload file → NIfTI → segmentation → GLB mesh.
    update_fn(job_id, **kwargs) patches the in-memory job record.
    """
    try:
        # 1. pre-process
        update_fn(job_id, status="preprocessing", progress=10)
        if src.suffix == ".zip":
            nii_path = _extract_zip_to_nifti(src, job_dir)
        else:
            nii_path = src   # already .nii.gz

        # 2. segmentation
        update_fn(job_id, status="segmenting", progress=30)
        seg_fn    = BACKEND_FN[backend]
        label_nii = seg_fn(nii_path, job_dir)

        # 3. mesh
        update_fn(job_id, status="meshing", progress=75)
        out_glb = mesh_dir / f"{job_id}.glb"
        _labels_to_glb(label_nii, out_glb)

        # 4. done
        update_fn(
            job_id,
            status="done",
            progress=100,
            mesh_url=f"/meshes/{job_id}.glb",
        )

    except Exception as exc:
        log.exception("Pipeline failed")
        update_fn(job_id, status="error", error=str(exc))
