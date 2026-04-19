from __future__ import annotations

import numpy as np
from scipy.ndimage import gaussian_filter

from medviz3d.core.types import MeshModel


def xray_to_illustrative_surface(
    image_yx: np.ndarray,
    pixel_size_mm: float = 0.6,
    height_mm: float = 40.0,
    blur_sigma: float = 1.5,
) -> MeshModel:
    """
    Honest pseudo-3D:
    - Treat intensity as a relative "height" field (illustrative only).
    - Produces a triangulated surface, not anatomy-true geometry.
    """
    img = np.asarray(image_yx, dtype=np.float32)
    if img.ndim != 2:
        raise ValueError("X-ray image must be 2D.")

    img = np.clip(img, 0.0, 1.0)
    img = gaussian_filter(img, sigma=float(blur_sigma))

    h = img * float(height_mm)
    y, x = h.shape

    xs = np.arange(x, dtype=np.float32) * float(pixel_size_mm)
    ys = np.arange(y, dtype=np.float32) * float(pixel_size_mm)
    xx, yy = np.meshgrid(xs, ys)

    # Surface vertices in XYZ (X to right, Y down, Z up)
    verts_xyz = np.stack([xx.ravel(), yy.ravel(), h.ravel()], axis=1).astype(np.float32)

    # Triangulate grid
    faces = []
    for j in range(y - 1):
        row0 = j * x
        row1 = (j + 1) * x
        for i in range(x - 1):
            a = row0 + i
            b = row0 + i + 1
            c = row1 + i
            d = row1 + i + 1
            faces.append((a, b, d))
            faces.append((a, d, c))
    faces = np.asarray(faces, dtype=np.int32)

    return MeshModel(
        vertices_xyz=verts_xyz,
        faces=faces,
        label="X-ray illustrative surface (estimated)",
        estimated=True,
        metadata={
            "estimated_mode": "intensity_heightfield",
            "pixel_size_mm": float(pixel_size_mm),
            "height_mm": float(height_mm),
        },
    )

