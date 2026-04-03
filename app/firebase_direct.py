from __future__ import annotations

import copy
import re
import secrets
import time
from datetime import datetime, timezone
from typing import Any

import requests

from app.config import (
    FIREBASE_API_KEY,
    FIREBASE_AUTH_EMAIL,
    FIREBASE_AUTH_PASSWORD,
    FIREBASE_DIRECT_ENABLED,
    FIREBASE_PROJECT_ID,
)
from app.db import normalize_device_id, normalize_streamer_id
from app.web_settings import DEFAULT_SETTINGS

_SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
_REFRESH_TOKEN_URL = "https://securetoken.googleapis.com/v1/token"
_FIRESTORE_DOCS_URL = "https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents"

_DONOR_KEY_RE = re.compile(r"[^a-z0-9_-]+")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now_utc().isoformat().replace("+00:00", "Z")


def _week_key(moment: datetime) -> str:
    iso = moment.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _normalize_donor_key(value: str) -> str:
    normalized = _DONOR_KEY_RE.sub("-", str(value or "").strip().lower())
    normalized = normalized.strip("-_")
    return normalized[:96] or "anon"


def _to_firestore_value(value: Any) -> dict:
    if value is None:
        return {"nullValue": None}

    if isinstance(value, bool):
        return {"booleanValue": value}

    if isinstance(value, int):
        return {"integerValue": str(value)}

    if isinstance(value, float):
        return {"doubleValue": value}

    if isinstance(value, str):
        return {"stringValue": value}

    if isinstance(value, list):
        return {
            "arrayValue": {
                "values": [_to_firestore_value(item) for item in value],
            }
        }

    if isinstance(value, dict):
        return {
            "mapValue": {
                "fields": {
                    str(key): _to_firestore_value(item)
                    for key, item in value.items()
                }
            }
        }

    return {"stringValue": str(value)}


def _to_firestore_fields(payload: dict) -> dict:
    return {str(key): _to_firestore_value(value) for key, value in payload.items()}


def _from_firestore_value(value: dict | None) -> Any:
    if not value:
        return None

    if "nullValue" in value:
        return None
    if "booleanValue" in value:
        return bool(value["booleanValue"])
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "stringValue" in value:
        return str(value["stringValue"])
    if "timestampValue" in value:
        return str(value["timestampValue"])
    if "arrayValue" in value:
        return [
            _from_firestore_value(item)
            for item in value.get("arrayValue", {}).get("values", [])
        ]
    if "mapValue" in value:
        fields = value.get("mapValue", {}).get("fields", {})
        return {
            key: _from_firestore_value(item)
            for key, item in fields.items()
        }

    return None


def _from_firestore_document(payload: dict | None) -> dict:
    if not payload:
        return {}
    fields = payload.get("fields", {})
    return {
        key: _from_firestore_value(item)
        for key, item in fields.items()
    }


class FirebaseDirectPublisher:
    def __init__(self, log_callback=None):
        self.log_callback = log_callback
        self.session = requests.Session()

        self.enabled = bool(FIREBASE_DIRECT_ENABLED)
        self.api_key = FIREBASE_API_KEY
        self.project_id = FIREBASE_PROJECT_ID
        self.email = FIREBASE_AUTH_EMAIL
        self.password = FIREBASE_AUTH_PASSWORD

        self.id_token = ""
        self.refresh_token = ""
        self.uid = ""
        self.expires_at = 0.0

    def log(self, text: str):
        if self.log_callback:
            self.log_callback(text)

    def is_configured(self) -> bool:
        return bool(
            self.enabled
            and self.api_key
            and self.project_id
            and self.email
            and self.password
        )

    def _firestore_base_url(self) -> str:
        return _FIRESTORE_DOCS_URL.format(project_id=self.project_id).rstrip("/")

    def _auth_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.id_token}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", 12)
        response = self.session.request(method=method, url=url, **kwargs)
        return response

    def _sign_in(self):
        response = self._request(
            "POST",
            f"{_SIGN_IN_URL}?key={self.api_key}",
            json={
                "email": self.email,
                "password": self.password,
                "returnSecureToken": True,
            },
        )
        response.raise_for_status()
        payload = response.json()

        self.id_token = str(payload.get("idToken") or "")
        self.refresh_token = str(payload.get("refreshToken") or "")
        self.uid = str(payload.get("localId") or "")
        expires_in = int(payload.get("expiresIn") or 3600)
        self.expires_at = time.time() + max(300, expires_in - 45)

    def _refresh_id_token(self):
        if not self.refresh_token:
            self._sign_in()
            return

        response = self._request(
            "POST",
            f"{_REFRESH_TOKEN_URL}?key={self.api_key}",
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
            },
        )

        if response.status_code >= 400:
            self._sign_in()
            return

        payload = response.json()
        self.id_token = str(payload.get("id_token") or "")
        self.refresh_token = str(payload.get("refresh_token") or self.refresh_token)
        self.uid = str(payload.get("user_id") or self.uid)
        expires_in = int(payload.get("expires_in") or 3600)
        self.expires_at = time.time() + max(300, expires_in - 45)

    def _ensure_auth(self):
        if not self.id_token or time.time() >= self.expires_at:
            if self.refresh_token:
                self._refresh_id_token()
            else:
                self._sign_in()

        if not self.id_token:
            raise ValueError("firebase auth failed")

    def _document_url(self, document_path: str) -> str:
        safe_path = document_path.strip().strip("/")
        return f"{self._firestore_base_url()}/{safe_path}"

    def _get_document(self, document_path: str) -> dict | None:
        response = self._request(
            "GET",
            self._document_url(document_path),
            headers=self._auth_headers(),
        )

        if response.status_code == 404:
            return None

        response.raise_for_status()
        return _from_firestore_document(response.json())

    def _upsert_document(self, document_path: str, data: dict):
        payload = data if isinstance(data, dict) else {}
        if not payload:
            return

        params = [("updateMask.fieldPaths", key) for key in payload.keys()]
        response = self._request(
            "PATCH",
            self._document_url(document_path),
            headers=self._auth_headers(),
            params=params,
            json={"fields": _to_firestore_fields(payload)},
        )
        response.raise_for_status()

    def _ensure_streamer_profile(self, streamer_id: str):
        profile_path = f"streamers/{streamer_id}"
        profile = self._get_document(profile_path)
        now_iso = _now_iso()

        if profile:
            owner_uid = str(profile.get("owner_uid") or "")
            if owner_uid and owner_uid != self.uid:
                raise ValueError("streamer_id belongs to another firebase account")

            patch = {
                "streamer_id": streamer_id,
                "updated_at_iso": now_iso,
            }
            if not owner_uid:
                patch["owner_uid"] = self.uid
            if not str(profile.get("display_name") or "").strip():
                patch["display_name"] = streamer_id
            self._upsert_document(profile_path, patch)
        else:
            self._upsert_document(
                profile_path,
                {
                    "streamer_id": streamer_id,
                    "display_name": streamer_id,
                    "owner_uid": self.uid,
                    "token": secrets.token_urlsafe(24),
                    "created_at_iso": now_iso,
                    "updated_at_iso": now_iso,
                    "last_seq": 0,
                },
            )

        settings_path = f"streamers/{streamer_id}/settings/main"
        settings = self._get_document(settings_path)
        if not settings:
            self._upsert_document(
                settings_path,
                {
                    "data": copy.deepcopy(DEFAULT_SETTINGS),
                    "updated_at_iso": now_iso,
                },
            )

    def _update_donor_stats(self, streamer_id: str, donor_name: str, amount: int) -> tuple[bool, bool]:
        donor_key = _normalize_donor_key(donor_name)
        path = f"streamers/{streamer_id}/donor_stats/{donor_key}"
        current = self._get_document(path) or {}

        previous_count = int(current.get("donation_count") or 0)
        next_count = previous_count + 1
        next_total = int(current.get("total_amount") or 0) + max(0, int(amount or 0))

        self._upsert_document(
            path,
            {
                "donor_key": donor_key,
                "donor_name": donor_name,
                "donation_count": next_count,
                "total_amount": next_total,
                "last_amount": max(0, int(amount or 0)),
                "updated_at_iso": _now_iso(),
            },
        )

        is_new_donor = previous_count == 0
        became_repeat = previous_count == 1
        return is_new_donor, became_repeat

    def _update_leaderboard(
        self,
        streamer_id: str,
        period: str,
        period_key: str,
        donor_name: str,
        amount: int,
    ) -> list[dict]:
        donor_key = _normalize_donor_key(donor_name)
        path = f"streamers/{streamer_id}/leaderboards/{period}_{period_key}"
        current = self._get_document(path) or {}
        items = current.get("items")

        next_items: list[dict] = []
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                next_items.append(
                    {
                        "donor_key": str(item.get("donor_key") or ""),
                        "donor_name": str(item.get("donor_name") or "Аноним"),
                        "total_amount": int(item.get("total_amount") or 0),
                        "donation_count": int(item.get("donation_count") or 0),
                        "last_amount": int(item.get("last_amount") or 0),
                    }
                )

        found = False
        for item in next_items:
            if item["donor_key"] != donor_key:
                continue
            item["donor_name"] = donor_name
            item["total_amount"] += max(0, int(amount or 0))
            item["donation_count"] += 1
            item["last_amount"] = max(0, int(amount or 0))
            found = True
            break

        if not found:
            next_items.append(
                {
                    "donor_key": donor_key,
                    "donor_name": donor_name,
                    "total_amount": max(0, int(amount or 0)),
                    "donation_count": 1,
                    "last_amount": max(0, int(amount or 0)),
                }
            )

        next_items.sort(
            key=lambda row: (
                -int(row.get("total_amount") or 0),
                str(row.get("donor_name") or "").lower(),
            )
        )
        next_items = next_items[:20]

        self._upsert_document(
            path,
            {
                "period": period,
                "period_key": period_key,
                "items": next_items,
                "updated_at_iso": _now_iso(),
            },
        )
        return next_items[:5]

    def _update_analytics(
        self,
        streamer_id: str,
        amount: int,
        last_donation: dict,
        top_day: list[dict],
        top_week: list[dict],
        top_month: list[dict],
        is_new_donor: bool,
        became_repeat: bool,
    ):
        path = f"streamers/{streamer_id}/analytics/current"
        current = self._get_document(path) or {}

        donation_count = int(current.get("donation_count") or 0) + 1
        total_amount = int(current.get("total_amount") or 0) + max(0, int(amount or 0))
        unique_donors = int(current.get("unique_donors") or 0) + (1 if is_new_donor else 0)
        repeat_donors = int(current.get("repeat_donors") or 0) + (1 if became_repeat else 0)
        average_donation = round(total_amount / donation_count, 2) if donation_count else 0

        self._upsert_document(
            path,
            {
                "donation_count": donation_count,
                "total_amount": total_amount,
                "average_donation": average_donation,
                "unique_donors": unique_donors,
                "repeat_donors": repeat_donors,
                "top_day": top_day,
                "top_week": top_week,
                "top_month": top_month,
                "last_donation": last_donation,
                "updated_at_iso": _now_iso(),
            },
        )

    def publish(self, streamer_id: str, parsed, device_id: str | None = None):
        if not self.is_configured():
            raise ValueError("firebase direct mode is not configured")

        safe_streamer_id = normalize_streamer_id(streamer_id)
        safe_device_id = normalize_device_id(device_id)
        if not safe_streamer_id:
            raise ValueError("streamer_id is required for firebase publish")

        self._ensure_auth()
        self._ensure_streamer_profile(safe_streamer_id)

        now = _now_utc()
        now_iso = now.isoformat().replace("+00:00", "Z")
        sequence = int(now.timestamp() * 1000)
        donation_doc_id = f"{sequence}-{secrets.token_hex(3)}"

        donor_name = str(parsed.donor_name or "Аноним").strip() or "Аноним"
        amount = max(0, int(parsed.amount or 0))
        message = str(parsed.message or "Хабарлама жоқ").strip() or "Хабарлама жоқ"
        raw_text = str(parsed.raw_text or "").strip() or (
            f"Kaspi Gold\nПеревод {amount} ₸\nОтправитель: {donor_name}\nСообщение: {message}"
        )

        donation_payload = {
            "seq": sequence,
            "streamer_id": safe_streamer_id,
            "device_id": safe_device_id,
            "donor_name": donor_name,
            "amount": amount,
            "currency": str(parsed.currency or "KZT"),
            "message": message,
            "raw_text": raw_text,
            "source_app": str(parsed.source_app or "desktop_app"),
            "confidence": float(parsed.confidence or 1.0),
            "status": "ready",
            "created_at_iso": now_iso,
        }

        self._upsert_document(
            f"streamers/{safe_streamer_id}/donations/{donation_doc_id}",
            donation_payload,
        )

        if safe_device_id:
            self._upsert_document(
                f"streamers/{safe_streamer_id}/devices/{safe_device_id}",
                {
                    "device_id": safe_device_id,
                    "device_name": safe_device_id,
                    "last_seen_at_iso": now_iso,
                    "updated_at_iso": now_iso,
                },
            )

        is_new_donor, became_repeat = self._update_donor_stats(safe_streamer_id, donor_name, amount)

        day_key = now.strftime("%Y-%m-%d")
        week_key = _week_key(now)
        month_key = now.strftime("%Y-%m")

        top_day = self._update_leaderboard(safe_streamer_id, "day", day_key, donor_name, amount)
        top_week = self._update_leaderboard(safe_streamer_id, "week", week_key, donor_name, amount)
        top_month = self._update_leaderboard(safe_streamer_id, "month", month_key, donor_name, amount)

        self._update_analytics(
            safe_streamer_id,
            amount,
            last_donation=donation_payload,
            top_day=top_day,
            top_week=top_week,
            top_month=top_month,
            is_new_donor=is_new_donor,
            became_repeat=became_repeat,
        )

        self._upsert_document(
            f"streamers/{safe_streamer_id}",
            {
                "updated_at_iso": now_iso,
                "last_seq": sequence,
            },
        )

        self.log("[firebase] donation synced to Firestore")
        return True
