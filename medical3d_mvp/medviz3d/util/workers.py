from __future__ import annotations

import inspect
import threading
from typing import Any, Callable, Generic, Optional, TypeVar

from PySide6.QtCore import QObject, QRunnable, Signal, Slot

from medviz3d.util.cancel import UserCancelled

T = TypeVar("T")


class WorkerSignals(QObject):
    started = Signal()
    finished = Signal()
    error = Signal(str)
    progress = Signal(int, str)  # percent, message
    result = Signal(object)


class Worker(QRunnable, Generic[T]):
    def __init__(
        self,
        fn: Callable[..., T],
        *args: Any,
        progress_cb: Optional[Callable[[int, str], None]] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__()
        self.fn = fn
        self.args = args
        self.kwargs = kwargs
        self.signals = WorkerSignals()
        self._progress_cb = progress_cb
        self._cancel_event = threading.Event()

    def bind_progress(self, cb: Optional[Callable[[int, str], None]]) -> None:
        """Attach a progress callback after construction (e.g. bridge to WorkerSignals)."""
        self._progress_cb = cb

    def request_cancel(self) -> None:
        """Request cooperative cancellation (see KNOWN_ISSUES.md)."""
        self._cancel_event.set()

    @Slot()
    def run(self) -> None:
        self.signals.started.emit()
        self._cancel_event.clear()
        try:
            kwargs = dict(self.kwargs)
            sig = inspect.signature(self.fn)
            param_names = set(sig.parameters.keys())

            if self._progress_cb is not None and "progress_cb" in param_names:
                kwargs["progress_cb"] = self._progress_cb
            if "cancel_event" in param_names:
                kwargs["cancel_event"] = self._cancel_event

            result = self.fn(*self.args, **kwargs)
            self.signals.result.emit(result)
        except UserCancelled:
            # Intentionally silent: user chose cancel.
            pass
        except Exception as e:  # noqa: BLE001
            self.signals.error.emit(str(e))
        finally:
            self.signals.finished.emit()
