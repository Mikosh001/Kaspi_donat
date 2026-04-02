const previewMusicStyle = getQueryParam("preview_style", "");

const musicState = {
  settings: null,
  lastId: Number(getQueryParam("after_id", "0")) || 0,
  queue: [],
  busy: false,
  hideTimer: null
};

const musicUi = {
  card: document.getElementById("music-card"),
  bg: document.getElementById("music-bg"),
  badge: document.getElementById("music-badge"),
  subtitle: document.getElementById("music-subtitle"),
  title: document.getElementById("music-title"),
  requester: document.getElementById("music-requester"),
  amount: document.getElementById("music-amount"),
  time: document.getElementById("music-time"),
  requestText: document.getElementById("music-request-text"),
  coverImage: document.getElementById("music-cover-image"),
  playerFrame: document.getElementById("music-player-frame")
};

function youtubeThumb(url) {
  const match = /[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/i.exec(url || "");
  const videoId = match?.[1] || match?.[2];
  if (!videoId) {
    return "";
  }
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function applyMusicTheme(settings) {
  const youtube = { ...(settings.youtube || {}) };
  if (previewMusicStyle) {
    youtube.style_id = previewMusicStyle;
  }
  const styleId = normalizeStyleId(youtube.style_id || "cyberpunk");
  applyThemeClass(musicUi.card, styleId, "style");
  applyOverlayTheme(
    musicUi.card,
    resolveOverlayTheme(styleId, {
      font_family: youtube.font_family,
      background: youtube.card_background,
      accent_color: youtube.accent_color,
      text_color: youtube.text_color,
      title_color: youtube.accent_color,
      name_color: youtube.text_color,
      amount_color: youtube.accent_color,
      message_color: youtube.text_color
    })
  );
}

function stopMusicWidget() {
  clearTimeout(musicState.hideTimer);
  musicUi.card.classList.remove("is-visible");
  musicUi.playerFrame.src = "";
  musicState.busy = false;
  if (musicState.queue.length) {
    const next = musicState.queue.shift();
    window.setTimeout(() => showMusic(next), 180);
  }
}

function renderMusicFrame(item, youtubeSettings) {
  if (isPreviewMode()) {
    musicUi.playerFrame.src = "";
    musicUi.playerFrame.classList.add("audio-only");
    return;
  }
  const embedUrl = buildYoutubeEmbed(item.youtube_url, youtubeSettings);
  if (!embedUrl) {
    musicUi.playerFrame.src = "";
    musicUi.playerFrame.classList.add("audio-only");
    return;
  }
  musicUi.playerFrame.src = embedUrl;
  musicUi.playerFrame.classList.toggle("audio-only", youtubeSettings.mode !== "video");
}

function showMusic(item) {
  if (musicState.busy) {
    musicState.queue.push(item);
    return;
  }

  const youtubeSettings = musicState.settings.youtube || {};
  musicState.busy = true;
  applyMusicTheme(musicState.settings);

  const cover = youtubeThumb(item.youtube_url) || youtubeSettings.background_image || "";
  musicUi.bg.style.backgroundImage = cover ? `url("${cover}")` : "none";
  musicUi.coverImage.src = cover || "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
  musicUi.badge.style.display = youtubeSettings.show_badge ? "inline-flex" : "none";
  musicUi.subtitle.textContent = youtubeSettings.widget_title || "YouTube Music";
  musicUi.title.textContent = item.music_request_text || "Music request";
  musicUi.requester.textContent = item.display_name || item.donor_name || "Аноним";
  musicUi.amount.textContent = formatAmount(item.amount);
  musicUi.time.textContent = item.notification_time || "Live";
  musicUi.requestText.textContent = youtubeSettings.widget_subtitle || "Музыка донаттан бөлек widget арқылы жүреді";

  renderMusicFrame(item, youtubeSettings);
  musicUi.card.classList.add("is-visible");
  musicState.hideTimer = window.setTimeout(
    stopMusicWidget,
    clamp(Number(youtubeSettings.max_seconds || 180), 10, 600) * 1000
  );
}

async function loadSettings() {
  musicState.settings = await loadEffectiveSettings();
}

async function pollMusicFeed() {
  if (!musicState.settings?.youtube?.enabled) {
    return;
  }
  if (isPreviewMode()) {
    if (!musicState.busy) {
      showMusic(createDemoDonation(musicState.settings));
    }
    return;
  }

  const rows = await apiGet(`/api/music-feed?after_id=${musicState.lastId}`);
  rows.forEach((item) => {
    musicState.lastId = Math.max(musicState.lastId, Number(item.id || 0));
    showMusic(item);
  });
}

document.addEventListener("keydown", (event) => {
  const hotkey = String(musicState.settings?.youtube?.panic_hotkey || "F9").toUpperCase();
  if (event.key.toUpperCase() === hotkey) {
    stopMusicWidget();
  }
});

async function bootstrapMusicWidget() {
  await loadSettings();
  await pollMusicFeed();
  window.setInterval(() => {
    loadSettings()
      .then(pollMusicFeed)
      .catch(() => {});
  }, isPreviewMode() ? 2500 : 1500);
}

bootstrapMusicWidget().catch(console.error);
