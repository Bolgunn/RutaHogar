import { MarketReferenceError } from "./marketReferenceService";

export async function getHousingBenefitCatalog({ apiBase, fetchImpl = fetch, signal } = {}) {
  let response;
  try { response = await fetchImpl(`${String(apiBase || "").replace(/\/$/, "")}/housing-benefit-catalog`, { signal }); }
  catch (cause) { throw new MarketReferenceError("No fue posible consultar el catÃ¡logo oficial.", { cause }); }
  let body;
  try { body = await response.json(); } catch (cause) { throw new MarketReferenceError("El catÃ¡logo oficial es invÃ¡lido.", { status: response.status, cause }); }
  if (!response.ok || !body?.version || !Array.isArray(body?.entries)) throw new MarketReferenceError("No hay un catÃ¡logo oficial disponible.", { status: response.status });
  return body;
}
