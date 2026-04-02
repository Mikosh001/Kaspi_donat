from __future__ import annotations

import re

from app.config import (
    KASPI_NEGATIVE_KEYWORDS,
    KASPI_REQUIRED_KEYWORDS,
    KASPI_TRANSFER_KEYWORDS,
    MAX_MESSAGE_LENGTH,
    MIN_CONFIDENCE_TO_SAVE,
    PHONE_LINK_UI_NOISE,
)
from app.dedupe import build_signature
from app.models import ParsedDonation


AMOUNT_RE = re.compile(
    r"(?<!\d)(\d[\d\s]{0,15})\s*(?:₸|тг|тенге|kzt)(?=\s|$|[|.,!?:;])",
    re.IGNORECASE,
)
MESSAGE_PATTERNS = [
    re.compile(r"(?:сообщение|хабарлама)\s*[:\-]?\s*(.+)", re.IGNORECASE),
]
NAME_PATTERNS = [
    re.compile(
        r"(?:^|[\s|])(?:жіберуші|жиберуші|отправитель|from|от)\s*[:\-]?\s*([^\n]{2,80})",
        re.IGNORECASE,
    ),
    re.compile(
        r"([A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүІіЁё .'\-]{1,60})\s+"
        r"(?:жіберді|прислал(?:а)?|отправил(?:а)?)",
        re.IGNORECASE,
    ),
]
NAME_LINE_RE = re.compile(
    r"^[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүІіЁё][A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүІіЁё .'\-]{1,60}$"
)
TIME_PREFIX_RE = re.compile(r"^\d{1,2}:\d{2}\s*")
INLINE_NAME_MESSAGE_RE = re.compile(r"^([^:]{2,60})\s*:\s*(.+)$")


def clean_text(text: str) -> str:
    text = (text or "").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)

    lines = []
    for line in text.splitlines():
        value = line.strip(" \t-•")
        if not value:
            continue
        lines.append(value)
    return "\n".join(lines).strip()


def contains_any(text: str, words: list[str]) -> bool:
    low = text.lower()
    return any(word in low for word in words)


def has_amount(text: str) -> bool:
    return bool(AMOUNT_RE.search(text))


def is_kaspi_related(text: str) -> bool:
    low = text.lower()
    if not any(keyword in low for keyword in KASPI_REQUIRED_KEYWORDS):
        return False
    if any(keyword in low for keyword in KASPI_NEGATIVE_KEYWORDS):
        return False
    if not has_amount(text):
        return False
    return any(keyword in low for keyword in KASPI_TRANSFER_KEYWORDS)


def extract_amount(text: str):
    candidates = []
    for match in AMOUNT_RE.finditer(text):
        digits = re.sub(r"\s+", "", match.group(1))
        try:
            amount = int(digits)
        except ValueError:
            continue

        if amount <= 0:
            continue

        start = max(0, match.start() - 28)
        end = min(len(text), match.end() + 28)
        context = text[start:end].lower()

        score = 0
        if any(word in context for word in KASPI_TRANSFER_KEYWORDS):
            score += 2
        if any(word in context for word in KASPI_NEGATIVE_KEYWORDS):
            score -= 3

        candidates.append((score, match.start(), amount))

    if not candidates:
        return None

    candidates.sort(key=lambda item: (-item[0], item[1]))
    return candidates[0][2]


def strip_noise_lines(lines: list[str]) -> list[str]:
    cleaned = []
    for line in lines:
        low = line.lower()
        if any(word in low for word in PHONE_LINK_UI_NOISE):
            continue
        cleaned.append(line)
    return cleaned


def normalize_person_name(value: str):
    value = clean_text(value)
    value = TIME_PREFIX_RE.sub("", value).strip(" .:-")
    if not value:
        return None
    if len(value) > 60:
        return None

    low = value.lower()
    if any(word in low for word in KASPI_REQUIRED_KEYWORDS):
        return None
    if any(word in low for word in KASPI_TRANSFER_KEYWORDS):
        return None
    if any(word in low for word in KASPI_NEGATIVE_KEYWORDS):
        return None
    if has_amount(value):
        return None
    if not NAME_LINE_RE.match(value):
        return None
    return value


def normalize_message(value: str | None):
    if not value:
        return None
    value = clean_text(value).strip(" .:-")
    if not value:
        return None
    if has_amount(value):
        return None
    if contains_any(value, KASPI_REQUIRED_KEYWORDS):
        return None
    return value[:MAX_MESSAGE_LENGTH]


def split_inline_name_message(line: str):
    cleaned = clean_text(line)
    match = INLINE_NAME_MESSAGE_RE.match(cleaned)
    if not match:
        return None, None

    donor_name = normalize_person_name(match.group(1))
    message = normalize_message(match.group(2))
    if donor_name and message:
        return donor_name, message
    return None, None


def extract_name_message_from_amount_line(line: str):
    match = AMOUNT_RE.search(line)
    if not match:
        return None, None

    tail = clean_text(line[match.end() :]).strip(" |:-")
    if not tail:
        return None, None

    tail = re.sub(
        r"^(?:от|from|отправитель|жіберуші|жиберуші)\s*[:\-]?\s*",
        "",
        tail,
        flags=re.IGNORECASE,
    )
    donor_name, message = split_inline_name_message(tail)
    if donor_name:
        return donor_name, message

    donor_name = normalize_person_name(tail)
    if donor_name:
        return donor_name, None

    return None, None


def extract_message(lines: list[str], donor_name: str | None):
    joined = "\n".join(lines)

    for pattern in MESSAGE_PATTERNS:
        match = pattern.search(joined)
        if match:
            message = normalize_message(match.group(1))
            if message:
                return message

    if donor_name:
        for line in lines:
            inline_name, inline_message = split_inline_name_message(line)
            if inline_name == donor_name and inline_message:
                return inline_message

    if not donor_name:
        return None

    donor_reached = False
    message_parts = []
    for line in lines:
        inline_name, inline_message = split_inline_name_message(line)
        if inline_name == donor_name and inline_message:
            return inline_message

        if not donor_reached and normalize_person_name(line) == donor_name:
            donor_reached = True
            continue
        if not donor_reached:
            continue
        if has_amount(line):
            continue
        if contains_any(line, KASPI_REQUIRED_KEYWORDS + KASPI_TRANSFER_KEYWORDS):
            continue

        message = normalize_message(line)
        if message:
            message_parts.append(message)

    if message_parts:
        return clean_text(" ".join(message_parts))[:MAX_MESSAGE_LENGTH]

    return None


def extract_name_and_message(lines: list[str], amount: int | None):
    if not lines:
        return None, None

    work = strip_noise_lines(lines)
    if not work:
        return None, None

    joined = "\n".join(work)

    donor_name = None
    for pattern in NAME_PATTERNS:
        match = pattern.search(joined)
        if match:
            donor_name = normalize_person_name(match.group(1))
            if donor_name:
                break

    amount_index = None
    for i, line in enumerate(work):
        digits = re.sub(r"[^\d]", "", line)
        if amount is not None and str(amount) in digits:
            amount_index = i
            break
        if AMOUNT_RE.search(line):
            amount_index = i
            break

    inline_message = None
    if amount_index is not None:
        amount_line_name, amount_line_message = extract_name_message_from_amount_line(work[amount_index])
        if amount_line_name:
            donor_name = donor_name or amount_line_name
        if amount_line_message:
            inline_message = amount_line_message

    search_order = work
    if amount_index is not None:
        search_order = work[amount_index + 1 :] + work[:amount_index]

    for line in search_order:
        inline_name, maybe_message = split_inline_name_message(line)
        if inline_name:
            donor_name = donor_name or inline_name
            inline_message = inline_message or maybe_message
            break

    if donor_name is None:
        for line in search_order:
            candidate = normalize_person_name(line)
            if candidate:
                donor_name = candidate
                break

    message = inline_message or extract_message(work, donor_name)
    return donor_name, message


def parse_donation(text: str) -> ParsedDonation | None:
    raw_text = clean_text(text)
    if not raw_text:
        return None
    if not is_kaspi_related(raw_text):
        return None

    amount = extract_amount(raw_text)
    lines = raw_text.splitlines()
    donor_name, message = extract_name_and_message(lines, amount)

    if amount is None or donor_name is None:
        return None

    confidence = 0.0
    low = raw_text.lower()
    if any(keyword in low for keyword in KASPI_REQUIRED_KEYWORDS):
        confidence += 0.35
    if amount is not None:
        confidence += 0.25
    if donor_name:
        confidence += 0.20
    if any(keyword in low for keyword in KASPI_TRANSFER_KEYWORDS):
        confidence += 0.10
    if message:
        confidence += 0.10
    if any(keyword in low for keyword in KASPI_NEGATIVE_KEYWORDS):
        confidence -= 0.50

    confidence = max(0.0, min(1.0, round(confidence, 2)))
    status = "ready" if confidence >= MIN_CONFIDENCE_TO_SAVE else "needs_review"

    if not message:
        message = "Хабарлама жоқ"

    return ParsedDonation(
        donor_name=donor_name,
        amount=amount,
        message=message,
        raw_text=raw_text,
        raw_signature=build_signature(raw_text),
        confidence=confidence,
        status=status,
    )
