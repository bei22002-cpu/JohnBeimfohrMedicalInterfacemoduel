from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable, Optional

import nibabel as nib
import numpy as np

from medviz3d.core.types import Volume

log = logging.getLogger(__name__)


def load_nifti(path: str | Path, progress_cb: Optional[Callable[[int, str], None]] = None) -> Volume:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"NIfTI file not found: {path}")

    if progress_cb is not None:
        progress_cb(5, "Reading NIfTI…")

    img = nib.load(str(path))
    data = img.get_fdata(dtype=np.float32)

    if data.ndim == 4:
        # Common: (X,Y,Z,T) or (X,Y,Z,C); take the first volume for MVP.
        log.warning("NIfTI is 4D; using first volume only.")
        data = data[..., 0]

    # nibabel arrays are typically (X,Y,Z); we standardize to (Z,Y,X)
    if data.shape[0] <= 8 and data.shape[-1] > 32:
        # If someone saved as (Z,Y,X) already, don't guess wrong—keep simple.
        pass

    data_xyz = np.asarray(data, dtype=np.float32)
    data_zyx = np.transpose(data_xyz, (2, 1, 0)).copy(order="C")

    hdr = img.header
    zooms = hdr.get_zooms()[:3]  # (X,Y,Z) spacing in mm
    spacing_zyx = (float(zooms[2]), float(zooms[1]), float(zooms[0]))

    affine = img.affine
    origin_xyz = (float(affine[0, 3]), float(affine[1, 3]), float(affine[2, 3]))
    direction = affine[:3, :3]
    # Normalize direction to pure orientation (remove scale)
    dir_norm = direction.copy()
    for i in range(3):
        n = np.linalg.norm(dir_norm[:, i])
        if n > 0:
            dir_norm[:, i] /= n
    direction_rowmajor = tuple(float(x) for x in dir_norm.reshape(-1))

    meta: dict[str, Any] = {
        "Filename": path.name,
        "ShapeXYZ": tuple(int(x) for x in data_xyz.shape),
        "ZoomsXYZ": tuple(float(x) for x in zooms),
    }

    if progress_cb is not None:
        progress_cb(95, "Volume ready.")

    return Volume(
        data_zyx=data_zyx,
        spacing_zyx=spacing_zyx,
        origin_xyz=origin_xyz,
        direction_3x3_rowmajor=direction_rowmajor,
        modality="UNKNOWN",
        metadata=meta,
        source_label=str(path),
    )

