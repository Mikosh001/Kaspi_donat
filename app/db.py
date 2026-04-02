from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.config import DATABASE_URL
from app.dedupe import build_compound_signature, normalize_name_for_key


engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, future=True, expire_on_commit=False)

_STREAMER_SANITIZE_RE = re.compile(r"[^a-zA-Z0-9_-]+")
_DEVICE_SANITIZE_RE = re.compile(r"[^a-zA-Z0-9._:-]+")


class Base(DeclarativeBase):
    pass


class DonationRecord(Base):
    __tablename__ = "donations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    streamer_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    device_id: Mapped[str] = mapped_column(String(80), default="")
    donor_name: Mapped[str] = mapped_column(String(120), default="")
    amount: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(16), default="KZT")
    message: Mapped[str] = mapped_column(Text, default="")
    raw_text: Mapped[str] = mapped_column(Text, default="")
    source_app: Mapped[str] = mapped_column(String(64), default="kaspi_phone_link")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    raw_signature: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="new")
    published: Mapped[int] = mapped_column(Integer, default=0)
    publish_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class StreamerAccount(Base):
    __tablename__ = "streamer_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    streamer_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120), default="")
    token: Mapped[str] = mapped_column(String(96), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class DeviceBinding(Base):
    __tablename__ = "device_bindings"
    __table_args__ = (
        UniqueConstraint("streamer_id", "device_id", name="uq_streamer_device"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    streamer_id: Mapped[str] = mapped_column(String(64), index=True)
    device_id: Mapped[str] = mapped_column(String(80), index=True)
    device_name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class StreamerSettingsRecord(Base):
    __tablename__ = "streamer_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    streamer_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


def normalize_streamer_id(value: str | None) -> str:
    normalized = _STREAMER_SANITIZE_RE.sub("-", str(value or "").strip().lower())
    normalized = normalized.strip("-_")
    return normalized[:64]


def normalize_device_id(value: str | None) -> str:
    normalized = _DEVICE_SANITIZE_RE.sub("-", str(value or "").strip())
    normalized = normalized.strip("-._:")
    return normalized[:80]


def _scoped_query(query, streamer_id: str | None):
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if scoped_streamer_id:
        return query.filter(DonationRecord.streamer_id == scoped_streamer_id)
    return query


def _now() -> datetime:
    return datetime.now()


def _ensure_legacy_schema():
    if engine.url.get_backend_name() != "sqlite":
        return

    with engine.begin() as conn:
        donation_columns = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(donations)"))
        }
        if "streamer_id" not in donation_columns:
            conn.execute(text("ALTER TABLE donations ADD COLUMN streamer_id VARCHAR(64) DEFAULT ''"))
        if "device_id" not in donation_columns:
            conn.execute(text("ALTER TABLE donations ADD COLUMN device_id VARCHAR(80) DEFAULT ''"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_donations_streamer_id ON donations (streamer_id)"))


def init_db():
    Base.metadata.create_all(engine)
    _ensure_legacy_schema()


def donation_to_dict(row: DonationRecord) -> dict:
    return {
        "id": row.id,
        "streamer_id": row.streamer_id,
        "device_id": row.device_id,
        "donor_name": row.donor_name,
        "amount": row.amount,
        "currency": row.currency,
        "message": row.message,
        "raw_text": row.raw_text,
        "source_app": row.source_app,
        "confidence": row.confidence,
        "raw_signature": row.raw_signature,
        "status": row.status,
        "published": bool(row.published),
        "publish_error": row.publish_error,
        "created_at": row.created_at.isoformat() if row.created_at else "",
    }


def save_donation(parsed, streamer_id: str | None = None, device_id: str | None = None):
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    scoped_device_id = normalize_device_id(device_id)
    with SessionLocal() as session:
        item = DonationRecord(
            streamer_id=scoped_streamer_id,
            device_id=scoped_device_id,
            donor_name=parsed.donor_name or "",
            amount=parsed.amount or 0,
            currency=parsed.currency,
            message=parsed.message or "",
            raw_text=parsed.raw_text,
            source_app=parsed.source_app,
            confidence=parsed.confidence,
            raw_signature=parsed.raw_signature,
            status=parsed.status,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item


def mark_published(row_id: int):
    with SessionLocal() as session:
        row = session.get(DonationRecord, row_id)
        if not row:
            return
        row.published = 1
        row.publish_error = ""
        session.commit()


def mark_publish_error(row_id: int, error_text: str):
    with SessionLocal() as session:
        row = session.get(DonationRecord, row_id)
        if not row:
            return
        row.publish_error = error_text[:1000]
        session.commit()


def get_recent_history(limit: int = 100, streamer_id: str | None = None):
    with SessionLocal() as session:
        query = _scoped_query(session.query(DonationRecord), streamer_id)
        rows = query.order_by(DonationRecord.id.desc()).limit(limit).all()
        return list(rows)


def get_donations(limit: int = 100, after_id: int = 0, streamer_id: str | None = None):
    with SessionLocal() as session:
        query = _scoped_query(session.query(DonationRecord), streamer_id)
        if after_id > 0:
            query = query.filter(DonationRecord.id > after_id)
        rows = query.order_by(DonationRecord.id.asc()).limit(limit).all()
        return list(rows)


def get_last_donation(streamer_id: str | None = None):
    with SessionLocal() as session:
        query = _scoped_query(session.query(DonationRecord), streamer_id)
        return (
            query.order_by(DonationRecord.id.desc()).first()
        )


def get_all_donations(streamer_id: str | None = None):
    with SessionLocal() as session:
        query = _scoped_query(session.query(DonationRecord), streamer_id)
        rows = query.order_by(DonationRecord.id.asc()).all()
        return list(rows)


def exists_signature(signature: str, streamer_id: str | None = None):
    with SessionLocal() as session:
        query = session.query(DonationRecord).filter(DonationRecord.raw_signature == signature)
        scoped_streamer_id = normalize_streamer_id(streamer_id)
        if scoped_streamer_id:
            query = query.filter(DonationRecord.streamer_id == scoped_streamer_id)
        row = query.first()
        return row is not None


def exists_compound_duplicate(
    donor_name: str | None,
    amount: int | None,
    raw_text: str,
    streamer_id: str | None = None,
):
    target_signature = build_compound_signature(donor_name, amount, raw_text)
    normalized_name = normalize_name_for_key(donor_name)
    amount_value = int(amount or 0)

    if not target_signature or not normalized_name or amount_value <= 0:
        return False

    with SessionLocal() as session:
        recent_cutoff = datetime.now() - timedelta(hours=24)
        query = (
            session.query(DonationRecord)
            .filter(DonationRecord.amount == amount_value)
            .filter(DonationRecord.created_at >= recent_cutoff)
        )
        scoped_streamer_id = normalize_streamer_id(streamer_id)
        if scoped_streamer_id:
            query = query.filter(DonationRecord.streamer_id == scoped_streamer_id)
        rows = query.all()

        for row in rows:
            if normalize_name_for_key(row.donor_name) != normalized_name:
                continue
            row_signature = build_compound_signature(row.donor_name, row.amount, row.raw_text)
            if row_signature and row_signature == target_signature:
                return True

        return False


def get_donations_since(moment: datetime | None, streamer_id: str | None = None):
    with SessionLocal() as session:
        query = _scoped_query(session.query(DonationRecord), streamer_id)
        if moment is not None:
            query = query.filter(DonationRecord.created_at >= moment)
        rows = query.order_by(DonationRecord.id.asc()).all()
        return list(rows)


def _account_to_dict(row: StreamerAccount) -> dict:
    return {
        "streamer_id": row.streamer_id,
        "display_name": row.display_name,
        "token": row.token,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _device_to_dict(row: DeviceBinding) -> dict:
    return {
        "device_id": row.device_id,
        "device_name": row.device_name,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else "",
    }


def create_or_get_streamer_account(streamer_id: str, display_name: str = "") -> dict:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    safe_display_name = str(display_name or "").strip()
    if not scoped_streamer_id:
        raise ValueError("streamer_id is required")

    with SessionLocal() as session:
        row = (
            session.query(StreamerAccount)
            .filter(StreamerAccount.streamer_id == scoped_streamer_id)
            .first()
        )
        if not row:
            row = StreamerAccount(
                streamer_id=scoped_streamer_id,
                display_name=(safe_display_name or scoped_streamer_id)[:120],
                token=secrets.token_urlsafe(24),
                created_at=_now(),
                updated_at=_now(),
            )
            session.add(row)
        elif safe_display_name:
            row.display_name = safe_display_name[:120]
            row.updated_at = _now()

        session.commit()
        session.refresh(row)
        return _account_to_dict(row)


def get_streamer_account(streamer_id: str) -> dict | None:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if not scoped_streamer_id:
        return None

    with SessionLocal() as session:
        row = (
            session.query(StreamerAccount)
            .filter(StreamerAccount.streamer_id == scoped_streamer_id)
            .first()
        )
        return _account_to_dict(row) if row else None


def rotate_streamer_token(streamer_id: str) -> dict:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if not scoped_streamer_id:
        raise ValueError("streamer_id is required")

    with SessionLocal() as session:
        row = (
            session.query(StreamerAccount)
            .filter(StreamerAccount.streamer_id == scoped_streamer_id)
            .first()
        )
        if not row:
            row = StreamerAccount(
                streamer_id=scoped_streamer_id,
                display_name=scoped_streamer_id,
                token=secrets.token_urlsafe(24),
                created_at=_now(),
                updated_at=_now(),
            )
            session.add(row)
        else:
            row.token = secrets.token_urlsafe(24)
            row.updated_at = _now()

        session.commit()
        session.refresh(row)
        return _account_to_dict(row)


def verify_streamer_token(streamer_id: str, token: str | None) -> bool:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    provided_token = (token or "").strip()
    if not scoped_streamer_id or not provided_token:
        return False

    with SessionLocal() as session:
        row = (
            session.query(StreamerAccount)
            .filter(StreamerAccount.streamer_id == scoped_streamer_id)
            .first()
        )
        if not row or not row.token:
            return False
        return secrets.compare_digest(row.token, provided_token)


def bind_device(streamer_id: str, device_id: str, device_name: str = "") -> dict:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    scoped_device_id = normalize_device_id(device_id)
    safe_device_name = str(device_name or "").strip()
    if not scoped_streamer_id or not scoped_device_id:
        raise ValueError("streamer_id and device_id are required")

    create_or_get_streamer_account(scoped_streamer_id)

    with SessionLocal() as session:
        row = (
            session.query(DeviceBinding)
            .filter(DeviceBinding.streamer_id == scoped_streamer_id)
            .filter(DeviceBinding.device_id == scoped_device_id)
            .first()
        )
        if not row:
            row = DeviceBinding(
                streamer_id=scoped_streamer_id,
                device_id=scoped_device_id,
                device_name=safe_device_name[:120],
                created_at=_now(),
                last_seen_at=_now(),
            )
            session.add(row)
        else:
            if safe_device_name:
                row.device_name = safe_device_name[:120]
            row.last_seen_at = _now()

        session.commit()
        session.refresh(row)
        return _device_to_dict(row)


def list_bound_devices(streamer_id: str) -> list[dict]:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if not scoped_streamer_id:
        return []

    with SessionLocal() as session:
        rows = (
            session.query(DeviceBinding)
            .filter(DeviceBinding.streamer_id == scoped_streamer_id)
            .order_by(DeviceBinding.last_seen_at.desc())
            .all()
        )
        return [_device_to_dict(row) for row in rows]


def save_streamer_settings(streamer_id: str, settings: dict) -> dict:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if not scoped_streamer_id:
        raise ValueError("streamer_id is required")

    payload = json.dumps(settings or {}, ensure_ascii=False)
    with SessionLocal() as session:
        row = (
            session.query(StreamerSettingsRecord)
            .filter(StreamerSettingsRecord.streamer_id == scoped_streamer_id)
            .first()
        )
        if not row:
            row = StreamerSettingsRecord(
                streamer_id=scoped_streamer_id,
                settings_json=payload,
                updated_at=_now(),
            )
            session.add(row)
        else:
            row.settings_json = payload
            row.updated_at = _now()

        session.commit()
        return settings or {}


def load_streamer_settings(streamer_id: str) -> dict | None:
    scoped_streamer_id = normalize_streamer_id(streamer_id)
    if not scoped_streamer_id:
        return None

    with SessionLocal() as session:
        row = (
            session.query(StreamerSettingsRecord)
            .filter(StreamerSettingsRecord.streamer_id == scoped_streamer_id)
            .first()
        )
        if not row or not row.settings_json.strip():
            return None
        try:
            return json.loads(row.settings_json)
        except json.JSONDecodeError:
            return None
