from __future__ import annotations

import os
import threading
from typing import Callable, Optional

import numpy as np

from medviz3d.core.types import Volume
from medviz3d.util.cancel import UserCancelled


def ai_segmentation_enabled() -> bool:
    v = os.environ.get("MEDVIZ3D_ENABLE_AI", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def explain_ai_setup() -> str:
    return (
        "AI segmentation is disabled.\n\n"
        "To enable the optional integration path:\n"
        "  1) Set environment variable MEDVIZ3D_ENABLE_AI=1\n"
        "  2) Install PyTorch appropriate for your machine\n"
        "  3) Install MONAI (e.g. pip install monai)\n\n"
        "This repository does not ship trained clinical models; "
        "you must plug in your own weights and preprocessing."
    )


def try_import_monai() -> bool:
    import monai  # noqa: F401

    return True


def run_ai_segmentation_placeholder(
    volume: Volume,
    progress_cb: Optional[Callable[[int, str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> np.ndarray:
    """
    Placeholder entry point for future MONAI-based segmentation.

    Returns a uint8 label map (same shape as volume) once a real model is wired in.
    """
    if not ai_segmentation_enabled():
        raise RuntimeError("AI segmentation is disabled. Set MEDVIZ3D_ENABLE_AI=1.")

    if cancel_event is not None and cancel_event.is_set():
        raise UserCancelled()

    if progress_cb:
        progress_cb(5, "Checking optional MONAI dependency…")

    try:
        try_import_monai()
    except ImportError as e:
        raise RuntimeError(
            "MONAI is not installed. Install with `pip install monai` after installing PyTorch."
        ) from e

    if progress_cb:
        progress_cb(100, "No model configured.")

    raise NotImplementedError(
        "AI segmentation is enabled, but no bundled model is configured yet. "
        "Implement medviz3d.core.ai.monai_optional.run_ai_segmentation_placeholder() "
        "to load your checkpoint and write a label map."
    )
