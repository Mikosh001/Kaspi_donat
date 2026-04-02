const goalUi = {
  card: document.getElementById("goal-card"),
  title: document.getElementById("goal-title"),
  fill: document.getElementById("goal-fill"),
  progress: document.getElementById("goal-progress"),
  current: document.getElementById("goal-current"),
  target: document.getElementById("goal-target")
};

function applyGoalStyle(goal) {
  const styleId = normalizeStyleId(goal.style_id || "classic");
  applyThemeClass(goalUi.card, styleId, "style");
  applyOverlayTheme(
    goalUi.card,
    resolveOverlayTheme(styleId, {
      accent_color: goal.bar_color || "#ff5631",
      text_color: goal.text_color || "#ffffff",
      background: goal.background_color || "rgba(16, 16, 16, 0.92)"
    })
  );
}

function buildPreviewGoal(settings) {
  const goal = settings.goal || {};
  const currentAmount = Number(goal.base_amount || 12500);
  const targetAmount = Math.max(1, Number(goal.target_amount || 50000));
  const progress = Math.min(100, Math.round((currentAmount / targetAmount) * 100));
  return {
    ...goal,
    current_amount: currentAmount,
    target_amount: targetAmount,
    progress
  };
}

async function refreshGoal() {
  const goal = isPreviewMode()
    ? buildPreviewGoal(await loadEffectiveSettings())
    : await apiGet("/api/goal");

  applyGoalStyle(goal);
  goalUi.title.textContent = goal.title;
  goalUi.fill.style.width = `${goal.progress}%`;
  goalUi.progress.textContent = `${Math.round(goal.progress)}%`;
  goalUi.current.textContent = formatAmount(goal.current_amount);
  goalUi.target.textContent = formatAmount(goal.target_amount);
}

refreshGoal().catch(console.error);
window.setInterval(() => {
  refreshGoal().catch(() => {});
}, isPreviewMode() ? 2500 : 4000);
