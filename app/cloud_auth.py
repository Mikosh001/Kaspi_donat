from __future__ import annotations

import json
import socket
from datetime import datetime
from pathlib import Path

import requests

from app.config import CONNECT_API_URL, DEVICE_AUTH_PATH, SITE_API_URL
from app.db import normalize_streamer_id


def _derive_ingest_url(connect_url: str) -> str:
    value = (connect_url or "").strip().rstrip("/")
    if value.endswith("/cloud/claim-device"):
        return f"{value[:-len('/cloud/claim-device')]}/cloud/ingest"
    if value.endswith("/claim-device"):
        return f"{value[:-len('/claim-device')]}/ingest"
    return SITE_API_URL.strip()


class DeviceAuthStore:
    def __init__(self, path: Path | None = None):
        self.path = path or DEVICE_AUTH_PATH

    def load(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            raw = self.path.read_text(encoding="utf-8").strip()
            if not raw:
                return {}
            payload = json.loads(raw)
            return payload if isinstance(payload, dict) else {}
        except (json.JSONDecodeError, OSError):
            return {}

    def save(self, payload: dict) -> dict:
        data = payload if isinstance(payload, dict) else {}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return data

    def clear(self):
        if self.path.exists():
            self.path.unlink(missing_ok=True)


class CloudConnectClient:
    def __init__(self, connect_url: str | None = None):
        self.connect_url = (connect_url or CONNECT_API_URL or "").strip()

    def can_connect(self) -> bool:
        return bool(self.connect_url)

    def claim_device(self, connect_code: str, device_id: str, device_name: str = "") -> dict:
        code = str(connect_code or "").strip().upper()
        if not code:
            raise ValueError("connect code required")
        safe_device_id = str(device_id or "").strip()
        if not safe_device_id:
            raise ValueError("device_id required")
        if not self.connect_url:
            raise ValueError("KAZ_ALERTS_CONNECT_URL орнатылмаған")

        payload = {
            "code": code,
            "device_id": safe_device_id,
            "device_name": str(device_name or "").strip() or socket.gethostname(),
        }

        response = requests.post(
            self.connect_url,
            json=payload,
            timeout=12,
        )
        response.raise_for_status()
        data = response.json() if response.content else {}

        streamer_id = normalize_streamer_id(data.get("streamer_id") or "")
        token = str(data.get("token") or "").strip()
        if not streamer_id or not token:
            raise ValueError("claim-device response ішінде streamer_id/token жоқ")

        ingest_url = str(data.get("ingest_url") or "").strip() or _derive_ingest_url(self.connect_url)

        return {
            "streamer_id": streamer_id,
            "token": token,
            "connect_url": self.connect_url,
            "ingest_url": ingest_url,
            "device_id": safe_device_id,
            "device_name": payload["device_name"],
            "updated_at": datetime.now().isoformat(),
        }
