const EXCLUDED_STATUSES = new Set(["sospechoso", "en_revision", "silenciado", "descartado"]);

export function buildExecutiveHomeSummary(evaluations = [], hours = 3, now = Date.now()) {
  const items = Array.isArray(evaluations) ? evaluations : [];
  const recent = items.filter((lead) => {
    const timestamp = lead.created_at ? new Date(lead.created_at).getTime() : NaN;
    return Number.isFinite(timestamp) && timestamp >= now - hours * 3600000 && timestamp <= now;
  }).sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
  return {
    total: items.length,
    high: items.filter((lead) => lead.result?.classification === "Alto" && !EXCLUDED_STATUSES.has(lead.reliability_status)).length,
    review: items.filter((lead) => ["sospechoso", "en_revision"].includes(lead.reliability_status)).length,
    recent: recent.slice(0, 12),
    recentTotal: recent.length,
  };
}
