import { supabase } from "../utils/supabase";
import { fetchJsonWithTimeout } from "./httpRequest";

export async function exportRequest(path, body) {
  if (!supabase) throw new Error("Las exportaciones requieren conexión y una sesión de ejecutivo o administrador.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Inicia sesión para exportar.");
  const base = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");
  const { response, payload } = await fetchJsonWithTimeout(`${base}/exports${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { timeoutMs: 60000, timeoutMessage: "La exportación tardó demasiado. Reduce la selección e intenta nuevamente." });
  if (!response.ok) {
    const code = payload?.detail?.code;
    throw new Error(code === "owner_mismatch" ? "No tienes permiso para exportar uno de los leads o proyectos seleccionados." : code === "invalid_export_selection" ? "Selecciona entre 1 y 500 leads distintos." : "No se pudo preparar o registrar la exportación. Intenta nuevamente; si persiste, contacta al administrador.");
  }
  return payload;
}
