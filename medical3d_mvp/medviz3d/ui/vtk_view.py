from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional

import pyvista as pv
from pyvistaqt import QtInteractor
from PySide6.QtWidgets import QLabel, QVBoxLayout, QWidget

ViewMode = Literal["empty", "single", "multi"]


class VtkView(QWidget):
    def __init__(self) -> None:
        super().__init__()
        layout = QVBoxLayout(self)

        self.banner = QLabel(
            "3D View. CT/MRI meshes are volumetric reconstructions; X-ray outputs are ESTIMATED/ILLUSTRATIVE."
        )
        self.banner.setWordWrap(True)
        self.banner.setStyleSheet("QLabel { color: #b00020; font-weight: 700; }")
        layout.addWidget(self.banner)

        self.plotter = QtInteractor(self)
        layout.addWidget(self.plotter.interactor, 1)

        self._mode: ViewMode = "empty"
        self._opacity = 0.6

        self._mesh_actor: Optional[object] = None
        self._current_poly: Optional[pv.PolyData] = None

        self._actors_by_id: dict[int, object] = {}
        self._polys_by_id: dict[int, pv.PolyData] = {}

        self.plotter.set_background("#0b1020")
        self.plotter.add_axes()

    def clear(self) -> None:
        self.plotter.clear()
        self.plotter.add_axes()
        self._mesh_actor = None
        self._current_poly = None
        self._actors_by_id.clear()
        self._polys_by_id.clear()
        self._mode = "empty"
        self.plotter.reset_camera()

    def show_polydata(self, poly: pv.PolyData, label: str, opacity: float, estimated: bool) -> None:
        self.clear()
        self._mode = "single"
        self._opacity = float(opacity)
        self._current_poly = poly
        color = "#ffcc80" if not estimated else "#ff8a80"
        self._mesh_actor = self.plotter.add_mesh(
            poly,
            name="mesh",
            color=color,
            opacity=self._opacity,
            smooth_shading=True,
            show_edges=False,
        )
        self.plotter.add_text(label, position="upper_left", font_size=10, color="white")
        self.plotter.reset_camera()

    def show_label_surfaces(
        self,
        surfaces: list[tuple[int, pv.PolyData, str, bool]],
        opacity: float,
        title: str = "Multi-structure",
    ) -> None:
        """Show multiple meshes with distinct colors. `surfaces` entries: (label_id, poly, name, estimated)."""
        self.clear()
        self._mode = "multi"
        self._opacity = float(opacity)

        palette = ["#ffcc80", "#8dd3c7", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5"]

        for lid, poly, _name, est in surfaces:
            color = palette[int(lid) % len(palette)] if not est else "#ff8a80"
            actor = self.plotter.add_mesh(
                poly,
                name=f"medviz_mesh_{lid}",
                color=color,
                opacity=self._opacity,
                smooth_shading=True,
                show_edges=False,
            )
            self._actors_by_id[int(lid)] = actor
            self._polys_by_id[int(lid)] = poly

        self.plotter.add_text(title, position="upper_left", font_size=10, color="white")
        self.plotter.reset_camera()

    def set_label_visible(self, label_id: int, visible: bool) -> None:
        if self._mode != "multi":
            return
        actor = self._actors_by_id.get(int(label_id))
        if actor is None:
            return
        try:
            actor.SetVisibility(1 if visible else 0)
            self.plotter.render()
        except Exception:
            pass

    def set_opacity(self, opacity: float) -> None:
        self._opacity = float(opacity)
        if self._mode == "multi":
            for actor in self._actors_by_id.values():
                try:
                    prop = getattr(actor, "prop", None)
                    if prop is not None and hasattr(prop, "opacity"):
                        prop.opacity = float(self._opacity)
                    elif hasattr(actor, "GetProperty"):
                        actor.GetProperty().SetOpacity(float(self._opacity))
                except Exception:
                    pass
            self.plotter.render()
            return

        if self._mesh_actor is None:
            return
        try:
            prop = getattr(self._mesh_actor, "prop", None)
            if prop is not None and hasattr(prop, "opacity"):
                prop.opacity = float(self._opacity)
            elif hasattr(self._mesh_actor, "GetProperty"):
                self._mesh_actor.GetProperty().SetOpacity(float(self._opacity))
            self.plotter.render()
        except Exception:
            pass

    def current_polydata(self) -> Optional[pv.PolyData]:
        return self._current_poly

    def poly_for_export(self, label_id: Optional[int] = None) -> Optional[pv.PolyData]:
        if self._mode == "single":
            return self._current_poly
        if self._mode == "multi" and self._polys_by_id:
            if label_id is not None and int(label_id) in self._polys_by_id:
                return self._polys_by_id[int(label_id)]
            first = sorted(self._polys_by_id.keys())[0]
            return self._polys_by_id[first]
        return None

    def save_screenshot(self, out_path: str | Path) -> None:
        out_path = Path(out_path)
        self.plotter.screenshot(str(out_path), return_img=False)

    def has_surface_geometry(self) -> bool:
        return self._mode in ("single", "multi")
