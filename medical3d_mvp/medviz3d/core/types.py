from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

import numpy as np

Modality = Literal["CT", "MR", "XRAY", "UNKNOWN"]


@dataclass(frozen=True)
class Volume:
    data_zyx: np.ndarray  # (Z, Y, X) float32
    spacing_zyx: tuple[float, float, float]  # mm
    origin_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0)
    direction_3x3_rowmajor: tuple[float, ...] = (
        1.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        1.0,
    )
    modality: Modality = "UNKNOWN"
    metadata: dict[str, Any] = field(default_factory=dict)
    source_label: str = ""

    @property
    def shape_zyx(self) -> tuple[int, int, int]:
        z, y, x = self.data_zyx.shape
        return int(z), int(y), int(x)


@dataclass(frozen=True)
class XRay2D:
    image_yx: np.ndarray  # (Y, X) float32 [0..1]
    modality: Modality = "XRAY"
    metadata: dict[str, Any] = field(default_factory=dict)
    source_label: str = ""


@dataclass(frozen=True)
class MeshModel:
    vertices_xyz: np.ndarray  # (N, 3) float32 in mm space
    faces: np.ndarray  # (M, 3) int32 indices (triangles)
    label: str
    estimated: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

