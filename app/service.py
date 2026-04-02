from __future__ import annotations

import threading
import time

from app.config import MIN_CONFIDENCE_TO_SAVE, POLL_INTERVAL_SECONDS
from app.db import (
    exists_compound_duplicate,
    exists_signature,
    mark_publish_error,
    mark_published,
    save_donation,
)
from app.dedupe import RecentDedupe, build_compound_signature
from app.parser import parse_donation
from app.phone_link_capture import PhoneLinkCapture
from app.publisher import Publisher


class DonationService:
    def __init__(self, streamer_id_getter, log_callback, event_callback, device_id_getter=None):
        self.streamer_id_getter = streamer_id_getter
        self.device_id_getter = device_id_getter or (lambda: "")
        self.log_callback = log_callback
        self.event_callback = event_callback
        self.capture = PhoneLinkCapture(log_callback=self.log)
        self.publisher = Publisher(log_callback=self.log)
        self.dedupe = RecentDedupe()
        self.running = False
        self.thread = None
        self.scanned_blocks = 0
        self.accepted_blocks = 0
        self.filtered_blocks = 0
        self.last_raw_text = ""
        self._debug_filtered_logged = set()

    def log(self, text: str):
        if self.log_callback:
            self.log_callback(text)

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        self.log("[service] тыңдау басталды")

    def stop(self):
        self.running = False
        self.log("[service] тыңдау тоқтатылды")

    def get_stats(self):
        return {
            "scanned": self.scanned_blocks,
            "accepted": self.accepted_blocks,
            "filtered": self.filtered_blocks,
        }

    def _log_filtered_preview(self, text: str):
        preview = " | ".join(line.strip() for line in text.splitlines() if line.strip())
        preview = preview[:180]
        if not preview or preview in self._debug_filtered_logged:
            return
        if len(self._debug_filtered_logged) >= 12:
            return
        self._debug_filtered_logged.add(preview)
        self.log(f"[filter] skipped: {preview}")

    def _loop(self):
        while self.running:
            blocks = self.capture.read_text_blocks()
            if blocks:
                for block in blocks:
                    self.scanned_blocks += 1
                    accepted = self._handle_text_block(block)
                    if accepted:
                        self.accepted_blocks += 1
                    else:
                        self.filtered_blocks += 1
            time.sleep(POLL_INTERVAL_SECONDS)

    def _handle_text_block(self, text: str):
        streamer_id = (self.streamer_id_getter() or "").strip()
        device_id = (self.device_id_getter() or "").strip()

        parsed = parse_donation(text)
        if not parsed:
            self._log_filtered_preview(text)
            return False

        if parsed.confidence < MIN_CONFIDENCE_TO_SAVE or parsed.status != "ready":
            self._log_filtered_preview(parsed.raw_text)
            return False

        compound_signature = build_compound_signature(
            parsed.donor_name,
            parsed.amount,
            parsed.raw_text,
        )

        if self.dedupe.seen(parsed.raw_signature):
            return False

        if compound_signature and self.dedupe.seen(compound_signature):
            return False

        if exists_signature(parsed.raw_signature, streamer_id=streamer_id):
            self.dedupe.add(parsed.raw_signature)
            return False

        if compound_signature and exists_compound_duplicate(
            parsed.donor_name,
            parsed.amount,
            parsed.raw_text,
            streamer_id=streamer_id,
        ):
            self.dedupe.add(compound_signature)
            return False

        self.dedupe.add(parsed.raw_signature)
        if compound_signature:
            self.dedupe.add(compound_signature)
        self.last_raw_text = parsed.raw_text
        row = save_donation(parsed, streamer_id=streamer_id, device_id=device_id)

        donor = parsed.donor_name or "Аноним"
        amount = parsed.amount or 0
        message = parsed.message or "Хабарлама жоқ"
        self.log(f"💸 {donor} -> {amount}₸ | {message}")

        if self.event_callback:
            self.event_callback(
                {
                    "id": row.id,
                    "donor_name": donor,
                    "amount": amount,
                    "message": message,
                    "confidence": parsed.confidence,
                    "status": parsed.status,
                }
            )

        if not streamer_id:
            self.log("[service] streamer id енгізілмеген, сайтқа жіберілмеді")
            return True

        try:
            self.publisher.publish(streamer_id, parsed, device_id=device_id)
            mark_published(row.id)
        except Exception as e:
            mark_publish_error(row.id, str(e))
            self.log(f"[publisher] жіберу қатесі: {e}")

        return True
