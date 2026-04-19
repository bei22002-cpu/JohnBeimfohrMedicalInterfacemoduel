from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np
import pydicom
import SimpleITK as sitk

from medviz3d.core.types import Volume

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DicomSeriesInfo:
    series_instance_uid: str
    series_description: str
    modality: str
    num_files: int
    example_file: str


def _safe_str(v: Any) -> str:
    try:
        return str(v) if v is not None else ""
    except Exception:  # noqa: BLE001
        return ""


def list_dicom_series(folder: str | Path) -> list[DicomSeriesInfo]:
    folder = Path(folder)
    if not folder.exists():
        raise FileNotFoundError(f"DICOM folder not found: {folder}")

    series_ids = sitk.ImageSeriesReader.GetGDCMSeriesIDs(str(folder))
    if not series_ids:
        return []

    infos: list[DicomSeriesInfo] = []
    for sid in series_ids:
        files = sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(folder), sid)
        series_desc = ""
        modality = ""
        example = files[0] if files else ""
        if example:
            try:
                ds = pydicom.dcmread(example, stop_before_pixels=True, force=True)
                series_desc = _safe_str(getattr(ds, "SeriesDescription", "")) or ""
                modality = _safe_str(getattr(ds, "Modality", "")) or ""
            except Exception as e:  # noqa: BLE001
                log.warning("Failed reading DICOM header %s: %s", example, e)
        infos.append(
            DicomSeriesInfo(
                series_instance_uid=sid,
                series_description=series_desc,
                modality=modality,
                num_files=len(files),
                example_file=example,
            )
        )

    infos.sort(key=lambda x: (x.modality, x.series_description, -x.num_files))
    return infos


def load_dicom_series(
    folder: str | Path,
    series_instance_uid: str,
    progress_cb: Optional[Callable[[int, str], None]] = None,
) -> Volume:
    folder = Path(folder)
    files = sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(folder), series_instance_uid)
    if not files:
        raise ValueError("Selected series has no readable files.")

    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(files)
    reader.MetaDataDictionaryArrayUpdateOn()
    reader.LoadPrivateTagsOn()

    if progress_cb is not None:
        progress_cb(5, f"Reading {len(files)} slices…")

    img = reader.Execute()

    spacing_xyz = img.GetSpacing()
    origin_xyz = img.GetOrigin()
    direction = img.GetDirection()

    arr_zyx = sitk.GetArrayFromImage(img).astype(np.float32, copy=False)
    modality = "UNKNOWN"
    meta: dict[str, Any] = {}

    # Best-effort: pull a few useful fields from the first file.
    try:
        ds0 = pydicom.dcmread(files[0], stop_before_pixels=True, force=True)
        modality = _safe_str(getattr(ds0, "Modality", "")) or "UNKNOWN"
        meta = {
            "Modality": modality,
            "SeriesDescription": _safe_str(getattr(ds0, "SeriesDescription", "")),
            "SeriesInstanceUID": _safe_str(getattr(ds0, "SeriesInstanceUID", "")),
            "StudyInstanceUID": _safe_str(getattr(ds0, "StudyInstanceUID", "")),
            "PatientID": _safe_str(getattr(ds0, "PatientID", "")),
            "PatientSex": _safe_str(getattr(ds0, "PatientSex", "")),
            "PatientAge": _safe_str(getattr(ds0, "PatientAge", "")),
            "StudyDate": _safe_str(getattr(ds0, "StudyDate", "")),
        }
    except Exception as e:  # noqa: BLE001
        log.warning("Failed extracting DICOM metadata: %s", e)

    # SimpleITK spacing is (X,Y,Z). Our array is (Z,Y,X).
    spacing_zyx = (float(spacing_xyz[2]), float(spacing_xyz[1]), float(spacing_xyz[0]))

    if progress_cb is not None:
        progress_cb(95, "Volume ready.")

    return Volume(
        data_zyx=arr_zyx,
        spacing_zyx=spacing_zyx,
        origin_xyz=(float(origin_xyz[0]), float(origin_xyz[1]), float(origin_xyz[2])),
        direction_3x3_rowmajor=tuple(float(x) for x in direction),
        modality="CT" if modality == "CT" else ("MR" if modality == "MR" else "UNKNOWN"),
        metadata=meta,
        source_label=str(folder),
    )

