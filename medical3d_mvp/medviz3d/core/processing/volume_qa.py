from __future__ import annotations

import math
from typing import Any

from medviz3d.core.types import Volume


def analyze_volume_geometry(vol: Volume) -> dict[str, Any]:
    """
    Geometry / spacing sanity checks for volumetric series.
    Warnings are informational (not a clinical quality gate).
    """
    sz, sy, sx = (float(vol.spacing_zyx[0]), float(vol.spacing_zyx[1]), float(vol.spacing_zyx[2]))
    nz, ny, nx = vol.shape_zyx
    warnings: list[str] = []

    for name, v in (("Z", sz), ("Y", sy), ("X", sx)):
        if v <= 0 or not math.isfinite(v):
            warnings.append(f"Non-positive or non-finite spacing along {name}: {v}")

    sp = sorted([sz, sy, sx])
    if sp[0] > 0:
        ratio = sp[2] / sp[0]
        if ratio > 4.0:
            warnings.append(
                f"Strongly anisotropic voxel spacing (max/min ≈ {ratio:.2f}). "
                "Consider isotropic resampling for more uniform 3D reconstruction."
            )
        elif ratio > 2.5:
            warnings.append(
                f"Moderately anisotropic voxel spacing (max/min ≈ {ratio:.2f}). "
                "Mesh smoothing may behave unevenly across axes."
            )

    # Heuristic: thin slices along Z vs thicker in-plane (common for axial CT)
    if sz > 0 and sx > 0 and sy > 0:
        if max(sx, sy) / sz > 2.0:
            warnings.append(
                "Through-plane (Z) spacing is much larger than in-plane spacing. "
                "Verify slice ordering and reconstruction intent."
            )

    if min(nz, ny, nx) < 8:
        warnings.append("Very small volume extent in at least one axis; 3D reconstruction may be unstable.")

    return {
        "spacing_zyx_mm": (sz, sy, sx),
        "shape_zyx": (nz, ny, nx),
        "physical_extent_mm_zyx": (
            max(0.0, (nz - 1) * sz),
            max(0.0, (ny - 1) * sy),
            max(0.0, (nx - 1) * sx),
        ),
        "warnings": warnings,
        "qa_ok": len(warnings) == 0,
    }
