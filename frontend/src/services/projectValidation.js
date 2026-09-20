import { comunasMvp } from "../constants/comunas";
import { estadosProyecto, tiposProyecto } from "../constants/proyectos";

// Lógica pura del catálogo de proyectos: sin Supabase, sin localStorage.
// El motor de reglas del backend no participa aquí — este módulo solo valida
// y filtra datos del catálogo (HU 7). El matching es de HU 13.

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  return Number(value);
}

const DESCRIPCION_MAX_LENGTH = 500;

// 'YYYY-MM'. Espejo exacto de proyectos_entrega_estimada_check en
// 20260827_proyectos_campos_comerciales.sql.
const entregaEstimadaPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateProject(input = {}) {
  const errors = {};
  const nombre = String(input.nombre ?? "").trim();
  const comuna = String(input.comuna ?? "").trim();
  const tipo = String(input.tipo ?? "").trim();
  const estado = String(input.estado ?? "").trim();
  const inmobiliariaId = String(input.inmobiliaria_id ?? "").trim();
  const precioMin = toNumber(input.precio_min_uf);
  const precioMax = toNumber(input.precio_max_uf);
  const descripcion = String(input.descripcion ?? "").trim();
  const entregaEstimada = String(input.entrega_estimada ?? "").trim();

  if (!nombre) errors.nombre = "Ingresa el nombre del proyecto.";
  if (!inmobiliariaId) errors.inmobiliaria_id = "Selecciona la inmobiliaria del proyecto.";

  if (!comuna) {
    errors.comuna = "Selecciona la comuna del proyecto.";
  } else if (!comunasMvp.includes(comuna)) {
    errors.comuna = "La comuna seleccionada no está disponible.";
  }

  if (!tipo) {
    errors.tipo = "Selecciona el tipo de proyecto.";
  } else if (!tiposProyecto.includes(tipo)) {
    errors.tipo = "El tipo de proyecto no es válido.";
  }

  if (!estado) {
    errors.estado = "Selecciona el estado del proyecto.";
  } else if (!estadosProyecto.includes(estado)) {
    errors.estado = "El estado del proyecto no es válido.";
  }

  if (!Number.isFinite(precioMin) || precioMin <= 0) {
    errors.precio_min_uf = "Ingresa un precio mínimo en UF mayor que 0.";
  }

  if (!Number.isFinite(precioMax) || precioMax <= 0) {
    errors.precio_max_uf = "Ingresa un precio máximo en UF mayor que 0.";
  }

  if (
    !errors.precio_min_uf &&
    !errors.precio_max_uf &&
    precioMin > precioMax
  ) {
    errors.precio_max_uf = "El precio máximo debe ser mayor o igual al mínimo.";
  }

  // Campos comerciales (CATALOGO-UNICO): siempre opcionales. Las filas
  // anteriores a la migración los tienen en NULL y deben seguir siendo
  // editables sin rellenarlos.
  if (descripcion.length > DESCRIPCION_MAX_LENGTH) {
    errors.descripcion = `La descripción no puede superar los ${DESCRIPCION_MAX_LENGTH} caracteres.`;
  }

  if (entregaEstimada && !entregaEstimadaPattern.test(entregaEstimada)) {
    errors.entrega_estimada = "Usa el formato AAAA-MM, con un mes entre 01 y 12.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// E4: solo un proyecto agotado queda fuera del matching (HU 13).
// `en_construccion` sí se recomienda: la venta en verde es una parte real del
// mercado. Spike 1 E4 §5.1 solo autoriza dos filtros excluyentes (capacidad y
// bloqueador crítico), así que el estado viaja hacia HU 13 en vez de filtrarse
// aquí en silencio. Los ejecutivos se recortan a los vinculados.
export function filterAvailable(projects = []) {
  return (projects || [])
    .filter((project) => project?.estado !== "agotado")
    .map((project) => ({
      ...project,
      ejecutivos: (project.ejecutivos || []).filter((exec) => exec?.estado === "vinculado"),
    }));
}

// El ejecutivo comercial solo trabaja los proyectos donde está asignado.
// La regla vinculante vive en la policy "Proyectos select tenant" (migración
// 20260831090000); esto la replica en el cliente para el proveedor local, que
// no tiene RLS, y como segunda barrera contra Supabase.
//
// El predicado debe ser el MISMO que el de la policy — id O correo — o el
// cliente terminaría escondiendo proyectos que la base sí autoriza: una
// asignación ya vinculada conserva el ejecutivo_email con que se creó, que no
// tiene por qué seguir siendo el correo actual de la cuenta.
// Se acepta el vínculo 'pendiente': una asignación recién creada aún no tiene
// ejecutivo_id, y el proyecto ya es suyo desde que el admin lo asigna.
export function filterAssignedTo(projects = [], ejecutivo = {}) {
  const correo = String(ejecutivo?.email || "").trim().toLowerCase();
  const id = ejecutivo?.id || null;
  if (!correo && !id) return projects || [];
  return (projects || []).filter((project) =>
    (project?.ejecutivos || []).some(
      (exec) =>
        (id && exec?.ejecutivo_id === id) ||
        (correo && String(exec?.email || "").trim().toLowerCase() === correo),
    ),
  );
}

// E3: decisión pura que replica assign_executive en la base de datos.
export function decideExecutiveBinding({ execInmobiliariaId, projectInmobiliariaId }) {
  if (!execInmobiliariaId) return "bind";
  if (execInmobiliariaId === projectInmobiliariaId) return "ok_same";
  return "reject_conflict";
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateExecutive(input = {}) {
  const errors = {};
  const fullName = String(input.full_name ?? "").trim();
  const email = String(input.email ?? "").trim();
  const inmobiliariaId = String(input.inmobiliaria_id ?? "").trim();

  if (!fullName) errors.full_name = "Ingresa el nombre del ejecutivo.";
  if (!email) {
    errors.email = "Ingresa el correo del ejecutivo.";
  } else if (!emailPattern.test(email)) {
    errors.email = "El correo no tiene un formato válido.";
  }
  if (!inmobiliariaId) errors.inmobiliaria_id = "Selecciona la inmobiliaria del ejecutivo.";

  return { ok: Object.keys(errors).length === 0, errors };
}

// Espejo exacto de testPasswordFromEmail en supabase/functions/create-executive.
// Modo de prueba: la contraseña es el texto antes del @, rellenado a 6
// caracteres porque Supabase exige ese mínimo.
export function derivedTestPassword(email) {
  const local = String(email || "").split("@")[0] || "";
  return local.length >= 6 ? local : local.padEnd(6, "0");
}
