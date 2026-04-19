from __future__ import annotations

from pathlib import Path

import numpy as np
import pyvista as pv

from medviz3d.core.types import MeshModel


def meshmodel_to_pyvista(mesh: MeshModel) -> pv.PolyData:
    verts = np.asarray(mesh.vertices_xyz, dtype=np.float32)
    faces = np.asarray(mesh.faces, dtype=np.int32)
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError("Only triangle meshes are supported for export.")
    vtk_faces = np.hstack([np.full((faces.shape[0], 1), 3, dtype=np.int32), faces]).ravel()
    return pv.PolyData(verts, vtk_faces)


def export_mesh(mesh: MeshModel, out_path: str | Path) -> None:
    export_polydata(meshmodel_to_pyvista(mesh), out_path)


def export_polydata(poly: pv.PolyData, out_path: str | Path) -> None:
    """
    Export a PyVista surface mesh. STL/OBJ/PLY/VTK use VTK writers.
    glTF/GLB uses `trimesh` if installed (optional dependency).
    """
    out_path = Path(out_path)
    suffix = out_path.suffix.lower()

    if suffix in (".gltf", ".glb"):
        try:
            import trimesh
        except ImportError as e:
            raise RuntimeError(
                "glTF export requires `trimesh`. Install with: pip install trimesh"
            ) from e

        verts = np.asarray(poly.points, dtype=np.float64)
        faces = np.asarray(poly.faces)
        if faces.size == 0:
            raise ValueError("Mesh has no faces.")
        if faces.ndim == 2 and faces.shape[1] == 3:
            tri = faces.astype(np.int64, copy=False)
        elif faces.ndim == 1:
            tri = faces.reshape(-1, 4)[:, 1:4].astype(np.int64, copy=False)
        elif faces.ndim == 2 and faces.shape[1] == 4:
            tri = faces[:, 1:4].astype(np.int64, copy=False)
        else:
            raise ValueError(f"Unsupported face array shape: {faces.shape}")
        tm = trimesh.Trimesh(vertices=verts, faces=tri, process=False)
        tm.export(str(out_path))
        return

    poly.save(str(out_path))
