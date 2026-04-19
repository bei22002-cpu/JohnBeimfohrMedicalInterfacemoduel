# MedViz3D MVP (Windows-first)

**MedViz3D** is a local, desktop medical imaging *visualization and reconstruction* tool.

See **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** for limitations, mitigations, and what is (and is not) cancellable.

- **CT/MRI (volumetric)**: loads DICOM series or NIfTI volumes, supports classical segmentation and surface mesh extraction.
- **X-ray (2D)**: supports *estimated/illustrative* pseudo‑3D visualization only. Single-view X-rays do **not** support true patient-specific 3D reconstruction.

## Safety / positioning disclaimer (non-diagnostic)

This software is for **visualization, education, and research workflows**. It is **not** a diagnostic device, does not provide clinical interpretation, and should not be used as the sole basis for medical decisions.

Outputs are labeled as:
- **Volumetric reconstruction** (from CT/MRI 3D volumes), or
- **Estimated / illustrative** (from 2D X-ray images).

## Features (MVP)

- Load:
  - DICOM folder (auto-detect series; choose series if multiple)
  - NIfTI (`.nii` / `.nii.gz`)
  - X-ray image (`.png/.jpg/.jpeg/.tif/.tiff/.bmp`)
- Inspect:
  - metadata (as available)
  - axial/coronal/sagittal slice viewers
- Segment (classical):
  - thresholding
  - connected-component cleanup (largest component option)
  - morphology (open/close + hole filling)
- Reconstruct:
  - marching cubes surface extraction
  - smoothing + decimation controls
- Visualize:
  - embedded interactive 3D viewport (pan/zoom/rotate)
  - multi-structure meshes with per-label visibility toggles
- Geometry QA:
  - spacing anisotropy / ordering heuristics with warnings surfaced in Metadata JSON
- Resampling:
  - optional isotropic resampling (SimpleITK linear)
- Semi-automatic segmentation:
  - slice-click seeds + intensity-bounded 26-connected region growing
  - two-band exclusive multi-label mask + extract-all-label meshes
- Progress UX:
  - modal progress dialog for longer jobs (resample / marching cubes / multi-label extraction / region grow)
- Optional AI hook:
  - `MEDVIZ3D_ENABLE_AI=1` + MONAI/PyTorch install path (no bundled weights yet)
- Export:
  - STL / OBJ / PLY / VTK / VTU
  - glTF (`.glb` / `.gltf`) via `trimesh` (included in `requirements.txt`)
  - segmentation mask as NIfTI (`.nii` / `.nii.gz`) using the same voxel geometry as the loaded volume (DICOM or NIfTI)
  - PNG/JPEG screenshot of the 3D view

### Cardiac CT (Phase 1 — visualization / education / communication)

MedViz3D is **not** a diagnostic system. Cardiac workflows are for **research, teaching, and clinician–patient explanation** of imaging-derived geometry, with explicit UI disclaimers.

- **CT window presets** for cardiac-style viewing; one-click apply to clip range (display in HU when appropriate).
- **LV blood pool (heuristic)** segmentation on Hounsfield-scaled CT: HU band + optional bone suppression + morphology + largest connected component. Outputs are **approximate**; contrast phase, artifacts, and anatomy vary widely—always review in 2D slices and 3D before any patient-facing use.
- **Mesh profiles** for communication vs detail (smoothing / decimation presets) and **surface QC hints** (boundaries, disconnected parts, volume sanity) stored under **Metadata → `CardiacPipeline`** together with segmentation parameters.
- **Patient mode** vs **Clinician mode**: patient mode simplifies the control surface and highlights a short guided flow; clinician mode exposes classical segmentation and advanced knobs.
- **Physician reviewed** session flag: stored in session JSON and metadata as `PhysicianReviewed`. **You** decide when a model is appropriate to show a patient; the app only records the checkbox state.

**Exports** (STL/OBJ/PLY, etc.) use voxel **spacing in mm** from the loaded volume when available—meshes are in **patient/world units** consistent with that spacing. Validate on your data before relying on absolute scale.

**Phase 2+ (not in this MVP slice):** cardiac MRI-specific notes, optional bias field, cine **phase selection**, and honest labeling before any true 4D path.

## Project layout

All Python code lives in `medical3d_mvp/`.

## Setup (Windows)

1. Install Python **3.11+** (recommended: 3.11 or 3.12).
2. Create and activate a venv:

```bash
cd medical3d_mvp
python -m venv .venv
.venv\\Scripts\\activate
```

3. Install dependencies:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Run

```bash
python run_app.py
```

## Tests (smoke)

From `medical3d_mvp` with the venv activated:

```bash
python -m unittest tests.test_cardiac_smoke -v
```

This exercises synthetic CT-like HU data → LV blood-pool heuristic → marching-cubes mesh without opening the GUI.

## Notes

- DICOM support uses **SimpleITK + GDCM**. If DICOM reading fails, install a SimpleITK build that includes GDCM (most do).
- GPU acceleration is not required; performance depends on volume size and your CPU/RAM.

## Optional AI dependencies

AI segmentation is **off by default**. To experiment with the stub entry point:

1. Set `MEDVIZ3D_ENABLE_AI=1`
2. Install PyTorch for your platform
3. Install MONAI (`pip install monai`)

Then use **Tools → AI segmentation (experimental)…**. You must implement model loading in
`medviz3d/core/ai/monai_optional.py` to return a label map.

