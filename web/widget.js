const previewStyle = getQueryParam("preview_style", "");

const widgetState = {
  settings: null,
  lastId: Number(getQueryParam("after_id", "0")) || 0,
  queue: [],
  busy: false,
  hideTimer: null,
  activeAudios: []
};

const widgetUi = {
  card: document.getElementById("alert-card"),
  title: document.getElementById("alert-title"),
  name: document.getElementById("alert-name"),
  amount: document.getElementById("alert-amount"),
  message: document.getElementById("alert-message"),
  gifMain: document.getElementById("alert-gif-main"),
  gifSideA: document.getElementById("alert-gif-side-a"),
  gifSideB: document.getElementById("alert-gif-side-b"),
  previewBadge: document.getElementById("preview-badge")
};

function stopSounds() {
  widgetState.activeAudios.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  widgetState.activeAudios = [];
}

function pickSpeechVoice(lang, voiceMode) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) {
    return null;
  }
  const prefix = (lang || "ru").toLowerCase().slice(0, 2);
  const byLang = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith(prefix));
  const pool = byLang.length ? byLang : voices;
  const modePatterns = {
    female: /(female|zira|hedda|katya|alya|alina|anna|maria|ira|svetlana)/i,
    male: /(male|david|pavel|nikolay|alex|yuri|anton|igor)/i,
    ai: /(google|microsoft|neural|online|cloud|premium)/i
  };
  const pattern = modePatterns[voiceMode] || null;
  if (pattern) {
    const match = pool.find((voice) => pattern.test(voice.name || ""));
    if (match) {
      return match;
    }
  }
  return pool[0] || voices[0] || null;
}

function speakTts(text, tier) {
  if (!("speechSynthesis" in window) || !text) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = tier.tts_lang || "kk-KZ";
  utterance.rate = clamp(Number(tier.tts_rate || 1), 0.5, 1.6);
  utterance.pitch = clamp(Number(tier.tts_pitch || 1), 0.5, 1.8);
  const voice = pickSpeechVoice(utterance.lang, tier.tts_voice_mode || "female");
  if (voice) {
    utterance.voice = voice;
  }
  window.speechSynthesis.speak(utterance);
}

function effectiveTier(item) {
  const tier = { ...(item.tier || {}) };
  if (previewStyle) {
    tier.style_id = previewStyle;
  }
  return tier;
}

function applyCardStyle(tier) {
  const styleId = normalizeStyleId(tier.style_id || widgetState.settings.alert.default_style || "classic");
  applyThemeClass(widgetUi.card, styleId, "style");
  widgetUi.card.dataset.animation = tier.animation_in || "rise";
  applyOverlayTheme(
    widgetUi.card,
    resolveOverlayTheme(styleId, {
      font_family: tier.font_family,
      background: tier.background,
      accent_color: tier.accent_color,
      border_color: tier.border_color,
      title_color: tier.title_color,
      name_color: tier.name_color,
      amount_color: tier.amount_color,
      message_color: tier.message_color
    })
  );
}

function setGifVisibility(image, url) {
  const container = image?.parentElement;
  if (!container || !image) {
    return;
  }
  if (url) {
    image.src = url;
    container.style.display = "block";
  } else {
    image.removeAttribute("src");
    container.style.display = "none";
  }
}

function applyGifStack(tier) {
  const fallbackGif = "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif";
  const stack = [tier.gif_url || fallbackGif, ...(Array.isArray(tier.gif_stack) ? tier.gif_stack : [])];
  setGifVisibility(widgetUi.gifMain, stack[0] || fallbackGif);
  setGifVisibility(widgetUi.gifSideA, stack[1] || "");
  setGifVisibility(widgetUi.gifSideB, stack[2] || "");
}

function playLayeredSound(tier) {
  stopSounds();
  const masterVolume = Number(widgetState.settings.alert.master_volume || 100) / 100;
  const layers = [];
  if (tier.sound_url) {
    layers.push({ url: tier.sound_url, volume: Number(tier.sound_volume || 100) });
  }
  (Array.isArray(tier.sound_layers) ? tier.sound_layers : []).forEach((layer) => {
    if (layer?.url) {
      layers.push({ url: layer.url, volume: Number(layer.volume || 100) });
    }
  });
  layers.forEach((layer) => {
    const audio = new Audio(layer.url);
    audio.volume = clamp((layer.volume / 100) * masterVolume, 0, 1);
    audio.play().catch(() => {});
    widgetState.activeAudios.push(audio);
  });
}

function hideCard() {
  widgetUi.card.classList.remove("is-visible");
  stopSounds();
  widgetState.busy = false;
  if (widgetState.queue.length) {
    const next = widgetState.queue.shift();
    window.setTimeout(() => showDonation(next), 220);
  }
}

function showDonation(item) {
  if (widgetState.busy) {
    widgetState.queue.push(item);
    return;
  }

  widgetState.busy = true;
  const tier = effectiveTier(item);
  applyCardStyle(tier);
  applyGifStack(tier);

  widgetUi.title.textContent = tier.title || "Жаңа донат";
  widgetUi.name.textContent = item.display_name || item.donor_name || "Аноним";
  widgetUi.amount.textContent = formatAmount(item.amount);
  widgetUi.message.textContent = item.message || "Хабарлама жоқ";
  widgetUi.previewBadge.style.display = widgetState.settings.alert.show_preview_badge ? "inline-flex" : "none";

  if (tier.sound_url || (Array.isArray(tier.sound_layers) && tier.sound_layers.length)) {
    playLayeredSound(tier);
  }

  if (tier.tts_enabled && !isPreviewMode()) {
    speakTts(item.tts_text || `${item.display_name} ${item.amount}. ${item.message || ""}`, tier);
  }

  widgetUi.card.classList.add("is-visible");
  clearTimeout(widgetState.hideTimer);
  widgetState.hideTimer = window.setTimeout(hideCard, Number(tier.duration_ms || 7000));
}

async function loadSettings() {
  widgetState.settings = await loadEffectiveSettings();
}

async function pollFeed() {
  if (!widgetState.settings) {
    return;
  }
  if (isPreviewMode()) {
    if (!widgetState.busy) {
      const demo = createDemoDonation(widgetState.settings);
      showDonation(demo);
    }
    return;
  }

  const rows = await apiGet(`/api/feed?after_id=${widgetState.lastId}`);
  rows.forEach((item) => {
    widgetState.lastId = Math.max(widgetState.lastId, Number(item.id || 0));
    if (item.amount >= Number(widgetState.settings.alert.min_amount || 0)) {
      showDonation(item);
    }
  });
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

async function bootstrapWidget() {
  await loadSettings();
  await pollFeed();
  window.setInterval(() => {
    loadSettings()
      .then(pollFeed)
      .catch(() => {});
  }, isPreviewMode() ? 2500 : 1500);
}

bootstrapWidget().catch(console.error);
