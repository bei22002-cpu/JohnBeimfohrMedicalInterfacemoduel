from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
from scipy.ndimage import binary_closing, binary_opening, generate_binary_structure, label

from medviz3d.util.cancel import UserCancelled


@dataclass(frozen=True)
class LvBloodPoolParams:
    """
    Classical HU band + morphology for **LV blood pool–biased** segmentation on CT.

    This is a **communication/research helper**, not a validated clinical segmenter.
    Contrast timing, phase, artifacts, and anatomic variability can make HU-only
    segmentation wrong without seeds/refinement.
    """

    hu_lo: float = 180.0
    hu_hi: float = 900.0
    bone_suppress: bool = True
    bone_hu: float = 1300.0
    keep_largest: bool = True
    open_iters: int = 1
    close_iters: int = 1
    connectivity: int = 2


def segment_lv_blood_pool_ct_hu(
    volume_hu_zyx: np.ndarray,
    p: Optional[LvBloodPoolParams] = None,
    progress_cb: Optional[Callable[[int, str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> tuple[np.ndarray, list[str]]:
    """
    Returns (mask uint8 0/1, warnings).

    **Rationale for LV blood pool first:** on many **contrast-enhanced cardiac CT** studies,
    intravascular/blood-pool HU often separates more robustly from myocardium than
    myocardium alone (which is narrower HU and more variable). This remains **heuristic**.
    """
    p = p or LvBloodPoolParams()
    warnings: list[str] = []
    vol = np.asarray(volume_hu_zyx, dtype=np.float32)

    if progress_cb:
        progress_cb(5, "LV blood pool (HU): threshold…")

    if cancel_event is not None and cancel_event.is_set():
        raise UserCancelled()

    m = (vol >= float(p.hu_lo)) & (vol <= float(p.hu_hi))
    if not np.any(m):
        warnings.append("No voxels matched HU band; widen HU range or verify CT is Hounsfield-scaled.")
        return np.zeros(vol.shape, dtype=np.uint8), warnings

    if p.bone_suppress:
        m &= vol < float(p.bone_hu)
        if not np.any(m):
            warnings.append("Bone suppression removed all voxels; try disabling bone suppression or adjust HU band.")

    struct = generate_binary_structure(3, int(p.connectivity))
    if p.open_iters > 0:
        m = binary_opening(m, structure=struct, iterations=int(p.open_iters))
    if p.close_iters > 0:
        m = binary_closing(m, structure=struct, iterations=int(p.close_iters))

    if cancel_event is not None and cancel_event.is_set():
        raise UserCancelled()

    if p.keep_largest:
        lab, n = label(m, structure=struct)
        if n > 1:
            counts = np.bincount(lab.ravel())
            counts[0] = 0
            keep = int(np.argmax(counts))
            m = lab == keep
            warnings.append(
                f"Multiple connected components detected ({n}); kept largest by voxel count (heuristic)."
            )
        elif n == 0:
            warnings.append("Labeling produced no components after morphology.")

    if progress_cb:
        progress_cb(100, "LV blood pool mask ready.")

    if np.sum(m) < 500:
        warnings.append("Very small segmented volume — likely not the LV blood pool; review slices.")

    return m.astype(np.uint8), warnings
