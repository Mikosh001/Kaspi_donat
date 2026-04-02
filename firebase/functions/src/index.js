"use strict";

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onRequest } = require("firebase-functions/v2/https");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const SERVER_TIMESTAMP = admin.firestore.FieldValue.serverTimestamp;

const YOUTUBE_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i;
const STREAMER_RE = /[^a-z0-9_-]+/g;
const DEVICE_RE = /[^a-zA-Z0-9._:-]+/g;
const DONOR_RE = /[^a-zA-Z0-9_\-\u0400-\u04FF\u0500-\u052F]+/g;

const ENFORCE_STREAMER_SCOPE = readBoolEnv("KAZ_ALERTS_ENFORCE_STREAMER_SCOPE", false);
const PUBLIC_BASE_URL = String(process.env.KAZ_ALERTS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const CONNECT_CODE_TTL_SECONDS = clampInt(process.env.KAZ_ALERTS_CONNECT_CODE_TTL_SECONDS, 600, 60, 3600);
const DEFAULT_STREAMER_ID = normalizeStreamerId(process.env.KAZ_ALERTS_DEFAULT_STREAMER_ID || "default") || "default";

const DEFAULT_SETTINGS = {
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
    top_day: {
      title: "ТОП ДОНАТ",
      limit: 5,
      mode: "list",
      style_id: "pubg"
    },
    top_week: {
      title: "ТОП АПТА",
      limit: 5,
      mode: "list",
      style_id: "gold"
    },
    top_month: {
      title: "ТОП АЙ",
      limit: 5,
      mode: "list",
      style_id: "classic"
    },
    last_donation: {
      title: "СОҢҒЫ ДОНАТ",
      limit: 1,
      mode: "single",
      style_id: "pink"
    }
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

function readBoolEnv(name, defaultValue) {
  const value = String(process.env[name] || (defaultValue ? "1" : "0")).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function clampInt(value, defaultValue, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, parsed));
}

function safeInt(value, defaultValue = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function safeFloat(value, defaultValue = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function nowIso() {
  return new Date().toISOString();
}

function timestampToIso(value) {
  if (!value) {
    return "";
  }
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function normalizeStreamerId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(STREAMER_RE, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
  return normalized;
}

function normalizeDeviceId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(DEVICE_RE, "-")
    .replace(/^[-._:]+|[-._:]+$/g, "")
    .slice(0, 80);
  return normalized;
}

function normalizeDonorKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(DONOR_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "anon";
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function randomConnectCode() {
  return crypto.randomBytes(5).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
}

function secureCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object") {
    return deepClone(base);
  }
  const result = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(current, value);
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map((item) => (typeof item === "object" && item ? { ...item } : item));
      continue;
    }
    result[key] = value;
  }
  return result;
}

function normalizeSettings(settings) {
  const data = deepMerge(DEFAULT_SETTINGS, settings || {});

  if (!Array.isArray(data.aliases)) {
    data.aliases = [];
  }
  data.aliases = data.aliases
    .map((item) => ({
      original: String(item?.original || "").trim(),
      alias: String(item?.alias || "").trim()
    }))
    .filter((item) => item.original);

  if (!Array.isArray(data.alert?.tiers) || !data.alert.tiers.length) {
    data.alert.tiers = deepClone(DEFAULT_SETTINGS.alert.tiers);
  }
  data.alert.min_amount = Math.max(0, safeInt(data.alert.min_amount, 0));
  data.alert.master_volume = Math.max(0, Math.min(100, safeInt(data.alert.master_volume, 100)));
  data.alert.default_style = String(data.alert.default_style || "classic");
  data.alert.tiers = data.alert.tiers
    .map((tier, idx) => ({
      id: String(tier?.id || `tier-${idx + 1}`),
      min_amount: Math.max(1, safeInt(tier?.min_amount, 1)),
      title: String(tier?.title || "Жаңа донат"),
      gif_url: String(tier?.gif_url || "").trim(),
      gif_stack: Array.isArray(tier?.gif_stack) ? tier.gif_stack.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 3) : [],
      sound_url: String(tier?.sound_url || "").trim(),
      sound_layers: Array.isArray(tier?.sound_layers) ? tier.sound_layers.slice(0, 4) : [],
      sound_volume: Math.max(0, Math.min(100, safeInt(tier?.sound_volume, 100))),
      tts_enabled: Boolean(tier?.tts_enabled),
      tts_text: String(tier?.tts_text || "{donor_name} {amount} теңге. {message}"),
      tts_voice_mode: String(tier?.tts_voice_mode || "female"),
      tts_lang: String(tier?.tts_lang || "kk-KZ"),
      tts_rate: Math.max(0.5, Math.min(1.6, safeFloat(tier?.tts_rate, 1))),
      tts_pitch: Math.max(0.5, Math.min(1.8, safeFloat(tier?.tts_pitch, 1))),
      duration_ms: Math.max(2000, safeInt(tier?.duration_ms, 7000)),
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

  for (const [key, defaults] of Object.entries(DEFAULT_SETTINGS.boards)) {
    const board = data.boards?.[key] || {};
    data.boards[key] = {
      ...defaults,
      ...board,
      title: String(board.title || defaults.title),
      limit: Math.max(1, Math.min(20, safeInt(board.limit, defaults.limit))),
      mode: String(board.mode || defaults.mode),
      style_id: String(board.style_id || defaults.style_id)
    };
  }

  data.goal = {
    ...DEFAULT_SETTINGS.goal,
    ...(data.goal || {})
  };
  data.goal.base_amount = Math.max(0, safeInt(data.goal.base_amount, 0));
  data.goal.target_amount = Math.max(1, safeInt(data.goal.target_amount, 50000));
  data.goal.auto_increment = data.goal.auto_increment !== false;
  data.goal.started_at = String(data.goal.started_at || nowIso());

  data.youtube = {
    ...DEFAULT_SETTINGS.youtube,
    ...(data.youtube || {})
  };
  data.youtube.enabled = data.youtube.enabled !== false;
  data.youtube.volume = Math.max(0, Math.min(100, safeInt(data.youtube.volume, 50)));
  data.youtube.min_amount = Math.max(0, safeInt(data.youtube.min_amount, 0));
  data.youtube.max_seconds = Math.max(10, safeInt(data.youtube.max_seconds, 180));
  data.youtube.mode = String(data.youtube.mode || "music") === "video" ? "video" : "music";

  return data;
}

function findAlertTier(settings, amount) {
  const tiers = Array.isArray(settings?.alert?.tiers) ? settings.alert.tiers : [];
  let best = tiers[0] || {};
  for (const tier of tiers) {
    if (amount >= safeInt(tier.min_amount, 0)) {
      best = tier;
    }
  }
  return best;
}

function applyAlias(name, settings) {
  const aliases = Array.isArray(settings?.aliases) ? settings.aliases : [];
  const normalized = String(name || "").trim().toLowerCase();
  for (const item of aliases) {
    if (normalized === String(item.original || "").trim().toLowerCase()) {
      return String(item.alias || "").trim() || name;
    }
  }
  return name;
}

function extractYoutubeUrl(text) {
  const input = String(text || "");
  const match = YOUTUBE_RE.exec(input);
  if (!match) {
    return "";
  }
  return `https://www.youtube.com/watch?v=${match[1]}`;
}

function stripYoutubeUrls(text) {
  return String(text || "").replace(YOUTUBE_RE, "").trim();
}

function resolveDonationPayload(raw, settings) {
  const base = raw || {};
  const amount = Math.max(0, safeInt(base.amount, 0));
  const message = String(base.message || "");
  const displayName = applyAlias(base.donor_name || "Аноним", settings);
  const tier = findAlertTier(settings, amount);

  const ttsTemplate = String(tier.tts_text || "{donor_name} {amount} теңге. {message}");
  let ttsText = ttsTemplate
    .replace("{donor_name}", displayName)
    .replace("{amount}", String(amount))
    .replace("{message}", message);
  if (message && !ttsTemplate.includes("{message}") && !ttsText.includes(message)) {
    ttsText = `${ttsText}. ${message}`;
  }

  return {
    id: safeInt(base.seq, safeInt(base.id, 0)),
    streamer_id: String(base.streamer_id || ""),
    device_id: String(base.device_id || ""),
    donor_name: String(base.donor_name || "Аноним"),
    display_name: displayName,
    amount,
    currency: String(base.currency || "KZT"),
    message,
    raw_text: String(base.raw_text || ""),
    source_app: String(base.source_app || "cloud_ingest"),
    confidence: safeFloat(base.confidence, 1),
    status: String(base.status || "ready"),
    published: true,
    publish_error: "",
    created_at: String(base.created_at_iso || ""),
    youtube_url: extractYoutubeUrl(`${message}\n${String(base.raw_text || "")}`),
    music_request_text: stripYoutubeUrls(message) || "Music request",
    tier,
    tts_text: ttsText,
    notification_time: ""
  };
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

function getPeriodKeys(inputDate) {
  const date = inputDate instanceof Date && !Number.isNaN(inputDate.getTime()) ? inputDate : new Date();
  const iso = date.toISOString();
  const dayKey = iso.slice(0, 10);
  const monthKey = iso.slice(0, 7);
  const weekParts = getIsoWeekParts(date);
  const weekKey = `${weekParts.year}-W${String(weekParts.week).padStart(2, "0")}`;
  return {
    createdAtIso: iso,
    dayKey,
    weekKey,
    monthKey
  };
}

function buildBaseUrl(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL;
  }
  const proto = String(req.get("x-forwarded-proto") || "https").split(",")[0].trim() || "https";
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function buildPreviewUrls(req, streamerId) {
  const base = buildBaseUrl(req);
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

function resolveStreamerId(req) {
  const queryStreamer = normalizeStreamerId(req.query?.streamer_id || "");
  const headerStreamer = normalizeStreamerId(req.get("x-streamer-id") || "");
  const bodyStreamer = normalizeStreamerId(req.body?.streamer_id || "");
  return queryStreamer || headerStreamer || bodyStreamer || "";
}

function resolveEffectiveStreamerId(req, allowFallback = true) {
  const explicit = resolveStreamerId(req);
  if (explicit) {
    return explicit;
  }
  if (allowFallback && !ENFORCE_STREAMER_SCOPE) {
    return DEFAULT_STREAMER_ID;
  }
  return "";
}

function ensureScopeOrReply(req, res, allowFallback = true) {
  const streamerId = resolveEffectiveStreamerId(req, allowFallback);
  if (!streamerId) {
    res.status(400).json({ error: "streamer scope required" });
    return "";
  }
  return streamerId;
}

function extractStreamerToken(req) {
  const headerToken = String(req.get("x-streamer-token") || "").trim();
  if (headerToken) {
    return headerToken;
  }
  const authHeader = String(req.get("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

async function verifyFirebaseUser(req) {
  const authHeader = String(req.get("authorization") || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Error("firebase id token required");
  }
  const token = authHeader.slice(7).trim();
  return admin.auth().verifyIdToken(token);
}

function streamerDocRef(streamerId) {
  return db.collection("streamers").doc(streamerId);
}

function settingsDocRef(streamerId) {
  return streamerDocRef(streamerId).collection("settings").doc("main");
}

function analyticsDocRef(streamerId) {
  return streamerDocRef(streamerId).collection("analytics").doc("current");
}

function donorStatsRef(streamerId) {
  return streamerDocRef(streamerId).collection("donor_stats");
}

function donationsRef(streamerId) {
  return streamerDocRef(streamerId).collection("donations");
}

function devicesRef(streamerId) {
  return streamerDocRef(streamerId).collection("devices");
}

function aggregateDonorRef(streamerId, period, key, donorKey) {
  return streamerDocRef(streamerId)
    .collection(`aggregate_${period}`)
    .doc(key)
    .collection("donors")
    .doc(donorKey);
}

async function loadStreamerAccount(streamerId) {
  const ref = streamerDocRef(streamerId);
  const snap = await ref.get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data() || {};
  return {
    streamer_id: streamerId,
    display_name: String(data.display_name || streamerId),
    token: String(data.token || ""),
    owner_uid: String(data.owner_uid || ""),
    created_at: timestampToIso(data.created_at),
    updated_at: timestampToIso(data.updated_at)
  };
}

async function ensureStreamerAccount(streamerId, options = {}) {
  const ref = streamerDocRef(streamerId);
  const now = SERVER_TIMESTAMP();
  const token = String(options.token || "").trim() || randomToken();
  const displayName = String(options.display_name || streamerId).trim() || streamerId;

  const existing = await loadStreamerAccount(streamerId);
  if (!existing) {
    await ref.set(
      {
        streamer_id: streamerId,
        display_name: displayName,
        owner_uid: String(options.owner_uid || "").trim(),
        token,
        created_at: now,
        updated_at: now,
        last_seq: 0
      },
      { merge: true }
    );
    return {
      streamer_id: streamerId,
      display_name: displayName,
      token,
      owner_uid: String(options.owner_uid || "")
    };
  }

  const updates = {
    updated_at: now
  };
  if (String(options.display_name || "").trim()) {
    updates.display_name = String(options.display_name || "").trim();
  }
  if (String(options.owner_uid || "").trim() && !existing.owner_uid) {
    updates.owner_uid = String(options.owner_uid || "").trim();
  }
  if (options.rotate_token) {
    updates.token = randomToken();
  }
  await ref.set(updates, { merge: true });
  const refreshed = await loadStreamerAccount(streamerId);
  return refreshed;
}

async function rotateStreamerToken(streamerId) {
  const account = await ensureStreamerAccount(streamerId, { rotate_token: true });
  return account;
}

async function listBoundDevices(streamerId) {
  const querySnap = await devicesRef(streamerId).orderBy("last_seen_at", "desc").limit(100).get();
  return querySnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      device_id: doc.id,
      device_name: String(data.device_name || ""),
      created_at: timestampToIso(data.created_at),
      last_seen_at: timestampToIso(data.last_seen_at)
    };
  });
}

async function bindDevice(streamerId, deviceId, deviceName) {
  const safeDeviceId = normalizeDeviceId(deviceId);
  if (!safeDeviceId) {
    throw new Error("device_id required");
  }
  await ensureStreamerAccount(streamerId, {});
  const ref = devicesRef(streamerId).doc(safeDeviceId);
  await ref.set(
    {
      device_id: safeDeviceId,
      device_name: String(deviceName || "").trim().slice(0, 120),
      last_seen_at: SERVER_TIMESTAMP(),
      created_at: SERVER_TIMESTAMP()
    },
    { merge: true }
  );
  const snap = await ref.get();
  const data = snap.data() || {};
  return {
    device_id: safeDeviceId,
    device_name: String(data.device_name || ""),
    created_at: timestampToIso(data.created_at),
    last_seen_at: timestampToIso(data.last_seen_at)
  };
}

async function verifyStreamerToken(streamerId, token) {
  const safeToken = String(token || "").trim();
  if (!streamerId || !safeToken) {
    return false;
  }
  const account = await loadStreamerAccount(streamerId);
  if (!account || !account.token) {
    return false;
  }
  return secureCompare(account.token, safeToken);
}

async function requireStreamerToken(req, res, streamerId) {
  const account = await loadStreamerAccount(streamerId);
  if (!account || !account.token) {
    return true;
  }
  const provided = extractStreamerToken(req);
  if (await verifyStreamerToken(streamerId, provided)) {
    return true;
  }
  res.status(401).json({ error: "invalid streamer token" });
  return false;
}

async function loadSettings(streamerId) {
  const snap = await settingsDocRef(streamerId).get();
  if (!snap.exists) {
    return normalizeSettings({});
  }
  return normalizeSettings(snap.data()?.data || {});
}

async function saveSettings(streamerId, patch) {
  const current = await loadSettings(streamerId);
  const next = normalizeSettings(deepMerge(current, patch || {}));
  await settingsDocRef(streamerId).set(
    {
      data: next,
      updated_at: SERVER_TIMESTAMP()
    },
    { merge: true }
  );
  return next;
}

function buildGoalState(settings, analytics) {
  const goal = settings.goal || {};
  const baseAmount = Math.max(0, safeInt(goal.base_amount, 0));
  const totalDonations = Math.max(0, safeInt(analytics.total_amount, 0));
  const currentAmount = goal.auto_increment === false ? baseAmount : baseAmount + totalDonations;
  const targetAmount = Math.max(1, safeInt(goal.target_amount, 1));
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
    started_at: String(goal.started_at || nowIso())
  };
}

async function getLastDonation(streamerId) {
  const snap = await donationsRef(streamerId).orderBy("seq", "desc").limit(1).get();
  if (snap.empty) {
    return null;
  }
  return snap.docs[0].data() || null;
}

async function getDonationList(streamerId, limit, afterId) {
  let query = donationsRef(streamerId).orderBy("seq", "asc").limit(Math.max(1, Math.min(200, limit)));
  if (afterId > 0) {
    query = query.startAfter(afterId);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() || {});
}

async function getTopFromAggregate(streamerId, period, key, limit) {
  if (!key) {
    return [];
  }
  const snap = await streamerDocRef(streamerId)
    .collection(`aggregate_${period}`)
    .doc(key)
    .collection("donors")
    .orderBy("total_amount", "desc")
    .limit(Math.max(limit, 5))
    .get();

  const items = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      donor_name: String(data.donor_name || "Аноним"),
      total_amount: Math.max(0, safeInt(data.total_amount, 0)),
      donation_count: Math.max(0, safeInt(data.donation_count, 0)),
      last_amount: Math.max(0, safeInt(data.last_amount, 0))
    };
  });
  items.sort((a, b) => (b.total_amount - a.total_amount) || a.donor_name.localeCompare(b.donor_name));
  return items.slice(0, limit);
}

function normalizeAnalytics(data) {
  const nowKeys = getPeriodKeys(new Date());
  const analytics = data || {};
  const topDay = analytics.day_key === nowKeys.dayKey ? analytics.top_day || [] : [];
  const topWeek = analytics.week_key === nowKeys.weekKey ? analytics.top_week || [] : [];
  const topMonth = analytics.month_key === nowKeys.monthKey ? analytics.top_month || [] : [];

  return {
    donation_count: Math.max(0, safeInt(analytics.donation_count, 0)),
    total_amount: Math.max(0, safeInt(analytics.total_amount, 0)),
    average_donation: safeFloat(analytics.average_donation, 0),
    unique_donors: Math.max(0, safeInt(analytics.unique_donors, 0)),
    repeat_donors: Math.max(0, safeInt(analytics.repeat_donors, 0)),
    day_key: String(analytics.day_key || nowKeys.dayKey),
    week_key: String(analytics.week_key || nowKeys.weekKey),
    month_key: String(analytics.month_key || nowKeys.monthKey),
    top_day: Array.isArray(topDay) ? topDay : [],
    top_week: Array.isArray(topWeek) ? topWeek : [],
    top_month: Array.isArray(topMonth) ? topMonth : []
  };
}

async function loadAnalytics(streamerId) {
  const snap = await analyticsDocRef(streamerId).get();
  if (!snap.exists) {
    return normalizeAnalytics({});
  }
  return normalizeAnalytics(snap.data() || {});
}

async function refreshTopLists(streamerId, dayKey, weekKey, monthKey) {
  const [topDay, topWeek, topMonth] = await Promise.all([
    getTopFromAggregate(streamerId, "day", dayKey, 5),
    getTopFromAggregate(streamerId, "week", weekKey, 5),
    getTopFromAggregate(streamerId, "month", monthKey, 5)
  ]);

  await analyticsDocRef(streamerId).set(
    {
      day_key: dayKey,
      week_key: weekKey,
      month_key: monthKey,
      top_day: topDay,
      top_week: topWeek,
      top_month: topMonth,
      updated_at: SERVER_TIMESTAMP()
    },
    { merge: true }
  );
}

async function createDonation(params) {
  const streamerId = normalizeStreamerId(params.streamer_id || "");
  if (!streamerId) {
    throw new Error("streamer_id required");
  }

  const donorName = String(params.donor_name || "Аноним").trim() || "Аноним";
  const amount = Math.max(0, safeInt(params.amount, 0));
  const message = String(params.message || "Хабарлама жоқ").trim() || "Хабарлама жоқ";
  const rawText = String(params.raw_text || "").trim() || `Kaspi Gold\nПеревод ${amount} ₸\nОтправитель: ${donorName}\nСообщение: ${message}`;
  const currency = String(params.currency || "KZT").trim() || "KZT";
  const sourceApp = String(params.source_app || "cloud_ingest").trim() || "cloud_ingest";
  const confidence = safeFloat(params.confidence, 1);
  const deviceId = normalizeDeviceId(params.device_id || "");
  const parsedDate = parseIsoDate(params.received_at);
  const period = getPeriodKeys(parsedDate || new Date());
  const donorKey = normalizeDonorKey(donorName);

  let created = null;

  await db.runTransaction(async (tx) => {
    const streamerRef = streamerDocRef(streamerId);
    const analyticsRef = analyticsDocRef(streamerId);
    const donorRef = donorStatsRef(streamerId).doc(donorKey);
    const dayRef = aggregateDonorRef(streamerId, "day", period.dayKey, donorKey);
    const weekRef = aggregateDonorRef(streamerId, "week", period.weekKey, donorKey);
    const monthRef = aggregateDonorRef(streamerId, "month", period.monthKey, donorKey);

    const [streamerSnap, analyticsSnap, donorSnap, daySnap, weekSnap, monthSnap] = await Promise.all([
      tx.get(streamerRef),
      tx.get(analyticsRef),
      tx.get(donorRef),
      tx.get(dayRef),
      tx.get(weekRef),
      tx.get(monthRef)
    ]);

    const streamerData = streamerSnap.exists ? streamerSnap.data() || {} : {};
    const analyticsData = analyticsSnap.exists ? analyticsSnap.data() || {} : {};
    const donorData = donorSnap.exists ? donorSnap.data() || {} : {};
    const dayData = daySnap.exists ? daySnap.data() || {} : {};
    const weekData = weekSnap.exists ? weekSnap.data() || {} : {};
    const monthData = monthSnap.exists ? monthSnap.data() || {} : {};

    const lastSeq = Math.max(0, safeInt(streamerData.last_seq, 0));
    const seq = lastSeq + 1;
    const donationId = String(seq).padStart(12, "0");

    const donorDonationCount = Math.max(0, safeInt(donorData.donation_count, 0));
    const nextDonorCount = donorDonationCount + 1;

    const totalAmount = Math.max(0, safeInt(analyticsData.total_amount, 0)) + amount;
    const donationCount = Math.max(0, safeInt(analyticsData.donation_count, 0)) + 1;
    const uniqueDonors = Math.max(0, safeInt(analyticsData.unique_donors, 0)) + (donorDonationCount === 0 ? 1 : 0);
    const repeatDonors = Math.max(0, safeInt(analyticsData.repeat_donors, 0)) + (donorDonationCount === 1 ? 1 : 0);

    const donationRef = donationsRef(streamerId).doc(donationId);
    const donationPayload = {
      id: donationId,
      seq,
      streamer_id: streamerId,
      device_id: deviceId,
      donor_name: donorName,
      donor_key: donorKey,
      amount,
      currency,
      message,
      raw_text: rawText,
      source_app: sourceApp,
      confidence,
      status: "ready",
      created_at: SERVER_TIMESTAMP(),
      created_at_iso: period.createdAtIso
    };

    tx.set(
      streamerRef,
      {
        streamer_id: streamerId,
        display_name: String(streamerData.display_name || streamerId),
        last_seq: seq,
        updated_at: SERVER_TIMESTAMP(),
        created_at: streamerData.created_at || SERVER_TIMESTAMP()
      },
      { merge: true }
    );

    tx.set(donationRef, donationPayload, { merge: false });

    tx.set(
      donorRef,
      {
        donor_name: donorName,
        donor_key: donorKey,
        total_amount: Math.max(0, safeInt(donorData.total_amount, 0)) + amount,
        donation_count: nextDonorCount,
        last_amount: amount,
        updated_at: SERVER_TIMESTAMP(),
        created_at: donorData.created_at || SERVER_TIMESTAMP()
      },
      { merge: true }
    );

    const nextAggregate = (current) => ({
      donor_name: donorName,
      donor_key: donorKey,
      total_amount: Math.max(0, safeInt(current.total_amount, 0)) + amount,
      donation_count: Math.max(0, safeInt(current.donation_count, 0)) + 1,
      last_amount: amount,
      updated_at: SERVER_TIMESTAMP(),
      created_at: current.created_at || SERVER_TIMESTAMP()
    });

    tx.set(dayRef, nextAggregate(dayData), { merge: true });
    tx.set(weekRef, nextAggregate(weekData), { merge: true });
    tx.set(monthRef, nextAggregate(monthData), { merge: true });

    tx.set(
      analyticsRef,
      {
        donation_count: donationCount,
        total_amount: totalAmount,
        average_donation: donationCount ? Math.round((totalAmount / donationCount) * 100) / 100 : 0,
        unique_donors: uniqueDonors,
        repeat_donors: repeatDonors,
        day_key: period.dayKey,
        week_key: period.weekKey,
        month_key: period.monthKey,
        updated_at: SERVER_TIMESTAMP()
      },
      { merge: true }
    );

    created = donationPayload;
  });

  await refreshTopLists(streamerId, period.dayKey, period.weekKey, period.monthKey);
  return created;
}

async function buildStreamerProfilePayload(streamerId, req, includeToken = false) {
  const safeStreamerId = normalizeStreamerId(streamerId || "");
  if (!safeStreamerId) {
    return null;
  }

  const account = await loadStreamerAccount(safeStreamerId);
  const devices = await listBoundDevices(safeStreamerId);

  const payload = {
    streamer_id: safeStreamerId,
    display_name: account?.display_name || safeStreamerId,
    created_at: account?.created_at || "",
    updated_at: account?.updated_at || "",
    exists: Boolean(account),
    devices,
    urls: buildPreviewUrls(req, safeStreamerId)
  };

  if (includeToken && account?.token) {
    payload.token = account.token;
  }

  return payload;
}

function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      logger.error("api error", {
        path: req.path,
        method: req.method,
        message: error?.message || "unknown"
      });
      res.status(500).json({
        error: error?.message || "internal error"
      });
    }
  };
}

const apiApp = express();
apiApp.use(cors({ origin: true }));
apiApp.use(express.json({ limit: "1mb" }));

apiApp.get("/health", withErrorHandling(async (req, res) => {
  res.json({
    ok: true,
    scope_required: ENFORCE_STREAMER_SCOPE
  });
}));

apiApp.get("/state", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  const settings = await loadSettings(streamerId);
  const analytics = await loadAnalytics(streamerId);
  const lastRaw = await getLastDonation(streamerId);
  const lastDonation = lastRaw ? resolveDonationPayload(lastRaw, settings) : null;

  const topDayLimit = Math.max(1, safeInt(settings.boards?.top_day?.limit, 5));
  const topWeekLimit = Math.max(1, safeInt(settings.boards?.top_week?.limit, 5));
  const topMonthLimit = Math.max(1, safeInt(settings.boards?.top_month?.limit, 5));

  const boards = {
    top_day: (analytics.top_day || []).slice(0, topDayLimit),
    top_week: (analytics.top_week || []).slice(0, topWeekLimit),
    top_month: (analytics.top_month || []).slice(0, topMonthLimit),
    last_donation: lastDonation
  };

  res.json({
    streamer_id: streamerId,
    settings,
    goal: buildGoalState(settings, analytics),
    urls: buildPreviewUrls(req, streamerId),
    boards,
    analytics,
    profile: await buildStreamerProfilePayload(streamerId, req, false)
  });
}));

apiApp.get("/settings", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;
  res.json(await loadSettings(streamerId));
}));

apiApp.get("/cloud/settings", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, false);
  if (!streamerId) return;
  res.json(await loadSettings(streamerId));
}));

apiApp.post("/settings", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  if (!(await requireStreamerToken(req, res, streamerId))) {
    return;
  }

  const next = await saveSettings(streamerId, req.body || {});
  res.json(next);
}));

apiApp.post("/cloud/settings", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, false);
  if (!streamerId) return;

  if (!(await requireStreamerToken(req, res, streamerId))) {
    return;
  }

  const next = await saveSettings(streamerId, req.body || {});
  res.json(next);
}));

apiApp.get("/donations", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  const settings = await loadSettings(streamerId);
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const afterId = Math.max(0, safeInt(req.query.after_id, 0));
  const rows = await getDonationList(streamerId, limit, afterId);
  res.json(rows.map((item) => resolveDonationPayload(item, settings)));
}));

apiApp.get("/feed", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  const settings = await loadSettings(streamerId);
  const afterId = Math.max(0, safeInt(req.query.after_id, 0));
  const rows = await getDonationList(streamerId, 100, afterId);
  res.json(rows.map((item) => resolveDonationPayload(item, settings)));
}));

apiApp.get("/music-feed", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  const settings = await loadSettings(streamerId);
  const afterId = Math.max(0, safeInt(req.query.after_id, 0));
  const rows = await getDonationList(streamerId, 100, afterId);

  const payload = rows
    .map((item) => resolveDonationPayload(item, settings))
    .filter((item) => {
      if (!settings.youtube?.enabled) {
        return false;
      }
      if (!item.youtube_url) {
        return false;
      }
      if (item.amount < Math.max(0, safeInt(settings.youtube?.min_amount, 0))) {
        return false;
      }
      if (item.tier?.youtube_enabled === false) {
        return false;
      }
      return true;
    });

  res.json(payload);
}));

apiApp.get("/stats/:board", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  const board = String(req.params.board || "top_day");
  const settings = await loadSettings(streamerId);
  const analytics = await loadAnalytics(streamerId);

  if (board === "last_donation") {
    const row = await getLastDonation(streamerId);
    res.json(row ? resolveDonationPayload(row, settings) : null);
    return;
  }

  if (board === "top_day") {
    const limit = clampInt(req.query.limit, safeInt(settings.boards?.top_day?.limit, 5), 1, 20);
    res.json((analytics.top_day || []).slice(0, limit));
    return;
  }

  if (board === "top_week") {
    const limit = clampInt(req.query.limit, safeInt(settings.boards?.top_week?.limit, 5), 1, 20);
    res.json((analytics.top_week || []).slice(0, limit));
    return;
  }

  if (board === "top_month") {
    const limit = clampInt(req.query.limit, safeInt(settings.boards?.top_month?.limit, 5), 1, 20);
    res.json((analytics.top_month || []).slice(0, limit));
    return;
  }

  if (board === "top_all") {
    const limit = clampInt(req.query.limit, 5, 1, 20);
    const snap = await donorStatsRef(streamerId).orderBy("total_amount", "desc").limit(limit).get();
    const items = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        donor_name: String(data.donor_name || "Аноним"),
        total_amount: safeInt(data.total_amount, 0),
        donation_count: safeInt(data.donation_count, 0),
        last_amount: safeInt(data.last_amount, 0)
      };
    });
    res.json(items);
    return;
  }

  res.status(404).json({ error: "board not found" });
}));

apiApp.get("/goal", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  const [settings, analytics] = await Promise.all([
    loadSettings(streamerId),
    loadAnalytics(streamerId)
  ]);
  res.json(buildGoalState(settings, analytics));
}));

apiApp.get("/preview-urls", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;
  res.json(buildPreviewUrls(req, streamerId));
}));

apiApp.get("/analytics/summary", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;
  res.json(await loadAnalytics(streamerId));
}));

apiApp.get(["/profile", "/cloud/profile"], withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;
  res.json((await buildStreamerProfilePayload(streamerId, req, false)) || {});
}));

apiApp.post("/test-donation", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, true);
  if (!streamerId) return;

  if (!(await requireStreamerToken(req, res, streamerId))) {
    return;
  }

  const created = await createDonation({
    streamer_id: streamerId,
    donor_name: req.body?.donor_name || "Тест Донатер",
    amount: req.body?.amount || 5000,
    message: req.body?.message || "Бұл тест донат. YouTube preview үшін https://youtu.be/dQw4w9WgXcQ",
    raw_text: req.body?.raw_text || "Kaspi Gold",
    confidence: 1,
    source_app: "test_donation",
    device_id: req.body?.device_id || "",
    received_at: req.body?.received_at || nowIso()
  });

  const settings = await loadSettings(streamerId);
  res.status(201).json(resolveDonationPayload(created, settings));
}));

apiApp.post("/cloud/register", withErrorHandling(async (req, res) => {
  const requestedStreamer = normalizeStreamerId(req.body?.streamer_id || resolveStreamerId(req));
  if (!requestedStreamer) {
    res.status(400).json({ error: "streamer_id required" });
    return;
  }

  const existing = await loadStreamerAccount(requestedStreamer);
  if (existing?.token && !(await verifyStreamerToken(requestedStreamer, extractStreamerToken(req)))) {
    res.status(409).json({ error: "streamer already registered" });
    return;
  }

  const account = await ensureStreamerAccount(requestedStreamer, {
    display_name: String(req.body?.display_name || "").trim(),
    rotate_token: Boolean(req.body?.rotate_token)
  });

  const deviceId = normalizeDeviceId(req.body?.device_id || req.get("x-device-id") || "");
  const deviceName = String(req.body?.device_name || "").trim();
  if (deviceId) {
    await bindDevice(requestedStreamer, deviceId, deviceName);
  }

  res.status(existing ? 200 : 201).json({
    account,
    profile: await buildStreamerProfilePayload(requestedStreamer, req, false)
  });
}));

apiApp.post("/cloud/rotate-token", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, false);
  if (!streamerId) return;

  if (!(await requireStreamerToken(req, res, streamerId))) {
    return;
  }

  const account = await rotateStreamerToken(streamerId);
  res.json({ account });
}));

apiApp.post("/cloud/bind-device", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, false);
  if (!streamerId) return;

  if (!(await requireStreamerToken(req, res, streamerId))) {
    return;
  }

  const deviceId = normalizeDeviceId(req.body?.device_id || req.get("x-device-id") || "");
  if (!deviceId) {
    res.status(400).json({ error: "device_id required" });
    return;
  }

  const device = await bindDevice(streamerId, deviceId, String(req.body?.device_name || "").trim());
  res.json({
    device,
    devices: await listBoundDevices(streamerId)
  });
}));

apiApp.post("/cloud/ingest", withErrorHandling(async (req, res) => {
  const streamerId = ensureScopeOrReply(req, res, false);
  if (!streamerId) return;

  if (!(await requireStreamerToken(req, res, streamerId))) {
    return;
  }

  const deviceId = normalizeDeviceId(req.body?.device_id || req.get("x-device-id") || "");
  if (deviceId) {
    await bindDevice(streamerId, deviceId, String(req.body?.device_name || "").trim());
  }

  const created = await createDonation({
    streamer_id: streamerId,
    donor_name: req.body?.donor_name || "Аноним",
    amount: req.body?.amount || 0,
    message: req.body?.message || "Хабарлама жоқ",
    raw_text: req.body?.raw_text || "",
    currency: req.body?.currency || "KZT",
    source_app: req.body?.source_app || "cloud_ingest",
    confidence: req.body?.confidence ?? 1,
    device_id: deviceId,
    received_at: req.body?.received_at || nowIso()
  });

  const settings = await loadSettings(streamerId);
  res.status(201).json(resolveDonationPayload(created, settings));
}));

apiApp.post("/cloud/create-connect-code", withErrorHandling(async (req, res) => {
  const decoded = await verifyFirebaseUser(req);
  const requestedStreamer = normalizeStreamerId(req.body?.streamer_id || decoded.uid);
  if (!requestedStreamer) {
    res.status(400).json({ error: "streamer_id required" });
    return;
  }

  const account = await ensureStreamerAccount(requestedStreamer, {
    display_name: String(req.body?.display_name || decoded.name || decoded.email || requestedStreamer).trim(),
    owner_uid: decoded.uid
  });

  if (account.owner_uid && account.owner_uid !== decoded.uid) {
    res.status(403).json({ error: "streamer owned by another user" });
    return;
  }

  const code = randomConnectCode();
  const now = Date.now();
  const expiresAt = now + CONNECT_CODE_TTL_SECONDS * 1000;
  await db.collection("connect_codes").doc(code).set(
    {
      code,
      streamer_id: requestedStreamer,
      owner_uid: decoded.uid,
      created_at_ms: now,
      expires_at_ms: expiresAt,
      used: false,
      used_by_device: ""
    },
    { merge: true }
  );

  res.status(201).json({
    code,
    expires_at_ms: expiresAt,
    streamer_id: requestedStreamer,
    profile: await buildStreamerProfilePayload(requestedStreamer, req, false)
  });
}));

apiApp.post("/cloud/claim-device", withErrorHandling(async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const deviceId = normalizeDeviceId(req.body?.device_id || req.get("x-device-id") || "");
  const deviceName = String(req.body?.device_name || "Desktop Listener").trim();

  if (!code) {
    res.status(400).json({ error: "code required" });
    return;
  }
  if (!deviceId) {
    res.status(400).json({ error: "device_id required" });
    return;
  }

  const codeRef = db.collection("connect_codes").doc(code);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) {
    res.status(404).json({ error: "connect code not found" });
    return;
  }

  const codeData = codeSnap.data() || {};
  if (codeData.used) {
    res.status(409).json({ error: "connect code already used" });
    return;
  }
  if (Date.now() > Math.max(0, safeInt(codeData.expires_at_ms, 0))) {
    res.status(410).json({ error: "connect code expired" });
    return;
  }

  const streamerId = normalizeStreamerId(codeData.streamer_id || "");
  if (!streamerId) {
    res.status(400).json({ error: "invalid connect code" });
    return;
  }

  const account = await ensureStreamerAccount(streamerId, {});
  await bindDevice(streamerId, deviceId, deviceName);
  await codeRef.set(
    {
      used: true,
      used_by_device: deviceId,
      used_at_ms: Date.now()
    },
    { merge: true }
  );

  res.json({
    streamer_id: streamerId,
    token: account.token,
    ingest_path: "/api/cloud/ingest",
    profile: await buildStreamerProfilePayload(streamerId, req, false)
  });
}));

apiApp.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

exports.api = onRequest(
  {
    region: process.env.KAZ_ALERTS_FIREBASE_REGION || "us-central1",
    timeoutSeconds: 60,
    memory: "512MiB"
  },
  apiApp
);
