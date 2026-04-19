from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pyvista as pv
from PySide6.QtCore import Qt, QThreadPool
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSlider,
    QSpinBox,
    QSplitter,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from medviz3d.core.ai.monai_optional import ai_segmentation_enabled, explain_ai_setup, run_ai_segmentation_placeholder
from medviz3d.core.cardiac.ct_lv_pool import LvBloodPoolParams, segment_lv_blood_pool_ct_hu
from medviz3d.core.cardiac.ct_presets import describe_preset, preset_by_name, presets_for_ui
from medviz3d.core.exporters import export_mesh, export_polydata, meshmodel_to_pyvista
from medviz3d.core.io.dicom_loader import DicomSeriesInfo, list_dicom_series, load_dicom_series
from medviz3d.core.io.mask_export import export_mask_nifti
from medviz3d.core.io.nifti_loader import load_nifti
from medviz3d.core.io.xray_loader import load_xray_image
from medviz3d.core.processing.preprocess import PreprocessParams, preprocess_volume
from medviz3d.core.processing.region_grow import region_grow_intensity_connected
from medviz3d.core.processing.resample import resample_isotropic
from medviz3d.core.processing.segmentation import IntensityBand, SegmentParams, segment_multi_band_exclusive, segment_threshold
from medviz3d.core.processing.volume_qa import analyze_volume_geometry
from medviz3d.core.recon.label_meshes import meshes_from_label_volume
from medviz3d.core.recon.mesh import mask_to_mesh
from medviz3d.core.recon.mesh_qc import analyze_surface_mesh
from medviz3d.core.types import MeshModel, Volume, XRay2D
from medviz3d.core.viz.xray_pseudo3d import xray_to_illustrative_surface
from medviz3d.ui.progress_dialog import attach_worker_progress
from medviz3d.ui.slice_viewer import SliceViewer3
from medviz3d.ui.vtk_view import VtkView
from medviz3d.util.workers import Worker

log = logging.getLogger(__name__)


DISCLAIMER = (
    "Disclaimer: Visualization/reconstruction tool for education, research, and clinician–patient "
    "communication only. Not a diagnostic device. Cardiac 3D models are imaging-derived geometry and "
    "may omit fine anatomy, contain segmentation errors, and (unless explicitly stated) do not represent "
    "true motion over the cardiac cycle. X-ray pseudo‑3D outputs are estimated/illustrative only."
)


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("MedViz3D MVP (Local)")
        self.resize(1400, 900)

        self.threadpool = QThreadPool.globalInstance()

        self._volume: Optional[Volume] = None
        self._xray: Optional[XRay2D] = None
        self._preprocessed: Optional[np.ndarray] = None
        self._mask: Optional[np.ndarray] = None
        self._mesh: Optional[MeshModel] = None
        self._seeds: list[tuple[int, int, int]] = []
        self._multi_mesh_models: dict[int, MeshModel] = {}
        self._structure_checks: dict[int, QCheckBox] = {}
        self._ui_mode: str = "clinician"  # "clinician" | "patient"
        self._cardiac_pipeline: dict[str, Any] = {}
        self._last_static_extra: Optional[dict] = None

        self._build_ui()
        self._set_idle_state()
        self._apply_ui_mode()

    def _build_ui(self) -> None:
        file_menu = self.menuBar().addMenu("&File")
        act_open_dicom = QAction("Open DICOM Folder…", self)
        act_open_nifti = QAction("Open NIfTI…", self)
        act_open_xray = QAction("Open X-ray Image…", self)
        act_export_mesh = QAction("Export Mesh…", self)
        act_export_mask = QAction("Export Segmentation Mask (NIfTI)…", self)
        act_screenshot_3d = QAction("Save 3D View Screenshot…", self)
        act_save_session = QAction("Save Session Metadata JSON…", self)
        act_quit = QAction("Quit", self)
        file_menu.addAction(act_open_dicom)
        file_menu.addAction(act_open_nifti)
        file_menu.addAction(act_open_xray)
        file_menu.addSeparator()
        file_menu.addAction(act_export_mesh)
        file_menu.addAction(act_export_mask)
        file_menu.addAction(act_screenshot_3d)
        file_menu.addAction(act_save_session)
        file_menu.addSeparator()
        file_menu.addAction(act_quit)

        act_open_dicom.triggered.connect(self.open_dicom_folder)
        act_open_nifti.triggered.connect(self.open_nifti)
        act_open_xray.triggered.connect(self.open_xray)
        act_export_mesh.triggered.connect(self.export_current_mesh)
        act_export_mask.triggered.connect(self.export_segmentation_mask)
        act_screenshot_3d.triggered.connect(self.save_3d_screenshot)
        act_save_session.triggered.connect(self.save_session_json)
        act_quit.triggered.connect(self.close)

        tools_menu = self.menuBar().addMenu("&Tools")
        act_ai = QAction("AI segmentation (experimental)…", self)
        tools_menu.addAction(act_ai)
        act_ai.triggered.connect(self.run_ai_segmentation)

        root = QWidget()
        self.setCentralWidget(root)
        layout = QHBoxLayout(root)

        splitter = QSplitter(Qt.Horizontal)
        layout.addWidget(splitter)

        left = QWidget()
        left_layout = QVBoxLayout(left)

        self.disclaimer = QLabel(DISCLAIMER)
        self.disclaimer.setWordWrap(True)
        self.disclaimer.setStyleSheet("QLabel { color: #b00020; font-weight: 600; }")
        left_layout.addWidget(self.disclaimer)

        mode_row = QHBoxLayout()
        mode_row.addWidget(QLabel("UI mode:"))
        self.ui_mode_combo = QComboBox()
        self.ui_mode_combo.addItems(["Clinician (full controls)", "Patient / teaching (guided CT)"])
        self.ui_mode_combo.currentIndexChanged.connect(self._on_ui_mode_changed)
        mode_row.addWidget(self.ui_mode_combo, 1)
        left_layout.addLayout(mode_row)

        self.physician_review_cb = QCheckBox(
            "Physician reviewed — OK to use in patient discussion (workflow flag only)"
        )
        self.physician_review_cb.toggled.connect(self._on_physician_review_toggled)
        left_layout.addWidget(self.physician_review_cb)

        self.patient_guide = QGroupBox("Guided steps: cardiac CT → LV blood pool → 3D (static model)")
        pg = QVBoxLayout(self.patient_guide)
        pg.addWidget(
            QLabel(
                "Limitations: single-phase geometry only (not a beating-heart digital twin). "
                "Segmentation is HU-heuristic and must be reviewed."
            )
        )
        b1 = QPushButton("1) Load cardiac CT (DICOM folder)")
        b1.clicked.connect(self.open_dicom_folder)
        b2 = QPushButton("2) Apply cardiac CT window to clip controls")
        b2.clicked.connect(self.apply_cardiac_ct_window)
        b3 = QPushButton("3) Click slices to drop seeds inside the bright blood pool (optional)")
        b3.clicked.connect(self._patient_seed_hint)
        b4 = QPushButton("4) Segment LV blood pool (HU heuristic)")
        b4.clicked.connect(self.run_lv_blood_pool_segmentation)
        b5 = QPushButton("5) Extract 3D mesh → open 3D View tab")
        b5.clicked.connect(self.extract_mesh)
        for w in (b1, b2, b3, b4, b5):
            pg.addWidget(w)
        left_layout.addWidget(self.patient_guide)

        self.meta_box = QGroupBox("Metadata")
        meta_layout = QVBoxLayout(self.meta_box)
        self.meta_text = QTextEdit()
        self.meta_text.setReadOnly(True)
        self.meta_text.setMinimumHeight(180)
        meta_layout.addWidget(self.meta_text)
        left_layout.addWidget(self.meta_box)

        self.proc_box = QGroupBox("Preprocess")
        proc_form = QFormLayout(self.proc_box)
        self.clip_min = QSpinBox()
        self.clip_min.setRange(-5000, 5000)
        self.clip_min.setValue(0)
        self.clip_max = QSpinBox()
        self.clip_max.setRange(-5000, 5000)
        self.clip_max.setValue(1000)
        self.normalize = QComboBox()
        self.normalize.addItems(["On", "Off"])
        self.denoise = QComboBox()
        self.denoise.addItems(["Off", "Median 3x3x3", "Median 5x5x5"])
        self.btn_preprocess = QPushButton("Apply Preprocess")
        proc_form.addRow("Clip min (HU-ish):", self.clip_min)
        proc_form.addRow("Clip max (HU-ish):", self.clip_max)
        proc_form.addRow("Normalize [0..1]:", self.normalize)
        proc_form.addRow("Denoise:", self.denoise)
        proc_form.addRow(self.btn_preprocess)
        self.iso_mm = QDoubleSpinBox()
        self.iso_mm.setRange(0.2, 5.0)
        self.iso_mm.setSingleStep(0.1)
        self.iso_mm.setDecimals(2)
        self.iso_mm.setValue(1.0)
        self.btn_resample_iso = QPushButton("Resample to isotropic voxel size")
        proc_form.addRow("Isotropic target (mm):", self.iso_mm)
        proc_form.addRow(self.btn_resample_iso)
        left_layout.addWidget(self.proc_box)

        self.cardiac_box = QGroupBox("Cardiac CT — LV blood pool (communication / research)")
        c_form = QFormLayout(self.cardiac_box)
        self.ct_preset_combo = QComboBox()
        self.ct_preset_combo.addItems(presets_for_ui())
        self.btn_ct_window = QPushButton("Apply selected CT window to HU clip (sets min/max)")
        self.lv_hu_lo = QSpinBox()
        self.lv_hu_lo.setRange(-2048, 3071)
        self.lv_hu_lo.setValue(180)
        self.lv_hu_hi = QSpinBox()
        self.lv_hu_hi.setRange(-2048, 3071)
        self.lv_hu_hi.setValue(900)
        self.chk_bone_suppress = QCheckBox("Suppress very high HU (bone/air streak mitigation)")
        self.chk_bone_suppress.setChecked(True)
        self.btn_lv_pool = QPushButton("Segment LV blood pool (uses raw HU volume, not normalized preview)")
        c_form.addRow("CT window preset:", self.ct_preset_combo)
        c_form.addRow(self.btn_ct_window)
        c_form.addRow("LV HU min:", self.lv_hu_lo)
        c_form.addRow("LV HU max:", self.lv_hu_hi)
        c_form.addRow(self.chk_bone_suppress)
        c_form.addRow(self.btn_lv_pool)
        left_layout.addWidget(self.cardiac_box)

        self.seg_box = QGroupBox("Segmentation (classical)")
        seg_form = QFormLayout(self.seg_box)
        self.threshold = QSlider(Qt.Horizontal)
        self.threshold.setRange(0, 1000)
        self.threshold.setValue(500)
        self.thresh_label = QLabel("0.500")
        self.keep_largest = QComboBox()
        self.keep_largest.addItems(["On", "Off"])
        self.btn_segment = QPushButton("Run Segmentation")
        seg_form.addRow("Threshold:", self.threshold)
        seg_form.addRow("Threshold value:", self.thresh_label)
        seg_form.addRow("Keep largest component:", self.keep_largest)
        seg_form.addRow(self.btn_segment)
        left_layout.addWidget(self.seg_box)

        self.rg_box = QGroupBox("Region grow (semi-auto)")
        rg_form = QFormLayout(self.rg_box)
        self.rg_tol = QDoubleSpinBox()
        self.rg_tol.setRange(0.0005, 1.0)
        self.rg_tol.setDecimals(4)
        self.rg_tol.setValue(0.05)
        self.seeds_label = QLabel("Seeds: none")
        self.btn_clear_seeds = QPushButton("Clear seeds")
        self.btn_region_grow = QPushButton("Grow region from seeds")
        rg_form.addRow("Intensity tolerance (abs):", self.rg_tol)
        rg_form.addRow(self.seeds_label)
        rg_form.addRow(self.btn_clear_seeds)
        rg_form.addRow(self.btn_region_grow)
        left_layout.addWidget(self.rg_box)

        self.ml_box = QGroupBox("Multi-label (two exclusive intensity bands)")
        ml_form = QFormLayout(self.ml_box)
        self.b1_lo = QSlider(Qt.Horizontal)
        self.b1_hi = QSlider(Qt.Horizontal)
        self.b2_lo = QSlider(Qt.Horizontal)
        self.b2_hi = QSlider(Qt.Horizontal)
        for s in (self.b1_lo, self.b1_hi, self.b2_lo, self.b2_hi):
            s.setRange(0, 1000)
        self.b1_lo.setValue(400)
        self.b1_hi.setValue(900)
        self.b2_lo.setValue(100)
        self.b2_hi.setValue(350)
        self.btn_build_multilabel = QPushButton("Build multi-label mask")
        self.btn_extract_multi_mesh = QPushButton("Extract meshes for all labels")
        ml_form.addRow("Struct 1 low:", self.b1_lo)
        ml_form.addRow("Struct 1 high:", self.b1_hi)
        ml_form.addRow("Struct 2 low:", self.b2_lo)
        ml_form.addRow("Struct 2 high:", self.b2_hi)
        ml_form.addRow(self.btn_build_multilabel)
        ml_form.addRow(self.btn_extract_multi_mesh)
        left_layout.addWidget(self.ml_box)

        self.struct_group = QGroupBox("Structure visibility (3D)")
        struct_outer = QVBoxLayout(self.struct_group)
        self.struct_scroll = QScrollArea()
        self.struct_scroll.setWidgetResizable(True)
        self.struct_inner = QWidget()
        self.struct_layout = QVBoxLayout(self.struct_inner)
        self.struct_scroll.setWidget(self.struct_inner)
        struct_outer.addWidget(self.struct_scroll)
        left_layout.addWidget(self.struct_group)

        self.mesh_box = QGroupBox("3D Reconstruction")
        mesh_form = QFormLayout(self.mesh_box)
        self.mesh_profile = QComboBox()
        self.mesh_profile.addItems(["Balanced", "Education (smoother)", "Fine detail"])
        self.mesh_profile.blockSignals(True)
        self.mesh_profile.setCurrentIndex(0)
        self.mesh_profile.blockSignals(False)
        self.mesh_profile.currentTextChanged.connect(self._on_mesh_profile_changed)
        mesh_form.addRow("Mesh profile:", self.mesh_profile)
        self.smooth_iters = QSpinBox()
        self.smooth_iters.setRange(0, 200)
        self.smooth_iters.setValue(20)
        self.decimate = QSlider(Qt.Horizontal)
        self.decimate.setRange(0, 90)
        self.decimate.setValue(0)
        self.decimate_label = QLabel("0%")
        self.btn_mesh = QPushButton("Extract Mesh (Marching Cubes)")
        self.export_label_spin = QSpinBox()
        self.export_label_spin.setRange(1, 64)
        self.export_label_spin.setValue(1)
        self.opacity = QSlider(Qt.Horizontal)
        self.opacity.setRange(1, 100)
        self.opacity.setValue(60)
        self.btn_clear = QPushButton("Clear Scene")
        mesh_form.addRow("Smooth iters:", self.smooth_iters)
        mesh_form.addRow("Decimate:", self.decimate)
        mesh_form.addRow("Decimate value:", self.decimate_label)
        mesh_form.addRow(self.btn_mesh)
        mesh_form.addRow("Export label id (multi-mesh):", self.export_label_spin)
        mesh_form.addRow("Mesh opacity:", self.opacity)
        mesh_form.addRow(self.btn_clear)
        left_layout.addWidget(self.mesh_box)

        self.status = QLabel("Ready.")
        self.status.setWordWrap(True)
        left_layout.addWidget(self.status)
        left_layout.addStretch(1)

        tabs = QTabWidget()
        self.slice_view = SliceViewer3()
        self.vtk_view = VtkView()
        tabs.addTab(self.slice_view, "Slices")
        tabs.addTab(self.vtk_view, "3D View")

        splitter.addWidget(left)
        splitter.addWidget(tabs)
        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([440, 960])

        self.btn_preprocess.clicked.connect(self.apply_preprocess)
        self.btn_resample_iso.clicked.connect(self.run_resample_isotropic)
        self.btn_ct_window.clicked.connect(self.apply_cardiac_ct_window)
        self.btn_lv_pool.clicked.connect(self.run_lv_blood_pool_segmentation)
        self.threshold.valueChanged.connect(self._update_threshold_label)
        self.btn_segment.clicked.connect(self.run_segmentation)
        self.btn_clear_seeds.clicked.connect(self.clear_seeds)
        self.btn_region_grow.clicked.connect(self.run_region_grow)
        self.btn_build_multilabel.clicked.connect(self.build_multilabel_mask)
        self.btn_extract_multi_mesh.clicked.connect(self.extract_multi_label_meshes)
        self.btn_mesh.clicked.connect(self.extract_mesh)
        self.opacity.valueChanged.connect(self._update_opacity)
        self.decimate.valueChanged.connect(self._update_decimate_label)
        self.btn_clear.clicked.connect(self.clear_scene)

        self.slice_view.volume_seed_requested.connect(self._on_volume_seed)

        self._update_threshold_label(self.threshold.value())

    def _set_idle_state(self) -> None:
        self.proc_box.setEnabled(False)
        self.seg_box.setEnabled(False)
        self.cardiac_box.setEnabled(False)
        self.rg_box.setEnabled(False)
        self.ml_box.setEnabled(False)
        self.struct_group.setEnabled(False)
        self.mesh_box.setEnabled(False)

    def _set_volume_state(self) -> None:
        self.proc_box.setEnabled(True)
        self.seg_box.setEnabled(True)
        self.cardiac_box.setEnabled(True)
        self.rg_box.setEnabled(True)
        self.ml_box.setEnabled(True)
        self.struct_group.setEnabled(True)
        self.mesh_box.setEnabled(True)

    def _set_xray_state(self) -> None:
        self.proc_box.setEnabled(False)
        self.seg_box.setEnabled(False)
        self.cardiac_box.setEnabled(False)
        self.rg_box.setEnabled(False)
        self.ml_box.setEnabled(False)
        self.struct_group.setEnabled(False)
        self.mesh_box.setEnabled(True)

    def _set_status(self, msg: str) -> None:
        self.status.setText(msg)

    def _show_error(self, title: str, msg: str) -> None:
        QMessageBox.critical(self, title, msg)

    def _update_threshold_label(self, v: int) -> None:
        self.thresh_label.setText(f"{v/1000.0:.3f}")

    def _update_decimate_label(self, v: int) -> None:
        self.decimate_label.setText(f"{int(v)}%")

    def _on_ui_mode_changed(self, idx: int) -> None:
        self._ui_mode = "patient" if idx == 1 else "clinician"
        self._apply_ui_mode()

    def _apply_ui_mode(self) -> None:
        patient = self._ui_mode == "patient"
        self.patient_guide.setVisible(patient)
        self.seg_box.setVisible(not patient)
        self.ml_box.setVisible(not patient)

    def _on_physician_review_toggled(self, _checked: bool) -> None:
        self._rerender_metadata_only()

    def _rerender_metadata_only(self) -> None:
        if self._volume is None and self._xray is None:
            return
        meta = self._volume.metadata if self._volume is not None else self._xray.metadata  # type: ignore[union-attr]
        self._render_metadata(meta, self._last_static_extra)

    def _on_mesh_profile_changed(self, text: str) -> None:
        if text.startswith("Education"):
            self.smooth_iters.setValue(45)
            self.decimate.setValue(35)
        elif text.startswith("Fine"):
            self.smooth_iters.setValue(5)
            self.decimate.setValue(0)
        else:
            self.smooth_iters.setValue(20)
            self.decimate.setValue(0)
        self._update_decimate_label(self.decimate.value())
        self._cardiac_pipeline["MeshPreset"] = text
        self._rerender_metadata_only()

    def apply_cardiac_ct_window(self) -> None:
        if self._volume is None:
            return
        name = self.ct_preset_combo.currentText()
        preset = preset_by_name(name)
        if preset is None:
            self._show_error("CT window", "Unknown preset.")
            return
        lo, hi = preset.clip_range_hu()
        self.clip_min.setValue(int(round(lo)))
        self.clip_max.setValue(int(round(hi)))
        self.normalize.setCurrentText("Off")
        self._cardiac_pipeline["LastCTWindow"] = describe_preset(preset)
        self._set_status(
            f"CT window '{preset.name}' applied to clip controls. Click 'Apply Preprocess' to refresh slices in HU."
        )
        self._rerender_metadata_only()

    def _patient_seed_hint(self) -> None:
        QMessageBox.information(
            self,
            "Seeds",
            "Click the axial/coronal/sagittal slice images to add seeds inside the bright blood pool.\n"
            "Seeds are optional but can improve region-growing refinement.",
        )

    def run_lv_blood_pool_segmentation(self) -> None:
        if self._volume is None:
            return
        if self._volume.modality not in ("CT", "UNKNOWN"):
            QMessageBox.warning(
                self,
                "Modality",
                "LV blood pool HU heuristics are designed for CT Hounsfield units. "
                "Proceed only if your volume is CT-like.",
            )

        p = LvBloodPoolParams(
            hu_lo=float(self.lv_hu_lo.value()),
            hu_hi=float(self.lv_hu_hi.value()),
            bone_suppress=bool(self.chk_bone_suppress.isChecked()),
        )

        vol = self._volume

        def lv_job(
            progress_cb=None,
            cancel_event=None,
        ):
            return segment_lv_blood_pool_ct_hu(
                vol.data_zyx.astype(np.float32, copy=False),
                p,
                progress_cb=progress_cb,
                cancel_event=cancel_event,
            )

        worker = Worker(lv_job)
        self._wire_progress(worker, "LV blood pool segmentation")
        worker.signals.result.connect(self._on_lv_blood_pool_done)
        worker.signals.error.connect(lambda s: self._show_error("LV blood pool", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def _on_lv_blood_pool_done(self, payload: object) -> None:
        mask, warns = payload  # type: ignore[misc]
        self._mask = mask
        if self._volume is not None:
            self._preprocessed = self._volume.data_zyx.astype(np.float32, copy=False)
            self.slice_view.set_volume(self._preprocessed, self._volume.spacing_zyx)
        self.slice_view.set_mask(mask)
        self._cardiac_pipeline["LVBloodPool"] = {
            "method": "HU_band_plus_morphology",
            "hu_lo": float(self.lv_hu_lo.value()),
            "hu_hi": float(self.lv_hu_hi.value()),
            "bone_suppress": bool(self.chk_bone_suppress.isChecked()),
            "warnings": list(warns),
        }
        self._rerender_metadata_only()
        self._set_status("LV blood pool mask ready. Review slices, then extract mesh.")

    def _update_opacity(self, v: int) -> None:
        if (
            self._mesh is None
            and self.vtk_view.current_polydata() is None
            and not self._multi_mesh_models
            and not self.vtk_view.has_surface_geometry()
        ):
            return
        self.vtk_view.set_opacity(v / 100.0)

    def _pick_dicom_series(self, series: list[DicomSeriesInfo]) -> Optional[DicomSeriesInfo]:
        if not series:
            return None
        if len(series) == 1:
            return series[0]

        dlg = QDialog(self)
        dlg.setWindowTitle("Choose DICOM series")
        layout = QVBoxLayout(dlg)
        layout.addWidget(QLabel("Multiple series were found. Select one to load:"))
        combo = QComboBox()
        for s in series:
            combo.addItem(
                f"[{s.modality or '??'}] {s.series_description or '(no description)'} — "
                f"{s.num_files} files — UID: "
                f"{(s.series_instance_uid[:22] + '…') if len(s.series_instance_uid) > 22 else s.series_instance_uid}"
            )
        layout.addWidget(combo)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        layout.addWidget(buttons)
        buttons.accepted.connect(dlg.accept)
        buttons.rejected.connect(dlg.reject)
        if dlg.exec() != QDialog.Accepted:
            return None
        return series[combo.currentIndex()]

    # ----------------------------
    # Loading
    # ----------------------------
    def open_dicom_folder(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "Select DICOM Folder")
        if not folder:
            return

        try:
            series = list_dicom_series(folder)
        except Exception as e:  # noqa: BLE001
            self._show_error("DICOM error", str(e))
            return

        if not series:
            self._show_error("No DICOM series", "No readable DICOM series found in that folder.")
            return

        selected = self._pick_dicom_series(series)
        if selected is None:
            return

        self._set_status("Loading DICOM series…")
        worker = Worker(load_dicom_series, folder, selected.series_instance_uid)
        worker.signals.result.connect(self._on_volume_loaded)
        worker.signals.error.connect(lambda s: self._show_error("Load error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def open_nifti(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Open NIfTI", filter="NIfTI (*.nii *.nii.gz)"
        )
        if not path:
            return
        self._set_status("Loading NIfTI…")
        worker = Worker(load_nifti, path)
        worker.signals.result.connect(self._on_volume_loaded)
        worker.signals.error.connect(lambda s: self._show_error("Load error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def open_xray(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Open X-ray image",
            filter="Images (*.png *.jpg *.jpeg *.tif *.tiff *.bmp)",
        )
        if not path:
            return
        self._set_status("Loading X-ray…")
        worker = Worker(load_xray_image, path)
        worker.signals.result.connect(self._on_xray_loaded)
        worker.signals.error.connect(lambda s: self._show_error("Load error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def _on_volume_loaded(self, vol: Volume) -> None:
        self._volume = vol
        self._xray = None
        self._preprocessed = vol.data_zyx
        self._mask = None
        self._mesh = None
        self._multi_mesh_models.clear()
        self._cardiac_pipeline = {}
        self.physician_review_cb.setChecked(False)
        self.clear_seeds()
        self._clear_structure_widgets()
        self.vtk_view.clear()

        self._set_volume_state()
        qa = analyze_volume_geometry(vol)
        self._last_static_extra = {
            "Shape(Z,Y,X)": vol.shape_zyx,
            "Spacing(Z,Y,X)mm": vol.spacing_zyx,
            "VolumeQA": qa,
        }
        self._render_metadata(vol.metadata, self._last_static_extra)
        self.slice_view.set_volume(vol.data_zyx, vol.spacing_zyx)
        if qa.get("warnings"):
            self._set_status("Volume loaded. QA warnings present — see Metadata JSON.")
        else:
            self._set_status("Volume loaded. Use preprocess/segmentation to reconstruct a mesh.")

    def _on_xray_loaded(self, xr: XRay2D) -> None:
        self._xray = xr
        self._volume = None
        self._preprocessed = None
        self._mask = None
        self._mesh = None
        self._multi_mesh_models.clear()
        self.clear_seeds()
        self._clear_structure_widgets()
        self.vtk_view.clear()

        self._set_xray_state()
        self._last_static_extra = {"Mode": "X-ray (2D) — estimated/illustrative pseudo-3D only"}
        self._render_metadata(xr.metadata, self._last_static_extra)
        self.slice_view.set_xray(xr.image_yx)
        self._set_status("X-ray loaded. You can create an estimated/illustrative surface mesh.")

    def _render_metadata(self, meta: dict, extra: Optional[dict] = None) -> None:
        d = dict(meta or {})
        if extra:
            d.update(extra)
        d["PhysicianReviewed"] = bool(self.physician_review_cb.isChecked())
        if self._cardiac_pipeline:
            d["CardiacPipeline"] = dict(self._cardiac_pipeline)
        self.meta_text.setPlainText(json.dumps(d, indent=2, sort_keys=True))

    # ----------------------------
    # Pipeline steps
    # ----------------------------
    def apply_preprocess(self) -> None:
        if self._volume is None:
            return
        p = PreprocessParams(
            clip_min=float(self.clip_min.value()),
            clip_max=float(self.clip_max.value()),
            normalize=(self.normalize.currentText() == "On"),
            median_denoise=(self.denoise.currentIndex() != 0),
            median_size=(3 if self.denoise.currentIndex() == 1 else 5),
        )
        self._set_status("Preprocessing…")
        worker = Worker(preprocess_volume, self._volume.data_zyx, p)
        worker.signals.result.connect(self._on_preprocessed)
        worker.signals.error.connect(lambda s: self._show_error("Preprocess error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def _on_preprocessed(self, arr: np.ndarray) -> None:
        self._preprocessed = arr
        if self._volume is not None:
            self.slice_view.set_volume(arr, self._volume.spacing_zyx)
        self._set_status("Preprocess applied.")

    def run_segmentation(self) -> None:
        if self._volume is None or self._preprocessed is None:
            return
        p = SegmentParams(
            threshold=float(self.threshold.value()) / 1000.0,
            keep_largest=(self.keep_largest.currentText() == "On"),
        )
        self._set_status("Segmenting…")
        worker = Worker(segment_threshold, self._preprocessed, p)
        worker.signals.result.connect(self._on_mask_ready)
        worker.signals.error.connect(lambda s: self._show_error("Segmentation error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def _on_mask_ready(self, mask: np.ndarray) -> None:
        self._mask = mask
        self.slice_view.set_mask(mask)
        self._set_status("Segmentation mask ready. You can extract a mesh.")

    def extract_mesh(self) -> None:
        if self._volume is not None:
            if self._mask is None:
                self._show_error("No mask", "Run segmentation first (or provide a mask) before mesh extraction.")
                return
            self._set_status("Extracting mesh…")
            mesh_label = (
                "LV blood pool (CT, heuristic)"
                if "LVBloodPool" in self._cardiac_pipeline
                else "Segmented structure"
            )
            worker = Worker(mask_to_mesh, self._mask, self._volume.spacing_zyx, mesh_label, False)
            self._wire_progress(worker, "Marching cubes")
            worker.signals.result.connect(self._on_mesh_ready_volume)
            worker.signals.error.connect(lambda s: self._show_error("Mesh error", s))
            worker.signals.finished.connect(lambda: self._set_status("Ready."))
            self.threadpool.start(worker)
            return

        if self._xray is not None:
            self._set_status("Building estimated/illustrative X-ray surface…")
            worker = Worker(xray_to_illustrative_surface, self._xray.image_yx)
            self._wire_progress(worker, "X-ray surface (estimated)")
            worker.signals.result.connect(self._on_mesh_ready_xray)
            worker.signals.error.connect(lambda s: self._show_error("Mesh error", s))
            worker.signals.finished.connect(lambda: self._set_status("Ready."))
            self.threadpool.start(worker)
            return

    def _on_mesh_ready_volume(self, mesh: MeshModel) -> None:
        self._mesh = mesh
        self._multi_mesh_models.clear()
        self._clear_structure_widgets()
        self._display_mesh(mesh, estimated=False)

    def _on_mesh_ready_xray(self, mesh: MeshModel) -> None:
        self._mesh = mesh
        self._multi_mesh_models.clear()
        self._clear_structure_widgets()
        self._display_mesh(mesh, estimated=True)

    def _display_mesh(self, mesh: MeshModel, estimated: bool) -> None:
        poly = meshmodel_to_pyvista(mesh)
        iters = int(self.smooth_iters.value())
        if iters > 0:
            poly = poly.smooth(n_iter=iters, relaxation_factor=0.01, feature_smoothing=False)
        dec = float(self.decimate.value()) / 100.0
        if dec > 0:
            poly = poly.decimate_pro(dec)
        opacity = self.opacity.value() / 100.0

        try:
            qc = analyze_surface_mesh(poly)
            self._cardiac_pipeline["MeshQC"] = qc
        except Exception as e:  # noqa: BLE001
            log.warning("Mesh QC failed: %s", e)
            self._cardiac_pipeline["MeshQC"] = {"warnings": [f"Mesh QC failed: {e}"]}

        self._cardiac_pipeline["MeshDisplay"] = {
            "profile": self.mesh_profile.currentText(),
            "smooth_iters": iters,
            "decimate_percent": int(round(dec * 100.0)),
            "opacity": float(opacity),
        }
        self._rerender_metadata_only()

        self.vtk_view.show_polydata(
            poly,
            label=(mesh.label + (" [ESTIMATED]" if estimated else "")),
            opacity=opacity,
            estimated=estimated,
        )
        self._set_status("Mesh displayed in 3D view.")

    def _wire_progress(self, worker: Worker, title: str) -> None:
        attach_worker_progress(worker, self, title)
        worker.bind_progress(lambda p, m, w=worker: w.signals.progress.emit(p, m))

    def _clear_structure_widgets(self) -> None:
        while self.struct_layout.count():
            item = self.struct_layout.takeAt(0)
            w = item.widget()
            if w is not None:
                w.deleteLater()
        self._structure_checks.clear()

    def _rebuild_structure_toggles(self, label_ids: list[int]) -> None:
        self._clear_structure_widgets()
        for lid in label_ids:
            cb = QCheckBox(f"Label {lid} visible")
            cb.setChecked(True)

            def _mk_handler(lbl: int):
                def _h(checked: bool) -> None:
                    self.vtk_view.set_label_visible(lbl, bool(checked))

                return _h

            cb.toggled.connect(_mk_handler(int(lid)))
            self.struct_layout.addWidget(cb)
            self._structure_checks[int(lid)] = cb

    def _on_volume_seed(self, z: int, y: int, x: int) -> None:
        if self._volume is None:
            return
        if len(self._seeds) >= 64:
            self._show_error("Seeds", "Maximum of 64 seeds supported in this MVP.")
            return
        self._seeds.append((int(z), int(y), int(x)))
        self._refresh_seeds_label()

    def _refresh_seeds_label(self) -> None:
        if not self._seeds:
            self.seeds_label.setText("Seeds: none")
            return
        tail = self._seeds[-3:]
        shown = ", ".join(str(t) for t in tail)
        extra = "" if len(self._seeds) <= 3 else f" (+{len(self._seeds)-3} more)"
        self.seeds_label.setText(f"Seeds ({len(self._seeds)}): {shown}{extra}")

    def clear_seeds(self) -> None:
        self._seeds.clear()
        self._refresh_seeds_label()

    def run_resample_isotropic(self) -> None:
        if self._volume is None:
            return
        mm = float(self.iso_mm.value())
        worker = Worker(resample_isotropic, self._volume, mm)
        self._wire_progress(worker, "Isotropic resampling")
        worker.signals.result.connect(self._on_volume_resampled)
        worker.signals.error.connect(lambda s: self._show_error("Resample error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def _on_volume_resampled(self, vol: Volume) -> None:
        self._volume = vol
        self._preprocessed = vol.data_zyx
        self._mask = None
        self._mesh = None
        self._multi_mesh_models.clear()
        self.vtk_view.clear()
        qa = analyze_volume_geometry(vol)
        self._last_static_extra = {
            "Shape(Z,Y,X)": vol.shape_zyx,
            "Spacing(Z,Y,X)mm": vol.spacing_zyx,
            "VolumeQA": qa,
        }
        self._render_metadata(vol.metadata, self._last_static_extra)
        self.slice_view.set_volume(vol.data_zyx, vol.spacing_zyx)
        self._set_status("Resample complete. QA warnings (if any) are in Metadata.")

    def run_region_grow(self) -> None:
        if self._volume is None or self._preprocessed is None:
            return
        if not self._seeds:
            self._show_error("Seeds", "Click slices to add at least one seed before region growing.")
            return
        tol = float(self.rg_tol.value())
        worker = Worker(region_grow_intensity_connected, self._preprocessed, list(self._seeds), tol)
        self._wire_progress(worker, "Region growing")
        worker.signals.result.connect(self._on_mask_ready)
        worker.signals.error.connect(lambda s: self._show_error("Region grow error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def build_multilabel_mask(self) -> None:
        if self._volume is None or self._preprocessed is None:
            return
        bands = [
            IntensityBand(
                lo=float(self.b1_lo.value()) / 1000.0,
                hi=float(self.b1_hi.value()) / 1000.0,
            ),
            IntensityBand(
                lo=float(self.b2_lo.value()) / 1000.0,
                hi=float(self.b2_hi.value()) / 1000.0,
            ),
        ]
        if bands[0].lo > bands[0].hi or bands[1].lo > bands[1].hi:
            self._show_error("Bands", "Each band requires low ≤ high.")
            return
        mask = segment_multi_band_exclusive(self._preprocessed, bands)
        if int(mask.max()) == 0:
            self._show_error("Multi-label", "No voxels matched the configured bands.")
            return
        self._mask = mask
        self.slice_view.set_mask(mask)
        self._set_status(f"Multi-label mask ready (labels 1..{int(mask.max())}).")

    def extract_multi_label_meshes(self) -> None:
        if self._volume is None or self._mask is None:
            self._show_error("Multi-label meshes", "Build a multi-label mask first.")
            return
        if int(self._mask.max()) < 2:
            self._show_error(
                "Multi-label meshes",
                "Need at least two distinct label ids (1 and 2). Use multi-label mask or adjust bands.",
            )
            return
        worker = Worker(meshes_from_label_volume, self._mask, self._volume.spacing_zyx, None)
        self._wire_progress(worker, "Multi-label mesh extraction")
        worker.signals.result.connect(self._on_multi_meshes_ready)
        worker.signals.error.connect(lambda s: self._show_error("Mesh error", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    def _on_multi_meshes_ready(self, meshes: dict[int, MeshModel]) -> None:
        self._multi_mesh_models = dict(meshes)
        self._mesh = None
        opacity = float(self.opacity.value()) / 100.0
        iters = int(self.smooth_iters.value())
        dec = float(self.decimate.value()) / 100.0

        surfaces: list[tuple[int, pv.PolyData, str, bool]] = []
        for lid, mesh in meshes.items():
            poly = meshmodel_to_pyvista(mesh)
            if iters > 0:
                poly = poly.smooth(n_iter=iters, relaxation_factor=0.01, feature_smoothing=False)
            if dec > 0:
                poly = poly.decimate_pro(dec)
            surfaces.append((int(lid), poly, mesh.label, False))

        self.vtk_view.show_label_surfaces(surfaces, opacity=opacity, title="Multi-structure (volumetric)")
        self._rebuild_structure_toggles(sorted(meshes.keys()))
        self.export_label_spin.setValue(int(sorted(meshes.keys())[0]))
        self._set_status("Multi-label meshes displayed. Toggle visibility per structure.")

    def run_ai_segmentation(self) -> None:
        if not ai_segmentation_enabled():
            QMessageBox.information(self, "AI segmentation", explain_ai_setup())
            return
        if self._volume is None:
            self._show_error("AI segmentation", "Load a volume first.")
            return
        worker = Worker(run_ai_segmentation_placeholder, self._volume)
        self._wire_progress(worker, "AI segmentation")
        worker.signals.error.connect(lambda s: QMessageBox.warning(self, "AI segmentation", s))
        worker.signals.finished.connect(lambda: self._set_status("Ready."))
        self.threadpool.start(worker)

    # ----------------------------
    # Export / utilities
    # ----------------------------
    def export_current_mesh(self) -> None:
        preview = self.vtk_view.poly_for_export(self.export_label_spin.value())
        if preview is None and self._mesh is None:
            self._show_error("No mesh", "No mesh available to export.")
            return
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Export mesh",
            filter=(
                "STL (*.stl);;OBJ (*.obj);;PLY (*.ply);;VTK (*.vtk);;VTU (*.vtu);;"
                "glTF Binary (*.glb);;glTF JSON (*.gltf)"
            ),
        )
        if not path:
            return
        try:
            poly = self.vtk_view.poly_for_export(self.export_label_spin.value())
            if poly is not None:
                export_polydata(poly, path)
            elif self._mesh is not None:
                export_mesh(self._mesh, path)
            else:
                self._show_error("Export", "No mesh geometry available to export.")
                return
        except Exception as e:  # noqa: BLE001
            self._show_error("Export error", str(e))
            return
        self._set_status(f"Exported mesh to: {path}")

    def export_segmentation_mask(self) -> None:
        if self._volume is None or self._mask is None:
            self._show_error(
                "No mask",
                "Load a volume, run segmentation, then export the mask as NIfTI.",
            )
            return
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Export segmentation mask",
            filter="NIfTI (*.nii.gz *.nii)",
        )
        if not path:
            return
        try:
            export_mask_nifti(self._volume, self._mask, path)
        except Exception as e:  # noqa: BLE001
            self._show_error("Mask export error", str(e))
            return
        self._set_status(f"Exported mask to: {path}")

    def save_3d_screenshot(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Save 3D screenshot",
            filter="PNG (*.png);;JPEG (*.jpg *.jpeg)",
        )
        if not path:
            return
        try:
            self.vtk_view.save_screenshot(path)
        except Exception as e:  # noqa: BLE001
            self._show_error("Screenshot error", str(e))
            return
        self._set_status(f"Saved screenshot: {path}")

    def save_session_json(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Save session JSON", filter="JSON (*.json)")
        if not path:
            return
        session = {
            "disclaimer": DISCLAIMER,
            "PhysicianReviewed": bool(self.physician_review_cb.isChecked()),
            "CardiacPipeline": dict(self._cardiac_pipeline),
            "volume_loaded": self._volume is not None,
            "xray_loaded": self._xray is not None,
            "volume": {
                "source": self._volume.source_label,
                "shape_zyx": self._volume.shape_zyx,
                "spacing_zyx": self._volume.spacing_zyx,
                "origin_xyz": self._volume.origin_xyz,
                "direction_3x3_rowmajor": self._volume.direction_3x3_rowmajor,
                "metadata": self._volume.metadata,
            }
            if self._volume is not None
            else None,
            "xray": {
                "source": self._xray.source_label,
                "metadata": self._xray.metadata,
            }
            if self._xray is not None
            else None,
            "mesh": {
                "label": self._mesh.label,
                "estimated": self._mesh.estimated,
                "num_vertices": int(self._mesh.vertices_xyz.shape[0]),
                "num_faces": int(self._mesh.faces.shape[0]),
                "metadata": self._mesh.metadata,
            }
            if self._mesh is not None
            else None,
        }
        Path(path).write_text(json.dumps(session, indent=2), encoding="utf-8")
        self._set_status(f"Saved session metadata: {path}")

    def clear_scene(self) -> None:
        self._mesh = None
        self._multi_mesh_models.clear()
        self._clear_structure_widgets()
        self.vtk_view.clear()
        self._set_status("Scene cleared.")

