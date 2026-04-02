from __future__ import annotations

import copy
import json
import threading
from datetime import datetime

from app.config import WEB_HOST, WEB_PORT, WEB_SETTINGS_PATH
from app.db import (
    load_streamer_settings,
    normalize_streamer_id,
    save_streamer_settings,
)


DEFAULT_SETTINGS = {
    "app": {
        "brand_name": "Kaz Alerts",
        "accent": "#ff5631",
        "host": WEB_HOST,
        "port": WEB_PORT,
    },
    "aliases": [],
    "alert": {
        "min_amount": 0,
        "master_volume": 100,
        "show_preview_badge": True,
        "default_style": "classic",
        "tiers": [
            {
                "id": "tier-default",
                "min_amount": 1,
                "title": "Жаңа донат",
                "gif_url": "",
                "gif_stack": [],
                "sound_url": "",
                "sound_layers": [],
                "sound_volume": 100,
                "tts_enabled": False,
                "tts_text": "{donor_name} {amount} теңге. {message}",
                "tts_voice_mode": "female",
                "tts_lang": "kk-KZ",
                "tts_rate": 1.0,
                "tts_pitch": 1.0,
                "duration_ms": 7000,
                "style_id": "classic",
                "animation_in": "rise",
                "font_family": "Bahnschrift",
                "background": "",
                "accent_color": "",
                "title_color": "",
                "name_color": "",
                "amount_color": "",
                "message_color": "",
                "border_color": "",
                "youtube_enabled": True,
            }
        ],
    },
    "boards": {
        "top_day": {
            "title": "ТОП ДОНАТ",
            "limit": 5,
            "mode": "list",
            "style_id": "pubg",
        },
        "top_week": {
            "title": "ТОП АПТА",
            "limit": 5,
            "mode": "list",
            "style_id": "gold",
        },
        "top_month": {
            "title": "ТОП АЙ",
            "limit": 5,
            "mode": "list",
            "style_id": "classic",
        },
        "last_donation": {
            "title": "СОҢҒЫ ДОНАТ",
            "limit": 1,
            "mode": "single",
            "style_id": "pink",
        },
    },
    "goal": {
        "title": "ЦЕЛЬ СБОРА",
        "base_amount": 0,
        "target_amount": 50000,
        "auto_increment": True,
        "started_at": datetime.now().isoformat(),
        "style_id": "classic",
        "bar_color": "#ff5631",
        "background_color": "#161616",
        "text_color": "#ffffff",
    },
    "youtube": {
        "enabled": True,
        "mode": "music",
        "volume": 50,
        "panic_hotkey": "F9",
        "min_amount": 0,
        "max_seconds": 180,
        "preview_url": "",
        "widget_title": "YouTube Music",
        "widget_subtitle": "Музыка донаттан бөлек widget арқылы жүреді",
        "style_id": "cyberpunk",
        "accent_color": "#ff5631",
        "text_color": "#ffffff",
        "font_family": "Bahnschrift",
        "background_image": "",
        "card_background": "rgba(16, 16, 16, 0.82)",
        "show_badge": True,
    },
}


def deep_merge(base: dict, patch: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in patch.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def normalize_sound_layers(value) -> list[dict]:
    items = value if isinstance(value, list) else []
    result = []
    for item in items:
        if isinstance(item, str):
            url = item.strip()
            volume = 100
        elif isinstance(item, dict):
            url = str(item.get("url", "")).strip()
            volume = int(item.get("volume", 100) or 100)
        else:
            continue

        if not url:
            continue
        result.append(
            {
                "url": url,
                "volume": max(0, min(100, volume)),
            }
        )
    return result[:4]


def normalize_settings(settings: dict) -> dict:
    data = deep_merge(DEFAULT_SETTINGS, settings or {})

    aliases = data.get("aliases", [])
    if not isinstance(aliases, list):
        aliases = []
    data["aliases"] = [
        {
            "original": str(item.get("original", "")).strip(),
            "alias": str(item.get("alias", "")).strip(),
        }
        for item in aliases
        if str(item.get("original", "")).strip()
    ]

    tiers = data.get("alert", {}).get("tiers", [])
    normalized_tiers = []
    for index, tier in enumerate(tiers if isinstance(tiers, list) else []):
        gif_stack = tier.get("gif_stack", [])
        if not isinstance(gif_stack, list):
            gif_stack = []

        normalized_tiers.append(
            {
                "id": str(tier.get("id") or f"tier-{index + 1}"),
                "min_amount": max(1, int(tier.get("min_amount", 1) or 1)),
                "title": str(tier.get("title", "Жаңа донат")),
                "gif_url": str(tier.get("gif_url", "")).strip(),
                "gif_stack": [str(item).strip() for item in gif_stack if str(item).strip()][:3],
                "sound_url": str(tier.get("sound_url", "")).strip(),
                "sound_layers": normalize_sound_layers(tier.get("sound_layers", [])),
                "sound_volume": max(0, min(100, int(tier.get("sound_volume", 100) or 0))),
                "tts_enabled": bool(tier.get("tts_enabled", False)),
                "tts_text": str(tier.get("tts_text", "{donor_name} {amount} теңге. {message}")),
                "tts_voice_mode": str(tier.get("tts_voice_mode", "female") or "female"),
                "tts_lang": str(tier.get("tts_lang", "kk-KZ") or "kk-KZ"),
                "tts_rate": round(max(0.5, min(1.6, float(tier.get("tts_rate", 1.0) or 1.0))), 2),
                "tts_pitch": round(max(0.5, min(1.8, float(tier.get("tts_pitch", 1.0) or 1.0))), 2),
                "duration_ms": max(2000, int(tier.get("duration_ms", 7000) or 2000)),
                "style_id": str(tier.get("style_id", "classic") or "classic"),
                "animation_in": str(tier.get("animation_in", "rise") or "rise"),
                "font_family": str(tier.get("font_family", "Bahnschrift") or "Bahnschrift"),
                "background": str(tier.get("background", "")).strip(),
                "accent_color": str(tier.get("accent_color", "")).strip(),
                "title_color": str(tier.get("title_color", "")).strip(),
                "name_color": str(tier.get("name_color", "")).strip(),
                "amount_color": str(tier.get("amount_color", "")).strip(),
                "message_color": str(tier.get("message_color", "")).strip(),
                "border_color": str(tier.get("border_color", "")).strip(),
                "youtube_enabled": bool(tier.get("youtube_enabled", True)),
            }
        )
    normalized_tiers.sort(key=lambda item: item["min_amount"])
    data["alert"]["tiers"] = normalized_tiers or copy.deepcopy(DEFAULT_SETTINGS["alert"]["tiers"])
    data["alert"]["min_amount"] = max(0, int(data["alert"].get("min_amount", 0) or 0))
    data["alert"]["master_volume"] = max(0, min(100, int(data["alert"].get("master_volume", 100) or 0)))
    data["alert"]["show_preview_badge"] = bool(data["alert"].get("show_preview_badge", True))
    data["alert"]["default_style"] = str(data["alert"].get("default_style", "classic") or "classic")

    for board_key, defaults in DEFAULT_SETTINGS["boards"].items():
        board = data["boards"].get(board_key, {})
        data["boards"][board_key] = {
            **defaults,
            **board,
            "limit": max(1, min(20, int(board.get("limit", defaults["limit"]) or defaults["limit"]))),
            "mode": str(board.get("mode", defaults["mode"]) or defaults["mode"]),
            "style_id": str(board.get("style_id", defaults["style_id"]) or defaults["style_id"]),
            "title": str(board.get("title", defaults["title"]) or defaults["title"]),
        }

    goal = data["goal"]
    goal["base_amount"] = max(0, int(goal.get("base_amount", 0) or 0))
    goal["target_amount"] = max(1, int(goal.get("target_amount", 1) or 1))
    goal["auto_increment"] = bool(goal.get("auto_increment", True))
    goal["started_at"] = str(goal.get("started_at") or datetime.now().isoformat())
    goal["style_id"] = str(goal.get("style_id", "classic") or "classic")
    goal["bar_color"] = str(goal.get("bar_color", "#ff5631") or "#ff5631")
    goal["background_color"] = str(goal.get("background_color", "#161616") or "#161616")
    goal["text_color"] = str(goal.get("text_color", "#ffffff") or "#ffffff")

    youtube = data["youtube"]
    youtube["enabled"] = bool(youtube.get("enabled", True))
    youtube["mode"] = "video" if str(youtube.get("mode")) == "video" else "music"
    youtube["volume"] = max(0, min(100, int(youtube.get("volume", 50) or 0)))
    youtube["min_amount"] = max(0, int(youtube.get("min_amount", 0) or 0))
    youtube["max_seconds"] = max(10, int(youtube.get("max_seconds", 180) or 10))
    youtube["panic_hotkey"] = str(youtube.get("panic_hotkey", "F9") or "F9")
    youtube["preview_url"] = str(youtube.get("preview_url", "")).strip()
    youtube["widget_title"] = str(youtube.get("widget_title", "YouTube Music") or "YouTube Music")
    youtube["widget_subtitle"] = str(
        youtube.get("widget_subtitle", "Музыка донаттан бөлек widget арқылы жүреді")
        or "Музыка донаттан бөлек widget арқылы жүреді"
    )
    youtube["style_id"] = str(youtube.get("style_id", "cyberpunk") or "cyberpunk")
    youtube["accent_color"] = str(youtube.get("accent_color", "#ff5631") or "#ff5631")
    youtube["text_color"] = str(youtube.get("text_color", "#ffffff") or "#ffffff")
    youtube["font_family"] = str(youtube.get("font_family", "Bahnschrift") or "Bahnschrift")
    youtube["background_image"] = str(youtube.get("background_image", "")).strip()
    youtube["card_background"] = str(
        youtube.get("card_background", "rgba(16, 16, 16, 0.82)")
        or "rgba(16, 16, 16, 0.82)"
    )
    youtube["show_badge"] = bool(youtube.get("show_badge", True))

    data["app"]["host"] = WEB_HOST
    data["app"]["port"] = WEB_PORT
    return data


class WebSettingsStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._path = WEB_SETTINGS_PATH
        self._ensure_file()

    def _ensure_file(self):
        if not self._path.exists():
            self._path.write_text(
                json.dumps(DEFAULT_SETTINGS, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    def load(self, streamer_id: str | None = None) -> dict:
        scoped_streamer_id = normalize_streamer_id(streamer_id)
        with self._lock:
            if scoped_streamer_id:
                data = load_streamer_settings(scoped_streamer_id) or {}
                return normalize_settings(data)

            self._ensure_file()
            raw = self._path.read_text(encoding="utf-8")
            data = json.loads(raw) if raw.strip() else {}
            return normalize_settings(data)

    def save(self, patch: dict, streamer_id: str | None = None) -> dict:
        scoped_streamer_id = normalize_streamer_id(streamer_id)
        with self._lock:
            if scoped_streamer_id:
                current = normalize_settings(load_streamer_settings(scoped_streamer_id) or {})
                next_data = normalize_settings(deep_merge(current, patch or {}))
                save_streamer_settings(scoped_streamer_id, next_data)
                return next_data

            self._ensure_file()
            raw = self._path.read_text(encoding="utf-8")
            current = normalize_settings(json.loads(raw) if raw.strip() else {})
            next_data = normalize_settings(deep_merge(current, patch or {}))
            self._path.write_text(
                json.dumps(next_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return next_data

    def replace(self, data: dict, streamer_id: str | None = None) -> dict:
        scoped_streamer_id = normalize_streamer_id(streamer_id)
        with self._lock:
            next_data = normalize_settings(data or {})
            if scoped_streamer_id:
                save_streamer_settings(scoped_streamer_id, next_data)
                return next_data

            self._path.write_text(
                json.dumps(next_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return next_data
