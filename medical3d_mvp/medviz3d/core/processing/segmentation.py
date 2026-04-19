from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import (
    binary_closing,
    binary_fill_holes,
    binary_opening,
    generate_binary_structure,
    label,
)


@dataclass(frozen=True)
class SegmentParams:
    threshold: float
    keep_largest: bool = True
    do_open: bool = True
    do_close: bool = True
    structure_connectivity: int = 2  # 1=6-neighborhood, 2=18/26
    fill_holes: bool = True


def segment_threshold(volume_zyx: np.ndarray, p: SegmentParams) -> np.ndarray:
    vol = np.asarray(volume_zyx, dtype=np.float32)
    mask = vol >= float(p.threshold)

    struct = generate_binary_structure(3, int(p.structure_connectivity))
    if p.do_open:
        mask = binary_opening(mask, structure=struct, iterations=1)
    if p.do_close:
        mask = binary_closing(mask, structure=struct, iterations=1)
    if p.fill_holes:
        mask = binary_fill_holes(mask)

    if p.keep_largest:
        lab, n = label(mask, structure=struct)
        if n > 1:
            counts = np.bincount(lab.ravel())
            counts[0] = 0
            keep = int(np.argmax(counts))
            mask = lab == keep

    return mask.astype(np.uint8)


@dataclass(frozen=True)
class IntensityBand:
    """Inclusive intensity band on the *same* scale as `volume_zyx` (e.g. normalized 0..1)."""

    lo: float
    hi: float


def segment_multi_band_exclusive(
    volume_zyx: np.ndarray,
    bands: list[IntensityBand],
) -> np.ndarray:
    """
    Build a uint8 label map: 0 background, 1..K for each band in order.
    If voxels satisfy multiple bands, the earliest band wins (exclusive assignment).
    """
    vol = np.asarray(volume_zyx, dtype=np.float32)
    out = np.zeros(vol.shape, dtype=np.uint8)
    for idx, band in enumerate(bands, start=1):
        m = (vol >= float(band.lo)) & (vol <= float(band.hi)) & (out == 0)
        out[m] = idx
    return out

