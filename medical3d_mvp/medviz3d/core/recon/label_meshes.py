from __future__ import annotations

import threading
from typing import Callable, Optional

import numpy as np

from medviz3d.core.recon.mesh import mask_to_mesh
from medviz3d.core.types import MeshModel
from medviz3d.util.cancel import UserCancelled


def meshes_from_label_volume(
    label_map_zyx: np.ndarray,
    spacing_zyx: tuple[float, float, float],
    label_ids: Optional[list[int]] = None,
    progress_cb: Optional[Callable[[int, str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> dict[int, MeshModel]:
    """
    Extract one surface mesh per label id (>0) from a label map.
    """
    lab = np.asarray(label_map_zyx, dtype=np.uint8)
    if lab.ndim != 3:
        raise ValueError("label_map_zyx must be 3D (Z,Y,X).")

    ids = sorted(int(x) for x in np.unique(lab) if int(x) > 0)
    if label_ids is not None:
        ids = [int(x) for x in label_ids if int(x) > 0]

    if not ids:
        raise ValueError("No positive labels found in label map.")

    out: dict[int, MeshModel] = {}
    n = len(ids)
    for i, lid in enumerate(ids):
        if cancel_event is not None and cancel_event.is_set():
            raise UserCancelled()
        if progress_cb:
            pct = int(10 + (80 * i) / max(1, n))
            progress_cb(pct, f"Mesh for label {lid} ({i+1}/{n})…")
        sub = (lab == lid).astype(np.uint8)
        if sub.max() == 0:
            continue
        mesh = mask_to_mesh(
            sub,
            spacing_zyx,
            label=f"Label {lid}",
            estimated=False,
            cancel_event=cancel_event,
        )
        out[lid] = mesh

    if progress_cb:
        progress_cb(100, "All label meshes extracted.")

    return out
