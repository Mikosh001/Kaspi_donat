from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ParsedDonation(BaseModel):
    donor_name: Optional[str] = None
    amount: Optional[int] = None
    currency: str = "KZT"
    message: Optional[str] = None
    raw_text: str
    source_app: str = "kaspi_phone_link"
    confidence: float = 0.0
    received_at: datetime = Field(default_factory=datetime.now)
    raw_signature: str
    status: str = "new"


class PublishPayload(BaseModel):
    streamer_id: str
    donor_name: str
    amount: int
    currency: str = "KZT"
    message: str
    raw_text: str
    received_at: str
    confidence: float
    device_id: Optional[str] = None
