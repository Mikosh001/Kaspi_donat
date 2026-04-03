from pathlib import Path
import os
import sys


def _read_int_env(name: str, default: int) -> int:
    value = os.getenv(name, str(default)).strip()
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name, "1" if default else "0").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _derive_connect_api_url(ingest_url: str) -> str:
    value = (ingest_url or "").strip()
    if not value:
        return ""
    if value.endswith("/cloud/ingest"):
        return f"{value[:-len('/cloud/ingest')]}/cloud/claim-device"
    if value.endswith("/ingest"):
        return f"{value[:-len('/ingest')]}/claim-device"
    return ""


def _is_frozen_runtime() -> bool:
    return bool(getattr(sys, "frozen", False))

FROZEN_RUNTIME = _is_frozen_runtime()

BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = Path(sys.executable).resolve().parent if FROZEN_RUNTIME else BASE_DIR
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", APP_DIR if FROZEN_RUNTIME else BASE_DIR))

if FROZEN_RUNTIME:
    appdata_root = Path(os.getenv("APPDATA", str(Path.home())))
    DATA_DIR = appdata_root / "KazAlerts" / "data"
else:
    DATA_DIR = BASE_DIR / "data"

DEBUG_DIR = DATA_DIR / "debug"

_web_candidates = [
    RESOURCE_DIR / "web",
    APP_DIR / "web",
    BASE_DIR / "web",
]
WEB_DIR = next((candidate for candidate in _web_candidates if candidate.exists()), _web_candidates[0])

DATA_DIR.mkdir(parents=True, exist_ok=True)
DEBUG_DIR.mkdir(parents=True, exist_ok=True)
if not WEB_DIR.exists() and not FROZEN_RUNTIME:
    WEB_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "app.db"
WEB_SETTINGS_PATH = DATA_DIR / "overlay_settings.json"
DEVICE_ID_PATH = DATA_DIR / "device_id.txt"
DEVICE_AUTH_PATH = DATA_DIR / "device_auth.json"

DATABASE_URL = os.getenv("KAZ_ALERTS_DATABASE_URL", f"sqlite:///{DB_PATH}")

SITE_API_URL = os.getenv("KAZ_ALERTS_API_URL", "")
SITE_API_KEY = os.getenv("KAZ_ALERTS_API_KEY", "")
CONNECT_API_URL = os.getenv("KAZ_ALERTS_CONNECT_URL", "").strip() or _derive_connect_api_url(SITE_API_URL)
PUBLIC_BASE_URL = os.getenv("KAZ_ALERTS_PUBLIC_BASE_URL", "").strip().rstrip("/")
DEFAULT_STREAMER_ID = os.getenv("KAZ_ALERTS_STREAMER_ID", "").strip()
AUTO_START_LISTENER = _read_bool_env("KAZ_ALERTS_AUTOSTART", default=False)

FIREBASE_API_KEY = os.getenv("KAZ_ALERTS_FIREBASE_API_KEY", "").strip()
FIREBASE_PROJECT_ID = os.getenv("KAZ_ALERTS_FIREBASE_PROJECT_ID", "").strip()
FIREBASE_AUTH_EMAIL = os.getenv("KAZ_ALERTS_FIREBASE_AUTH_EMAIL", "").strip()
FIREBASE_AUTH_PASSWORD = os.getenv("KAZ_ALERTS_FIREBASE_AUTH_PASSWORD", "").strip()
FIREBASE_DIRECT_ENABLED = _read_bool_env(
    "KAZ_ALERTS_FIREBASE_DIRECT",
    default=bool(
        FIREBASE_API_KEY
        and FIREBASE_PROJECT_ID
        and FIREBASE_AUTH_EMAIL
        and FIREBASE_AUTH_PASSWORD
    ),
)

PHONE_LINK_TITLES = [
    "Связь с телефоном",
    "Phone Link",
]

KASPI_REQUIRED_KEYWORDS = [
    "kaspi",
    "каспи",
]

KASPI_TRANSFER_KEYWORDS = [
    "перевод",
    "поступление",
    "зачисление",
    "пополнение",
    "түсті",
    "жіберуші",
    "жиберуші",
    "отправитель",
    "сообщение",
    "хабарлама",
    "₸",
    "тг",
    "тенге",
]

KASPI_NEGATIVE_KEYWORDS = [
    "покупка",
    "оплата",
    "рассрочка",
    "кредит",
    "депозит",
    "бонус",
    "кэшбэк",
    "кешбек",
    "qr",
    "снятие",
    "вы перевели",
    "исходящий",
]

PHONE_LINK_UI_NOISE = [
    "очистить все",
    "подтвердить получение перевода",
    "reply",
    "ответить",
    "открыть на телефоне",
    "вчера",
    "сегодня",
]

POLL_INTERVAL_SECONDS = 1.2
PUBLISH_RETRY_SECONDS = 8
RECENT_DEDUPE_SECONDS = 180
MIN_CONFIDENCE_TO_SAVE = 0.6
MAX_MESSAGE_LENGTH = 220

WEB_HOST = os.getenv("KAZ_ALERTS_WEB_HOST", "127.0.0.1").strip() or "127.0.0.1"
WEB_PORT = _read_int_env("PORT", _read_int_env("KAZ_ALERTS_WEB_PORT", 3400))
ENFORCE_STREAMER_SCOPE = _read_bool_env("KAZ_ALERTS_ENFORCE_STREAMER_SCOPE", default=False)

APP_NAME = "Kaz Alerts MVP"
