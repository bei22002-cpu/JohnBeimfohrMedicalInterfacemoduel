import sys

from PySide6.QtWidgets import QApplication

from medviz3d.util.logging_config import configure_logging
from medviz3d.ui.main_window import MainWindow


def main() -> int:
    configure_logging()

    app = QApplication(sys.argv)
    app.setApplicationName("MedViz3D MVP")
    app.setOrganizationName("Local")

    w = MainWindow()
    w.show()
    return app.exec()

