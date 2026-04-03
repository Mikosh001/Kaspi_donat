from __future__ import annotations

import socket
import webbrowser

from PySide6.QtCore import QSettings, QTimer
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

from app.cloud_auth import CloudConnectClient, DeviceAuthStore
from app.config import (
    APP_NAME,
    AUTO_START_LISTENER,
    CONNECT_API_URL,
    DEFAULT_STREAMER_ID,
    FIREBASE_AUTH_EMAIL,
    FIREBASE_DIRECT_ENABLED,
    FIREBASE_PROJECT_ID,
    SITE_API_URL,
    WEB_HOST,
    WEB_PORT,
)
from app.device_identity import get_device_id
from app.db import get_recent_history, init_db, normalize_streamer_id
from app.service import DonationService
from app.web_server import ensure_web_server


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(920, 760)
        self.local_settings = QSettings("KazAlerts", "DesktopApp")
        self.device_id = get_device_id()
        self.device_auth_store = DeviceAuthStore()
        self.device_auth = self.device_auth_store.load()
        self.cloud_connect_client = CloudConnectClient()
        self.firebase_direct_mode = bool(FIREBASE_DIRECT_ENABLED)
        self.service = DonationService(
            streamer_id_getter=self.get_streamer_id,
            log_callback=self.threadsafe_log,
            event_callback=self.on_donation,
            device_id_getter=self.get_device_id,
            streamer_token_getter=self.get_streamer_token,
            api_url_getter=self.get_publish_api_url,
        )
        self._pending_logs = []
        self._pending_events = []
        self.build_ui()
        self.load_history()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.flush_ui_queue)
        self.timer.start(250)

        if AUTO_START_LISTENER and self.get_scoped_streamer_id():
            QTimer.singleShot(350, self.toggle_service)

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

        cloud_info = QLabel(
            (
                f"Firebase direct mode: {FIREBASE_PROJECT_ID or '(project id жоқ)'}"
                if self.firebase_direct_mode
                else f"Cloud connect URL: {CONNECT_API_URL or '(орнатылмаған)'}"
            )
        )
        cloud_info.setStyleSheet("color: #455a64; font-size: 11px;")
        root.addWidget(cloud_info)

        cloud_row = QHBoxLayout()
        cloud_row.addWidget(QLabel("One-time code:"))
        self.cloud_code_input = QLineEdit()
        self.cloud_code_input.setPlaceholderText("Мысалы: AB12CD34")
        cloud_row.addWidget(self.cloud_code_input)

        self.cloud_connect_btn = QPushButton("Cloud-қа қосу")
        self.cloud_connect_btn.clicked.connect(self.connect_cloud_device)
        cloud_row.addWidget(self.cloud_connect_btn)

        self.cloud_disconnect_btn = QPushButton("Cloud ажырату")
        self.cloud_disconnect_btn.clicked.connect(self.disconnect_cloud_device)
        cloud_row.addWidget(self.cloud_disconnect_btn)
        root.addLayout(cloud_row)

        if self.firebase_direct_mode:
            self.cloud_code_input.setEnabled(False)
            self.cloud_code_input.setPlaceholderText("Firebase direct mode active")
            self.cloud_connect_btn.setEnabled(False)
            self.cloud_disconnect_btn.setEnabled(False)

        self.cloud_status_label = QLabel()
        self.cloud_status_label.setStyleSheet("color: #37474f; font-size: 12px; font-weight: 600;")
        root.addWidget(self.cloud_status_label)

        row = QHBoxLayout()
        row.addWidget(QLabel("Streamer ID:"))
        self.id_input = QLineEdit()
        self.id_input.setPlaceholderText("Мысалы: 2546")
        saved_streamer_id = str(self.local_settings.value("streamer_id", "", type=str) or "").strip()
        linked_streamer_id = normalize_streamer_id(self.device_auth.get("streamer_id") or "")
        initial_streamer_id = DEFAULT_STREAMER_ID or linked_streamer_id or saved_streamer_id
        if initial_streamer_id:
            self.id_input.setText(initial_streamer_id)
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

        self.id_input.textChanged.connect(self.on_streamer_id_changed)
        self.refresh_cloud_status()
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

    def get_streamer_token(self):
        return str(self.device_auth.get("token") or "").strip()

    def get_publish_api_url(self):
        from_cloud = str(self.device_auth.get("ingest_url") or "").strip()
        return from_cloud or SITE_API_URL

    def on_streamer_id_changed(self, _text=""):
        self.local_settings.setValue("streamer_id", self.get_streamer_id())
        self.refresh_cloud_status()
        self.refresh_scoped_links()

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

    def refresh_cloud_status(self):
        if self.firebase_direct_mode:
            scoped_streamer_id = self.get_scoped_streamer_id() or "(streamer id қажет)"
            self.cloud_status_label.setText(
                "Firebase direct: "
                f"project={FIREBASE_PROJECT_ID or '(missing)'} | "
                f"email={FIREBASE_AUTH_EMAIL or '(missing)'} | "
                f"scope={scoped_streamer_id}"
            )
            return

        linked_streamer_id = normalize_streamer_id(self.device_auth.get("streamer_id") or "")
        has_token = bool(str(self.device_auth.get("token") or "").strip())
        ingest_url = str(self.device_auth.get("ingest_url") or "").strip()
        if not linked_streamer_id or not has_token:
            self.cloud_status_label.setText(
                "Cloud: қосылмаған. One-time code енгізіп Cloud-қа қосыңыз."
            )
            return

        scope_status = "OK" if linked_streamer_id == self.get_scoped_streamer_id() else "Streamer ID сәйкес емес"
        self.cloud_status_label.setText(
            f"Cloud: {linked_streamer_id} | token: бар | ingest: {ingest_url or '(env)'} | {scope_status}"
        )

    def connect_cloud_device(self):
        if self.firebase_direct_mode:
            QMessageBox.warning(
                self,
                "Cloud connect",
                "Firebase direct mode қосулы. One-time code бұл режимде қолданылмайды.",
            )
            return

        if not self.cloud_connect_client.can_connect():
            QMessageBox.warning(
                self,
                "Cloud connect",
                "KAZ_ALERTS_CONNECT_URL орнатылмаған. local.env.bat ішінде connect URL жазыңыз.",
            )
            return

        code = self.cloud_code_input.text().strip().upper()
        if not code:
            QMessageBox.warning(self, "Cloud connect", "Алдымен one-time code енгізіңіз")
            return

        try:
            payload = self.cloud_connect_client.claim_device(
                connect_code=code,
                device_id=self.device_id,
                device_name=socket.gethostname(),
            )
        except Exception as exc:
            QMessageBox.warning(self, "Cloud connect", f"Қосылу қатесі: {exc}")
            return

        self.device_auth = self.device_auth_store.save(payload)
        self.id_input.setText(payload.get("streamer_id", ""))
        self.cloud_code_input.clear()
        self.refresh_cloud_status()
        self.log_box.append("[cloud] құрылғы Cloud профиліне сәтті байланыстырылды")

    def disconnect_cloud_device(self):
        if self.firebase_direct_mode:
            QMessageBox.warning(
                self,
                "Cloud connect",
                "Firebase direct mode қосулы. Локальды one-time code сессиясы қолданылмайды.",
            )
            return

        self.device_auth_store.clear()
        self.device_auth = {}
        self.refresh_cloud_status()
        self.log_box.append("[cloud] локальды cloud-auth дерегі өшірілді")

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
        rows = get_recent_history(50, streamer_id=self.get_scoped_streamer_id() or None)
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
