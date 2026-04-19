from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
from skimage.measure import marching_cubes

from medviz3d.core.types import MeshModel
from medviz3d.util.cancel import UserCancelled


@dataclass(frozen=True)
class MeshParams:
    iso_value: float = 0.5
    smooth_iters: int = 20
    smooth_relax: float = 0.01
    decimate_fraction: float = 0.0  # 0=no decimate, 0.5=remove ~50%


def mask_to_mesh(
    mask_zyx: np.ndarray,
    spacing_zyx: tuple[float, float, float],
    label: str,
    estimated: bool = False,
    p: Optional[MeshParams] = None,
    progress_cb: Optional[Callable[[int, str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> MeshModel:
    m = np.asarray(mask_zyx, dtype=np.float32)
    if m.ndim != 3:
        raise ValueError("Mask must be 3D (Z,Y,X).")
    if m.max() <= 0:
        raise ValueError("Mask is empty; nothing to reconstruct.")

    p = p or MeshParams()

    if cancel_event is not None and cancel_event.is_set():
        raise UserCancelled()

    if progress_cb:
        progress_cb(15, "Running marching cubes…")

    # marching_cubes expects spacing per axis in the same order as array axes.
    verts_zyx, faces, _, _ = marching_cubes(
        m,
        level=float(p.iso_value),
        spacing=(float(spacing_zyx[0]), float(spacing_zyx[1]), float(spacing_zyx[2])),
        allow_degenerate=False,
    )

    # Convert (Z,Y,X) to (X,Y,Z) world axes for visualization/export.
    verts_xyz = np.stack([verts_zyx[:, 2], verts_zyx[:, 1], verts_zyx[:, 0]], axis=1).astype(
        np.float32, copy=False
    )
    faces = np.asarray(faces, dtype=np.int32)

    if progress_cb:
        progress_cb(100, "Marching cubes complete.")

    return MeshModel(vertices_xyz=verts_xyz, faces=faces, label=label, estimated=estimated)

