import { supabase } from "../utils/supabase";
import { evaluateFavoriteOpportunityChange } from "../lib/simulation/opportunityRadar";
import { localProvider as favoritesLocalProvider } from "./favoritesService";
import { recordLocalLeadChangeEvent } from "./leadChangeService";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";
import { filterAssignedTo, filterAvailable, validateProject } from "./projectValidation";

// Catálogo de proyectos inmobiliarios (HU 7) y condiciones comerciales (HU 31).
// Proveedores activos: 'local' (sin Supabase) y 'supabase'.
export const PROVIDER = isSupabaseDataConfigured ? "supabase" : "local";

const CATALOG_KEY = "scoreleads_project_catalog";
const LAST_EVALUATION_KEY = "scoreleads_last_evaluation";
const LOCAL_INMOBILIARIA_NOMBRE = "Inmobiliaria Andes (demo)";

const projectColumns =
  "id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, bono_pie_pct, estado, descripcion, entrega_estimada, created_at, updated_at";

function newId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now());
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readLocalLastEvaluation() {
  try {
    const raw = localStorage.getItem(LAST_EVALUATION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function notifyLocalFavoriteOpportunities(previousRow, updatedRow) {
  if (!updatedRow?.id) return;
  const allAlertsByUser = favoritesLocalProvider.getAllAlerts();
  const financialContext = readLocalLastEvaluation();

  Object.entries(allAlertsByUser || {}).forEach(([userId, alertsByProject]) => {
    const favoriteAlert = alertsByProject?.[updatedRow.id];
    if (!favoriteAlert || !favoriteAlert.notificar_cambios) return;

    const evaluation = evaluateFavoriteOpportunityChange({
      favoriteAlert,
      previousProject: previousRow,
      updatedProject: updatedRow,
      financialContext,
      userId,
    });

    if (evaluation.triggered && evaluation.event) {
      recordLocalLeadChangeEvent(evaluation.event);
      if (evaluation.nextThresholds) {
        favoritesLocalProvider.updateAlertThresholds(
          userId,
          updatedRow.id,
          evaluation.nextThresholds,
        );
      }
    }
  });
}

// ---------------------------------------------------------------
// Proveedor local — colapso a un solo tenant
// ---------------------------------------------------------------

function readCatalog() {
  let catalog;
  try {
    catalog = JSON.parse(localStorage.getItem(CATALOG_KEY));
  } catch {
    catalog = null;
  }

  if (!catalog?.inmobiliarias?.length) {
    catalog = {
      inmobiliarias: [
        { id: newId(), nombre: LOCAL_INMOBILIARIA_NOMBRE, created_at: new Date().toISOString() },
      ],
      proyectos: [],
      asignaciones: [],
    };
    writeCatalog(catalog);
  }

  return {
    inmobiliarias: catalog.inmobiliarias || [],
    proyectos: catalog.proyectos || [],
    asignaciones: catalog.asignaciones || [],
  };
}

function writeCatalog(catalog) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
}

function localTenant() {
  return readCatalog().inmobiliarias[0];
}

export const localCatalogProvider = {
  getTenantContext() {
    const tenant = localTenant();
    return {
      inmobiliaria_id: tenant.id,
      inmobiliaria_nombre: tenant.nombre,
      isGlobalAdmin: false,
    };
  },
  getProjects({ ejecutivo } = {}) {
    const catalog = readCatalog();
    const proyectos = catalog.proyectos
      .map((row) => buildLocalProject(catalog, row))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return filterAssignedTo(proyectos, ejecutivo);
  },
  createProject(input) {
    const { ok, errors } = validateProject(input);
    if (!ok) throw new Error(Object.values(errors)[0]);
    const payload = {
      inmobiliaria_id: input.inmobiliaria_id,
      nombre: String(input.nombre).trim(),
      comuna: input.comuna,
      tipo: input.tipo,
      precio_min_uf: Number(input.precio_min_uf),
      precio_max_uf: Number(input.precio_max_uf),
      bono_pie_pct:
        input.bono_pie_pct !== undefined &&
        input.bono_pie_pct !== null &&
        String(input.bono_pie_pct).trim() !== ""
          ? Number(input.bono_pie_pct)
          : 0,
      estado: input.estado,
      descripcion: String(input.descripcion ?? "").trim() || null,
      entrega_estimada: String(input.entrega_estimada ?? "").trim() || null,
    };
    const catalog = readCatalog();
    assertLocalNameAvailable(catalog, payload.inmobiliaria_id, payload.nombre);
    const now = new Date().toISOString();
    const row = { ...payload, id: newId(), created_at: now, updated_at: now };
    catalog.proyectos.push(row);
    writeCatalog(catalog);
    return buildLocalProject(catalog, row);
  },
  updateProject(id, input) {
    if (!id) throw new Error("ID de proyecto requerido.");
    const { ok, errors } = validateProject(input);
    if (!ok) throw new Error(Object.values(errors)[0]);
    const payload = {
      inmobiliaria_id: input.inmobiliaria_id,
      nombre: String(input.nombre).trim(),
      comuna: input.comuna,
      tipo: input.tipo,
      precio_min_uf: Number(input.precio_min_uf),
      precio_max_uf: Number(input.precio_max_uf),
      bono_pie_pct:
        input.bono_pie_pct !== undefined &&
        input.bono_pie_pct !== null &&
        String(input.bono_pie_pct).trim() !== ""
          ? Number(input.bono_pie_pct)
          : 0,
      estado: input.estado,
      descripcion: String(input.descripcion ?? "").trim() || null,
      entrega_estimada: String(input.entrega_estimada ?? "").trim() || null,
    };
    const catalog = readCatalog();
    const index = catalog.proyectos.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Proyecto no encontrado.");
    assertLocalNameAvailable(catalog, payload.inmobiliaria_id, payload.nombre, id);
    const previousRow = { ...catalog.proyectos[index] };
    catalog.proyectos[index] = {
      ...catalog.proyectos[index],
      ...payload,
      updated_at: new Date().toISOString(),
    };
    writeCatalog(catalog);
    notifyLocalFavoriteOpportunities(previousRow, catalog.proyectos[index]);
    return buildLocalProject(catalog, catalog.proyectos[index]);
  },
};

function buildLocalProject(catalog, row) {
  const inmobiliaria = catalog.inmobiliarias.find((item) => item.id === row.inmobiliaria_id);
  return {
    id: row.id,
    inmobiliaria_id: row.inmobiliaria_id,
    inmobiliaria_nombre: inmobiliaria?.nombre || "",
    nombre: row.nombre,
    comuna: row.comuna,
    tipo: row.tipo,
    precio_min_uf: Number(row.precio_min_uf),
    precio_max_uf: Number(row.precio_max_uf),
    bono_pie_pct: Number(row.bono_pie_pct) || 0,
    estado: row.estado,
    descripcion: row.descripcion || null,
    entrega_estimada: row.entrega_estimada || null,
    ejecutivos: catalog.asignaciones
      .filter((item) => item.proyecto_id === row.id)
      .map((item) => ({
        ejecutivo_id: item.ejecutivo_id || null,
        email: item.ejecutivo_email,
        nombre: item.nombre || "",
        estado: item.estado,
        source: item.source,
      })),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assertLocalNameAvailable(catalog, inmobiliariaId, nombre, ignoreId) {
  const target = String(nombre).trim().toLowerCase();
  const duplicated = catalog.proyectos.some(
    (item) =>
      item.id !== ignoreId &&
      item.inmobiliaria_id === inmobiliariaId &&
      String(item.nombre).trim().toLowerCase() === target,
  );
  if (duplicated) {
    throw new Error("Ya existe un proyecto con ese nombre en esta inmobiliaria.");
  }
}

// ---------------------------------------------------------------
// Proveedor Supabase
// ---------------------------------------------------------------

function translateSupabaseWriteError(error) {
  if (error?.code === "23505") {
    return new Error("Ya existe un proyecto con ese nombre en esta inmobiliaria.");
  }
  if (error?.code === "23514") {
    return new Error("El rango de precios en UF no es consistente.");
  }
  return new Error(error?.message || "No se pudo guardar el proyecto.");
}

async function fetchExecutiveNames(ejecutivoIds) {
  const ids = [...new Set(ejecutivoIds.filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase.rpc("list_staff_names", { p_ids: ids });
  if (error) {
    logSupabaseError(error);
    return {};
  }

  return (data || []).reduce((acc, row) => {
    acc[row.id] = row.full_name || "";
    return acc;
  }, {});
}

async function inmobiliariaNameMap() {
  const inmobiliarias = await getInmobiliarias();
  return inmobiliarias.reduce((acc, item) => {
    acc[item.id] = item.nombre;
    return acc;
  }, {});
}

function buildRemoteProject(row, assignments, namesById, inmobiliariaNames) {
  return {
    id: row.id,
    inmobiliaria_id: row.inmobiliaria_id,
    inmobiliaria_nombre: inmobiliariaNames[row.inmobiliaria_id] || "",
    nombre: row.nombre,
    comuna: row.comuna,
    tipo: row.tipo,
    precio_min_uf: Number(row.precio_min_uf),
    precio_max_uf: Number(row.precio_max_uf),
    bono_pie_pct: Number(row.bono_pie_pct) || 0,
    estado: row.estado,
    descripcion: row.descripcion || null,
    entrega_estimada: row.entrega_estimada || null,
    ejecutivos: assignments
      .filter((item) => item.proyecto_id === row.id)
      .map((item) => ({
        ejecutivo_id: item.ejecutivo_id || null,
        email: item.ejecutivo_email,
        nombre: namesById[item.ejecutivo_id] || "",
        estado: item.estado,
        source: item.source,
      })),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------
// Contexto de tenant
// ---------------------------------------------------------------

export async function getTenantContext() {
  if (PROVIDER === "local") {
    const tenant = localTenant();
    return {
      inmobiliaria_id: tenant.id,
      inmobiliaria_nombre: tenant.nombre,
      isGlobalAdmin: false,
    };
  }

  const { data, error } = await supabase.rpc("get_my_inmobiliaria");
  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo determinar la inmobiliaria del administrador.");
  }

  if (!data) {
    return { inmobiliaria_id: null, inmobiliaria_nombre: "", isGlobalAdmin: true };
  }

  const inmobiliarias = await getInmobiliarias();
  return {
    inmobiliaria_id: data,
    inmobiliaria_nombre: inmobiliarias.find((item) => item.id === data)?.nombre || "",
    isGlobalAdmin: false,
  };
}

export async function getInmobiliarias() {
  if (PROVIDER === "local") {
    return readCatalog().inmobiliarias;
  }

  const { data, error } = await supabase
    .from("inmobiliarias")
    .select("id, nombre, created_at")
    .order("nombre");

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar las inmobiliarias.");
  }
  return data || [];
}

export async function createInmobiliaria(nombre) {
  const nombreLimpio = String(nombre || "").trim();
  if (!nombreLimpio) throw new Error("Ingresa el nombre de la inmobiliaria.");

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    if (catalog.inmobiliarias.some((item) => item.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
      throw new Error("Ya existe una inmobiliaria con ese nombre.");
    }
    const inmobiliaria = { id: newId(), nombre: nombreLimpio, created_at: new Date().toISOString() };
    catalog.inmobiliarias.push(inmobiliaria);
    writeCatalog(catalog);
    return inmobiliaria;
  }

  const { data, error } = await supabase
    .from("inmobiliarias")
    .insert({ nombre: nombreLimpio })
    .select("id, nombre, created_at")
    .single();

  if (error) {
    logSupabaseError(error);
    if (error.code === "23505") throw new Error("Ya existe una inmobiliaria con ese nombre.");
    throw new Error(error.message || "No se pudo crear la inmobiliaria.");
  }
  return data;
}

export async function assignAdmin(inmobiliariaId, email) {
  const correo = normalizeEmail(email);
  if (!inmobiliariaId) throw new Error("Selecciona la inmobiliaria.");
  if (!correo.includes("@")) throw new Error("Ingresa un correo válido.");

  if (PROVIDER === "local") {
    throw new Error("La asignación de administradores requiere Supabase configurado.");
  }

  const { error } = await supabase.rpc("assign_admin", {
    p_inmobiliaria_id: inmobiliariaId,
    p_email: correo,
  });

  if (error) {
    logSupabaseError(error);
    throw new Error(error.message || "No se pudo asignar el administrador.");
  }
  return true;
}

// ---------------------------------------------------------------
// Proyectos — contrato congelado para HU 13
// ---------------------------------------------------------------

export async function getProjects({ inmobiliariaId, ejecutivo } = {}) {
  if (PROVIDER === "local") {
    const catalog = readCatalog();
    const proyectos = catalog.proyectos
      .map((row) => buildLocalProject(catalog, row))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return filterAssignedTo(proyectos, ejecutivo);
  }

  const { error: resolveError } = await supabase.rpc("resolve_pending_executives");
  if (resolveError) logSupabaseError(resolveError);

  let query = supabase.from("proyectos").select(projectColumns).order("nombre");
  if (inmobiliariaId && inmobiliariaId !== "all") {
    query = query.eq("inmobiliaria_id", inmobiliariaId);
  }

  const { data: projectRows, error } = await query;
  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar los proyectos.");
  }

  const rows = projectRows || [];
  if (!rows.length) return [];

  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from("proyecto_ejecutivos")
    .select("proyecto_id, ejecutivo_id, ejecutivo_email, estado, source")
    .in("proyecto_id", rows.map((row) => row.id));

  if (assignmentsError) logSupabaseError(assignmentsError);

  const assignments = assignmentRows || [];
  const namesById = await fetchExecutiveNames(assignments.map((item) => item.ejecutivo_id));
  const inmobiliariaNames = await inmobiliariaNameMap();

  const projects = rows.map((row) =>
    buildRemoteProject(row, assignments, namesById, inmobiliariaNames),
  );
  return filterAssignedTo(projects, ejecutivo);
}

export async function getAvailableProjects({ inmobiliariaId, ejecutivo } = {}) {
  const projects = await getProjects({ inmobiliariaId, ejecutivo });
  return filterAvailable(projects);
}

export async function createProject(input) {
  const { ok, errors } = validateProject(input);
  if (!ok) throw new Error(Object.values(errors)[0]);

  const payload = {
    inmobiliaria_id: input.inmobiliaria_id,
    nombre: String(input.nombre).trim(),
    comuna: input.comuna,
    tipo: input.tipo,
    precio_min_uf: Number(input.precio_min_uf),
    precio_max_uf: Number(input.precio_max_uf),
    bono_pie_pct:
      input.bono_pie_pct !== undefined &&
      input.bono_pie_pct !== null &&
      String(input.bono_pie_pct).trim() !== ""
        ? Number(input.bono_pie_pct)
        : 0,
    estado: input.estado,
    descripcion: String(input.descripcion ?? "").trim() || null,
    entrega_estimada: String(input.entrega_estimada ?? "").trim() || null,
  };

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    assertLocalNameAvailable(catalog, payload.inmobiliaria_id, payload.nombre);
    const now = new Date().toISOString();
    const row = { ...payload, id: newId(), created_at: now, updated_at: now };
    catalog.proyectos.push(row);
    writeCatalog(catalog);
    return buildLocalProject(catalog, row);
  }

  const { data, error } = await supabase
    .from("proyectos")
    .insert(payload)
    .select(projectColumns)
    .single();

  if (error) {
    logSupabaseError(error);
    throw translateSupabaseWriteError(error);
  }

  return buildRemoteProject(data, [], {}, await inmobiliariaNameMap());
}

export async function updateProject(id, input) {
  if (!id) throw new Error("ID de proyecto requerido.");
  const { ok, errors } = validateProject(input);
  if (!ok) throw new Error(Object.values(errors)[0]);

  const payload = {
    inmobiliaria_id: input.inmobiliaria_id,
    nombre: String(input.nombre).trim(),
    comuna: input.comuna,
    tipo: input.tipo,
    precio_min_uf: Number(input.precio_min_uf),
    precio_max_uf: Number(input.precio_max_uf),
    bono_pie_pct:
      input.bono_pie_pct !== undefined &&
      input.bono_pie_pct !== null &&
      String(input.bono_pie_pct).trim() !== ""
        ? Number(input.bono_pie_pct)
        : 0,
    estado: input.estado,
    descripcion: String(input.descripcion ?? "").trim() || null,
    entrega_estimada: String(input.entrega_estimada ?? "").trim() || null,
  };

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    const index = catalog.proyectos.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Proyecto no encontrado.");
    assertLocalNameAvailable(catalog, payload.inmobiliaria_id, payload.nombre, id);
    const previousRow = { ...catalog.proyectos[index] };
    catalog.proyectos[index] = {
      ...catalog.proyectos[index],
      ...payload,
      updated_at: new Date().toISOString(),
    };
    writeCatalog(catalog);
    notifyLocalFavoriteOpportunities(previousRow, catalog.proyectos[index]);
    return buildLocalProject(catalog, catalog.proyectos[index]);
  }

  const { data, error } = await supabase
    .from("proyectos")
    .update(payload)
    .eq("id", id)
    .select(projectColumns)
    .single();

  if (error) {
    logSupabaseError(error);
    throw translateSupabaseWriteError(error);
  }

  return {
    ...buildRemoteProject(data, [], {}, await inmobiliariaNameMap()),
    ejecutivos: await getProjectExecutives(id),
  };
}

export async function setProjectStatus(id, estado) {
  if (!id) throw new Error("ID de proyecto requerido.");

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    const index = catalog.proyectos.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Proyecto no encontrado.");
    catalog.proyectos[index].estado = estado;
    catalog.proyectos[index].updated_at = new Date().toISOString();
    writeCatalog(catalog);
    return buildLocalProject(catalog, catalog.proyectos[index]);
  }

  const { data, error } = await supabase
    .from("proyectos")
    .update({ estado })
    .eq("id", id)
    .select(projectColumns)
    .single();

  if (error) {
    logSupabaseError(error);
    throw new Error(error.message || "No se pudo actualizar el estado del proyecto.");
  }

  return {
    ...buildRemoteProject(data, [], {}, await inmobiliariaNameMap()),
    ejecutivos: await getProjectExecutives(id),
  };
}

export async function deleteProject(id) {
  if (!id) throw new Error("ID de proyecto requerido.");

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    if (catalog.asignaciones.some((item) => item.proyecto_id === id)) {
      throw new Error("El proyecto tiene ejecutivos asignados. Márcalo como agotado para retirarlo.");
    }
    catalog.proyectos = catalog.proyectos.filter((item) => item.id !== id);
    writeCatalog(catalog);
    return true;
  }

  const executives = await getProjectExecutives(id);
  if (executives.length) {
    throw new Error("El proyecto tiene ejecutivos asignados. Márcalo como agotado para retirarlo.");
  }

  const { error } = await supabase.from("proyectos").delete().eq("id", id);
  if (error) {
    logSupabaseError(error);
    if (error.code === "23503") {
      throw new Error("Este proyecto tiene historial comercial y no se puede eliminar; márcalo como agotado.");
    }
    throw new Error(error.message || "No se pudo eliminar el proyecto.");
  }
  return true;
}

export async function importProjects(proyectos) {
  if (PROVIDER === "local") {
    throw new Error("La carga masiva requiere Supabase configurado.");
  }

  const { data, error } = await supabase.rpc("importar_proyectos", { p_proyectos: proyectos });

  if (error) {
    logSupabaseError(error);
    if (error.code === "42501") {
      throw new Error("La carga masiva solo está disponible para el administrador de una inmobiliaria.");
    }
    if (error.code === "22023" && error.message?.includes("nombre_repetido")) {
      throw new Error("El archivo repite el nombre de un proyecto. No se guardó ningún proyecto.");
    }
    if (error.code === "22023") {
      throw new Error("El archivo no tiene un formato válido. No se guardó ningún proyecto.");
    }
    if (error.code === "23514" || error.code === "23502") {
      throw new Error("Una fila no cumple las reglas del catálogo. No se guardó ningún proyecto.");
    }
    throw new Error("No se pudo completar la carga. No se guardó ningún proyecto.");
  }

  return { creados: Number(data?.creados) || 0, actualizados: Number(data?.actualizados) || 0 };
}

// ---------------------------------------------------------------
// Ejecutivos del proyecto
// ---------------------------------------------------------------

export async function getProjectExecutives(projectId) {
  if (!projectId) return [];

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    return catalog.asignaciones
      .filter((item) => item.proyecto_id === projectId)
      .map((item) => ({
        ejecutivo_id: item.ejecutivo_id || null,
        email: item.ejecutivo_email,
        nombre: item.nombre || "",
        estado: item.estado,
        source: item.source,
      }));
  }

  const { data, error } = await supabase
    .from("proyecto_ejecutivos")
    .select("ejecutivo_id, ejecutivo_email, estado, source")
    .eq("proyecto_id", projectId);

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar los ejecutivos del proyecto.");
  }

  const rows = data || [];
  const namesById = await fetchExecutiveNames(rows.map((row) => row.ejecutivo_id));
  return rows.map((row) => ({
    ejecutivo_id: row.ejecutivo_id || null,
    email: row.ejecutivo_email,
    nombre: namesById[row.ejecutivo_id] || "",
    estado: row.estado,
    source: row.source,
  }));
}

export async function assignExecutive(projectId, email, origen) {
  const correo = normalizeEmail(email);
  if (!projectId) throw new Error("ID de proyecto requerido.");
  if (!correo.includes("@")) throw new Error("Ingresa un correo válido.");

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    if (!catalog.proyectos.some((item) => item.id === projectId)) {
      throw new Error("Proyecto no encontrado.");
    }
    const existing = catalog.asignaciones.find(
      (item) => item.proyecto_id === projectId && item.ejecutivo_email === correo,
    );
    if (existing) {
      existing.estado = "vinculado";
    } else {
      catalog.asignaciones.push({
        proyecto_id: projectId,
        ejecutivo_id: null,
        ejecutivo_email: correo,
        nombre: "",
        estado: "vinculado",
        source: "manual",
        created_at: new Date().toISOString(),
      });
    }
    writeCatalog(catalog);
    return getProjectExecutives(projectId);
  }

  const { error } = await supabase.rpc("assign_executive", {
    p_project_id: projectId,
    p_email: correo,
    ...(origen ? { p_origen: origen } : {}),
  });

  if (error) {
    logSupabaseError(error);
    throw new Error(error.message || "No se pudo asignar el ejecutivo.");
  }
  return getProjectExecutives(projectId);
}

export async function unassignExecutive(projectId, email, origen) {
  const correo = normalizeEmail(email);
  if (!projectId || !correo) throw new Error("Proyecto y correo requeridos.");

  if (PROVIDER === "local") {
    const catalog = readCatalog();
    catalog.asignaciones = catalog.asignaciones.filter(
      (item) => !(item.proyecto_id === projectId && item.ejecutivo_email === correo),
    );
    writeCatalog(catalog);
    return getProjectExecutives(projectId);
  }

  const { error } = await supabase.rpc("unassign_executive", {
    p_project_id: projectId,
    p_email: correo,
    ...(origen ? { p_origen: origen } : {}),
  });

  if (error) {
    logSupabaseError(error);
    throw new Error(error.message || "No se pudo quitar el ejecutivo.");
  }
  return getProjectExecutives(projectId);
}

// ---------------------------------------------------------------
// Avisos de Portal Inmobiliario (HU 19) para la sección Proyectos
// ---------------------------------------------------------------

const PORTAL_PAGE_SIZE = 1000;

async function fetchAllPortalRows(columns, { priced }) {
  const rows = [];
  for (let from = 0; ; from += PORTAL_PAGE_SIZE) {
    let query = supabase.from("proyectos_rag").select(columns);
    if (priced) query = query.gt("valor_uf", 0);
    const { data, error } = await query.order("comuna").order("id").range(from, from + PORTAL_PAGE_SIZE - 1);

    if (error) {
      logSupabaseError(error);
      throw new Error("No se pudieron cargar los proyectos del portal.");
    }
    rows.push(...(data || []));
    if ((data || []).length < PORTAL_PAGE_SIZE) break;
  }
  return rows;
}

export async function getPortalProjects() {
  if (PROVIDER === "local") return [];
  return fetchAllPortalRows("id, nombre, comuna, tipo_vivienda, valor_uf, precio_desde, estado, inmobiliaria, url, imagen_url", { priced: true });
}

export async function getPortalCommunes() {
  if (PROVIDER === "local") return [];
  const rows = await fetchAllPortalRows("comuna", { priced: false });
  return [...new Set(rows.map((row) => row.comuna).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}
