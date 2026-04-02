from __future__ import annotations

import re

import uiautomation as auto

from app.config import (
    KASPI_NEGATIVE_KEYWORDS,
    KASPI_REQUIRED_KEYWORDS,
    KASPI_TRANSFER_KEYWORDS,
    PHONE_LINK_TITLES,
    PHONE_LINK_UI_NOISE,
)


AMOUNT_RE = re.compile(
    r"(?<!\d)\d[\d\s]{0,15}\s*(?:₸|тг|тенге|kzt)(?=\s|$|[|.,!?:;])",
    re.IGNORECASE,
)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def clean_block_lines(lines: list[str]) -> list[str]:
    cleaned = []
    for line in lines:
        value = normalize_spaces(line)
        if not value:
            continue

        low = value.lower()
        if any(noise in low for noise in PHONE_LINK_UI_NOISE):
            continue

        cleaned.append(value)
    return cleaned


def block_signature(text: str) -> str:
    return normalize_spaces(text).lower()


def has_amount_signal(text: str) -> bool:
    return bool(AMOUNT_RE.search(text))


def is_kaspi_candidate_block(text: str) -> bool:
    normalized = normalize_spaces(text)
    if not normalized:
        return False

    low = normalized.lower()
    if not any(keyword in low for keyword in KASPI_REQUIRED_KEYWORDS):
        return False

    if any(keyword in low for keyword in KASPI_NEGATIVE_KEYWORDS):
        return False

    if not has_amount_signal(normalized):
        return False

    return any(keyword in low for keyword in KASPI_TRANSFER_KEYWORDS)


def get_phone_link_window():
    auto.SetGlobalSearchTimeout(1)
    for title in PHONE_LINK_TITLES:
        window = auto.WindowControl(searchDepth=1, Name=title)
        if window.Exists(0, 0):
            return window
    return None


def append_candidate(results: list[str], seen: set[str], raw_block: str):
    if not raw_block:
        return

    signature = block_signature(raw_block)
    if signature in seen:
        return

    if not is_kaspi_candidate_block(raw_block):
        return

    seen.add(signature)
    results.append(raw_block)


def collect_candidate_texts(window) -> list[str]:
    results: list[str] = []
    seen: set[str] = set()

    for item, _ in auto.WalkControl(window, maxDepth=18):
        try:
            if item.ControlType in (auto.ControlType.ListItemControl, auto.ControlType.GroupControl):
                texts = []
                for child, __ in auto.WalkControl(item, maxDepth=6):
                    if child.ControlType == auto.ControlType.TextControl and child.Name:
                        texts.append(child.Name)

                block_lines = clean_block_lines(texts)
                if 2 <= len(block_lines) <= 8:
                    append_candidate(results, seen, "\n".join(block_lines))

            elif item.ControlType == auto.ControlType.TextControl and item.Name:
                line = normalize_spaces(item.Name)
                if line:
                    append_candidate(results, seen, line)
        except Exception:
            continue

    return results
