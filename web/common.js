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

const YOUTUBE_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i;
const STREAMER_SANITIZE_RE = /[^a-z0-9_-]+/g;
const DONOR_SANITIZE_RE = /[^a-z0-9_-]+/g;

const FIREBASE_DIRECT_STATE = {
  initPromise: null,
  firebaseGlobal: null,
  app: null,
  auth: null,
  db: null
};

function isFirestoreDirectMode() {
  return Boolean(
    window.KAZ_FIREBASE_DIRECT_MODE &&
    window.KAZ_FIREBASE_CONFIG?.apiKey &&
    window.KAZ_FIREBASE_CONFIG?.projectId
  );
}

window.isFirestoreDirectMode = isFirestoreDirectMode;

function directDefaultSettings() {
  return {
    app: {
      brand_name: "Kaz Alerts",
      accent: "#ff5631"
    },
    aliases: [],
    alert: {
      min_amount: 0,
      master_volume: 100,
      show_preview_badge: true,
      default_style: "classic",
      tiers: [
        {
          id: "tier-default",
          min_amount: 1,
          title: "Жаңа донат",
          gif_url: "",
          gif_stack: [],
          sound_url: "",
          sound_layers: [],
          sound_volume: 100,
          tts_enabled: false,
          tts_text: "{donor_name} {amount} теңге. {message}",
          tts_voice_mode: "female",
          tts_lang: "kk-KZ",
          tts_rate: 1,
          tts_pitch: 1,
          duration_ms: 7000,
          style_id: "classic",
          animation_in: "rise",
          font_family: "Bahnschrift",
          background: "",
          accent_color: "",
          title_color: "",
          name_color: "",
          amount_color: "",
          message_color: "",
          border_color: "",
          youtube_enabled: true
        }
      ]
    },
    boards: {
      top_day: { title: "ТОП ДОНАТ", limit: 5, mode: "list", style_id: "pubg" },
      top_week: { title: "ТОП АПТА", limit: 5, mode: "list", style_id: "gold" },
      top_month: { title: "ТОП АЙ", limit: 5, mode: "list", style_id: "classic" },
      last_donation: { title: "СОҢҒЫ ДОНАТ", limit: 1, mode: "single", style_id: "pink" }
    },
    goal: {
      title: "ЦЕЛЬ СБОРА",
      base_amount: 0,
      target_amount: 50000,
      auto_increment: true,
      started_at: new Date().toISOString(),
      style_id: "classic",
      bar_color: "#ff5631",
      background_color: "#161616",
      text_color: "#ffffff"
    },
    youtube: {
      enabled: true,
      mode: "music",
      volume: 50,
      panic_hotkey: "F9",
      min_amount: 0,
      max_seconds: 180,
      preview_url: "",
      widget_title: "YouTube Music",
      widget_subtitle: "Музыка донаттан бөлек widget арқылы жүреді",
      style_id: "cyberpunk",
      accent_color: "#ff5631",
      text_color: "#ffffff",
      font_family: "Bahnschrift",
      background_image: "",
      card_background: "rgba(16, 16, 16, 0.82)",
      show_badge: true
    }
  };
}

function normalizeDirectSettings(settings) {
  const merged = deepMerge(directDefaultSettings(), settings || {});
  if (!Array.isArray(merged.alert?.tiers) || !merged.alert.tiers.length) {
    merged.alert.tiers = directDefaultSettings().alert.tiers;
  }
  merged.alert.tiers = merged.alert.tiers
    .map((tier, index) => ({
      id: String(tier?.id || `tier-${index + 1}`),
      min_amount: Math.max(1, Number(tier?.min_amount || 1)),
      title: String(tier?.title || "Жаңа донат"),
      gif_url: String(tier?.gif_url || "").trim(),
      gif_stack: Array.isArray(tier?.gif_stack) ? tier.gif_stack.filter(Boolean).slice(0, 3) : [],
      sound_url: String(tier?.sound_url || "").trim(),
      sound_layers: Array.isArray(tier?.sound_layers) ? tier.sound_layers.slice(0, 4) : [],
      sound_volume: clamp(Number(tier?.sound_volume || 100), 0, 100),
      tts_enabled: Boolean(tier?.tts_enabled),
      tts_text: String(tier?.tts_text || "{donor_name} {amount} теңге. {message}"),
      tts_voice_mode: String(tier?.tts_voice_mode || "female"),
      tts_lang: String(tier?.tts_lang || "kk-KZ"),
      tts_rate: clamp(Number(tier?.tts_rate || 1), 0.5, 1.6),
      tts_pitch: clamp(Number(tier?.tts_pitch || 1), 0.5, 1.8),
      duration_ms: Math.max(2000, Number(tier?.duration_ms || 7000)),
      style_id: String(tier?.style_id || "classic"),
      animation_in: String(tier?.animation_in || "rise"),
      font_family: String(tier?.font_family || "Bahnschrift"),
      background: String(tier?.background || "").trim(),
      accent_color: String(tier?.accent_color || "").trim(),
      title_color: String(tier?.title_color || "").trim(),
      name_color: String(tier?.name_color || "").trim(),
      amount_color: String(tier?.amount_color || "").trim(),
      message_color: String(tier?.message_color || "").trim(),
      border_color: String(tier?.border_color || "").trim(),
      youtube_enabled: tier?.youtube_enabled !== false
    }))
    .sort((a, b) => a.min_amount - b.min_amount);
  merged.alert.min_amount = Math.max(0, Number(merged.alert.min_amount || 0));
  merged.alert.master_volume = clamp(Number(merged.alert.master_volume || 100), 0, 100);
  merged.alert.default_style = String(merged.alert.default_style || "classic");

  Object.entries(directDefaultSettings().boards).forEach(([boardKey, defaults]) => {
    const board = merged.boards?.[boardKey] || {};
    merged.boards[boardKey] = {
      ...defaults,
      ...board,
      title: String(board.title || defaults.title),
      limit: clamp(Number(board.limit || defaults.limit), 1, 20),
      mode: String(board.mode || defaults.mode),
      style_id: String(board.style_id || defaults.style_id)
    };
  });

  merged.goal.base_amount = Math.max(0, Number(merged.goal.base_amount || 0));
  merged.goal.target_amount = Math.max(1, Number(merged.goal.target_amount || 1));
  merged.goal.auto_increment = merged.goal.auto_increment !== false;
  merged.goal.started_at = String(merged.goal.started_at || new Date().toISOString());

  merged.youtube.enabled = merged.youtube.enabled !== false;
  merged.youtube.mode = String(merged.youtube.mode || "music") === "video" ? "video" : "music";
  merged.youtube.volume = clamp(Number(merged.youtube.volume || 50), 0, 100);
  merged.youtube.min_amount = Math.max(0, Number(merged.youtube.min_amount || 0));
  merged.youtube.max_seconds = Math.max(10, Number(merged.youtube.max_seconds || 180));

  return merged;
}

function normalizeDirectStreamerId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(STREAMER_SANITIZE_RE, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
  return normalized;
}

function normalizeDonorKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(DONOR_SANITIZE_RE, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 96);
  return normalized || "anon";
}

function randomToken(length = 48) {
  const bytes = new Uint8Array(Math.max(16, length));
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").slice(0, length);
}

function getIsoWeekParts(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return { year: utcDate.getUTCFullYear(), week };
}

function periodKeys(now = new Date()) {
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);
  const week = getIsoWeekParts(now);
  return {
    dayKey,
    monthKey,
    weekKey: `${week.year}-W${String(week.week).padStart(2, "0")}`
  };
}

async function waitForAuthState(auth) {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (user) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      resolve(user || auth.currentUser || null);
    };
    const timeout = window.setTimeout(() => finish(auth.currentUser || null), 1400);
    unsubscribe = auth.onAuthStateChanged(
      (user) => {
        clearTimeout(timeout);
        finish(user);
      },
      () => {
        clearTimeout(timeout);
        finish(auth.currentUser || null);
      }
    );
  });
}

async function ensureDirectFirebase() {
  if (!isFirestoreDirectMode()) {
    return null;
  }
  if (FIREBASE_DIRECT_STATE.db) {
    return FIREBASE_DIRECT_STATE;
  }
  if (FIREBASE_DIRECT_STATE.initPromise) {
    return FIREBASE_DIRECT_STATE.initPromise;
  }

  FIREBASE_DIRECT_STATE.initPromise = (async () => {
    const firebaseGlobal = window.firebase;
    if (!firebaseGlobal?.initializeApp) {
      throw new Error("Firebase SDK жүктелмеді. firebase-app-compat.js файлын тексеріңіз.");
    }

    const app = firebaseGlobal.apps?.length
      ? firebaseGlobal.app()
      : firebaseGlobal.initializeApp(window.KAZ_FIREBASE_CONFIG);
    const auth = firebaseGlobal.auth(app);
    const db = firebaseGlobal.firestore(app);

    await waitForAuthState(auth);

    FIREBASE_DIRECT_STATE.firebaseGlobal = firebaseGlobal;
    FIREBASE_DIRECT_STATE.app = app;
    FIREBASE_DIRECT_STATE.auth = auth;
    FIREBASE_DIRECT_STATE.db = db;
    return FIREBASE_DIRECT_STATE;
  })();

  return FIREBASE_DIRECT_STATE.initPromise;
}

function directRefs(db, streamerId) {
  const streamer = db.collection("streamers").doc(streamerId);
  return {
    db,
    streamer,
    settings: streamer.collection("settings").doc("main"),
    analytics: streamer.collection("analytics").doc("current"),
    donations: streamer.collection("donations"),
    devices: streamer.collection("devices"),
    donorStats: streamer.collection("donor_stats"),
    leaderboards: streamer.collection("leaderboards")
  };
}

function extractApiPath(pathname) {
  const index = pathname.indexOf("/api/");
  if (index >= 0) {
    return pathname.slice(index);
  }
  return pathname;
}

async function resolveDirectStreamerId(searchParams, payload = null) {
  const fromPayload = normalizeDirectStreamerId(payload?.streamer_id || "");
  if (fromPayload) {
    return fromPayload;
  }

  const fromPath = normalizeDirectStreamerId(STREAMER_CONTEXT.id || "");
  if (fromPath) {
    return fromPath;
  }

  const fromQuery = normalizeDirectStreamerId(searchParams?.get("streamer_id") || "");
  if (fromQuery) {
    return fromQuery;
  }

  const firebaseState = await ensureDirectFirebase();
  const user = await waitForAuthState(firebaseState.auth);
  const fromUser = normalizeDirectStreamerId(user?.uid || "");
  if (fromUser) {
    return fromUser;
  }

  const fallback = normalizeDirectStreamerId(window.KAZ_FIREBASE_DEFAULT_STREAMER_ID || "default");
  if (fallback) {
    return fallback;
  }

  throw new Error("streamer_id required. /s/<streamer_id>/ URL қолданыңыз.");
}

function directPreviewUrls(streamerId) {
  const base = window.location.origin.replace(/\/+$/, "");
  const prefix = streamerId ? `/s/${encodeURIComponent(streamerId)}` : "";
  return {
    admin: `${base}${prefix}/`,
    widget: `${base}${prefix}/widget`,
    widgetyt: `${base}${prefix}/widgetyt`,
    goal: `${base}${prefix}/goal`,
    top_day: `${base}${prefix}/stats?board=top_day`,
    top_week: `${base}${prefix}/stats?board=top_week`,
    top_month: `${base}${prefix}/stats?board=top_month`,
    last_donation: `${base}${prefix}/stats?board=last_donation`,
    analytics: `${base}${prefix}/api/analytics/summary`
  };
}

function directApplyAlias(name, settings) {
  const aliases = Array.isArray(settings?.aliases) ? settings.aliases : [];
  const normalized = String(name || "").trim().toLowerCase();
  for (const item of aliases) {
    if (normalized === String(item?.original || "").trim().toLowerCase()) {
      return String(item?.alias || "").trim() || name;
    }
  }
  return name;
}

function directFindTier(amount, settings) {
  const tiers = Array.isArray(settings?.alert?.tiers) ? settings.alert.tiers : [];
  let best = tiers[0] || {};
  tiers.forEach((tier) => {
    if (Number(amount || 0) >= Number(tier?.min_amount || 0)) {
      best = tier;
    }
  });
  return best;
}

function directExtractYoutubeUrl(text) {
  const match = YOUTUBE_RE.exec(String(text || ""));
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : "";
}

function directStripYoutubeUrl(text) {
  return String(text || "").replace(YOUTUBE_RE, "").trim();
}

function directResolveDonationPayload(raw, settings) {
  const base = raw || {};
  const amount = Math.max(0, Number(base.amount || 0));
  const donorName = String(base.donor_name || "Аноним") || "Аноним";
  const message = String(base.message || "");
  const displayName = directApplyAlias(donorName, settings);
  const tier = directFindTier(amount, settings);

  const template = String(tier?.tts_text || "{donor_name} {amount} теңге. {message}");
  let ttsText = template
    .replaceAll("{donor_name}", displayName)
    .replaceAll("{amount}", String(amount))
    .replaceAll("{message}", message);
  if (message && !template.includes("{message}") && !ttsText.includes(message)) {
    ttsText = `${ttsText}. ${message}`;
  }

  return {
    id: Number(base.seq || base.id || 0),
    seq: Number(base.seq || 0),
    streamer_id: String(base.streamer_id || ""),
    device_id: String(base.device_id || ""),
    donor_name: donorName,
    display_name: displayName,
    amount,
    currency: String(base.currency || "KZT"),
    message,
    raw_text: String(base.raw_text || ""),
    source_app: String(base.source_app || "cloud_ingest"),
    confidence: Number(base.confidence || 1),
    status: String(base.status || "ready"),
    published: true,
    publish_error: "",
    created_at: String(base.created_at_iso || base.created_at || ""),
    youtube_url: directExtractYoutubeUrl(`${message}\n${String(base.raw_text || "")}`),
    music_request_text: directStripYoutubeUrl(message) || "Music request",
    notification_time: String(base.notification_time || ""),
    tier,
    tts_text: ttsText
  };
}

function normalizeAnalytics(payload) {
  const data = payload || {};
  return {
    donation_count: Number(data.donation_count || 0),
    total_amount: Number(data.total_amount || 0),
    average_donation: Number(data.average_donation || 0),
    unique_donors: Number(data.unique_donors || 0),
    repeat_donors: Number(data.repeat_donors || 0),
    top_day: Array.isArray(data.top_day) ? data.top_day : [],
    top_week: Array.isArray(data.top_week) ? data.top_week : [],
    top_month: Array.isArray(data.top_month) ? data.top_month : [],
    last_donation: data.last_donation || null
  };
}

async function directLoadSettings(streamerId) {
  const state = await ensureDirectFirebase();
  const refs = directRefs(state.db, streamerId);
  const snap = await refs.settings.get();
  if (!snap.exists) {
    return normalizeDirectSettings({});
  }
  const payload = snap.data()?.data || {};
  return normalizeDirectSettings(payload);
}

async function directLoadAnalytics(streamerId) {
  const state = await ensureDirectFirebase();
  const refs = directRefs(state.db, streamerId);
  const snap = await refs.analytics.get();
  if (!snap.exists) {
    return normalizeAnalytics({});
  }
  return normalizeAnalytics(snap.data() || {});
}

async function directFetchLastDonation(streamerId, settings) {
  const state = await ensureDirectFirebase();
  const refs = directRefs(state.db, streamerId);
  let query = refs.donations.orderBy("seq", "desc").limit(1);
  let snap;
  try {
    snap = await query.get();
  } catch {
    snap = await refs.donations.orderBy("created_at_iso", "desc").limit(1).get();
  }
  if (snap.empty) {
    return null;
  }
  return directResolveDonationPayload(snap.docs[0].data(), settings);
}

async function directFetchDonations(streamerId, settings, afterId = 0, limit = 100) {
  const state = await ensureDirectFirebase();
  const refs = directRefs(state.db, streamerId);

  let rows = [];
  try {
    let query = refs.donations.orderBy("seq", "asc").limit(limit);
    if (Number(afterId || 0) > 0) {
      query = query.where("seq", ">", Number(afterId));
    }
    const snap = await query.get();
    rows = snap.docs.map((doc) => doc.data());
  } catch {
    const snap = await refs.donations.orderBy("created_at_iso", "asc").limit(Math.max(limit, 200)).get();
    rows = snap.docs.map((doc) => doc.data());
    if (Number(afterId || 0) > 0) {
      rows = rows.filter((item) => Number(item?.seq || 0) > Number(afterId));
    }
    rows = rows.slice(-limit);
  }

  return rows.map((row) => directResolveDonationPayload(row, settings));
}

function directBuildGoalState(settings, analytics) {
  const goal = settings.goal || {};
  const baseAmount = Math.max(0, Number(goal.base_amount || 0));
  const totalAmount = Math.max(0, Number(analytics.total_amount || 0));
  const currentAmount = goal.auto_increment === false ? baseAmount : baseAmount + totalAmount;
  const targetAmount = Math.max(1, Number(goal.target_amount || 1));
  const progress = Math.round(Math.min((currentAmount / targetAmount) * 100, 100) * 100) / 100;
  return {
    title: String(goal.title || "ЦЕЛЬ СБОРА"),
    current_amount: currentAmount,
    target_amount: targetAmount,
    progress,
    style_id: String(goal.style_id || "classic"),
    bar_color: String(goal.bar_color || "#ff5631"),
    background_color: String(goal.background_color || "#161616"),
    text_color: String(goal.text_color || "#ffffff"),
    auto_increment: goal.auto_increment !== false,
    started_at: String(goal.started_at || new Date().toISOString())
  };
}

async function directRequireOwner(streamerId) {
  const state = await ensureDirectFirebase();
  const user = await waitForAuthState(state.auth);
  if (!user) {
    throw new Error("Алдымен /connect бетінде Sign in жасаңыз");
  }

  const refs = directRefs(state.db, streamerId);
  const snap = await refs.streamer.get();
  const nowIso = new Date().toISOString();
  const current = snap.exists ? (snap.data() || {}) : {};
  const ownerUid = String(current.owner_uid || "");

  if (ownerUid && ownerUid !== user.uid) {
    throw new Error("Бұл streamer_id басқа аккаунтқа тиесілі");
  }

  const patch = {
    streamer_id: streamerId,
    updated_at_iso: nowIso
  };
  if (!ownerUid) {
    patch.owner_uid = user.uid;
  }
  if (!String(current.display_name || "").trim()) {
    patch.display_name = user.email || streamerId;
  }
  if (!String(current.created_at_iso || "").trim()) {
    patch.created_at_iso = nowIso;
  }
  if (!String(current.token || "").trim()) {
    patch.token = randomToken();
  }

  await refs.streamer.set(patch, { merge: true });

  const settingsSnap = await refs.settings.get();
  if (!settingsSnap.exists) {
    await refs.settings.set(
      {
        data: normalizeDirectSettings({}),
        updated_at_iso: nowIso
      },
      { merge: true }
    );
  }

  return {
    user,
    refs,
    profile: {
      ...current,
      ...patch
    }
  };
}

function updateLeaderboardItems(items, donorKey, donorName, amount) {
  const result = Array.isArray(items) ? items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      donor_key: String(item.donor_key || ""),
      donor_name: String(item.donor_name || "Аноним"),
      total_amount: Number(item.total_amount || 0),
      donation_count: Number(item.donation_count || 0),
      last_amount: Number(item.last_amount || 0)
    })) : [];

  let found = false;
  result.forEach((item) => {
    if (item.donor_key !== donorKey) {
      return;
    }
    item.donor_name = donorName;
    item.total_amount += amount;
    item.donation_count += 1;
    item.last_amount = amount;
    found = true;
  });

  if (!found) {
    result.push({
      donor_key: donorKey,
      donor_name: donorName,
      total_amount: amount,
      donation_count: 1,
      last_amount: amount
    });
  }

  result.sort((a, b) => {
    if (b.total_amount !== a.total_amount) {
      return b.total_amount - a.total_amount;
    }
    return a.donor_name.localeCompare(b.donor_name);
  });
  return result.slice(0, 20);
}

async function directCreateDonation(streamerId, payload) {
  const owner = await directRequireOwner(streamerId);
  const refs = owner.refs;
  const now = new Date();
  const nowIso = now.toISOString();
  const amount = Math.max(0, Number(payload?.amount || 0));
  const donorName = String(payload?.donor_name || "Тест Донатер").trim() || "Тест Донатер";
  const message = String(payload?.message || "Бұл тест донат").trim() || "Бұл тест донат";
  const deviceId = String(payload?.device_id || "").trim();
  const donorKey = normalizeDonorKey(donorName);
  const keys = periodKeys(now);

  let createdDonation = null;
  await refs.db.runTransaction(async (tx) => {
    const streamerSnap = await tx.get(refs.streamer);
    const streamerData = streamerSnap.exists ? (streamerSnap.data() || {}) : {};
    const lastSeq = Number(streamerData.last_seq || 0);
    const nextSeq = Math.max(Date.now(), lastSeq + 1);

    const donationPayload = {
      seq: nextSeq,
      streamer_id: streamerId,
      device_id: deviceId,
      donor_name: donorName,
      amount,
      currency: "KZT",
      message,
      raw_text: `Kaspi Gold\nПеревод ${amount} ₸\nОтправитель: ${donorName}\nСообщение: ${message}`,
      source_app: "web_test",
      confidence: 1,
      status: "ready",
      created_at_iso: nowIso
    };
    createdDonation = donationPayload;

    tx.set(refs.streamer, {
      streamer_id: streamerId,
      updated_at_iso: nowIso,
      last_seq: nextSeq
    }, { merge: true });

    tx.set(refs.donations.doc(`${nextSeq}-${Math.random().toString(16).slice(2, 8)}`), donationPayload, { merge: true });

    if (deviceId) {
      tx.set(refs.devices.doc(deviceId), {
        device_id: deviceId,
        device_name: String(payload?.device_name || deviceId),
        updated_at_iso: nowIso,
        last_seen_at_iso: nowIso
      }, { merge: true });
    }

    const donorRef = refs.donorStats.doc(donorKey);
    const donorSnap = await tx.get(donorRef);
    const donorData = donorSnap.exists ? (donorSnap.data() || {}) : {};
    const prevDonorCount = Number(donorData.donation_count || 0);
    const donorCount = prevDonorCount + 1;
    const donorTotal = Number(donorData.total_amount || 0) + amount;
    tx.set(donorRef, {
      donor_key: donorKey,
      donor_name: donorName,
      donation_count: donorCount,
      total_amount: donorTotal,
      last_amount: amount,
      updated_at_iso: nowIso
    }, { merge: true });

    const dayRef = refs.leaderboards.doc(`day_${keys.dayKey}`);
    const weekRef = refs.leaderboards.doc(`week_${keys.weekKey}`);
    const monthRef = refs.leaderboards.doc(`month_${keys.monthKey}`);

    const daySnap = await tx.get(dayRef);
    const weekSnap = await tx.get(weekRef);
    const monthSnap = await tx.get(monthRef);

    const nextDay = updateLeaderboardItems(daySnap.data()?.items || [], donorKey, donorName, amount);
    const nextWeek = updateLeaderboardItems(weekSnap.data()?.items || [], donorKey, donorName, amount);
    const nextMonth = updateLeaderboardItems(monthSnap.data()?.items || [], donorKey, donorName, amount);

    tx.set(dayRef, { period: "day", period_key: keys.dayKey, items: nextDay, updated_at_iso: nowIso }, { merge: true });
    tx.set(weekRef, { period: "week", period_key: keys.weekKey, items: nextWeek, updated_at_iso: nowIso }, { merge: true });
    tx.set(monthRef, { period: "month", period_key: keys.monthKey, items: nextMonth, updated_at_iso: nowIso }, { merge: true });

    const analyticsSnap = await tx.get(refs.analytics);
    const analyticsData = analyticsSnap.exists ? (analyticsSnap.data() || {}) : {};
    const donationCount = Number(analyticsData.donation_count || 0) + 1;
    const totalAmount = Number(analyticsData.total_amount || 0) + amount;
    const uniqueDonors = Number(analyticsData.unique_donors || 0) + (prevDonorCount === 0 ? 1 : 0);
    const repeatDonors = Number(analyticsData.repeat_donors || 0) + (prevDonorCount === 1 ? 1 : 0);

    tx.set(refs.analytics, {
      donation_count: donationCount,
      total_amount: totalAmount,
      average_donation: donationCount ? Math.round((totalAmount / donationCount) * 100) / 100 : 0,
      unique_donors: uniqueDonors,
      repeat_donors: repeatDonors,
      top_day: nextDay.slice(0, 5),
      top_week: nextWeek.slice(0, 5),
      top_month: nextMonth.slice(0, 5),
      last_donation: donationPayload,
      updated_at_iso: nowIso
    }, { merge: true });
  });

  const settings = await directLoadSettings(streamerId);
  return directResolveDonationPayload(createdDonation, settings);
}

async function directLoadProfile(streamerId) {
  const state = await ensureDirectFirebase();
  const refs = directRefs(state.db, streamerId);
  const [streamerSnap, deviceSnap] = await Promise.all([
    refs.streamer.get(),
    refs.devices.limit(100).get()
  ]);

  const profile = streamerSnap.exists ? (streamerSnap.data() || {}) : {};
  const devices = deviceSnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      device_id: doc.id,
      device_name: String(data.device_name || ""),
      created_at: String(data.created_at_iso || ""),
      last_seen_at: String(data.last_seen_at_iso || data.updated_at_iso || "")
    };
  });

  return {
    streamer_id: streamerId,
    display_name: String(profile.display_name || streamerId),
    created_at: String(profile.created_at_iso || ""),
    updated_at: String(profile.updated_at_iso || ""),
    exists: streamerSnap.exists,
    devices,
    urls: directPreviewUrls(streamerId),
    token: String(profile.token || "")
  };
}

async function directCloudRegister(streamerId, payload) {
  const owner = await directRequireOwner(streamerId);
  const refs = owner.refs;
  const patch = {};
  const displayName = String(payload?.display_name || "").trim();
  if (displayName) {
    patch.display_name = displayName;
  }
  if (payload?.rotate_token) {
    patch.token = randomToken();
  }
  if (Object.keys(patch).length) {
    patch.updated_at_iso = new Date().toISOString();
    await refs.streamer.set(patch, { merge: true });
  }

  const deviceId = String(payload?.device_id || "").trim();
  if (deviceId) {
    await refs.devices.doc(deviceId).set({
      device_id: deviceId,
      device_name: String(payload?.device_name || "Admin Browser"),
      updated_at_iso: new Date().toISOString(),
      last_seen_at_iso: new Date().toISOString()
    }, { merge: true });
  }

  const profile = await directLoadProfile(streamerId);
  return {
    account: {
      streamer_id: profile.streamer_id,
      display_name: profile.display_name,
      token: profile.token,
      created_at: profile.created_at,
      updated_at: profile.updated_at
    },
    profile
  };
}

async function directCloudRotateToken(streamerId) {
  const owner = await directRequireOwner(streamerId);
  const token = randomToken();
  await owner.refs.streamer.set(
    {
      token,
      updated_at_iso: new Date().toISOString()
    },
    { merge: true }
  );
  const profile = await directLoadProfile(streamerId);
  return {
    account: {
      streamer_id: profile.streamer_id,
      display_name: profile.display_name,
      token,
      created_at: profile.created_at,
      updated_at: profile.updated_at
    }
  };
}

async function directCloudBindDevice(streamerId, payload) {
  const owner = await directRequireOwner(streamerId);
  const deviceId = String(payload?.device_id || "").trim();
  if (!deviceId) {
    throw new Error("device_id required");
  }
  const nowIso = new Date().toISOString();
  await owner.refs.devices.doc(deviceId).set(
    {
      device_id: deviceId,
      device_name: String(payload?.device_name || "Admin Browser"),
      last_seen_at_iso: nowIso,
      updated_at_iso: nowIso,
      created_at_iso: nowIso
    },
    { merge: true }
  );
  const profile = await directLoadProfile(streamerId);
  return {
    device: profile.devices.find((item) => item.device_id === deviceId) || null,
    devices: profile.devices
  };
}

async function directSaveSettings(streamerId, patch) {
  const owner = await directRequireOwner(streamerId);
  const current = await directLoadSettings(streamerId);
  const next = normalizeDirectSettings(deepMerge(current, patch || {}));
  await owner.refs.settings.set(
    {
      data: next,
      updated_at_iso: new Date().toISOString()
    },
    { merge: true }
  );
  return next;
}

async function directApiGet(scopedUrl) {
  const parsed = new URL(scopedUrl, window.location.origin);
  const apiPath = extractApiPath(parsed.pathname);

  if (apiPath === "/api/health") {
    return {
      ok: true,
      mode: "firebase-direct",
      streamer_id: normalizeDirectStreamerId(STREAMER_CONTEXT.id || parsed.searchParams.get("streamer_id") || "")
    };
  }

  const streamerId = await resolveDirectStreamerId(parsed.searchParams);

  const settings = await directLoadSettings(streamerId);

  if (apiPath === "/api/settings" || apiPath === "/api/cloud/settings") {
    return settings;
  }

  if (apiPath === "/api/donations" || apiPath === "/api/feed") {
    const limit = clamp(Number(parsed.searchParams.get("limit") || 100), 1, 200);
    const afterId = Math.max(0, Number(parsed.searchParams.get("after_id") || 0));
    return directFetchDonations(streamerId, settings, afterId, limit);
  }

  if (apiPath === "/api/music-feed") {
    const afterId = Math.max(0, Number(parsed.searchParams.get("after_id") || 0));
    const rows = await directFetchDonations(streamerId, settings, afterId, 100);
    return rows.filter((item) => {
      if (!settings.youtube?.enabled) {
        return false;
      }
      if (!item.youtube_url) {
        return false;
      }
      if (Number(item.amount || 0) < Number(settings.youtube?.min_amount || 0)) {
        return false;
      }
      if (item.tier?.youtube_enabled === false) {
        return false;
      }
      return true;
    });
  }

  if (apiPath === "/api/analytics/summary") {
    return directLoadAnalytics(streamerId);
  }

  if (apiPath === "/api/goal") {
    const analytics = await directLoadAnalytics(streamerId);
    return directBuildGoalState(settings, analytics);
  }

  if (apiPath === "/api/preview-urls") {
    return directPreviewUrls(streamerId);
  }

  if (apiPath === "/api/profile" || apiPath === "/api/cloud/profile") {
    return directLoadProfile(streamerId);
  }

  if (apiPath.startsWith("/api/stats/")) {
    const boardKey = apiPath.replace("/api/stats/", "");
    if (boardKey === "last_donation") {
      const analytics = await directLoadAnalytics(streamerId);
      if (analytics.last_donation) {
        return directResolveDonationPayload(analytics.last_donation, settings);
      }
      return directFetchLastDonation(streamerId, settings);
    }
    const analytics = await directLoadAnalytics(streamerId);
    const boardSettings = settings.boards?.[boardKey] || settings.boards?.top_day || { limit: 5 };
    const limit = clamp(Number(parsed.searchParams.get("limit") || boardSettings.limit || 5), 1, 20);
    if (boardKey === "top_week") {
      return (analytics.top_week || []).slice(0, limit);
    }
    if (boardKey === "top_month") {
      return (analytics.top_month || []).slice(0, limit);
    }
    return (analytics.top_day || []).slice(0, limit);
  }

  if (apiPath === "/api/state") {
    const analytics = await directLoadAnalytics(streamerId);
    const lastDonation = analytics.last_donation
      ? directResolveDonationPayload(analytics.last_donation, settings)
      : await directFetchLastDonation(streamerId, settings);
    const boards = {
      top_day: (analytics.top_day || []).slice(0, Number(settings.boards?.top_day?.limit || 5)),
      top_week: (analytics.top_week || []).slice(0, Number(settings.boards?.top_week?.limit || 5)),
      top_month: (analytics.top_month || []).slice(0, Number(settings.boards?.top_month?.limit || 5)),
      last_donation: lastDonation
    };

    return {
      streamer_id: streamerId,
      settings,
      goal: directBuildGoalState(settings, analytics),
      urls: directPreviewUrls(streamerId),
      boards,
      analytics,
      profile: await directLoadProfile(streamerId)
    };
  }

  throw new Error(`GET ${apiPath} unsupported in Firebase direct mode`);
}

async function directApiPost(scopedUrl, payload) {
  const parsed = new URL(scopedUrl, window.location.origin);
  const apiPath = extractApiPath(parsed.pathname);
  const streamerId = await resolveDirectStreamerId(parsed.searchParams, payload || {});

  if (apiPath === "/api/settings" || apiPath === "/api/cloud/settings") {
    return directSaveSettings(streamerId, payload || {});
  }

  if (apiPath === "/api/test-donation") {
    return directCreateDonation(streamerId, payload || {});
  }

  if (apiPath === "/api/cloud/register") {
    return directCloudRegister(streamerId, payload || {});
  }

  if (apiPath === "/api/cloud/rotate-token") {
    return directCloudRotateToken(streamerId);
  }

  if (apiPath === "/api/cloud/bind-device") {
    return directCloudBindDevice(streamerId, payload || {});
  }

  throw new Error(`POST ${apiPath} unsupported in Firebase direct mode`);
}

async function apiGet(url) {
  const scopedUrl = withStreamerApiContext(url);
  if (isFirestoreDirectMode() && scopedUrl.includes("/api/")) {
    return directApiGet(scopedUrl);
  }

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
  if (isFirestoreDirectMode() && scopedUrl.includes("/api/")) {
    return directApiPost(scopedUrl, payload || {});
  }

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
