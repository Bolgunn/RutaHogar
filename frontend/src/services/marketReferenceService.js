export class MarketReferenceError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = "MarketReferenceError";
    this.status = status;
    this.cause = cause;
  }
}

export function normalizeMarketReference(value) {
  const ufValueClp = Number(value?.uf_value_clp);
  const snapshotFetchedAt = value?.snapshot_fetched_at;

  if (!Number.isFinite(ufValueClp) || ufValueClp <= 0 || !snapshotFetchedAt) {
    throw new MarketReferenceError("El backend devolvió una referencia UF inválida.");
  }

  return {
    uf_value_clp: ufValueClp,
    effective_date: value.effective_date || null,
    snapshot_effective_date: value.snapshot_effective_date || null,
    snapshot_fetched_at: snapshotFetchedAt,
    source: value.source || null,
  };
}

export async function getMarketReference({ apiBase, fetchImpl = fetch, signal } = {}) {
  let response;
  try {
    response = await fetchImpl(
      `${String(apiBase || "").replace(/\/$/, "")}/market-reference`,
      { signal },
    );
  } catch (cause) {
    throw new MarketReferenceError("No fue posible consultar la referencia UF.", { cause });
  }

  let body;
  try {
    body = await response.json();
  } catch (cause) {
    throw new MarketReferenceError("El backend devolvió una referencia UF inválida.", {
      status: response.status,
      cause,
    });
  }

  if (!response.ok) {
    throw new MarketReferenceError("No fue posible consultar la referencia UF.", {
      status: response.status,
    });
  }

  return normalizeMarketReference(body);
}
