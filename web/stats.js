const boardKey = getQueryParam("board", "top_day");
const previewStyle = getQueryParam("preview_style", "");

const statsState = {
  settings: null
};

const statsUi = {
  card: document.getElementById("board-card"),
  title: document.getElementById("board-title"),
  content: document.getElementById("board-content")
};

function endpointForBoard() {
  if (boardKey === "top_week") {
    return "/api/stats/top_week";
  }
  if (boardKey === "top_month") {
    return "/api/stats/top_month";
  }
  if (boardKey === "last_donation") {
    return "/api/stats/last_donation";
  }
  return "/api/stats/top_day";
}

function currentBoardSettings() {
  const fallback = statsState.settings.boards.top_day;
  const boardSettings = statsState.settings.boards[boardKey] || fallback;
  if (!previewStyle) {
    return boardSettings;
  }
  return { ...boardSettings, style_id: previewStyle };
}

function applyBoardTheme(boardSettings) {
  const styleId = normalizeStyleId(boardSettings.style_id || "classic");
  applyThemeClass(statsUi.card, styleId, "theme");
  applyOverlayTheme(statsUi.card, resolveOverlayTheme(styleId));
}

function previewListItems(items) {
  if (items.length) {
    return items;
  }
  return isPreviewMode() ? getPreviewBoardItems() : [];
}

function renderList(items) {
  const rows = previewListItems(items);
  if (!rows.length) {
    statsUi.content.innerHTML = "";
    return;
  }

  statsUi.content.innerHTML = `
    <div class="rows">
      ${rows.map((item, index) => `
        <div class="row-item rank-${index + 1}">
          <div class="row-rank">${index + 1}</div>
          <div class="row-name">${escapeHtml(item.donor_name)}</div>
          <div class="row-amount">${formatAmount(item.total_amount || item.amount)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMarquee(items) {
  const rows = previewListItems(items);
  if (!rows.length) {
    renderList(rows);
    return;
  }
  const rowHtml = rows.map((item, index) => `
    <span><strong>${index + 1}. ${escapeHtml(item.donor_name)}</strong> ${formatAmount(item.total_amount || item.amount)}</span>
  `).join("");
  statsUi.content.innerHTML = `
    <div class="marquee">
      <div class="marquee-track">${rowHtml}${rowHtml}</div>
    </div>
  `;
}

function renderSingle(item) {
  const row = item || (isPreviewMode() ? createDemoDonation(statsState.settings) : null);
  if (!row) {
    statsUi.content.innerHTML = "";
    return;
  }
  statsUi.content.innerHTML = `
    <div class="single-card">
      <div class="single-name">${escapeHtml(row.display_name || row.donor_name)}</div>
      <div class="single-amount">${formatAmount(row.amount)}</div>
      <div class="single-message">${escapeHtml(row.message || "Хабарлама жоқ")}</div>
    </div>
  `;
}

async function refreshStats() {
  statsState.settings = await loadEffectiveSettings();
  const boardSettings = currentBoardSettings();
  applyBoardTheme(boardSettings);
  statsUi.title.textContent = boardSettings.title;

  const endpoint = endpointForBoard();
  const payload = await apiGet(endpoint);

  if (boardKey === "last_donation") {
    renderSingle(payload);
    return;
  }

  const items = (payload || []).slice(0, Number(boardSettings.limit || 5));
  if (boardSettings.mode === "marquee") {
    renderMarquee(items);
  } else {
    renderList(items);
  }
}

refreshStats().catch(console.error);
window.setInterval(() => {
  refreshStats().catch(() => {});
}, 4000);
