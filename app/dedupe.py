from __future__ import annotations

import hashlib
import re
import time

from app.config import RECENT_DEDUPE_SECONDS

TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")


class RecentDedupe:
    def __init__(self):
        self._items = {}

    def _cleanup(self):
        now = time.time()
        expired = [
            key for key, value in self._items.items() if now - value > RECENT_DEDUPE_SECONDS
        ]
        for key in expired:
            self._items.pop(key, None)

    def seen(self, signature: str) -> bool:
        self._cleanup()
        return signature in self._items

    def add(self, signature: str):
        self._cleanup()
        self._items[signature] = time.time()


def normalize_for_signature(text: str) -> str:
    text = (text or "").replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def build_signature(text: str) -> str:
    normalized = normalize_for_signature(text)
    return hashlib.sha256(normalized.encode("utf-8", errors="ignore")).hexdigest()


def normalize_name_for_key(name: str | None) -> str:
    value = normalize_for_signature(name or "")
    value = re.sub(r"[^a-zа-яәғқңөұүіё0-9]+", "", value, flags=re.IGNORECASE)
    return value


def extract_notification_time(text: str) -> str:
    match = TIME_RE.search(text or "")
    if not match:
        return ""
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def build_compound_signature(donor_name: str | None, amount: int | None, raw_text: str) -> str:
    normalized_name = normalize_name_for_key(donor_name)
    amount_value = int(amount or 0)
    notification_time = extract_notification_time(raw_text)
    if not normalized_name or amount_value <= 0 or not notification_time:
        return ""
    compound = f"{normalized_name}|{amount_value}|{notification_time}"
    return hashlib.sha256(compound.encode("utf-8", errors="ignore")).hexdigest()
