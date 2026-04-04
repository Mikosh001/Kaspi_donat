const LANGUAGE_KEY = "kaz_alerts_admin_lang";

const state = {
  settings: null,
  urls: null,
  profile: null,
  tiers: [],
  aliases: [],
  lang: localStorage.getItem(LANGUAGE_KEY) || "kk",
  draftTimer: null
};

function getOrCreateBrowserDeviceId() {
  const key = "kaz_alerts_browser_device_id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const generated = `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(key, generated);
  return generated;
}

function addCacheBust(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function t(key) {
  return window.ADMIN_TRANSLATIONS?.[state.lang]?.[key] || window.ADMIN_TRANSLATIONS?.kk?.[key] || key;
}

function getById(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const box = getById("status-box");
  box.textContent = message;
  box.style.color = isError ? "#b13220" : "#a74129";
}

function isAuthFlowError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("sign in")
    || message.includes("алдымен")
    || message.includes("insufficient permissions")
    || message.includes("permission-denied")
    || message.includes("басқа аккаунтқа тиесілі")
  );
}

function buildConnectRedirectUrl() {
  const nextPath = `${window.location.pathname}${window.location.search}`;
  const connectPath = scopedRoute("/connect");
  const separator = connectPath.includes("?") ? "&" : "?";
  return `${connectPath}${separator}next=${encodeURIComponent(nextPath)}`;
}

function handleActionError(error) {
  const message = String(error?.message || error || "Unknown error");
  if (!isAuthFlowError(error)) {
    setStatus(message, true);
    return;
  }

  setStatus(`${message} /connect бетіне бағытталды...`, true);
  window.setTimeout(() => {
    window.location.href = buildConnectRedirectUrl();
  }, 450);
}

function styleOptionsHtml(selectedValue) {
  return listAvailableStyles().map((style) => `
    <option value="${style.id}" ${normalizeStyleId(selectedValue) === style.id ? "selected" : ""}>${style.label}</option>
  `).join("");
}

function populateStyleSelects() {
  ["alert-default-style", "board-top-month-style", "board-last-style", "goal-style", "youtube-style-id"].forEach((id) => {
    const select = getById(id);
    const current = select.dataset.currentValue || select.value || "classic";
    select.innerHTML = styleOptionsHtml(current);
    select.value = normalizeStyleId(current);
  });
}

function setSelectValue(id, value) {
  const select = getById(id);
  select.dataset.currentValue = normalizeStyleId(value || "classic");
  select.innerHTML = styleOptionsHtml(select.dataset.currentValue);
  select.value = select.dataset.currentValue;
}

function applyTranslations() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === state.lang);
  });
}

function renderMetrics(snapshot) {
  const topDay = snapshot.boards.top_day || [];
  const analytics = snapshot.analytics || {};
  getById("metric-donations").textContent = String(analytics.donation_count || topDay.reduce((sum, item) => sum + item.donation_count, 0));
  getById("metric-total").textContent = formatAmount(snapshot.goal.current_amount);
  getById("metric-goal").textContent = `${Math.round(snapshot.goal.progress)}%`;
  getById("metric-server").textContent = snapshot.urls.admin;
  getById("metric-average").textContent = formatAmount(analytics.average_donation || 0);
  getById("metric-repeat").textContent = String(analytics.repeat_donors || 0);
}

function renderStyleCard(style, selectedStyle, previewRoute, targetInputId) {
  const active = normalizeStyleId(selectedStyle) === style.id;
  return `
    <div class="style-card ${active ? "is-selected" : ""}">
      <div class="style-card-head">
        <div>
          <div class="style-name">${style.label}</div>
          <div class="style-description">${style.description}</div>
        </div>
        <input type="radio" ${active ? "checked" : ""} aria-label="${style.label}">
      </div>
      <div class="style-palette">
        <span style="background:${style.accent}"></span>
        <span style="background:${style.accentSoft}"></span>
        <span style="background:${style.text}"></span>
      </div>
      <div class="button-row">
        <button class="btn btn-light" type="button" data-preview-style="${style.id}" data-preview-route="${previewRoute}">${t("preview")}</button>
        <button class="btn btn-dark" type="button" data-apply-style="${style.id}" data-style-target="${targetInputId}">${t("use_style")}</button>
      </div>
    </div>
  `;
}

function renderStyleGalleries() {
  const quickStyles = listAvailableStyles().slice(0, 4);
  getById("alert-style-gallery").innerHTML = quickStyles.map((style) => {
    return renderStyleCard(style, getById("alert-default-style").value, "/widget?preview=1", "alert-default-style");
  }).join("");
  getById("board-style-gallery").innerHTML = quickStyles.map((style) => {
    return renderStyleCard(style, getById("board-top-day-style").value || "pubg", "/stats?board=top_day&preview=1", "board-top-day-style");
  }).join("");
}

function renderAlertSettings(settings) {
  getById("alert-min-amount").value = settings.alert.min_amount;
  getById("alert-master-volume").value = settings.alert.master_volume;
  setSelectValue("alert-default-style", settings.alert.default_style);
  state.tiers = settings.alert.tiers.map((tier) => ({ ...tier }));
  renderStyleGalleries();
  renderTiers();
}

function renderTierRow(tier, index) {
  return `
    <div class="tier-row" data-tier-index="${index}">
      <div class="tier-header">
        <strong>${t("tiers_title")} #${index + 1}</strong>
        <button class="btn btn-light" data-remove-tier="${index}">${t("remove")}</button>
      </div>
      <div class="field-grid three">
        <label><span>${t("min_alert_amount")}</span><input data-key="min_amount" type="number" min="1" value="${tier.min_amount}"></label>
        <label><span>${t("title_label")}</span><input data-key="title" type="text" value="${escapeHtml(tier.title || "")}"></label>
        <label><span>${t("duration_label")}</span><input data-key="duration_ms" type="number" min="2000" step="500" value="${tier.duration_ms}"></label>
      </div>
      <div class="field-grid three">
        <label><span>${t("style_select")}</span><select data-key="style_id">${styleOptionsHtml(tier.style_id)}</select></label>
        <label><span>${t("animation_label")}</span><select data-key="animation_in">
          <option value="rise" ${tier.animation_in === "rise" ? "selected" : ""}>${t("animation_rise")}</option>
          <option value="pop" ${tier.animation_in === "pop" ? "selected" : ""}>${t("animation_pop")}</option>
          <option value="slide-left" ${tier.animation_in === "slide-left" ? "selected" : ""}>${t("animation_slide_left")}</option>
          <option value="flip" ${tier.animation_in === "flip" ? "selected" : ""}>${t("animation_flip")}</option>
        </select></label>
        <label><span>${t("font_family")}</span><input data-key="font_family" type="text" value="${escapeHtml(tier.font_family || "")}"></label>
      </div>
      <div class="field-grid three">
        <label><span>${t("main_gif_url")}</span><input data-key="gif_url" type="url" value="${escapeHtml(tier.gif_url || "")}"></label>
        <label><span>${t("sound_url")}</span><input data-key="sound_url" type="url" value="${escapeHtml(tier.sound_url || "")}"></label>
        <label><span>${t("volume_label")}</span><input data-key="sound_volume" type="number" min="0" max="100" value="${tier.sound_volume}"></label>
      </div>
      <div class="field-grid three">
        <label><span>${t("accent_color")}</span><input data-key="accent_color" type="color" value="${tier.accent_color || "#ff5631"}"></label>
        <label><span>${t("title_text_color")}</span><input data-key="title_color" type="color" value="${tier.title_color || "#f5c7bd"}"></label>
        <label><span>${t("name_text_color")}</span><input data-key="name_color" type="color" value="${tier.name_color || "#ffffff"}"></label>
      </div>
      <div class="field-grid three">
        <label><span>${t("amount_text_color")}</span><input data-key="amount_color" type="color" value="${tier.amount_color || "#ff5631"}"></label>
        <label><span>${t("message_text_color")}</span><input data-key="message_color" type="color" value="${tier.message_color || "#ffffff"}"></label>
        <label><span>${t("border_color")}</span><input data-key="border_color" type="color" value="${tier.border_color || "#ffffff"}"></label>
      </div>
      <div class="field-grid two">
        <label><span>${t("background_css")}</span><input data-key="background" type="text" value="${escapeHtml(tier.background || "")}" placeholder="linear-gradient(...)"></label>
        <label><span>${t("tts_template")}</span><input data-key="tts_text" type="text" value="${escapeHtml(tier.tts_text || "")}"></label>
      </div>
      <div class="field-grid three">
        <label><span>${t("tts_voice")}</span><select data-key="tts_voice_mode">
          <option value="female" ${tier.tts_voice_mode === "female" ? "selected" : ""}>${t("voice_female")}</option>
          <option value="male" ${tier.tts_voice_mode === "male" ? "selected" : ""}>${t("voice_male")}</option>
          <option value="ai" ${tier.tts_voice_mode === "ai" ? "selected" : ""}>${t("voice_ai")}</option>
        </select></label>
        <label><span>${t("tts_lang")}</span><select data-key="tts_lang">
          <option value="kk-KZ" ${tier.tts_lang === "kk-KZ" ? "selected" : ""}>kk-KZ</option>
          <option value="ru-RU" ${tier.tts_lang === "ru-RU" ? "selected" : ""}>ru-RU</option>
          <option value="en-US" ${tier.tts_lang === "en-US" ? "selected" : ""}>en-US</option>
        </select></label>
        <label><span>${t("tts_rate")}</span><input data-key="tts_rate" type="number" min="0.5" max="1.6" step="0.05" value="${tier.tts_rate || 1}"></label>
      </div>
      <div class="field-grid three">
        <label><span>${t("tts_pitch")}</span><input data-key="tts_pitch" type="number" min="0.5" max="1.8" step="0.05" value="${tier.tts_pitch || 1}"></label>
        <label class="switch"><input data-key="tts_enabled" type="checkbox" ${tier.tts_enabled ? "checked" : ""}><span>${t("tts_full_text")}</span></label>
        <label class="switch"><input data-key="youtube_enabled" type="checkbox" ${tier.youtube_enabled ? "checked" : ""}><span>${t("forward_widgetyt")}</span></label>
      </div>
      <div class="field-grid two">
        <label><span>${t("gif_stack")}</span><textarea data-key="gif_stack">${escapeHtml((tier.gif_stack || []).join("\n"))}</textarea></label>
        <label><span>${t("sound_layers")}</span><textarea data-key="sound_layers">${escapeHtml(soundLayersToText(tier.sound_layers || []))}</textarea></label>
      </div>
    </div>
  `;
}

function renderTiers() {
  getById("tiers-list").innerHTML = state.tiers.map(renderTierRow).join("");
}

function renderBoards(settings) {
  getById("board-top-day-title").value = settings.boards.top_day.title;
  getById("board-top-day-limit").value = settings.boards.top_day.limit;
  getById("board-top-day-mode").value = settings.boards.top_day.mode;
  getById("board-top-day-style").value = normalizeStyleId(settings.boards.top_day.style_id || "pubg");
  getById("board-top-month-title").value = settings.boards.top_month.title;
  getById("board-top-month-limit").value = settings.boards.top_month.limit;
  getById("board-top-month-mode").value = settings.boards.top_month.mode;
  setSelectValue("board-top-month-style", settings.boards.top_month.style_id);
  getById("board-last-title").value = settings.boards.last_donation.title;
  setSelectValue("board-last-style", settings.boards.last_donation.style_id);
  renderStyleGalleries();
}

function renderGoal(settings) {
  getById("goal-title").value = settings.goal.title;
  getById("goal-base-amount").value = settings.goal.base_amount;
  getById("goal-target-amount").value = settings.goal.target_amount;
  setSelectValue("goal-style", settings.goal.style_id);
  getById("goal-bar-color").value = settings.goal.bar_color;
  getById("goal-text-color").value = settings.goal.text_color;
  getById("goal-auto-increment").checked = Boolean(settings.goal.auto_increment);
}

function renderYoutube(settings) {
  getById("youtube-mode").value = settings.youtube.mode;
  getById("youtube-volume").value = settings.youtube.volume;
  getById("youtube-min-amount").value = settings.youtube.min_amount;
  getById("youtube-max-seconds").value = settings.youtube.max_seconds;
  getById("youtube-panic-hotkey").value = settings.youtube.panic_hotkey;
  getById("youtube-preview-url").value = settings.youtube.preview_url || "";
  getById("youtube-enabled").checked = Boolean(settings.youtube.enabled);
  getById("youtube-widget-title").value = settings.youtube.widget_title || "";
  getById("youtube-widget-subtitle").value = settings.youtube.widget_subtitle || "";
  setSelectValue("youtube-style-id", settings.youtube.style_id);
  getById("youtube-accent-color").value = settings.youtube.accent_color || "#ff5631";
  getById("youtube-text-color").value = settings.youtube.text_color || "#ffffff";
  getById("youtube-font-family").value = settings.youtube.font_family || "Bahnschrift";
  getById("youtube-background-image").value = settings.youtube.background_image || "";
  getById("youtube-card-background").value = settings.youtube.card_background || "rgba(16,16,16,0.82)";
  getById("youtube-show-badge").checked = Boolean(settings.youtube.show_badge);
}

function renderAliases() {
  getById("aliases-list").innerHTML = state.aliases.map((item, index) => `
    <div class="alias-row" data-alias-index="${index}">
      <label><span>${t("original_name")}</span><input data-key="original" type="text" value="${escapeHtml(item.original || "")}"></label>
      <label><span>${t("alias_name")}</span><input data-key="alias" type="text" value="${escapeHtml(item.alias || "")}"></label>
      <button class="btn btn-light" data-remove-alias="${index}">${t("remove")}</button>
    </div>
  `).join("");
}

function renderLinks(urls) {
  const items = [[t("link_admin"), urls.admin], [t("link_alert"), urls.widget], [t("link_widgetyt"), urls.widgetyt], [t("link_top_day"), urls.top_day], [t("link_top_week"), urls.top_week], [t("link_top_month"), urls.top_month], [t("link_last_donation"), urls.last_donation], [t("link_goal"), urls.goal]];
  getById("links-list").innerHTML = items.map(([label, value], index) => `
    <div class="link-row">
      <strong>${label}</strong>
      <input id="copy-link-${index}" type="text" readonly value="${escapeHtml(value)}">
      <button class="btn btn-dark" data-copy-link="${index}">${t("copy")}</button>
    </div>
  `).join("");
}

function renderCloudProfile(profile) {
  const context = getStreamerContext();
  const streamerInput = getById("cloud-streamer-id");
  const deviceInput = getById("cloud-device-id");
  const tokenInput = getById("cloud-token");
  const summary = getById("cloud-profile-summary");

  streamerInput.value = context.id || "";
  if (!deviceInput.value) {
    deviceInput.value = getOrCreateBrowserDeviceId();
  }
  tokenInput.value = context.token || "";

  const hasContext = Boolean(context.id);
  getById("cloud-register-button").disabled = !hasContext;
  getById("cloud-bind-button").disabled = !hasContext;
  getById("cloud-rotate-button").disabled = !hasContext;

  if (!hasContext) {
    summary.textContent = t("cloud_needed");
    return;
  }

  const deviceCount = Array.isArray(profile?.devices) ? profile.devices.length : 0;
  const displayName = profile?.display_name || context.id;
  summary.textContent = `${displayName} • devices: ${deviceCount}`;
}

function activateTab(tabName) {
  document.querySelectorAll(".nav-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tabName));
}

function collectTierRows() {
  return Array.from(document.querySelectorAll(".tier-row")).map((row, index) => ({
    id: state.tiers[index]?.id || `tier-${Date.now()}-${index}`,
    min_amount: Number(row.querySelector("[data-key='min_amount']").value || 1),
    title: row.querySelector("[data-key='title']").value.trim() || "Жаңа донат",
    gif_url: row.querySelector("[data-key='gif_url']").value.trim(),
    gif_stack: splitLines(row.querySelector("[data-key='gif_stack']").value),
    sound_url: row.querySelector("[data-key='sound_url']").value.trim(),
    sound_layers: parseSoundLayerLines(row.querySelector("[data-key='sound_layers']").value),
    duration_ms: Number(row.querySelector("[data-key='duration_ms']").value || 7000),
    sound_volume: Number(row.querySelector("[data-key='sound_volume']").value || 100),
    style_id: row.querySelector("[data-key='style_id']").value,
    animation_in: row.querySelector("[data-key='animation_in']").value,
    font_family: row.querySelector("[data-key='font_family']").value.trim() || "Bahnschrift",
    accent_color: row.querySelector("[data-key='accent_color']").value,
    title_color: row.querySelector("[data-key='title_color']").value,
    name_color: row.querySelector("[data-key='name_color']").value,
    amount_color: row.querySelector("[data-key='amount_color']").value,
    message_color: row.querySelector("[data-key='message_color']").value,
    border_color: row.querySelector("[data-key='border_color']").value,
    background: row.querySelector("[data-key='background']").value.trim(),
    tts_enabled: row.querySelector("[data-key='tts_enabled']").checked,
    youtube_enabled: row.querySelector("[data-key='youtube_enabled']").checked,
    tts_text: row.querySelector("[data-key='tts_text']").value.trim() || "{donor_name} {amount} теңге. {message}",
    tts_voice_mode: row.querySelector("[data-key='tts_voice_mode']").value,
    tts_lang: row.querySelector("[data-key='tts_lang']").value,
    tts_rate: Number(row.querySelector("[data-key='tts_rate']").value || 1),
    tts_pitch: Number(row.querySelector("[data-key='tts_pitch']").value || 1)
  }));
}

function collectAliasRows() {
  return Array.from(document.querySelectorAll(".alias-row")).map((row) => ({
    original: row.querySelector("[data-key='original']").value.trim(),
    alias: row.querySelector("[data-key='alias']").value.trim()
  })).filter((item) => item.original);
}

function buildPayload() {
  return {
    aliases: collectAliasRows(),
    alert: {
      min_amount: Number(getById("alert-min-amount").value || 0),
      master_volume: Number(getById("alert-master-volume").value || 100),
      default_style: getById("alert-default-style").value,
      tiers: collectTierRows()
    },
    boards: {
      top_day: { title: getById("board-top-day-title").value.trim() || "ТОП ДОНАТ", limit: Number(getById("board-top-day-limit").value || 5), mode: getById("board-top-day-mode").value, style_id: getById("board-top-day-style").value || "pubg" },
      top_month: { title: getById("board-top-month-title").value.trim() || "ТОП АЙ", limit: Number(getById("board-top-month-limit").value || 5), mode: getById("board-top-month-mode").value, style_id: getById("board-top-month-style").value },
      last_donation: { title: getById("board-last-title").value.trim() || "СОҢҒЫ ДОНАТ", style_id: getById("board-last-style").value }
    },
    goal: {
      title: getById("goal-title").value.trim() || "ЦЕЛЬ СБОРА",
      base_amount: Number(getById("goal-base-amount").value || 0),
      target_amount: Number(getById("goal-target-amount").value || 1),
      style_id: getById("goal-style").value,
      bar_color: getById("goal-bar-color").value,
      text_color: getById("goal-text-color").value,
      auto_increment: getById("goal-auto-increment").checked,
      started_at: state.settings.goal.started_at
    },
    youtube: {
      mode: getById("youtube-mode").value,
      volume: Number(getById("youtube-volume").value || 50),
      min_amount: Number(getById("youtube-min-amount").value || 0),
      max_seconds: Number(getById("youtube-max-seconds").value || 180),
      panic_hotkey: getById("youtube-panic-hotkey").value.trim() || "F9",
      preview_url: getById("youtube-preview-url").value.trim(),
      enabled: getById("youtube-enabled").checked,
      widget_title: getById("youtube-widget-title").value.trim() || "YouTube Music",
      widget_subtitle: getById("youtube-widget-subtitle").value.trim() || "Музыка донаттан бөлек widget арқылы жүреді",
      style_id: getById("youtube-style-id").value,
      accent_color: getById("youtube-accent-color").value,
      text_color: getById("youtube-text-color").value,
      font_family: getById("youtube-font-family").value.trim() || "Bahnschrift",
      background_image: getById("youtube-background-image").value.trim(),
      card_background: getById("youtube-card-background").value.trim() || "rgba(16, 16, 16, 0.82)",
      show_badge: getById("youtube-show-badge").checked
    }
  };
}

function refreshPreviews() {
  getById("widget-preview").src = addCacheBust(scopedRoute("/widget?preview=1"));
  getById("widgetyt-preview").src = addCacheBust(scopedRoute("/widgetyt?preview=1"));
  getById("board-preview").src = addCacheBust(scopedRoute("/stats?board=top_day&preview=1"));
  getById("goal-preview").src = addCacheBust(scopedRoute("/goal?preview=1"));
}

function queueDraftPreview() {
  clearTimeout(state.draftTimer);
  state.draftTimer = window.setTimeout(() => {
    if (!state.settings) return;
    saveDraftSettings(deepMerge(state.settings, buildPayload()));
    refreshPreviews();
    setStatus(t("preview_updated"));
  }, 240);
}

function openStylePreview(styleId, route) {
  getById("style-modal-title").textContent = `${getStyleMeta(styleId).label} ${t("preview")}`;
  const scoped = scopedRoute(route);
  const separator = scoped.includes("?") ? "&" : "?";
  getById("style-modal-frame").src = `${scoped}${separator}preview_style=${styleId}&t=${Date.now()}`;
  getById("style-modal").classList.remove("hidden");
}

function closeStylePreview() {
  getById("style-modal").classList.add("hidden");
  getById("style-modal-frame").src = scopedRoute("/stats?board=top_day&preview=1");
}

async function refreshCloudProfile() {
  const context = getStreamerContext();
  if (!context.id) {
    renderCloudProfile(null);
    return;
  }
  const profile = await apiGet("/api/profile");
  state.profile = profile;
  renderCloudProfile(profile);
}

async function cloudRegister() {
  const context = getStreamerContext();
  if (!context.id) {
    throw new Error(t("cloud_needed"));
  }
  const deviceId = getById("cloud-device-id").value.trim() || getOrCreateBrowserDeviceId();
  const response = await apiPost("/api/cloud/register", {
    streamer_id: context.id,
    device_id: deviceId,
    device_name: "Admin Browser"
  });
  if (response?.account?.token) {
    setStreamerToken(response.account.token);
    getById("cloud-token").value = response.account.token;
  }
  state.profile = response?.profile || null;
  renderCloudProfile(state.profile);
  setStatus(t("cloud_ok"));
}

async function cloudBindDevice() {
  const context = getStreamerContext();
  if (!context.id) {
    throw new Error(t("cloud_needed"));
  }
  setStreamerToken(getById("cloud-token").value.trim());
  const deviceId = getById("cloud-device-id").value.trim() || getOrCreateBrowserDeviceId();
  await apiPost("/api/cloud/bind-device", {
    streamer_id: context.id,
    device_id: deviceId,
    device_name: "Admin Browser"
  });
  await refreshCloudProfile();
  setStatus(t("cloud_ok"));
}

async function cloudRotateToken() {
  const context = getStreamerContext();
  if (!context.id) {
    throw new Error(t("cloud_needed"));
  }
  setStreamerToken(getById("cloud-token").value.trim());
  const response = await apiPost("/api/cloud/rotate-token", {
    streamer_id: context.id
  });
  if (response?.account?.token) {
    setStreamerToken(response.account.token);
    getById("cloud-token").value = response.account.token;
  }
  await refreshCloudProfile();
  setStatus(t("cloud_ok"));
}

async function saveAll() {
  const payload = buildPayload();
  state.settings = await apiPost("/api/settings", payload);
  state.aliases = state.settings.aliases.map((item) => ({ ...item }));
  state.tiers = state.settings.alert.tiers.map((item) => ({ ...item }));
  saveDraftSettings(state.settings);
  renderAlertSettings(state.settings);
  renderBoards(state.settings);
  renderGoal(state.settings);
  renderYoutube(state.settings);
  renderAliases();
  refreshPreviews();
  setStatus(t("settings_saved"));
}

async function sendPreviewDonation() {
  const tiers = collectTierRows().sort((a, b) => a.min_amount - b.min_amount);
  const amount = tiers[0]?.min_amount || 5000;
  const youtubeLink = getById("youtube-preview-url").value.trim();
  const message = youtubeLink ? `QARAKESSEK - Құраған гүл ${youtubeLink}` : "Салам қалайсың";
  await apiPost("/api/test-donation", { donor_name: "Мейірбек Р.", amount, message });
  setStatus(t("preview_sent"));
  refreshPreviews();
}

function attachEvents() {
  document.addEventListener("click", (event) => {
    const navTab = event.target.closest(".nav-tab");
    if (navTab) return activateTab(navTab.dataset.tab);
    const langBtn = event.target.closest(".lang-btn");
    if (langBtn) {
      state.lang = langBtn.dataset.lang;
      localStorage.setItem(LANGUAGE_KEY, state.lang);
      applyTranslations();
      renderAlertSettings(state.settings);
      renderBoards(state.settings);
      renderAliases();
      renderLinks(state.urls);
      return;
    }
    const applyStyleButton = event.target.closest("[data-apply-style]");
    if (applyStyleButton) {
      const styleId = applyStyleButton.dataset.applyStyle;
      const input = getById(applyStyleButton.dataset.styleTarget);
      input.value = styleId;
      renderStyleGalleries();
      return queueDraftPreview();
    }
    const previewStyleButton = event.target.closest("[data-preview-style]");
    if (previewStyleButton) return openStylePreview(previewStyleButton.dataset.previewStyle, previewStyleButton.dataset.previewRoute);
    if (event.target.id === "style-modal-close" || event.target.id === "style-modal-close-button") return closeStylePreview();
    if (event.target.id === "add-tier-button") {
      state.tiers.push({ id: `tier-${Date.now()}`, min_amount: 1000, title: "Жаңа донат", gif_url: "", gif_stack: [], sound_url: "", sound_layers: [], duration_ms: 7000, sound_volume: 100, style_id: getById("alert-default-style").value || "classic", animation_in: "rise", font_family: "Bahnschrift", accent_color: "#ff5631", title_color: "#f5c7bd", name_color: "#ffffff", amount_color: "#ff5631", message_color: "#ffffff", border_color: "#ffffff", background: "", tts_enabled: false, youtube_enabled: true, tts_text: "{donor_name} {amount} теңге. {message}", tts_voice_mode: "female", tts_lang: "kk-KZ", tts_rate: 1, tts_pitch: 1 });
      renderTiers();
      return queueDraftPreview();
    }
    if (event.target.id === "add-alias-button") {
      state.aliases.push({ original: "", alias: "" });
      return renderAliases();
    }
    if (event.target.matches("[data-remove-tier]")) {
      state.tiers.splice(Number(event.target.dataset.removeTier), 1);
      renderTiers();
      return queueDraftPreview();
    }
    if (event.target.matches("[data-remove-alias]")) {
      state.aliases.splice(Number(event.target.dataset.removeAlias), 1);
      renderAliases();
      return queueDraftPreview();
    }
    if (event.target.id === "save-all-button") return saveAll().catch(handleActionError);
    if (event.target.id === "preview-donation-button") return sendPreviewDonation().catch(handleActionError);
    if (event.target.id === "cloud-register-button") return cloudRegister().catch(handleActionError);
    if (event.target.id === "cloud-bind-button") return cloudBindDevice().catch(handleActionError);
    if (event.target.id === "cloud-rotate-button") return cloudRotateToken().catch(handleActionError);
    if (event.target.matches("[data-copy-link]")) {
      const input = getById(`copy-link-${event.target.dataset.copyLink}`);
      return copyText(input.value).then(() => setStatus(t("link_copied"))).catch((error) => setStatus(error.message, true));
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.closest(".config-card")) {
      renderStyleGalleries();
      queueDraftPreview();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.closest(".config-card")) {
      renderStyleGalleries();
      queueDraftPreview();
    }
    if (event.target.id === "cloud-token") {
      setStreamerToken(event.target.value.trim());
    }
  });
}

async function loadState() {
  const snapshot = await apiGet("/api/state");
  state.settings = snapshot.settings;
  state.urls = snapshot.urls;
  state.profile = snapshot.profile;
  state.aliases = snapshot.settings.aliases.map((item) => ({ ...item }));
  populateStyleSelects();
  applyTranslations();
  renderMetrics(snapshot);
  renderAlertSettings(snapshot.settings);
  renderBoards(snapshot.settings);
  renderGoal(snapshot.settings);
  renderYoutube(snapshot.settings);
  renderAliases();
  renderLinks(snapshot.urls);
  renderCloudProfile(snapshot.profile);
  saveDraftSettings(snapshot.settings);
  refreshPreviews();
  setStatus(t("status_idle"));
}

attachEvents();
loadState().catch((error) => setStatus(error.message, true));
