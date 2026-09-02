import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

// Favoritos de proyectos del lead (HU 9).
//
// Antes vivían en localStorage bajo "scoreleads_favorites", con los ids del
// mock del backend. Al leer el catálogo real esos ids no referencian nada, así
// que la clave anterior se abandona sin migrar: no hay nada que migrar.
//
// Mismo reparto de proveedores que projectService: 'local' cuando Supabase no
// está configurada (guardrail 3 de CLAUDE.md — el flujo tiene que funcionar sin
// ella), 'supabase' en el resto de los casos.
//
// Las tres funciones devuelven / reciben ids de proyecto como string, de modo
// que el componente que llama nunca ve la forma de la fila. Los errores se
// lanzan, no se tragan: el toggle es optimista y necesita saber si revertir.
export const PROVIDER = isSupabaseDataConfigured ? "supabase" : "local";

const FAVORITES_KEY = "scoreleads_proyecto_favoritos";

// Un objeto por usuario, no un arreglo suelto: sin Supabase igual puede haber
// más de una cuenta usando el mismo navegador.
function readLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function writeLocal(byUser) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(byUser));
}

function localKey(usuarioId) {
  return String(usuarioId || "anonimo");
}

// Exportado para poder probarlo: PROVIDER depende de si hay un .env con
// credenciales, así que un test que llame a las funciones públicas ejercita una
// rama u otra según la máquina. Estas tres son la rama local, siempre.
export const localProvider = {
  get(usuarioId) {
    return readLocal()[localKey(usuarioId)] || [];
  },
  add(usuarioId, proyectoId) {
    const byUser = readLocal();
    const key = localKey(usuarioId);
    const current = byUser[key] || [];
    if (!current.includes(proyectoId)) byUser[key] = [...current, proyectoId];
    writeLocal(byUser);
    return true;
  },
  remove(usuarioId, proyectoId) {
    const byUser = readLocal();
    const key = localKey(usuarioId);
    byUser[key] = (byUser[key] || []).filter((id) => id !== proyectoId);
    writeLocal(byUser);
    return true;
  },
};

export async function getFavorites(usuarioId) {
  if (!usuarioId) return [];

  if (PROVIDER === "local") return localProvider.get(usuarioId);

  const { data, error } = await supabase
    .from("proyecto_favoritos")
    .select("proyecto_id")
    .eq("usuario_id", usuarioId);

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar tus favoritos.");
  }

  return (data || []).map((row) => row.proyecto_id);
}

export async function addFavorite(usuarioId, proyectoId) {
  if (!usuarioId || !proyectoId) throw new Error("Falta el usuario o el proyecto.");

  if (PROVIDER === "local") return localProvider.add(usuarioId, proyectoId);

  // Repetir el favorito no es un error, es el mismo estado. `ignoreDuplicates`
  // genera ON CONFLICT DO NOTHING; sin el, PostgREST emite DO UPDATE, que bajo
  // RLS exige una policy de UPDATE — y la migracion no crea ninguna a proposito
  // (el toggle es insert o delete). Con DO UPDATE, refavoritear una fila que ya
  // existe se rechaza con 42501 y el usuario ve "no se pudo guardar" por algo
  // que ya estaba guardado.
  const { error } = await supabase
    .from("proyecto_favoritos")
    .upsert({ usuario_id: usuarioId, proyecto_id: proyectoId }, {
      onConflict: "usuario_id,proyecto_id",
      ignoreDuplicates: true,
    });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo guardar el proyecto en tus favoritos.");
  }
  return true;
}

export async function removeFavorite(usuarioId, proyectoId) {
  if (!usuarioId || !proyectoId) throw new Error("Falta el usuario o el proyecto.");

  if (PROVIDER === "local") return localProvider.remove(usuarioId, proyectoId);

  const { error } = await supabase
    .from("proyecto_favoritos")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("proyecto_id", proyectoId);

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo quitar el proyecto de tus favoritos.");
  }
  return true;
}
