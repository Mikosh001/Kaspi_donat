from __future__ import annotations

import requests

from app.config import SITE_API_KEY, SITE_API_URL
from app.firebase_direct import FirebaseDirectPublisher
from app.models import PublishPayload


class Publisher:
    def __init__(self, log_callback=None):
        self.log_callback = log_callback
        self.firebase_direct = FirebaseDirectPublisher(log_callback=self.log)

    def log(self, text: str):
        if self.log_callback:
            self.log_callback(text)

    def can_publish(self, api_url: str | None = None) -> bool:
        target = (api_url or SITE_API_URL or "").strip()
        return bool(target) or self.firebase_direct.is_configured()

    def publish(
        self,
        streamer_id: str,
        parsed,
        device_id: str | None = None,
        streamer_token: str | None = None,
        api_url: str | None = None,
    ):
        target_api_url = (api_url or SITE_API_URL or "").strip()

        if self.firebase_direct.is_configured():
            try:
                self.firebase_direct.publish(
                    streamer_id=streamer_id,
                    parsed=parsed,
                    device_id=device_id,
                )
                return True
            except Exception as exc:
                self.log(f"[firebase] publish error: {exc}")
                if not target_api_url:
                    raise

        if not target_api_url:
            self.log("[publisher] API URL орнатылмаған, тек локальды сақталды")
            return True

        payload = PublishPayload(
            streamer_id=streamer_id,
            donor_name=parsed.donor_name or "Аноним",
            amount=parsed.amount or 0,
            message=parsed.message or "Хабарлама жоқ",
            raw_text=parsed.raw_text,
            received_at=parsed.received_at.isoformat(),
            confidence=parsed.confidence,
            device_id=(device_id or "").strip() or None,
        )

        headers = {}
        if SITE_API_KEY:
            headers["Authorization"] = f"Bearer {SITE_API_KEY}"
            headers["X-Streamer-Token"] = SITE_API_KEY
        if streamer_token:
            headers["X-Streamer-Token"] = streamer_token
        if device_id:
            headers["X-Device-ID"] = device_id

        response = requests.post(
            target_api_url,
            json=payload.model_dump(),
            headers=headers,
            timeout=8,
        )
        response.raise_for_status()
        self.log("[publisher] сайтқа жіберілді")
        return True
