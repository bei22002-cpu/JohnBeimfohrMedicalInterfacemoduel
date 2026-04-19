from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QProgressDialog, QWidget

from medviz3d.util.workers import Worker


def attach_worker_progress(worker: Worker, parent: QWidget, title: str) -> QProgressDialog:
    """
    Show a modal progress dialog driven by `WorkerSignals.progress` (percent, message).

    Cancel requests cooperative cancellation for callables that accept `cancel_event`
    (see `medviz3d.util.workers.Worker` and KNOWN_ISSUES.md).
    """
    dlg = QProgressDialog(parent)
    dlg.setWindowTitle(title)
    dlg.setLabelText("Starting…")
    dlg.setRange(0, 100)
    dlg.setWindowModality(Qt.WindowModal)
    dlg.setMinimumDuration(250)
    dlg.setAutoClose(True)
    dlg.setAutoReset(True)

    def on_progress(pct: int, msg: str) -> None:
        dlg.setValue(int(max(0, min(100, pct))))
        dlg.setLabelText(msg)

    worker.signals.progress.connect(on_progress)
    worker.signals.finished.connect(dlg.reset)
    worker.signals.error.connect(dlg.reset)
    worker.signals.started.connect(dlg.show)
    dlg.canceled.connect(worker.request_cancel)
    return dlg
