import { fetchJsonWithTimeout } from "./httpRequest";

const apiBase = () => (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");

export async function getAcademyNews() {
  const base = apiBase();
  if (!base) throw new Error("API no configurada");
  const { response, payload } = await fetchJsonWithTimeout(`${base}/academy/news`, undefined, {
    timeoutMs: 8_000,
    timeoutMessage: "No se pudo cargar la actualidad a tiempo.",
  });
  if (!response.ok) throw new Error("No se pudo cargar la actualidad.");
  return payload;
}
