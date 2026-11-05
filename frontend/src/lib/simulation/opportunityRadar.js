// HU 31 — Radar de oportunidades y alertas por variación de condiciones comerciales
// en proyectos favoritos del catálogo RutaHogar (baja de precio en UF o bono pie %).
// Módulo puro: sin Supabase, sin localStorage, sin React.

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

const UI_STATUS_BY_CODE = {
  compatible: "Compatible",
  compatible_con_ajustes: "Cercano",
  no_compatible: "Requiere ajuste",
  unknown: "Por confirmar",
};

/**
 * Recalcula la compatibilidad referencial de un comprador ante las condiciones
 * comerciales de un proyecto favorito (precio mínimo en UF y bono pie %).
 */
export function recalculateOpportunityCompatibility(
  financialContext = {},
  precioMinUf,
  bonoPiePct = 0,
) {
  const ctx = financialContext && typeof financialContext === "object" ? financialContext : {};
  const result = ctx.result || ctx.result_snapshot || ctx;
  const input = ctx.input || ctx.input_snapshot || ctx;
  const indicators = result?.financial_indicators || ctx.financial_indicators || {};
  const marketCtx =
    result?.market_context ||
    indicators?.capacidad_supuestos?.market_snapshot ||
    ctx.market_context ||
    {};

  const ufValueClp =
    toFiniteNumber(marketCtx?.uf_value) ||
    toFiniteNumber(marketCtx?.uf_value_clp) ||
    toFiniteNumber(ctx.uf_value_clp) ||
    toFiniteNumber(input?.uf_value_clp) ||
    39000;
  const safeUf = ufValueClp > 0 ? ufValueClp : 39000;

  const ahorroClp =
    toFiniteNumber(input?.ahorro_disponible) ??
    toFiniteNumber(input?.ahorro) ??
    toFiniteNumber(ctx.ahorro_disponible);

  let capacidadUf =
    toFiniteNumber(indicators?.capacidad_compra_estimada_uf) ??
    toFiniteNumber(ctx.capacidad_compra_estimada_uf);

  if (capacidadUf === null && ahorroClp !== null && ahorroClp > 0) {
    // Fallback determinista cuando una sesión local aún no trae indicadores ALG-9
    capacidadUf = round1(ahorroClp / safeUf / 0.1);
  }

  const precio = toFiniteNumber(precioMinUf);
  const bono = Math.max(0, Math.min(30, toFiniteNumber(bonoPiePct) || 0));

  const pieMinRate = Math.max(0.05, 0.1 - bono / 100);
  const pieRecRate = Math.max(0.05, 0.2 - bono / 100);

  const ahorroUf = ahorroClp !== null ? round1(ahorroClp / safeUf) : null;
  const aporteBonoUf = precio !== null && precio > 0 ? round1(precio * (bono / 100)) : 0;
  const capacidadEfectivaUf =
    capacidadUf !== null ? round1(capacidadUf + aporteBonoUf) : null;
  const pieMinimoRequeridoUf =
    precio !== null && precio > 0 ? round1(precio * pieMinRate) : 0;

  if (capacidadEfectivaUf === null || precio === null || precio <= 0) {
    return {
      status: "unknown",
      label: "Compatibilidad por confirmar",
      uiStatus: UI_STATUS_BY_CODE.unknown,
      capacidad_base_uf: capacidadUf !== null ? round1(capacidadUf) : null,
      capacidad_efectiva_uf: capacidadEfectivaUf,
      aporte_bono_pie_uf: aporteBonoUf,
      bono_pie_pct: bono,
      pie_minimo_requerido_uf: pieMinimoRequeridoUf,
      ahorro_estimado_uf: ahorroUf,
      brecha_uf: null,
      brecha_pie_uf: null,
    };
  }

  const brechaUf = Math.max(0, round1(precio - capacidadEfectivaUf));
  const brechaPieUf =
    ahorroUf !== null ? Math.max(0, round1(pieMinimoRequeridoUf - ahorroUf)) : 0;

  const meetsCapacityStrict = capacidadEfectivaUf >= precio;
  const meetsCapacityNear = capacidadEfectivaUf >= round1(precio * 0.9);
  const meetsPieRec = ahorroUf === null ? true : ahorroUf >= round1(precio * pieRecRate);
  const meetsPieMin = ahorroUf === null ? true : ahorroUf >= pieMinimoRequeridoUf;

  let status = "no_compatible";
  let label = "Aún fuera de alcance";

  if (meetsCapacityStrict && meetsPieRec) {
    status = "compatible";
    label = "Compatible hoy";
  } else if (meetsCapacityNear && meetsPieMin) {
    status = "compatible_con_ajustes";
    label = "Compatible con ajustes";
  }

  return {
    status,
    label,
    uiStatus: UI_STATUS_BY_CODE[status] || "Requiere ajuste",
    capacidad_base_uf: round1(capacidadUf),
    capacidad_efectiva_uf: capacidadEfectivaUf,
    aporte_bono_pie_uf: aporteBonoUf,
    bono_pie_pct: bono,
    pie_minimo_requerido_uf: pieMinimoRequeridoUf,
    ahorro_estimado_uf: ahorroUf,
    brecha_uf: brechaUf,
    brecha_pie_uf: brechaPieUf,
  };
}

/**
 * Evalúa si la actualización de un proyecto del catálogo dispara una alerta HU 31
 * para un favorito con "Notificar cambios" activo, y construye el evento para Inicio.
 */
export function evaluateFavoriteOpportunityChange({
  favoriteAlert,
  previousProject = null,
  updatedProject,
  financialContext = {},
  userId = null,
  nowIso = new Date().toISOString(),
} = {}) {
  if (!favoriteAlert || !favoriteAlert.notificar_cambios || !updatedProject) {
    return { triggered: false, event: null, nextThresholds: null };
  }
  if (updatedProject.estado === "agotado") {
    return { triggered: false, event: null, nextThresholds: null };
  }

  const currMin = toFiniteNumber(updatedProject.precio_min_uf ?? updatedProject.valor_uf);
  const currMax =
    toFiniteNumber(updatedProject.precio_max_uf) ?? currMin;
  const currBono = Math.max(0, toFiniteNumber(updatedProject.bono_pie_pct) || 0);

  const prevMin =
    toFiniteNumber(favoriteAlert.umbral_precio_min_uf) ??
    toFiniteNumber(previousProject?.precio_min_uf ?? previousProject?.valor_uf) ??
    currMin;
  const prevMax =
    toFiniteNumber(favoriteAlert.umbral_precio_max_uf) ??
    toFiniteNumber(previousProject?.precio_max_uf) ??
    prevMin;
  const prevBono = Math.max(
    0,
    toFiniteNumber(favoriteAlert.umbral_bono_pie_pct) ??
      toFiniteNumber(previousProject?.bono_pie_pct) ??
      0,
  );

  const priceDropped =
    (currMin !== null && prevMin !== null && currMin < prevMin) ||
    (currMax !== null && prevMax !== null && currMax < prevMax);
  const bonoIncreased = currBono > prevBono;

  if (!priceDropped && !bonoIncreased) {
    return { triggered: false, event: null, nextThresholds: null };
  }

  const compBefore = recalculateOpportunityCompatibility(financialContext, prevMin, prevBono);
  const compAfter = recalculateOpportunityCompatibility(financialContext, currMin, currBono);
  const projectName = updatedProject.nombre || previousProject?.nombre || "tu proyecto favorito";
  const projectId = updatedProject.id || favoriteAlert.proyecto_id;

  let title = "";
  let summary = "";

  if (priceDropped && bonoIncreased) {
    title = `Bajó el precio y se activó bono pie de ${currBono}% en ${projectName}`;
    summary = `${projectName} bajó desde ${Math.round(prevMin).toLocaleString("es-CL")} UF a ${Math.round(currMin).toLocaleString("es-CL")} UF y sumó un bono pie de ${currBono}%. Tu compatibilidad referencial ahora es: ${compAfter.label}.`;
  } else if (priceDropped) {
    title = `Bajó el precio en tu favorito ${projectName}`;
    summary = `${projectName} redujo su precio desde ${Math.round(prevMin).toLocaleString("es-CL")} UF a ${Math.round(currMin).toLocaleString("es-CL")} UF. Tu compatibilidad referencial ahora es: ${compAfter.label}.`;
  } else {
    title = `${projectName} activó un bono pie de ${currBono}%`;
    summary = `Tu favorito ${projectName} aplicó un bono pie de ${currBono}% (desde ${Math.round(currMin || 0).toLocaleString("es-CL")} UF). Tu compatibilidad referencial ahora es: ${compAfter.label}.`;
  }

  const prevLabel = `Desde ${Math.round(prevMin || 0).toLocaleString("es-CL")} UF${
    prevBono > 0 ? ` · Bono pie ${prevBono}%` : " · Sin bono pie"
  }`;
  const currLabel = `Desde ${Math.round(currMin || 0).toLocaleString("es-CL")} UF${
    currBono > 0 ? ` · Bono pie ${currBono}%` : " · Sin bono pie"
  } (${compAfter.label})`;

  const event = {
    id: `fav-opp-${projectId}-${currMin}-${currMax}-${currBono}`,
    user_id: userId || favoriteAlert.usuario_id || null,
    event_type: "favorite_project_opportunity",
    materiality_key: `fav-opp:${projectId}:${currMin ?? ""}:${currMax ?? ""}:${currBono}`,
    occurred_at: nowIso,
    project_id: projectId,
    project_name: projectName,
    tone: "positive",
    title,
    summary,
    previous_value: {
      label: prevLabel,
      precio_min_uf: prevMin,
      precio_max_uf: prevMax,
      bono_pie_pct: prevBono,
      compatibility_status: compBefore.status,
      compatibility_label: compBefore.label,
    },
    current_value: {
      label: currLabel,
      precio_min_uf: currMin,
      precio_max_uf: currMax,
      bono_pie_pct: currBono,
      compatibility_status: compAfter.status,
      compatibility_label: compAfter.label,
    },
    payload: {
      project_id: projectId,
      project_name: projectName,
      comuna: updatedProject.comuna || previousProject?.comuna || "",
      tipo: updatedProject.tipo || updatedProject.tipo_vivienda || "",
      price_dropped: priceDropped,
      bono_pie_increased: bonoIncreased,
      precio_min_anterior_uf: prevMin,
      precio_min_actual_uf: currMin,
      precio_max_anterior_uf: prevMax,
      precio_max_actual_uf: currMax,
      descuento_uf: Math.max(0, (prevMin || 0) - (currMin || 0)),
      bono_pie_anterior_pct: prevBono,
      bono_pie_actual_pct: currBono,
      compatibility_before: compBefore,
      compatibility_after: compAfter,
    },
    source: "catalog_update",
  };

  return {
    triggered: true,
    event,
    nextThresholds: {
      umbral_precio_min_uf: currMin,
      umbral_precio_max_uf: currMax,
      umbral_bono_pie_pct: currBono,
    },
  };
}

/**
 * Formatea el resumen visible de umbrales registrados cuando el usuario activa la campana.
 */
export function formatOpportunityThresholdSummary(alert, project = null) {
  if (!alert || !alert.notificar_cambios) return "";
  const minUf =
    toFiniteNumber(alert.umbral_precio_min_uf) ??
    toFiniteNumber(project?.precio_min_uf ?? project?.valor_uf);
  const bonoPct =
    toFiniteNumber(alert.umbral_bono_pie_pct) ??
    toFiniteNumber(project?.bono_pie_pct) ??
    0;

  const parts = ["Alerta activa"];
  if (minUf !== null && minUf > 0) {
    parts.push(`Umbral desde ${Math.round(minUf).toLocaleString("es-CL")} UF`);
  }
  if (bonoPct > 0) {
    parts.push(`Bono pie ${bonoPct}%`);
  }
  return parts.join(" · ");
}
