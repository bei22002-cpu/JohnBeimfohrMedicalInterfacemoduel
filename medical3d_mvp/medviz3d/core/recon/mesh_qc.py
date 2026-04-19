from __future__ import annotations

from typing import Any

import numpy as np
import pyvista as pv


def analyze_surface_mesh(poly: pv.PolyData) -> dict[str, Any]:
    """
    Lightweight surface sanity checks for communication/research meshes.

    Not a substitute for mesh validation in regulated workflows.
    """
    out: dict[str, Any] = {}
    if poly.n_points == 0 or poly.n_cells == 0:
        out["warnings"] = ["Empty mesh."]
        return out

    warnings: list[str] = []

    try:
        surf = poly.triangulate()
        feat = surf.extract_feature_edges(
            boundary_edges=True,
            non_manifold_edges=True,
            feature_edges=False,
            manifold_edges=False,
        )
        n_edge_pts = int(feat.n_points)
        out["feature_edge_points"] = n_edge_pts
        if n_edge_pts > 0:
            warnings.append(
                f"Mesh has {n_edge_pts} feature-edge sample points (open boundary / non-manifold / sharp edges). "
                "Inspect for holes or self-intersections."
            )
    except Exception as e:  # noqa: BLE001
        warnings.append(f"Feature-edge QC skipped: {e}")

    try:
        clus = poly.connectivity(extraction_mode="all")
        n_reg = int(clus["RegionId"].max() + 1) if "RegionId" in clus.array_names else 1
        out["connected_components"] = n_reg
        if n_reg > 1:
            warnings.append(f"Mesh has {n_reg} disconnected components (may be expected for multi-label exports).")
    except Exception as e:  # noqa: BLE001
        warnings.append(f"Connectivity QC skipped: {e}")

    try:
        vol = float(poly.volume)
        out["mesh_volume_mm3_est"] = vol
        if not np.isfinite(vol) or vol <= 0:
            warnings.append("Non-positive or non-finite mesh volume estimate.")
    except Exception as e:  # noqa: BLE001
        warnings.append(f"Volume estimate skipped: {e}")

    out["warnings"] = warnings
    out["n_points"] = int(poly.n_points)
    out["n_cells"] = int(poly.n_cells)
    return out
