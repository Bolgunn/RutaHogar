// Adaptador catálogo (HU 7) -> simulación (HU 6).
//
// La página de simulación nació leyendo un arreglo hardcodeado con nombres de
// campo propios (`tipo_vivienda`, `valor_uf`, `descripcion_corta`). El catálogo
// real usa otros (`tipo`, `precio_min_uf` / `precio_max_uf`, `descripcion`) y,
// sobre todo, otra semántica de precio: guarda un RANGO, no un punto.
//
// En vez de reescribir la simulación, la frontera se cruza aquí. El contrato
// del catálogo está congelado (docs/project-catalog-contract.md); este módulo
// es lo único que conoce ambos vocabularios.
//
// Puro: sin Supabase, sin localStorage, sin React.

// El cálculo de escenario necesita UN número y el catálogo tiene dos. Se usa
// `precio_min_uf` — la unidad disponible más barata — y la UI etiqueta el
// resultado como "desde", de modo que nadie lea el escenario como el precio
// del proyecto. El rango viaja al lado para poder mostrarlo tal cual.
export function catalogProjectToSimulation(project) {
  if (!project) return null;

  const precioMin = Number(project.precio_min_uf) || 0;
  const precioMax = Number(project.precio_max_uf) || precioMin;

  return {
    id: project.id,
    nombre: project.nombre,
    comuna: project.comuna,
    tipo_vivienda: project.tipo,
    valor_uf: precioMin,
    precio_min_uf: precioMin,
    precio_max_uf: precioMax,
    descripcion_corta: project.descripcion || "",
    entrega_estimada: project.entrega_estimada || "",
    inmobiliaria: project.inmobiliaria_nombre || "",
    estado: project.estado,
  };
}

export function catalogProjectsToSimulation(projects = []) {
  return (projects || []).map(catalogProjectToSimulation).filter(Boolean);
}

function formatUf(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("es-CL")} UF`;
}

// Un proyecto con rango no tiene *un* precio, así que "2.400 UF" sería falso y
// "2.400 – 3.200 UF" no cabe donde hoy se muestra una cifra. "desde 2.400 UF"
// es verdadero en ambos casos. Cuando min == max el proyecto sí tiene un precio
// único y el "desde" sobra.
export function formatProjectPrice(project) {
  const precioMin = Number(project?.precio_min_uf) || Number(project?.valor_uf) || 0;
  const precioMax = Number(project?.precio_max_uf) || precioMin;

  if (precioMax > precioMin) return `desde ${formatUf(precioMin)}`;
  return formatUf(precioMin);
}

// Mes de entrega 'YYYY-MM' -> 'enero 2027'. Devuelve "" si no hay dato o si el
// formato no calza, para que la UI simplemente no muestre nada.
const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatDeliveryMonth(entregaEstimada) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(entregaEstimada || "").trim());
  if (!match) return "";
  return `${monthNames[Number(match[2]) - 1]} ${match[1]}`;
}
