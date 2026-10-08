const MIN_DATES = 90;

function parseDate(value) {
  const time = Date.parse(`${String(value || "").slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

export function projectUf(history = [], purchaseDate, today = new Date()) {
  const target = parseDate(purchaseDate);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const latestPurchase = new Date(now);
  latestPurchase.setUTCMonth(latestPurchase.getUTCMonth() + 24);
  if (target === null || target < now || target > latestPurchase.getTime()) return null;
  const windowStart = new Date(now);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
  const start = windowStart.getTime();
  const byDate = new Map();
  for (const row of history) {
    const date = parseDate(row?.effective_date);
    const uf = Number(row?.uf_value_clp);
    if (date !== null && date >= start && date <= now && Number.isFinite(uf) && uf > 0) {
      byDate.set(new Date(date).toISOString().slice(0, 10), { date, uf, row });
    }
  }
  const observations = [...byDate.values()].sort((a, b) => a.date - b.date);
  if (observations.length < MIN_DATES) return null;
  const origin = observations[0].date;
  const xs = observations.map(({ date }) => (date - origin) / 86_400_000);
  const ys = observations.map(({ uf }) => uf);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  const slope = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denominator;
  const value = meanY + slope * ((target - origin) / 86_400_000 - meanX);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    uf_value_clp: value,
    provenance: {
      mode: "projected",
      method: "ols-linear",
      observations: observations.length,
      window_start: new Date(observations[0].date).toISOString().slice(0, 10),
      window_end: new Date(observations.at(-1).date).toISOString().slice(0, 10),
      purchase_date: String(purchaseDate).slice(0, 10),
    },
  };
}

export function currentUfReference(reference) {
  const value = Number(reference?.uf_value_clp);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { uf_value_clp: value, provenance: { mode: "current", ...reference } };
}
