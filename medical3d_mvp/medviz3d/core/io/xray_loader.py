from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

import numpy as np
from PIL import Image, ImageOps

from medviz3d.core.types import XRay2D


def load_xray_image(path: str | Path, progress_cb: Optional[Callable[[int, str], None]] = None) -> XRay2D:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"X-ray image not found: {path}")

    if progress_cb is not None:
        progress_cb(10, "Reading image…")

    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("L")

    arr = np.asarray(img, dtype=np.float32)
    if arr.max() > 0:
        arr = arr / 255.0

    if progress_cb is not None:
        progress_cb(95, "Image ready.")

    return XRay2D(
        image_yx=arr,
        metadata={"Filename": path.name, "Width": int(arr.shape[1]), "Height": int(arr.shape[0])},
        source_label=str(path),
    )

