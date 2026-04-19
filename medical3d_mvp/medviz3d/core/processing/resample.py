from __future__ import annotations

import math
import threading
from dataclasses import replace
from typing import Callable, Optional

import numpy as np
import SimpleITK as sitk

from medviz3d.core.types import Volume
from medviz3d.util.cancel import UserCancelled


def resample_isotropic(
    volume: Volume,
    voxel_mm: float,
    progress_cb: Optional[Callable[[int, str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Volume:
    """
    Resample volume onto a uniform isotropic grid (linear interpolation).
    Preserves origin/direction; updates spacing and array shape.
    """
    if voxel_mm <= 0 or not math.isfinite(voxel_mm):
        raise ValueError("voxel_mm must be a positive finite number.")

    if progress_cb:
        progress_cb(5, "Preparing resample…")

    img = sitk.GetImageFromArray(np.asarray(volume.data_zyx, dtype=np.float32))
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

    in_size = img.GetSize()
    in_spa = img.GetSpacing()
    out_spacing = (float(voxel_mm), float(voxel_mm), float(voxel_mm))
    out_size = []
    for i in range(3):
        extent = max(0.0, (in_size[i] - 1) * float(in_spa[i]))
        n = int(max(1, round(extent / voxel_mm) + 1))
        out_size.append(n)

    if progress_cb:
        progress_cb(25, f"Resampling to {voxel_mm} mm isotropic voxels…")

    if cancel_event is not None and cancel_event.is_set():
        raise UserCancelled()

    resampler = sitk.ResampleImageFilter()
    resampler.SetInterpolator(sitk.sitkLinear)
    resampler.SetOutputOrigin(img.GetOrigin())
    resampler.SetOutputDirection(img.GetDirection())
    resampler.SetOutputSpacing(out_spacing)
    resampler.SetSize([int(x) for x in out_size])
    resampler.SetDefaultPixelValue(float(np.nanmin(sitk.GetArrayFromImage(img))))

    if cancel_event is not None and cancel_event.is_set():
        raise UserCancelled()

    out = resampler.Execute(img)

    arr = sitk.GetArrayFromImage(out).astype(np.float32, copy=False)
    new_spacing = (float(out_spacing[0]), float(out_spacing[1]), float(out_spacing[2]))

    if progress_cb:
        progress_cb(95, "Resample complete.")

    meta = dict(volume.metadata)
    meta["Resample"] = {"isotropic_mm": float(voxel_mm), "prior_spacing_zyx": volume.spacing_zyx}

    return replace(
        volume,
        data_zyx=arr,
        spacing_zyx=new_spacing,
        metadata=meta,
    )
