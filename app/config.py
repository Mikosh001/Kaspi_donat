from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DEBUG_DIR = DATA_DIR / "debug"
WEB_DIR = BASE_DIR / "web"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DEBUG_DIR.mkdir(parents=True, exist_ok=True)
WEB_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "app.db"
WEB_SETTINGS_PATH = DATA_DIR / "overlay_settings.json"
DEVICE_ID_PATH = DATA_DIR / "device_id.txt"

DATABASE_URL = os.getenv("KAZ_ALERTS_DATABASE_URL", f"sqlite:///{DB_PATH}")

SITE_API_URL = os.getenv("KAZ_ALERTS_API_URL", "")
SITE_API_KEY = os.getenv("KAZ_ALERTS_API_KEY", "")
PUBLIC_BASE_URL = os.getenv("KAZ_ALERTS_PUBLIC_BASE_URL", "").strip().rstrip("/")

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

WEB_HOST = "127.0.0.1"
WEB_PORT = 3400

APP_NAME = "Kaz Alerts MVP"
