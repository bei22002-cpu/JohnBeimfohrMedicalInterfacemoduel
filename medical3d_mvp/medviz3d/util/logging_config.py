from __future__ import annotations

import logging
import logging.handlers
import os
from pathlib import Path


def configure_logging() -> None:
    log_dir = Path(os.environ.get("MEDVIZ3D_LOG_DIR", Path.cwd() / "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "medviz3d.log"

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=5_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    file_handler.setLevel(logging.INFO)

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    console.setLevel(logging.INFO)

    root.handlers.clear()
    root.addHandler(file_handler)
    root.addHandler(console)

