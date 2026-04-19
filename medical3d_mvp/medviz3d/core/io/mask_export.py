from __future__ import annotations

from pathlib import Path

import numpy as np
import SimpleITK as sitk

from medviz3d.core.types import Volume


def export_mask_nifti(volume: Volume, mask_zyx: np.ndarray, out_path: str | Path) -> None:
    """
    Write a binary/label mask as NIfTI using the same voxel geometry as `volume`
    (spacing/origin/direction in SimpleITK convention for Z,Y,X array from GetImageFromArray).
    """
    out_path = Path(out_path)
    arr = np.asarray(mask_zyx, dtype=np.uint8)
    if arr.shape != volume.data_zyx.shape:
        raise ValueError(
            f"Mask shape {arr.shape} does not match volume shape {volume.data_zyx.shape} (Z,Y,X)."
        )

    img = sitk.GetImageFromArray(arr)
    img.SetSpacing(
        (
            float(volume.spacing_zyx[0]),
            float(volume.spacing_zyx[1]),
            float(volume.spacing_zyx[2]),
        )
    )
    img.SetOrigin((float(volume.origin_xyz[0]), float(volume.origin_xyz[1]), float(volume.origin_xyz[2])))
    d = volume.direction_3x3_rowmajor
    if len(d) == 9:
        img.SetDirection(tuple(float(x) for x in d))

    sitk.WriteImage(img, str(out_path), useCompression=True)
