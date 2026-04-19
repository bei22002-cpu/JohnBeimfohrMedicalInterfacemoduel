from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import median_filter


@dataclass(frozen=True)
class PreprocessParams:
    clip_min: float | None = None
    clip_max: float | None = None
    normalize: bool = True
    median_denoise: bool = False
    median_size: int = 3


def preprocess_volume(data_zyx: np.ndarray, p: PreprocessParams) -> np.ndarray:
    x = np.asarray(data_zyx, dtype=np.float32)
    if p.clip_min is not None or p.clip_max is not None:
        mn = p.clip_min if p.clip_min is not None else float(np.nanmin(x))
        mx = p.clip_max if p.clip_max is not None else float(np.nanmax(x))
        x = np.clip(x, mn, mx)
    if p.median_denoise:
        k = int(max(1, p.median_size))
        if k % 2 == 0:
            k += 1
        x = median_filter(x, size=(k, k, k))
    if p.normalize:
        mn = float(np.nanmin(x))
        mx = float(np.nanmax(x))
        if mx > mn:
            x = (x - mn) / (mx - mn)
    return x.astype(np.float32, copy=False)

