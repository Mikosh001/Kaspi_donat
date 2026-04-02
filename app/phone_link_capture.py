from __future__ import annotations

from app.notification_listener import collect_candidate_texts, get_phone_link_window


class PhoneLinkCapture:
    def __init__(self, log_callback=None):
        self.log_callback = log_callback

    def log(self, text: str):
        if self.log_callback:
            self.log_callback(text)

    def read_text_blocks(self) -> list[str]:
        window = get_phone_link_window()
        if not window:
            return []
        try:
            return collect_candidate_texts(window)
        except Exception as e:
            self.log(f"[capture] оқу қатесі: {e}")
            return []
