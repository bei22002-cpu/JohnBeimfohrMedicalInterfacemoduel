from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CTWindowPreset:
    """CT window as (center HU, width HU). Clip range is [center - width/2, center + width/2]."""

    name: str
    center_hu: float
    width_hu: float

    def clip_range_hu(self) -> tuple[float, float]:
        lo = float(self.center_hu - self.width_hu / 2.0)
        hi = float(self.center_hu + self.width_hu / 2.0)
        return lo, hi


# Common presets for thoracic/cardiac CT review (not a substitute for PACS windowing policy).
CT_WINDOW_PRESETS: list[CTWindowPreset] = [
    CTWindowPreset("Cardiac / soft tissue", 40.0, 400.0),
    CTWindowPreset("Mediastinum", 50.0, 350.0),
    CTWindowPreset("Lung", -600.0, 1500.0),
    CTWindowPreset("Bone", 300.0, 1500.0),
    CTWindowPreset("Wide soft tissue", 40.0, 800.0),
]


def preset_by_name(name: str) -> CTWindowPreset | None:
    for p in CT_WINDOW_PRESETS:
        if p.name == name:
            return p
    return None


def presets_for_ui() -> list[str]:
    return [p.name for p in CT_WINDOW_PRESETS]


def describe_preset(p: CTWindowPreset) -> dict[str, Any]:
    lo, hi = p.clip_range_hu()
    return {
        "name": p.name,
        "center_hu": p.center_hu,
        "width_hu": p.width_hu,
        "clip_min_hu": lo,
        "clip_max_hu": hi,
    }
