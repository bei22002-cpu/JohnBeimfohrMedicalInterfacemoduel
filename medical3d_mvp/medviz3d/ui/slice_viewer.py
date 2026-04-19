from __future__ import annotations

from typing import Optional

import numpy as np
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QImage, QMouseEvent, QPixmap
from PySide6.QtWidgets import (
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QSlider,
    QVBoxLayout,
    QWidget,
)


def _to_qimage_gray(arr_yx: np.ndarray) -> QImage:
    a = np.asarray(arr_yx, dtype=np.float32)
    a = np.nan_to_num(a)
    mn = float(a.min())
    mx = float(a.max())
    if mx > mn:
        a = (a - mn) / (mx - mn)
    a8 = (np.clip(a, 0, 1) * 255.0).astype(np.uint8)
    h, w = a8.shape
    return QImage(a8.tobytes(), w, h, w, QImage.Format_Grayscale8).copy()


def _overlay_mask(gray: np.ndarray, mask: Optional[np.ndarray]) -> np.ndarray:
    if mask is None:
        return gray
    g = np.asarray(gray, dtype=np.float32)
    m = np.asarray(mask, dtype=np.uint8)
    out = g.copy()
    if int(m.max()) <= 1:
        out[m > 0] = np.clip(out[m > 0] * 0.6 + 0.4, 0.0, 1.0)
        return out
    # multi-label: modest brightness steps per label id
    for lid in range(1, int(m.max()) + 1):
        sel = m == lid
        if not np.any(sel):
            continue
        bump = 0.12 * float(lid)
        out[sel] = np.clip(out[sel] * 0.55 + bump, 0.0, 1.0)
    return out


class SliceImageLabel(QLabel):
    """QLabel that reports clicks in displayed pixmap coordinates (column=x_pix, row=y_pix)."""

    pixmap_clicked = Signal(int, int)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.LeftButton:
            pm = self.pixmap()
            if pm is not None and not pm.isNull():
                pw, ph = pm.width(), pm.height()
                lw, lh = self.width(), self.height()
                ox = (lw - pw) // 2
                oy = (lh - ph) // 2
                mx = int(event.position().x())
                my = int(event.position().y())
                ix = mx - ox
                iy = my - oy
                if 0 <= ix < pw and 0 <= iy < ph:
                    self.pixmap_clicked.emit(ix, iy)
        super().mousePressEvent(event)


class _SingleSlice(QWidget):
    def __init__(self, title: str) -> None:
        super().__init__()
        lay = QVBoxLayout(self)
        self.title = QLabel(title)
        self.title.setStyleSheet("QLabel { font-weight: 700; }")
        self.image = SliceImageLabel()
        self.image.setMinimumSize(260, 260)
        self.image.setAlignment(Qt.AlignCenter)
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(0, 0)
        self.idx = QLabel("0")

        lay.addWidget(self.title)
        lay.addWidget(self.image, 1)
        row = QHBoxLayout()
        row.addWidget(self.slider, 1)
        row.addWidget(self.idx)
        lay.addLayout(row)

    def set_pixmap(self, pm: QPixmap) -> None:
        self.image.setPixmap(pm.scaled(self.image.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation))


def _map_pix_to_axis(idx_pix: int, pix_len: int, axis_len: int) -> int:
    if axis_len <= 1:
        return 0
    if pix_len <= 1:
        return 0
    v = int(round(float(idx_pix) * float(axis_len - 1) / float(pix_len - 1)))
    return int(max(0, min(axis_len - 1, v)))


class SliceViewer3(QWidget):
    """
    Axial / coronal / sagittal slice views.

    Emits `volume_seed_requested(z,y,x)` when the user left-clicks a slice while a volume is loaded.
    """

    volume_seed_requested = Signal(int, int, int)

    def __init__(self) -> None:
        super().__init__()
        self._vol: Optional[np.ndarray] = None
        self._mask: Optional[np.ndarray] = None
        self._xray: Optional[np.ndarray] = None
        self._spacing_zyx = (1.0, 1.0, 1.0)

        self.ax = _SingleSlice("Axial (Z) — click to set seed")
        self.co = _SingleSlice("Coronal (Y) — click to set seed")
        self.sa = _SingleSlice("Sagittal (X) — click to set seed")

        grid = QGridLayout(self)
        grid.addWidget(self.ax, 0, 0)
        grid.addWidget(self.co, 0, 1)
        grid.addWidget(self.sa, 0, 2)

        self.ax.slider.valueChanged.connect(self._render)
        self.co.slider.valueChanged.connect(self._render)
        self.sa.slider.valueChanged.connect(self._render)

        self.ax.image.pixmap_clicked.connect(lambda ix, iy: self._on_click_axial(ix, iy))
        self.co.image.pixmap_clicked.connect(lambda ix, iy: self._on_click_coronal(ix, iy))
        self.sa.image.pixmap_clicked.connect(lambda ix, iy: self._on_click_sagittal(ix, iy))

    def set_volume(self, vol_zyx: np.ndarray, spacing_zyx: tuple[float, float, float]) -> None:
        self._xray = None
        self._vol = np.asarray(vol_zyx, dtype=np.float32)
        self._spacing_zyx = spacing_zyx
        z, y, x = self._vol.shape
        self.ax.slider.setRange(0, max(0, z - 1))
        self.co.slider.setRange(0, max(0, y - 1))
        self.sa.slider.setRange(0, max(0, x - 1))
        self.ax.slider.setValue(z // 2 if z else 0)
        self.co.slider.setValue(y // 2 if y else 0)
        self.sa.slider.setValue(x // 2 if x else 0)
        self._render()

    def set_xray(self, image_yx: np.ndarray) -> None:
        self._vol = None
        self._mask = None
        self._xray = np.asarray(image_yx, dtype=np.float32)
        self.ax.slider.setRange(0, 0)
        self.co.slider.setRange(0, 0)
        self.sa.slider.setRange(0, 0)
        self.ax.slider.setValue(0)
        self.co.slider.setValue(0)
        self.sa.slider.setValue(0)
        self._render()

    def set_mask(self, mask_zyx: Optional[np.ndarray]) -> None:
        self._mask = None if mask_zyx is None else np.asarray(mask_zyx, dtype=np.uint8)
        self._render()

    def _on_click_axial(self, ix: int, iy: int) -> None:
        if self._vol is None:
            return
        # Axial slice array is (Y,X). QImage width=n x, height=n y.
        z = int(self.ax.slider.value())
        _, ny, nx = self._vol.shape
        pm = self.ax.image.pixmap()
        if pm is None or pm.isNull() or ny <= 0 or nx <= 0:
            return
        pw, ph = pm.width(), pm.height()
        x = _map_pix_to_axis(ix, pw, nx)
        y = _map_pix_to_axis(iy, ph, ny)
        self.volume_seed_requested.emit(z, y, x)

    def _on_click_coronal(self, ix: int, iy: int) -> None:
        if self._vol is None:
            return
        # Coronal slice array is (Z,X). QImage width=n x, height=n z.
        y = int(self.co.slider.value())
        nz, _, nx = self._vol.shape
        pm = self.co.image.pixmap()
        if pm is None or pm.isNull() or nz <= 0 or nx <= 0:
            return
        pw, ph = pm.width(), pm.height()
        x = _map_pix_to_axis(ix, pw, nx)
        z = _map_pix_to_axis(iy, ph, nz)
        self.volume_seed_requested.emit(z, y, x)

    def _on_click_sagittal(self, ix: int, iy: int) -> None:
        if self._vol is None:
            return
        # Sagittal slice array is (Z,Y). QImage width=n y, height=n z.
        x = int(self.sa.slider.value())
        nz, ny, _ = self._vol.shape
        pm = self.sa.image.pixmap()
        if pm is None or pm.isNull() or nz <= 0 or ny <= 0:
            return
        pw, ph = pm.width(), pm.height()
        y = _map_pix_to_axis(ix, pw, ny)
        z = _map_pix_to_axis(iy, ph, nz)
        self.volume_seed_requested.emit(z, y, x)

    def _render(self) -> None:
        if self._xray is not None:
            q = _to_qimage_gray(self._xray)
            pm = QPixmap.fromImage(q)
            self.ax.set_pixmap(pm)
            self.co.set_pixmap(pm)
            self.sa.set_pixmap(pm)
            self.ax.idx.setText("2D")
            self.co.idx.setText("2D")
            self.sa.idx.setText("2D")
            return

        if self._vol is None:
            self.ax.image.setText("Load a volume or X-ray.")
            self.co.image.setText("Load a volume or X-ray.")
            self.sa.image.setText("Load a volume or X-ray.")
            return

        v = self._vol
        z = int(self.ax.slider.value())
        y = int(self.co.slider.value())
        x = int(self.sa.slider.value())
        self.ax.idx.setText(str(z))
        self.co.idx.setText(str(y))
        self.sa.idx.setText(str(x))

        ax = v[z, :, :]
        co = v[:, y, :]
        sa = v[:, :, x]

        ax_m = self._mask[z, :, :] if self._mask is not None else None
        co_m = self._mask[:, y, :] if self._mask is not None else None
        sa_m = self._mask[:, :, x] if self._mask is not None else None

        ax_disp = _overlay_mask(ax, ax_m)
        co_disp = _overlay_mask(co, co_m)
        sa_disp = _overlay_mask(sa, sa_m)

        self.ax.set_pixmap(QPixmap.fromImage(_to_qimage_gray(ax_disp)))
        self.co.set_pixmap(QPixmap.fromImage(_to_qimage_gray(co_disp)))
        self.sa.set_pixmap(QPixmap.fromImage(_to_qimage_gray(sa_disp)))
