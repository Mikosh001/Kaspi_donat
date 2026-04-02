from __future__ import annotations

import re
import secrets

from app.config import DEVICE_ID_PATH


_DEVICE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")


def get_device_id() -> str:
    if DEVICE_ID_PATH.exists():
        value = DEVICE_ID_PATH.read_text(encoding="utf-8").strip()
        if _DEVICE_ID_RE.match(value):
            return value

    value = f"dev-{secrets.token_hex(8)}"
    DEVICE_ID_PATH.write_text(value, encoding="utf-8")
    return value
