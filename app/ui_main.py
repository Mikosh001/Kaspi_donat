from __future__ import annotations

import webbrowser

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from app.config import APP_NAME, WEB_HOST, WEB_PORT
from app.device_identity import get_device_id
from app.db import get_recent_history, init_db, normalize_streamer_id
from app.service import DonationService
from app.web_server import ensure_web_server


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(920, 760)
        self.device_id = get_device_id()
        self.service = DonationService(
            streamer_id_getter=self.get_streamer_id,
            log_callback=self.threadsafe_log,
            event_callback=self.on_donation,
            device_id_getter=self.get_device_id,
        )
        self._pending_logs = []
        self._pending_events = []
        self.build_ui()
        self.load_history()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.flush_ui_queue)
        self.timer.start(250)

    def build_ui(self):
        root = QVBoxLayout(self)

        title = QLabel("Kaz Alerts — Kaspi Donat Reader")
        title.setStyleSheet("font-size: 22px; font-weight: 700; color: #e53935;")
        root.addWidget(title)

        subtitle = QLabel(
            "Phone Link / Связь с телефоном терезесінен тек Kaspi уведомлениялары өтеді"
        )
        subtitle.setStyleSheet("color: #444; font-size: 13px;")
        root.addWidget(subtitle)

        web_info = QLabel(
            f"Overlay site: http://{WEB_HOST}:{WEB_PORT}  |  Alert: /widget  |  Top: /stats?board=top_day  |  Goal: /goal"
        )
        web_info.setStyleSheet("color: #0d47a1; font-size: 12px; font-weight: 700;")
        root.addWidget(web_info)

        self.streamer_web_info = QLabel()
        self.streamer_web_info.setStyleSheet("color: #2e7d32; font-size: 12px; font-weight: 700;")
        root.addWidget(self.streamer_web_info)

        device_info = QLabel(f"Device ID: {self.device_id}")
        device_info.setStyleSheet("color: #666; font-size: 12px;")
        root.addWidget(device_info)

        row = QHBoxLayout()
        row.addWidget(QLabel("Streamer ID:"))
        self.id_input = QLineEdit()
        self.id_input.setPlaceholderText("Мысалы: 2546")
        row.addWidget(self.id_input)

        self.start_btn = QPushButton("Бастау")
        self.start_btn.clicked.connect(self.toggle_service)
        row.addWidget(self.start_btn)

        clear_btn = QPushButton("Логты тазарту")
        clear_btn.clicked.connect(self.clear_log)
        row.addWidget(clear_btn)
        root.addLayout(row)

        links_row = QHBoxLayout()
        self.open_admin_btn = QPushButton("Admin ашу")
        self.open_admin_btn.clicked.connect(lambda: self.open_scoped_page("/"))
        links_row.addWidget(self.open_admin_btn)

        self.open_widget_btn = QPushButton("Widget ашу")
        self.open_widget_btn.clicked.connect(lambda: self.open_scoped_page("/widget"))
        links_row.addWidget(self.open_widget_btn)

        self.open_stats_btn = QPushButton("Top day ашу")
        self.open_stats_btn.clicked.connect(lambda: self.open_scoped_page("/stats?board=top_day"))
        links_row.addWidget(self.open_stats_btn)
        root.addLayout(links_row)

        self.id_input.textChanged.connect(self.refresh_scoped_links)
        self.refresh_scoped_links()

        self.status_label = QLabel("Статус: тоқтап тұр")
        self.status_label.setStyleSheet("font-weight: 700; color: gray;")
        root.addWidget(self.status_label)

        self.filter_label = QLabel("Kaspi filter: 0 қаралды / 0 қабылданды / 0 өткізілді")
        self.filter_label.setStyleSheet("color: #555; font-size: 12px;")
        root.addWidget(self.filter_label)

        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["ID", "Аты", "Сумма", "Хабарлама", "Confidence"])
        self.table.horizontalHeader().setStretchLastSection(True)
        root.addWidget(self.table)

        self.log_box = QTextEdit()
        self.log_box.setReadOnly(True)
        root.addWidget(self.log_box)

    def get_streamer_id(self):
        return self.id_input.text().strip()

    def get_scoped_streamer_id(self):
        return normalize_streamer_id(self.get_streamer_id())

    def get_device_id(self):
        return self.device_id

    def build_scoped_url(self, path: str = "/") -> str:
        base = f"http://{WEB_HOST}:{WEB_PORT}"
        scoped_streamer_id = self.get_scoped_streamer_id()
        if not scoped_streamer_id:
            return f"{base}{path}"
        return f"{base}/s/{scoped_streamer_id}{path}"

    def refresh_scoped_links(self):
        scoped_streamer_id = self.get_scoped_streamer_id()
        if not scoped_streamer_id:
            self.streamer_web_info.setText(
                "Streamer web: Streamer ID енгізсеңіз, /s/<id>/ режиміне сілтемелер шығады"
            )
            return

        admin_url = self.build_scoped_url("/")
        widget_url = self.build_scoped_url("/widget")
        self.streamer_web_info.setText(
            f"Streamer web ({scoped_streamer_id}): Admin {admin_url} | Widget {widget_url}"
        )

    def open_scoped_page(self, path: str):
        webbrowser.open(self.build_scoped_url(path), new=2)

    def clear_log(self):
        self.log_box.clear()

    def toggle_service(self):
        if not self.service.running:
            if not self.get_streamer_id():
                QMessageBox.warning(self, "Ескерту", "Алдымен Streamer ID енгіз")
                return
            self.service.start()
            self.status_label.setText("Статус: тыңдап тұр")
            self.status_label.setStyleSheet("font-weight: 700; color: green;")
            self.start_btn.setText("Тоқтату")
        else:
            self.service.stop()
            self.status_label.setText("Статус: тоқтатылды")
            self.status_label.setStyleSheet("font-weight: 700; color: gray;")
            self.start_btn.setText("Бастау")

    def threadsafe_log(self, text: str):
        self._pending_logs.append(text)

    def on_donation(self, item: dict):
        self._pending_events.append(item)

    def flush_ui_queue(self):
        while self._pending_logs:
            text = self._pending_logs.pop(0)
            self.log_box.append(text)

        while self._pending_events:
            item = self._pending_events.pop(0)
            self.insert_row(item)

        stats = self.service.get_stats()
        self.filter_label.setText(
            f"Kaspi filter: {stats['scanned']} қаралды / "
            f"{stats['accepted']} қабылданды / "
            f"{stats['filtered']} өткізілді"
        )

    def insert_row(self, item: dict):
        row = 0
        self.table.insertRow(row)
        self.table.setItem(row, 0, QTableWidgetItem(str(item.get("id", ""))))
        self.table.setItem(row, 1, QTableWidgetItem(item.get("donor_name", "")))
        self.table.setItem(row, 2, QTableWidgetItem(f"{item.get('amount', 0)} ₸"))
        self.table.setItem(row, 3, QTableWidgetItem(item.get("message", "")))
        self.table.setItem(row, 4, QTableWidgetItem(str(item.get("confidence", 0.0))))

    def load_history(self):
        rows = get_recent_history(50)
        for row in reversed(rows):
            self.insert_row(
                {
                    "id": row.id,
                    "donor_name": row.donor_name,
                    "amount": row.amount,
                    "message": row.message,
                    "confidence": row.confidence,
                }
            )


def main():
    init_db()
    app = QApplication([])
    web_server_error = None
    try:
        ensure_web_server()
    except Exception as exc:
        web_server_error = str(exc)
    win = MainWindow()
    win.show()
    if web_server_error:
        QMessageBox.warning(
            win,
            "Web server",
            f"Overlay site іске қосылмады:\n{web_server_error}",
        )
    app.exec()
