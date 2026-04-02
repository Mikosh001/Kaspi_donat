from __future__ import annotations

import json
import mimetypes
import re
import threading
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app.config import ENFORCE_STREAMER_SCOPE, PUBLIC_BASE_URL, WEB_DIR, WEB_HOST, WEB_PORT
from app.db import (
    bind_device,
    create_or_get_streamer_account,
    donation_to_dict,
    get_all_donations,
    get_donations,
    get_donations_since,
    get_last_donation,
    get_streamer_account,
    init_db,
    list_bound_devices,
    normalize_device_id,
    normalize_streamer_id,
    rotate_streamer_token,
    save_donation,
    verify_streamer_token,
)
from app.dedupe import build_signature, extract_notification_time
from app.models import ParsedDonation
from app.web_settings import WebSettingsStore


YOUTUBE_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]{6,})",
    re.IGNORECASE,
)

STATIC_ROUTES = {
    "/": "admin.html",
    "/widget": "widget.html",
    "/widgetyt": "widgetyt.html",
    "/stats": "stats.html",
    "/goal": "goal.html",
}

_server_instance = None
_server_lock = threading.Lock()


def apply_alias(name: str, settings: dict) -> str:
    aliases = settings.get("aliases", [])
    normalized = (name or "").strip().lower()
    for item in aliases:
        if normalized == str(item.get("original", "")).strip().lower():
            return str(item.get("alias", "")).strip() or name
    return name


def extract_youtube_url(text: str) -> str:
    if not text:
        return ""
    match = YOUTUBE_RE.search(text)
    if not match:
        return ""
    return f"https://www.youtube.com/watch?v={match.group(1)}"


def strip_youtube_urls(text: str) -> str:
    return re.sub(YOUTUBE_RE, "", text or "").strip()


def find_alert_tier(amount: int, settings: dict) -> dict:
    tiers = settings.get("alert", {}).get("tiers", [])
    best = tiers[0] if tiers else {}
    for tier in tiers:
        if amount >= int(tier.get("min_amount", 0) or 0):
            best = tier
    return best


def resolve_donation_payload(row, settings: dict) -> dict:
    base = donation_to_dict(row) if not isinstance(row, dict) else row
    safe_message = str(base.get("message", "") or "")
    display_name = apply_alias(base.get("donor_name", ""), settings)
    youtube_url = extract_youtube_url(
        f"{safe_message}\n{base.get('raw_text', '')}"
    )
    tier = find_alert_tier(int(base.get("amount", 0) or 0), settings)
    music_request_text = strip_youtube_urls(safe_message).strip() or "Music request"

    tts_template = str(tier.get("tts_text", "{donor_name} {amount} теңге. {message}"))
    tts_text = (
        tts_template.replace("{donor_name}", display_name)
        .replace("{amount}", str(base.get("amount", 0)))
        .replace("{message}", safe_message)
    )
    if safe_message and "{message}" not in tts_template and safe_message not in tts_text:
        tts_text = f"{tts_text}. {safe_message}"

    return {
        **base,
        "display_name": display_name,
        "youtube_url": youtube_url,
        "music_request_text": music_request_text,
        "notification_time": extract_notification_time(base.get("raw_text", "")),
        "tier": tier,
        "tts_text": tts_text,
    }


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def parse_int(value, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        result = default

    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def build_goal_state(settings: dict, streamer_id: str | None = None) -> dict:
    goal = settings.get("goal", {})
    started_at = parse_iso_datetime(goal.get("started_at"))
    current = int(goal.get("base_amount", 0) or 0)

    if goal.get("auto_increment", True):
        donations = get_donations_since(started_at, streamer_id=streamer_id)
        current += sum(max(0, int(item.amount or 0)) for item in donations)

    target = max(1, int(goal.get("target_amount", 1) or 1))
    progress = round(min(current / target * 100, 100), 2)

    return {
        "title": str(goal.get("title", "ЦЕЛЬ СБОРА")),
        "current_amount": current,
        "target_amount": target,
        "progress": progress,
        "style_id": str(goal.get("style_id", "ember")),
        "bar_color": str(goal.get("bar_color", "#ff5631")),
        "background_color": str(goal.get("background_color", "#161616")),
        "text_color": str(goal.get("text_color", "#ffffff")),
        "auto_increment": bool(goal.get("auto_increment", True)),
        "started_at": goal.get("started_at"),
    }


def filter_donations_by_period(rows, period: str):
    now = datetime.now()
    if period == "all":
        return list(rows)

    result = []
    current_iso = now.isocalendar()
    for row in rows:
        created_at = row.created_at
        if not created_at:
            continue
        if period == "day" and created_at.date() == now.date():
            result.append(row)
        elif period == "week" and created_at.isocalendar()[:2] == current_iso[:2]:
            result.append(row)
        elif period == "month" and created_at.year == now.year and created_at.month == now.month:
            result.append(row)
    return result


def build_top_stats(period: str, settings: dict, limit: int, streamer_id: str | None = None) -> list[dict]:
    rows = filter_donations_by_period(get_all_donations(streamer_id=streamer_id), period)
    grouped: dict[str, dict] = {}

    for row in rows:
        display_name = apply_alias(row.donor_name or "Аноним", settings)
        bucket = grouped.setdefault(
            display_name,
            {
                "donor_name": display_name,
                "total_amount": 0,
                "donation_count": 0,
                "last_amount": 0,
            },
        )
        bucket["total_amount"] += int(row.amount or 0)
        bucket["donation_count"] += 1
        bucket["last_amount"] = int(row.amount or 0)

    items = list(grouped.values())
    items.sort(key=lambda item: (-item["total_amount"], item["donor_name"].lower()))
    return items[:limit]


def build_analytics_summary(settings: dict, streamer_id: str | None = None) -> dict:
    rows = get_all_donations(streamer_id=streamer_id)
    total_amount = 0
    donor_counts: dict[str, int] = {}

    for row in rows:
        amount = max(0, int(row.amount or 0))
        total_amount += amount
        display_name = apply_alias(row.donor_name or "Аноним", settings)
        donor_counts[display_name] = donor_counts.get(display_name, 0) + 1

    donation_count = len(rows)
    average_donation = round(total_amount / donation_count, 2) if donation_count else 0
    repeat_donors = sum(1 for count in donor_counts.values() if count > 1)

    return {
        "donation_count": donation_count,
        "total_amount": total_amount,
        "average_donation": average_donation,
        "unique_donors": len(donor_counts),
        "repeat_donors": repeat_donors,
        "top_day": build_top_stats("day", settings, 5, streamer_id=streamer_id),
        "top_week": build_top_stats("week", settings, 5, streamer_id=streamer_id),
        "top_month": build_top_stats("month", settings, 5, streamer_id=streamer_id),
    }


def build_base_url() -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    return f"http://{WEB_HOST}:{WEB_PORT}"


def build_preview_urls(streamer_id: str | None = None) -> dict:
    base = build_base_url()
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    prefix = f"/s/{scoped_streamer_id}" if scoped_streamer_id else ""
    return {
        "admin": f"{base}{prefix}/",
        "widget": f"{base}{prefix}/widget",
        "widgetyt": f"{base}{prefix}/widgetyt",
        "goal": f"{base}{prefix}/goal",
        "top_day": f"{base}{prefix}/stats?board=top_day",
        "top_week": f"{base}{prefix}/stats?board=top_week",
        "top_month": f"{base}{prefix}/stats?board=top_month",
        "last_donation": f"{base}{prefix}/stats?board=last_donation",
        "analytics": f"{base}{prefix}/api/analytics/summary",
    }


def build_streamer_profile_payload(streamer_id: str, include_token: bool = False) -> dict | None:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if not scoped_streamer_id:
        return None

    account = get_streamer_account(scoped_streamer_id)
    payload = {
        "streamer_id": scoped_streamer_id,
        "display_name": (account or {}).get("display_name") or scoped_streamer_id,
        "created_at": (account or {}).get("created_at", ""),
        "updated_at": (account or {}).get("updated_at", ""),
        "exists": bool(account),
        "devices": list_bound_devices(scoped_streamer_id),
        "urls": build_preview_urls(scoped_streamer_id),
    }
    if include_token and account:
        payload["token"] = account.get("token", "")
    return payload


class OverlayRequestHandler(BaseHTTPRequestHandler):
    settings_store = WebSettingsStore()

    def log_message(self, format, *args):
        return

    def _send_json(self, payload: dict | list | None, status: int = 200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_error_json(self, status: int, message: str):
        self._send_json({"error": message}, status=status)

    def _send_file(self, file_path: Path):
        if not file_path.exists() or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        mime_type, _ = mimetypes.guess_type(file_path.name)
        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header(
            "Content-Type",
            f"{mime_type or 'application/octet-stream'}; charset=utf-8"
            if file_path.suffix in {".html", ".css", ".js"}
            else mime_type or "application/octet-stream",
        )
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _extract_streamer_token(self) -> str:
        auth_header = self.headers.get("Authorization", "").strip()
        if auth_header.lower().startswith("bearer "):
            return auth_header[7:].strip()
        return self.headers.get("X-Streamer-Token", "").strip()

    def _is_token_authorized(self, streamer_id: str) -> bool:
        scoped_streamer_id = normalize_streamer_id(streamer_id)
        if not scoped_streamer_id:
            return False
        token = self._extract_streamer_token()
        return verify_streamer_token(scoped_streamer_id, token)

    def _resolve_scope(self, path: str, query: dict) -> tuple[str, str]:
        query_streamer_id = normalize_streamer_id((query.get("streamer_id", [""])[0] or "").strip())
        header_streamer_id = normalize_streamer_id(self.headers.get("X-Streamer-ID", ""))
        path_streamer_id = ""

        segments = [segment for segment in path.split("/") if segment]
        scoped_path = path
        if len(segments) >= 2 and segments[0] == "s":
            candidate = normalize_streamer_id(segments[1])
            if candidate:
                path_streamer_id = candidate
            remainder = segments[2:]
            scoped_path = f"/{'/'.join(remainder)}" if remainder else "/"

        scoped_streamer_id = path_streamer_id or query_streamer_id or header_streamer_id

        return scoped_path, scoped_streamer_id

    def _require_scope_for_get(self, path: str, streamer_id: str) -> bool:
        if not ENFORCE_STREAMER_SCOPE:
            return True
        if path == "/api/health":
            return True
        if streamer_id:
            return True
        self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer scope required")
        return False

    def _require_scope_for_post(self, path: str, streamer_id: str) -> bool:
        if not ENFORCE_STREAMER_SCOPE:
            return True
        if streamer_id:
            return True

        # Cloud write endpoints can provide streamer_id in request body.
        if path in {
            "/api/cloud/register",
            "/api/cloud/rotate-token",
            "/api/cloud/bind-device",
            "/api/cloud/ingest",
        }:
            return True

        self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer scope required")
        return False

    def _handle_get_api(self, path: str, query: dict, streamer_id: str):
        if path == "/api/health":
            self._send_json(
                {
                    "ok": True,
                    "scope_required": ENFORCE_STREAMER_SCOPE,
                    "streamer_id": streamer_id,
                }
            )
            return

        settings = self.settings_store.load(streamer_id=streamer_id)

        if path == "/api/state":
            last_row = get_last_donation(streamer_id=streamer_id)
            boards = {
                "top_day": build_top_stats(
                    "day",
                    settings,
                    settings["boards"]["top_day"]["limit"],
                    streamer_id=streamer_id,
                ),
                "top_week": build_top_stats(
                    "week",
                    settings,
                    settings["boards"]["top_week"]["limit"],
                    streamer_id=streamer_id,
                ),
                "top_month": build_top_stats(
                    "month",
                    settings,
                    settings["boards"]["top_month"]["limit"],
                    streamer_id=streamer_id,
                ),
                "last_donation": resolve_donation_payload(last_row, settings) if last_row else None,
            }
            self._send_json(
                {
                    "streamer_id": streamer_id,
                    "settings": settings,
                    "goal": build_goal_state(settings, streamer_id=streamer_id),
                    "urls": build_preview_urls(streamer_id),
                    "boards": boards,
                    "analytics": build_analytics_summary(settings, streamer_id=streamer_id),
                    "profile": build_streamer_profile_payload(streamer_id) if streamer_id else None,
                }
            )
            return

        if path == "/api/settings":
            self._send_json(settings)
            return

        if path == "/api/cloud/settings":
            if not streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return
            self._send_json(settings)
            return

        if path == "/api/donations":
            limit = parse_int(query.get("limit", ["50"])[0], default=50, minimum=1, maximum=200)
            after_id = parse_int(query.get("after_id", ["0"])[0], default=0, minimum=0)
            rows = get_donations(limit=limit, after_id=after_id, streamer_id=streamer_id)
            payload = [resolve_donation_payload(row, settings) for row in rows]
            self._send_json(payload)
            return

        if path == "/api/feed":
            after_id = parse_int(query.get("after_id", ["0"])[0], default=0, minimum=0)
            rows = get_donations(limit=100, after_id=after_id, streamer_id=streamer_id)
            payload = [resolve_donation_payload(row, settings) for row in rows]
            self._send_json(payload)
            return

        if path == "/api/music-feed":
            after_id = parse_int(query.get("after_id", ["0"])[0], default=0, minimum=0)
            rows = get_donations(limit=100, after_id=after_id, streamer_id=streamer_id)
            payload = []
            for row in rows:
                item = resolve_donation_payload(row, settings)
                if not settings.get("youtube", {}).get("enabled", True):
                    continue
                if not item.get("youtube_url"):
                    continue
                if int(item.get("amount", 0) or 0) < int(settings["youtube"].get("min_amount", 0) or 0):
                    continue
                if item.get("tier", {}).get("youtube_enabled", True) is False:
                    continue
                payload.append(item)
            self._send_json(payload)
            return

        if path.startswith("/api/stats/"):
            board_key = path.removeprefix("/api/stats/")
            if board_key == "last_donation":
                row = get_last_donation(streamer_id=streamer_id)
                self._send_json(resolve_donation_payload(row, settings) if row else None)
                return

            period_map = {
                "top_day": "day",
                "top_week": "week",
                "top_month": "month",
                "top_all": "all",
            }
            period = period_map.get(board_key, "day")
            board_settings = settings["boards"].get(board_key, {"limit": 5})
            limit = parse_int(
                query.get("limit", [str(board_settings.get("limit", 5))])[0],
                default=board_settings.get("limit", 5),
                minimum=1,
                maximum=20,
            )
            self._send_json(build_top_stats(period, settings, limit, streamer_id=streamer_id))
            return

        if path == "/api/goal":
            self._send_json(build_goal_state(settings, streamer_id=streamer_id))
            return

        if path == "/api/preview-urls":
            self._send_json(build_preview_urls(streamer_id))
            return

        if path == "/api/analytics/summary":
            self._send_json(build_analytics_summary(settings, streamer_id=streamer_id))
            return

        if path in {"/api/profile", "/api/cloud/profile"}:
            target_streamer_id = streamer_id or normalize_streamer_id(query.get("streamer_id", [""])[0])
            if not target_streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return
            profile = build_streamer_profile_payload(target_streamer_id)
            self._send_json(profile or {})
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def _handle_post_api(self, path: str, streamer_id: str):
        settings = self.settings_store.load(streamer_id=streamer_id)

        if path == "/api/settings":
            account = get_streamer_account(streamer_id) if streamer_id else None
            if account and account.get("token") and not self._is_token_authorized(streamer_id):
                self._send_error_json(HTTPStatus.UNAUTHORIZED, "invalid streamer token")
                return
            payload = self._read_json()
            next_settings = self.settings_store.save(payload, streamer_id=streamer_id)
            self._send_json(next_settings)
            return

        if path == "/api/cloud/settings":
            if not streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return
            if not self._is_token_authorized(streamer_id):
                self._send_error_json(HTTPStatus.UNAUTHORIZED, "invalid streamer token")
                return
            payload = self._read_json()
            next_settings = self.settings_store.save(payload, streamer_id=streamer_id)
            self._send_json(next_settings)
            return

        if path == "/api/test-donation":
            payload = self._read_json()
            donor_name = str(payload.get("donor_name", "Тест Донатер")).strip() or "Тест Донатер"
            amount = parse_int(payload.get("amount", 5000), default=5000, minimum=1)
            message = str(
                payload.get(
                    "message",
                    "Бұл тест донат. YouTube preview үшін https://youtu.be/dQw4w9WgXcQ",
                )
            ).strip()
            raw_text = f"Kaspi Gold\nПеревод {amount} ₸\nОтправитель: {donor_name}\nСообщение: {message}"
            parsed = ParsedDonation(
                donor_name=donor_name,
                amount=amount,
                message=message,
                raw_text=raw_text,
                raw_signature=build_signature(f"{raw_text}-{datetime.now().isoformat()}"),
                confidence=1.0,
                status="ready",
            )
            row = save_donation(parsed, streamer_id=streamer_id)
            self._send_json(resolve_donation_payload(row, settings), status=201)
            return

        if path == "/api/cloud/register":
            payload = self._read_json()
            requested_streamer_id = normalize_streamer_id(payload.get("streamer_id") or streamer_id)
            if not requested_streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return

            existing_account = get_streamer_account(requested_streamer_id)
            if existing_account and not self._is_token_authorized(requested_streamer_id):
                self._send_error_json(HTTPStatus.CONFLICT, "streamer already registered")
                return

            account = create_or_get_streamer_account(
                requested_streamer_id,
                str(payload.get("display_name", "")).strip(),
            )
            if bool(payload.get("rotate_token")):
                account = rotate_streamer_token(requested_streamer_id)

            device_id = normalize_device_id(payload.get("device_id") or self.headers.get("X-Device-ID", ""))
            device_name = str(payload.get("device_name", "")).strip()
            if device_id:
                bind_device(requested_streamer_id, device_id, device_name)

            self._send_json(
                {
                    "account": account,
                    "profile": build_streamer_profile_payload(requested_streamer_id),
                },
                status=HTTPStatus.CREATED if not existing_account else HTTPStatus.OK,
            )
            return

        if path == "/api/cloud/rotate-token":
            payload = self._read_json()
            requested_streamer_id = normalize_streamer_id(payload.get("streamer_id") or streamer_id)
            if not requested_streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return
            if not self._is_token_authorized(requested_streamer_id):
                self._send_error_json(HTTPStatus.UNAUTHORIZED, "invalid streamer token")
                return

            account = rotate_streamer_token(requested_streamer_id)
            self._send_json({"account": account})
            return

        if path == "/api/cloud/bind-device":
            payload = self._read_json()
            requested_streamer_id = normalize_streamer_id(payload.get("streamer_id") or streamer_id)
            if not requested_streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return
            if not self._is_token_authorized(requested_streamer_id):
                self._send_error_json(HTTPStatus.UNAUTHORIZED, "invalid streamer token")
                return

            device_id = normalize_device_id(payload.get("device_id") or self.headers.get("X-Device-ID", ""))
            if not device_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "device_id required")
                return

            device = bind_device(
                requested_streamer_id,
                device_id,
                str(payload.get("device_name", "")).strip(),
            )
            self._send_json(
                {
                    "device": device,
                    "devices": list_bound_devices(requested_streamer_id),
                }
            )
            return

        if path == "/api/cloud/ingest":
            payload = self._read_json()
            requested_streamer_id = normalize_streamer_id(payload.get("streamer_id") or streamer_id)
            if not requested_streamer_id:
                self._send_error_json(HTTPStatus.BAD_REQUEST, "streamer_id required")
                return
            if not self._is_token_authorized(requested_streamer_id):
                self._send_error_json(HTTPStatus.UNAUTHORIZED, "invalid streamer token")
                return

            device_id = normalize_device_id(payload.get("device_id") or self.headers.get("X-Device-ID", ""))
            if device_id:
                bind_device(
                    requested_streamer_id,
                    device_id,
                    str(payload.get("device_name", "")).strip(),
                )

            donor_name = str(payload.get("donor_name", "Аноним")).strip() or "Аноним"
            amount = parse_int(payload.get("amount", 0), default=0, minimum=0)
            message = str(payload.get("message", "Хабарлама жоқ")).strip() or "Хабарлама жоқ"
            raw_text = str(payload.get("raw_text", "")).strip() or f"Kaspi Gold\nПеревод {amount} ₸\nОтправитель: {donor_name}\nСообщение: {message}"
            received_at = parse_iso_datetime(payload.get("received_at")) or datetime.now()

            parsed = ParsedDonation(
                donor_name=donor_name,
                amount=amount,
                currency=str(payload.get("currency", "KZT") or "KZT"),
                message=message,
                raw_text=raw_text,
                source_app=str(payload.get("source_app", "cloud_ingest") or "cloud_ingest"),
                confidence=float(payload.get("confidence", 1.0) or 1.0),
                received_at=received_at,
                raw_signature=build_signature(
                    f"{requested_streamer_id}:{raw_text}:{payload.get('received_at', '')}:{device_id}"
                ),
                status="ready",
            )

            row = save_donation(
                parsed,
                streamer_id=requested_streamer_id,
                device_id=device_id,
            )
            scoped_settings = self.settings_store.load(streamer_id=requested_streamer_id)
            self._send_json(resolve_donation_payload(row, scoped_settings), status=201)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        path, streamer_id = self._resolve_scope(parsed.path, query)

        if path.startswith("/api/"):
            if not self._require_scope_for_get(path, streamer_id):
                return
            self._handle_get_api(path, query, streamer_id)
            return

        if path in STATIC_ROUTES:
            self._send_file(WEB_DIR / STATIC_ROUTES[path])
            return

        file_path = (WEB_DIR / path.lstrip("/")).resolve()
        if WEB_DIR.resolve() not in file_path.parents and file_path != WEB_DIR.resolve():
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        self._send_file(file_path)

    def do_POST(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        path, streamer_id = self._resolve_scope(parsed.path, query)

        if path.startswith("/api/"):
            if not self._require_scope_for_post(path, streamer_id):
                return
            self._handle_post_api(path, streamer_id)
            return

        self.send_error(HTTPStatus.NOT_FOUND)


class OverlayWebServer:
    def __init__(self):
        init_db()
        self.httpd = ThreadingHTTPServer((WEB_HOST, WEB_PORT), OverlayRequestHandler)
        self.thread = None

    def start(self):
        if self.thread and self.thread.is_alive():
            return self
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        return self

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()


def ensure_web_server() -> OverlayWebServer:
    global _server_instance
    with _server_lock:
        if _server_instance is None:
            _server_instance = OverlayWebServer().start()
        return _server_instance
