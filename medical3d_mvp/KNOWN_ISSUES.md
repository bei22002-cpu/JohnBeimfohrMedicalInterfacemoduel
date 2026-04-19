# Known issues, limitations, and mitigations

This document tracks **realistic limitations** of MedViz3D MVP, **workarounds**, and **planned or partial fixes**. It is updated as the codebase evolves.

---

## 1. Environment and tooling

### Issue

- **Windows path quirks**: folders with apostrophes or unusual characters can confuse some automation tools and scripts.
- **IDE / agent shell**: some PowerShell wrapper scripts may fail with parser errors unrelated to Python; local `cmd.exe` or a clean terminal often works.

### Mitigation

- Prefer project paths **without apostrophes** for the Python tree (e.g. `C:\dev\medical3d_mvp`).
- Run installs from **Command Prompt** or **Windows Terminal** if PowerShell automation fails:
  - `cd medical3d_mvp`
  - `python -m venv .venv`
  - `.venv\Scripts\activate`
  - `pip install -r requirements.txt`

### Status

- Documentation only (no code fix for external shells).

---

## 2. NIfTI geometry / orientation

### Issue

- NIfTI loading uses a **practical** mapping to `Volume` (spacing, origin, normalized direction). **Oblique** or unusual qform/sform combinations may differ slightly from tools that implement full NIfTI affine handling in every edge case.

### Mitigation

- Cross-check critical studies in a reference viewer (e.g. ITK-SNAP, 3D Slicer) before relying on exported meshes for regulated workflows.
- Prefer **DICOM** as source of truth when possible for clinical-grade geometry pipelines.

### Planned / partial fix

- Store the **raw 4×4 affine** from nibabel in `Volume.metadata` for audit and future export parity (not yet implemented).

---

## 3. DICOM robustness

### Issue

- Missing slices, inconsistent spacing, private tags, or unsupported compression can cause **read failures** or **misleading geometry** if not caught.

### Mitigation

- Use **VolumeQA** warnings in Metadata after load/resample.
- Validate series in a DICOM validator or PACS QA tool for problematic archives.

### Status

- QA warnings implemented; per-instance validation is incremental.

---

## 4. Cancellation of long jobs

### Issue

- Some operations are inherently **single-shot** (e.g. one `SimpleITK` `Execute`) and cannot be interrupted mid-call from Python.
- Previously, the progress dialog had **no cancel**.

### Mitigation / fix

- **Cooperative cancel** is implemented for:
  - **Region growing** (BFS loop checks `cancel_event`)
  - **Multi-label mesh extraction** (between labels; each marching cubes still atomic)
- **Marching cubes** for a single large mask is still **one call** to scikit-image; cancel applies **before** that call, not inside it. Multi-label extraction can cancel **between** labels; partial meshes from an interrupted run are **not** merged into a result (work is discarded for that job).
- **Isotropic resample** is one `ResampleImageFilter.Execute` — **not cancellable** mid-flight.

### Status

- Partial: progress dialog **Cancel** wired to `Worker.request_cancel()`; see `medviz3d/util/workers.py` and `attach_worker_progress`.

---

## 5. Worker kwargs injection (`progress_cb`, `cancel_event`)

### Issue

- Passing `progress_cb` into callables that do not accept it caused `TypeError` in early versions.

### Fix

- `Worker.run()` uses **`inspect.signature`** and only injects `progress_cb` / `cancel_event` if the target function declares those parameters.

### Status

- Implemented in `medviz3d/util/workers.py`.

---

## 6. Segmentation quality (threshold / bands / region grow)

### Issue

- Intensity-only methods **leak** into wrong tissues, especially MR without careful windowing.
- Region grow can **flood** if tolerance is too high (mitigated by `max_voxels`).

### Mitigation

- Tune preprocess (clip/normalize) before threshold or bands.
- Use **seeds** conservatively and lower tolerance; clear seeds and retry.
- Treat outputs as **visualization / research**, not validated clinical segmentation.

### Planned

- Additional classical tools (connected components per label, simple graph cuts) as optional steps.

---

## 7. Slice seed click mapping

### Issue

- Mapping from **scaled pixmap** coordinates to volume indices can be slightly off for extreme aspect ratios or very small volumes.

### Mitigation

- Zoom the slice panel (resize window) and click near the center of the structure; verify on other planes.

### Planned

- Optional crosshair overlay and explicit “pick mode” with sub-pixel refinement.

---

## 8. VTK / PyVista version fragility

### Issue

- Opacity and actor APIs differ slightly across PyVista/VTK versions.

### Mitigation

- `VtkView` uses both `actor.prop.opacity` and `GetProperty()` fallbacks.

### Status

- Defensive coding in place; regressions still possible on major upgrades—pin versions in production (`requirements.txt`).

---

## 9. Export semantics (multi-label)

### Issue

- **Export mesh** exports **one label id** at a time (spin box), not all labels merged by default.

### Mitigation

- Export each label sequentially, or post-process merge in MeshLab/Blender.

### Planned

- Optional “export all labels as separate files” batch dialog.

---

## 10. X-ray “3D”

### Issue / product stance

- Single 2D X-ray does **not** encode patient-specific 3D anatomy.

### Mitigation

- UI and metadata label X-ray surfaces as **estimated / illustrative**.

### Status

- By design.

---

## 11. AI (MONAI) integration

### Issue

- No bundled trained weights; enabling `MEDVIZ3D_ENABLE_AI=1` without your own model code does not produce segmentation.

### Mitigation

- Implement inference in `medviz3d/core/ai/monai_optional.py` (load weights, preprocess, postprocess) under your governance.

### Status

- Stub + README; implementation is user-specific.

---

## 12. Cardiac CT — LV blood pool (HU heuristic)

### Issue

- **LV blood pool** mode uses a simple **Hounsfield band + morphology + largest component** pipeline. It can include **aorta, RV, coronaries, veins, or bone edges** depending on contrast, phase, collimation, and artifacts.
- Results are **not** validated segmentation for diagnosis, treatment planning, or device sizing.

### Mitigation

- Review **all orthogonal slices** and the 3D surface before showing a model to anyone.
- Tune HU min/max; toggle **bone suppression** when cortical bone leaks into the band.
- Use **Clinician mode** + classical threshold / **region growing** with seeds to refine or replace the mask when the heuristic is wrong.
- Use **Physician reviewed** only after your own clinical/technical QC.

### Status

- Documented behavior; improvements (seeds, multi-step cardiac pipeline) are incremental.

---

## 13. Mesh surface QC (`CardiacPipeline.MeshQC`)

### Issue

- QC uses PyVista helpers (`extract_feature_edges`, `connectivity`, `volume`). **API or mesh state** differences across versions can cause a step to be skipped with a warning string instead of numeric fields.

### Mitigation

- Pin `pyvista` / `vtk` per `requirements.txt` for reproducible behavior.
- Treat QC output as **hints**, not proof of watertight clinical geometry.

### Status

- Best-effort; defensive `try/except` around each sub-check.

---

## Quick reference: what is cancellable today

| Operation                         | Cancel support        |
|----------------------------------|-----------------------|
| Region grow                      | Yes (cooperative)     |
| Multi-label mesh extraction      | Between labels       |
| LV blood pool (HU heuristic)     | Yes (cooperative checkpoints) |
| Single-label marching cubes      | Before MC only (scikit-image call is still atomic) |
| Isotropic resample               | Before `Execute` only (the SimpleITK call itself is still atomic) |
| DICOM / NIfTI load               | No                   |

---

## Reporting a new issue

Include: OS, Python version, `pip freeze` excerpt for `SimpleITK`, `vtk`, `pyvista`, dataset type (CT/MR), and any **Metadata → VolumeQA** JSON when relevant.
