from __future__ import annotations

from collections import deque
import threading
from typing import Callable, Iterable, Optional

import numpy as np

from medviz3d.util.cancel import UserCancelled


def region_grow_intensity_connected(
    volume_zyx: np.ndarray,
    seeds_zyx: Iterable[tuple[int, int, int]],
    intensity_tolerance: float,
    max_voxels: int = 2_000_000,
    progress_cb: Optional[Callable[[int, str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> np.ndarray:
    """
    Simple region growing in 26-connectivity.

    A voxel is included if it is connected to a seed and its intensity is within
    +/- intensity_tolerance of the mean intensity at seed locations.

    This is a classical helper for semi-automatic refinement, not a validated
    clinical segmentation algorithm.
    """
    vol = np.asarray(volume_zyx, dtype=np.float32)
    if vol.ndim != 3:
        raise ValueError("volume_zyx must be 3D (Z,Y,X).")

    seeds = [(int(z), int(y), int(x)) for z, y, x in seeds_zyx]
    if not seeds:
        raise ValueError("At least one seed is required.")

    nz, ny, nx = vol.shape
    for z, y, x in seeds:
        if not (0 <= z < nz and 0 <= y < ny and 0 <= x < nx):
            raise ValueError(f"Seed out of bounds: {(z, y, x)} for shape {(nz, ny, nx)}")

    ref = float(np.mean([vol[z, y, x] for z, y, x in seeds]))
    lo = ref - float(intensity_tolerance)
    hi = ref + float(intensity_tolerance)

    out = np.zeros(vol.shape, dtype=np.uint8)
    visited = np.zeros(vol.shape, dtype=np.uint8)

    q: deque[tuple[int, int, int]] = deque()
    for z, y, x in seeds:
        if lo <= float(vol[z, y, x]) <= hi:
            visited[z, y, x] = 1
            out[z, y, x] = 1
            q.append((z, y, x))

    neighbors = []
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dz == dy == dx == 0:
                    continue
                neighbors.append((dz, dy, dx))

    count = 0
    while q:
        if cancel_event is not None and cancel_event.is_set():
            raise UserCancelled()
        z, y, x = q.popleft()
        count += 1
        if count % 250_000 == 0 and progress_cb:
            pct = min(90, int(100 * count / max_voxels))
            progress_cb(pct, f"Region growing… {count} voxels")

        if count > max_voxels:
            raise RuntimeError(
                f"Region growing exceeded max_voxels={max_voxels}. "
                "Increase tolerance carefully or raise max_voxels."
            )

        for dz, dy, dx in neighbors:
            zz, yy, xx = z + dz, y + dy, x + dx
            if zz < 0 or yy < 0 or xx < 0 or zz >= nz or yy >= ny or xx >= nx:
                continue
            if visited[zz, yy, xx]:
                continue
            val = float(vol[zz, yy, xx])
            if lo <= val <= hi:
                visited[zz, yy, xx] = 1
                out[zz, yy, xx] = 1
                q.append((zz, yy, xx))

    if progress_cb:
        progress_cb(100, "Region growing complete.")

    return out
