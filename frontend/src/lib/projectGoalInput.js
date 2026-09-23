// Payload de /score para "Fijar como mi Meta" (HU 9).
//
// TRAMPA, y la razon de que esto exista como modulo propio. Pisar solo
// `property_value` NO cambia el valor de la vivienda: el resolutor del backend
// (scoring_engine/property_value.py) consulta `property_value_clp` y despues
// `property_value_uf` ANTES de mirar `property_value`, y esos dos vienen
// copiados de la evaluacion anterior. El resultado era una re-evaluacion
// identica a la previa mientras la UI anunciaba que el plan se habia ajustado.
//
// Por eso se reemplaza la familia de campos del objetivo. El valor se envía
// en UF y el backend lo convierte con la UF de su snapshot persistido. Cambiar
// la meta tampoco autoriza a sustituir el dividendo declarado por una
// simulación construida con tasa o UF del frontend.
export function buildProjectGoalInput(baseInput = {}, project = {}) {
  const valorUf = Number(project.precio_min_uf) || Number(project.valor_uf) || 0;
  const roundedUf = Math.round(valorUf * 100) / 100;

  return {
    ...baseInput,
    property_value: valorUf,
    property_value_unit: "uf",
    property_value_uf: roundedUf,
    property_value_clp: undefined,
    property_value_source: "project_selection",
    // Este resumen solo identifica la meta en la experiencia; el motor recibe
    // los campos financieros ya normalizados y no depende de esta metadata.
    project_goal: {
      id: project.id || null,
      nombre: project.nombre || "Proyecto seleccionado",
      comuna: project.comuna || "",
      tipo_vivienda: project.tipo_vivienda || "",
      estado: project.estado || "",
      entrega_estimada: project.entrega_estimada || "",
      inmobiliaria: project.inmobiliaria || "",
      precio_min_uf: valorUf,
      precio_max_uf: Number(project.precio_max_uf) || valorUf,
    },
    // Un proyecto en construcción corresponde a vivienda nueva para los
    // requisitos que dependen de esa condición, como FOGAES y Ley 21.748.
    vivienda_nueva: project.estado === "en_construccion",
    // Los campos de mercado del input histórico no se reenvían. /score
    // resuelve UF, tasa, LTV y plazo de referencia desde Supabase.
    uf_value_clp: undefined,
    dividendo_estimado_calculado: undefined,
    dividendo_tasa_anual_referencial: undefined,
    dividendo_monto_credito_estimado_clp: undefined,
    dividendo_monto_credito_estimado_uf: undefined,
    dividendo_uf_referencial_clp: undefined,
  };
}
