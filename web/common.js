const DRAFT_SETTINGS_KEY = "kaz_alerts_preview_draft";
const STREAMER_TOKEN_KEY_PREFIX = "kaz_alerts_streamer_token_";
const STREAMER_CONTEXT = resolveStreamerContext();

function resolveStreamerContext() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const pathStreamerId = pathParts[0] === "s" ? pathParts[1] || "" : "";
  const queryStreamerId = getQueryParam("streamer_id", "");
  const streamerId = String(pathStreamerId || queryStreamerId || "").trim().toLowerCase();

  let token = "";
  const queryToken = getQueryParam("token", "").trim();
  if (streamerId) {
    const tokenKey = `${STREAMER_TOKEN_KEY_PREFIX}${streamerId}`;
    if (queryToken) {
      localStorage.setItem(tokenKey, queryToken);
      token = queryToken;
    } else {
      token = localStorage.getItem(tokenKey) || "";
    }
  }

  return {
    id: streamerId,
    token: token.trim(),
    basePath: streamerId ? `/s/${encodeURIComponent(streamerId)}` : ""
  };
}

function getStreamerContext() {
  return { ...STREAMER_CONTEXT };
}

function setStreamerToken(token) {
  if (!STREAMER_CONTEXT.id) {
    return;
  }
  const tokenKey = `${STREAMER_TOKEN_KEY_PREFIX}${STREAMER_CONTEXT.id}`;
  const safeToken = String(token || "").trim();
  if (!safeToken) {
    localStorage.removeItem(tokenKey);
    STREAMER_CONTEXT.token = "";
    return;
  }
  localStorage.setItem(tokenKey, safeToken);
  STREAMER_CONTEXT.token = safeToken;
}

function scopedRoute(path) {
  if (!STREAMER_CONTEXT.id) {
    return path;
  }
  if (!path || !path.startsWith("/") || path.startsWith("/s/")) {
    return path;
  }
  return `${STREAMER_CONTEXT.basePath}${path}`;
}

function withStreamerApiContext(url) {
  if (!STREAMER_CONTEXT.id) {
    return url;
  }
  const parsed = new URL(url, window.location.origin);
  if (!parsed.pathname.startsWith("/api/")) {
    return url;
  }
  if (!parsed.searchParams.has("streamer_id")) {
    parsed.searchParams.set("streamer_id", STREAMER_CONTEXT.id);
  }
  if (/^https?:\/\//i.test(url)) {
    return parsed.toString();
  }
  return `${parsed.pathname}${parsed.search}`;
}

function streamerHeaders() {
  const headers = {};
  if (STREAMER_CONTEXT.id) {
    headers["X-Streamer-ID"] = STREAMER_CONTEXT.id;
  }
  if (STREAMER_CONTEXT.token) {
    headers["X-Streamer-Token"] = STREAMER_CONTEXT.token;
  }
  return headers;
}

const STYLE_META = {
  classic: {
    id: "classic",
    label: "Classic",
    description: "Gold, silver, bronze leaderboard",
    accent: "#ffbc2e",
    accentSoft: "#ffe69a",
    text: "#fff8df",
    muted: "rgba(255,244,208,0.72)",
    background: "linear-gradient(135deg, rgba(31, 22, 10, 0.97), rgba(55, 41, 16, 0.94))",
    border: "rgba(255,188,46,0.28)",
    fontFamily: "\"Arial Black\", \"Bahnschrift\", sans-serif"
  },
  cyberpunk: {
    id: "cyberpunk",
    label: "CyberPunk",
    description: "Neon interface and glitch feel",
    accent: "#45f5ff",
    accentSoft: "#ff4fd8",
    text: "#ebfffe",
    muted: "rgba(182,251,255,0.7)",
    background: "linear-gradient(135deg, rgba(8, 15, 30, 0.98), rgba(29, 8, 34, 0.94))",
    border: "rgba(69,245,255,0.32)",
    fontFamily: "\"Consolas\", \"Segoe UI\", monospace"
  },
  pubg: {
    id: "pubg",
    label: "PUBG",
    description: "Battle Royale industrial gold",
    accent: "#fff512",
    accentSoft: "#de8d00",
    text: "#fffef0",
    muted: "rgba(255, 236, 170, 0.8)",
    background: "linear-gradient(135deg, rgba(21, 21, 18, 0.96), rgba(47, 43, 31, 0.96))",
    border: "rgba(255,245,18,0.34)",
    fontFamily: "\"Arial Black\", \"Impact\", sans-serif"
  },
  pink: {
    id: "pink",
    label: "Pink",
    description: "Soft glossy pink theme",
    accent: "#ff5ea8",
    accentSoft: "#ffc6e0",
    text: "#fff7fb",
    muted: "rgba(255,221,236,0.82)",
    background: "linear-gradient(135deg, rgba(59, 24, 41, 0.95), rgba(117, 44, 86, 0.92))",
    border: "rgba(255,94,168,0.28)",
    fontFamily: "\"Trebuchet MS\", \"Segoe UI\", sans-serif"
  },
  ember: null,
  gold: null,
  cyber: null,
  glass: {
    id: "glass",
    label: "Glass",
    description: "Transparent modern card",
    accent: "#ffffff",
    accentSoft: "#cfd8e3",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.72)",
    background: "rgba(23, 26, 31, 0.56)",
    border: "rgba(255,255,255,0.14)",
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", sans-serif"
  }
};

STYLE_META.ember = { ...STYLE_META.classic, id: "ember", label: "Ember", description: "Warm orange broadcast style", accent: "#ff5631", accentSoft: "#ff8a6f", background: "linear-gradient(135deg, rgba(25, 15, 12, 0.94), rgba(42, 21, 18, 0.94))", border: "rgba(255,122,92,0.24)" };
STYLE_META.gold = { ...STYLE_META.classic, id: "gold", label: "Gold", description: "Classic gold leaderboard" };
STYLE_META.cyber = { ...STYLE_META.cyberpunk, id: "cyber", label: "Cyber", description: "Neon green cyber style", accent: "#7bff00", accentSoft: "#b6ff6d", border: "rgba(123,255,0,0.22)" };

const STYLE_ORDER = ["classic", "cyberpunk", "pubg", "pink", "glass", "ember", "gold", "cyber"];

const DEMO_DONATION = {
  id: 999999,
  donor_name: "Мейірбек Р.",
  display_name: "Мейірбек Р.",
  amount: 100,
  message: "Салам қалайсың",
  tts_text: "Мейірбек Р. 100 теңге. Салам қалайсың",
  music_request_text: "QARAKESSEK - Құраған гүл",
  youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  notification_time: "22:29"
};

const DEMO_TOP_ITEMS = [
  { donor_name: "Донатер 1", total_amount: 10000, donation_count: 5 },
  { donor_name: "Донатер 2", total_amount: 6500, donation_count: 3 },
  { donor_name: "Донатер 3", total_amount: 4200, donation_count: 2 },
  { donor_name: "Донатер 4", total_amount: 2000, donation_count: 1 },
  { donor_name: "Донатер 5", total_amount: 1000, donation_count: 1 }
];

function normalizeStyleId(styleId) {
  if (!styleId) {
    return "classic";
  }
  const normalized = String(styleId).toLowerCase();
  const aliases = {
    ember: "classic",
    gold: "classic",
    cyber: "cyberpunk"
  };
  return aliases[normalized] || normalized;
}

function getStyleMeta(styleId) {
  return STYLE_META[normalizeStyleId(styleId)] || STYLE_META.classic;
}

function listAvailableStyles() {
  return STYLE_ORDER.map((id) => getStyleMeta(id));
}

function isPreviewMode() {
  return getQueryParam("preview", "0") === "1";
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object") {
    return JSON.parse(JSON.stringify(base || {}));
  }

  const result = Array.isArray(base) ? [...base] : { ...(base || {}) };
  Object.entries(patch).forEach(([key, value]) => {
    const current = result[key];
    if (Array.isArray(value)) {
      result[key] = value.map((item) => (typeof item === "object" && item ? { ...item } : item));
      return;
    }
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(current, value);
      return;
    }
    result[key] = value;
  });
  return result;
}

async function apiGet(url) {
  const scopedUrl = withStreamerApiContext(url);
  const response = await fetch(scopedUrl, {
    cache: "no-store",
    headers: {
      ...streamerHeaders()
    }
  });
  if (!response.ok) {
    throw new Error(`GET ${scopedUrl} failed`);
  }
  return response.json();
}

async function apiPost(url, payload) {
  const scopedUrl = withStreamerApiContext(url);
  const response = await fetch(scopedUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...streamerHeaders()
    },
    body: JSON.stringify(payload || {})
  });
  if (!response.ok) {
    throw new Error(`POST ${scopedUrl} failed`);
  }
  return response.json();
}

function formatAmount(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getQueryParam(name, fallback = "") {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || fallback;
}

function copyText(value) {
  return navigator.clipboard.writeText(value);
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSoundLayerLines(value) {
  return splitLines(value).map((line) => {
    const [urlPart, volumePart] = line.split("|");
    return {
      url: (urlPart || "").trim(),
      volume: clamp(Number((volumePart || "100").trim() || 100), 0, 100)
    };
  }).filter((item) => item.url);
}

function soundLayersToText(layers) {
  return (Array.isArray(layers) ? layers : []).map((item) => {
    const url = String(item?.url || "").trim();
    const volume = clamp(Number(item?.volume || 100), 0, 100);
    return url ? `${url}|${volume}` : "";
  }).filter(Boolean).join("\n");
}

function loadDraftSettings() {
  try {
    const raw = localStorage.getItem(DRAFT_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraftSettings(settings) {
  localStorage.setItem(DRAFT_SETTINGS_KEY, JSON.stringify(settings || {}));
}

function clearDraftSettings() {
  localStorage.removeItem(DRAFT_SETTINGS_KEY);
}

async function loadEffectiveSettings() {
  const saved = await apiGet("/api/settings");
  if (!isPreviewMode()) {
    return saved;
  }
  const draft = loadDraftSettings();
  return draft ? deepMerge(saved, draft) : saved;
}

function resolveOverlayTheme(styleId, overrides = {}) {
  const preset = getStyleMeta(styleId);
  return {
    accent: overrides.accent_color || preset.accent,
    accentSoft: preset.accentSoft,
    text: overrides.text_color || preset.text,
    muted: preset.muted,
    background: overrides.background || preset.background,
    border: overrides.border_color || preset.border,
    fontFamily: overrides.font_family || preset.fontFamily,
    titleColor: overrides.title_color || preset.muted,
    nameColor: overrides.name_color || preset.text,
    amountColor: overrides.amount_color || preset.accent,
    messageColor: overrides.message_color || preset.text
  };
}

function applyOverlayTheme(element, theme) {
  if (!element || !theme) {
    return;
  }
  element.style.setProperty("--overlay-accent", theme.accent);
  element.style.setProperty("--overlay-accent-soft", theme.accentSoft);
  element.style.setProperty("--overlay-text", theme.text);
  element.style.setProperty("--overlay-muted", theme.muted);
  element.style.setProperty("--overlay-bg", theme.background);
  element.style.setProperty("--overlay-border", theme.border);
  element.style.setProperty("--overlay-font", theme.fontFamily);
  element.style.setProperty("--overlay-title-color", theme.titleColor);
  element.style.setProperty("--overlay-name-color", theme.nameColor);
  element.style.setProperty("--overlay-amount-color", theme.amountColor);
  element.style.setProperty("--overlay-message-color", theme.messageColor);
}

function applyThemeClass(element, styleId, prefix = "style") {
  if (!element) {
    return;
  }
  listAvailableStyles().forEach((item) => {
    element.classList.remove(`${prefix}-${item.id}`);
  });
  element.classList.add(`${prefix}-${normalizeStyleId(styleId)}`);
}

function buildYoutubeEmbed(url, youtubeSettings) {
  const match = /[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/i.exec(url || "");
  const videoId = match?.[1] || match?.[2];
  if (!videoId) {
    return "";
  }
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&start=0&controls=${youtubeSettings.mode === "video" ? 1 : 0}`;
}

function createDemoDonation(settings) {
  const tier = (settings?.alert?.tiers || [])[0] || {};
  const defaultMessage = "Салам қалайсың";
  const template = String(tier.tts_text || "{donor_name} {amount} теңге. {message}");
  const base = { ...DEMO_DONATION };
  base.tier = tier;
  base.tts_text = template
    .replaceAll("{donor_name}", base.display_name)
    .replaceAll("{amount}", String(base.amount))
    .replaceAll("{message}", base.message || defaultMessage);
  return base;
}

function getPreviewBoardItems() {
  return DEMO_TOP_ITEMS.map((item) => ({ ...item }));
}
