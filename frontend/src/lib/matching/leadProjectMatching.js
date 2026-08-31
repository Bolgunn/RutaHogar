// ALG-10 — Afinidad lead–proyecto.
// Especificación normativa: docs/algorithms/ALG-10-lead-project-affinity.md.
// Puro: no consulta Supabase ni hace fetch. Cada consumidor decide qué subconjunto
// del catálogo le entrega.
//
// No se declara aquí ninguna constante de capacidad ni regulatoria: todas llegan
// dentro de capacidad_supuestos (ALG-9). Lo único propio son los pesos de afinidad.

const UMBRAL_CERCANIA = 0.8;

const HOLGURA_CERCANIA_MAX = 60;
const HOLGURA_MAX = 45;
const HOLGURA_EN_TOPE = 12;
const SOBRECALCE_MAX = 20;
const SOBRECALCE_SATURACION = 3.0;

const PENALIDAD_COMUNA = 15;
const PENALIDAD_TIPO = 10;
const PENALIDAD_CLASIFICACION = { Alto: 0, Medio: 8, Bajo: 15 };
const PENALIDAD_CLASIFICACION_DESCONOCIDA = 15;
const PENALIDAD_BLOQUEADOR = { high: 7, medium: 4, low: 0, info: 0 };
const TOPE_PENALIDAD_BLOQUEADORES = 15;

const BANDA_COMPATIBLE = 70;
const BANDA_CERCANO = 45;

const TITULOS_BLOQUEADOR_PAR = {
  pie_insuficiente_para_proyecto: "Pie insuficiente para este proyecto",
  renta_insuficiente_para_proyecto: "Renta insuficiente para este proyecto",
};

const ORDEN_SEVERIDAD = ["critical", "high", "medium", "low", "info"];

const round1 = (value) => Math.round(value * 10) / 10;

function interpolar(x, anchors) {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      if (x1 === x0) return y1;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return anchors[anchors.length - 1][1];
}

// R2.1 — U invertida. Cuatro anclas continuas; en un proyecto de precio único
// el ancla de precio_min desaparece y manda la de precio_max (-12), no -45.
function penalidadHolgura(capacidadUf, proyecto, peakRatio) {
  const precioMin = proyecto.precio_min_uf;
  const precioMax = proyecto.precio_max_uf;
  const crudos = [
    [UMBRAL_CERCANIA * precioMin, HOLGURA_CERCANIA_MAX],
    [precioMin, HOLGURA_MAX],
    [precioMax, HOLGURA_EN_TOPE],
    [peakRatio * precioMax, 0],
    [SOBRECALCE_SATURACION * precioMax, SOBRECALCE_MAX],
  ];
  const anchors = crudos.filter(([x], i) => !crudos.slice(i + 1).some(([otro]) => otro === x));
  return interpolar(capacidadUf, anchors);
}

function comunasDeclaradas(evaluacion) {
  const input = evaluacion.input || {};
  const onboarding = evaluacion.onboarding || {};
  const principal = input.comuna_objetivo || onboarding.comuna_interes || null;
  const alternativa = onboarding.comuna_alternativa || null;
  return { principal, declaradas: [principal, alternativa].filter(Boolean) };
}

function penalidadBloqueadores(bloqueadores) {
  const total = bloqueadores.reduce((acc, b) => acc + (PENALIDAD_BLOQUEADOR[b.severity] || 0), 0);
  return Math.min(total, TOPE_PENALIDAD_BLOQUEADORES);
}

function bloqueadorMasSevero(bloqueadores) {
  for (const severidad of ORDEN_SEVERIDAD) {
    const encontrado = bloqueadores.find((b) => b.severity === severidad);
    if (encontrado) return encontrado;
  }
  return null;
}

function factorAnualidad(tasaAnual, plazoAnios) {
  const tasaMensual = tasaAnual / 12;
  const n = plazoAnios * 12;
  if (tasaMensual === 0) return n;
  return (1 - (1 + tasaMensual) ** -n) / tasaMensual;
}

// R3 — brecha de recurso: lo que el lead debe sumar, bajo los mismos supuestos
// con que se calculó su capacidad.
function brechaRecursoClp(restriccion, precioRefUf, brechaValorUf, supuestos, ingresoTotal) {
  const uf = supuestos.uf_value_clp;
  if (restriccion === "pie") {
    return Math.round(brechaValorUf * supuestos.pie_ratio * uf);
  }
  const principalReqUf = precioRefUf * (1 - supuestos.pie_ratio);
  const factor = factorAnualidad(supuestos.tasa_anual_uf, supuestos.plazo_anios);
  const dividendoReqClp = (principalReqUf / factor) * uf;
  const ingresoReqClp = dividendoReqClp / supuestos.ratio_dividendo_max;
  return Math.round(Math.max(0, ingresoReqClp - ingresoTotal));
}

function bloqueadorPrincipal({
  criticos,
  noCriticos,
  brechaValorUf,
  restriccion,
  precioRefUf,
  supuestos,
  ingresoTotal,
}) {
  if (criticos.length > 0) {
    return {
      codigo: criticos[0].code,
      titulo: criticos[0].title,
      brecha_valor_uf: brechaValorUf,
      brecha_recurso_clp: null,
      brecha_recurso_tipo: null,
    };
  }

  // El guardián brecha > 0 es load-bearing: sin él todo par recibiría un
  // bloqueador fabricado, porque restriccion_vinculante siempre viene seteada.
  if (brechaValorUf > 0 && (restriccion === "pie" || restriccion === "renta")) {
    const codigo =
      restriccion === "pie" ? "pie_insuficiente_para_proyecto" : "renta_insuficiente_para_proyecto";
    return {
      codigo,
      titulo: TITULOS_BLOQUEADOR_PAR[codigo],
      brecha_valor_uf: brechaValorUf,
      brecha_recurso_clp: brechaRecursoClp(
        restriccion,
        precioRefUf,
        brechaValorUf,
        supuestos,
        ingresoTotal,
      ),
      brecha_recurso_tipo: restriccion === "pie" ? "ahorro" : "ingreso",
    };
  }

  const siguiente = bloqueadorMasSevero(noCriticos);
  if (siguiente) {
    return {
      codigo: siguiente.code,
      titulo: siguiente.title,
      brecha_valor_uf: brechaValorUf,
      brecha_recurso_clp: null,
      brecha_recurso_tipo: null,
    };
  }

  return null;
}

export function matchLeadToProjects(evaluacion, proyectos) {
  const lead = evaluacion || {};
  const input = lead.input || {};
  const resultado = lead.result || {};
  const indicadores = resultado.financial_indicators || {};
  const supuestos = indicadores.capacidad_supuestos || {};
  const bloqueadores = resultado.blockers || [];
  const catalogo = proyectos || [];

  const capacidadUf = indicadores.capacidad_compra_estimada_uf;
  const asistidaUf = indicadores.capacidad_asistida_uf;
  const restriccion = indicadores.restriccion_vinculante;
  const status = indicadores.capacidad_status;
  const ingresoTotal = indicadores.ingreso_total || 0;
  const ahorro = input.ahorro_disponible || 0;
  const uf = supuestos.uf_value_clp;
  const pieDisponibleUf = uf > 0 ? round1(ahorro / uf) : 0;

  const { principal, declaradas } = comunasDeclaradas(lead);
  const tipoObjetivo = (lead.onboarding || {}).tipo_propiedad || null;
  const criticos = bloqueadores.filter((b) => b.severity === "critical");
  const noCriticos = bloqueadores.filter((b) => b.severity !== "critical");
  const penalidadClasificacion =
    PENALIDAD_CLASIFICACION[resultado.classification] ?? PENALIDAD_CLASIFICACION_DESCONOCIDA;
  const peakRatio = supuestos.ratio_dividendo_max / supuestos.ratio_dividendo_saludable;

  const matches = [];
  const excluidos = [];

  for (const proyecto of catalogo) {
    const base = {
      proyecto_id: proyecto.id,
      proyecto_nombre: proyecto.nombre,
      comuna: proyecto.comuna,
      tipo: proyecto.tipo,
      precio_min_uf: proyecto.precio_min_uf,
      precio_max_uf: proyecto.precio_max_uf,
    };

    // R1/R5 — la ruta asistida se re-evalúa por proyecto: es la regla de ALG-8
    // con otro sujeto, no el booleano ya calculado contra el objetivo declarado.
    const fogaesAplicable =
      input.vivienda_nueva === true &&
      proyecto.precio_max_uf <= supuestos.fogaes_tope_uf &&
      ahorro / (proyecto.precio_min_uf * uf) >= supuestos.fogaes_pie_ratio;

    const desbloqueableConFogaes =
      fogaesAplicable &&
      typeof capacidadUf === "number" &&
      typeof asistidaUf === "number" &&
      capacidadUf < proyecto.precio_min_uf &&
      asistidaUf >= proyecto.precio_min_uf;

    const alcanzaPrecioMin =
      typeof capacidadUf === "number" && capacidadUf >= proyecto.precio_min_uf;

    const evidencia = {
      capacidad_uf: typeof capacidadUf === "number" ? capacidadUf : null,
      pie_disponible_uf: pieDisponibleUf,
      clasificacion_financiera: resultado.classification ?? null,
      restriccion_vinculante: restriccion ?? null,
      plazo_anios: supuestos.plazo_anios ?? null,
      plazo_origen: supuestos.plazo_origen ?? null,
      alcanza_precio_min: alcanzaPrecioMin,
      desbloqueable_con_fogaes: desbloqueableConFogaes,
    };

    // G0 — precondición, no criterio de matching: sin número no hay par puntuable.
    if (status === "requires_info" || typeof capacidadUf !== "number") {
      excluidos.push({
        ...base,
        afinidad: null,
        clasificacion: null,
        motivo_exclusion: "capacidad_requiere_antecedentes",
        reorientable: false,
        bloqueador_principal: null,
        evidencia,
      });
      continue;
    }

    const precioRefUf = alcanzaPrecioMin ? proyecto.precio_max_uf : proyecto.precio_min_uf;
    const brechaValorUf = round1(Math.max(0, precioRefUf - capacidadUf));
    const bloqueador = bloqueadorPrincipal({
      criticos,
      noCriticos,
      brechaValorUf,
      restriccion,
      precioRefUf,
      supuestos,
      ingresoTotal,
    });

    if (criticos.length > 0) {
      excluidos.push({
        ...base,
        afinidad: null,
        clasificacion: null,
        motivo_exclusion: "bloqueador_critico",
        reorientable: false,
        bloqueador_principal: bloqueador,
        evidencia,
      });
      continue;
    }

    const capacidadInclusionUf = fogaesAplicable
      ? Math.max(capacidadUf, asistidaUf ?? capacidadUf)
      : capacidadUf;

    if (capacidadInclusionUf < UMBRAL_CERCANIA * proyecto.precio_min_uf) {
      excluidos.push({
        ...base,
        afinidad: null,
        clasificacion: null,
        motivo_exclusion: "capacidad_insuficiente",
        reorientable: false,
        bloqueador_principal: bloqueador,
        evidencia,
      });
      continue;
    }

    const comunaFueraDeLoDeclarado = declaradas.length > 0 && !declaradas.includes(proyecto.comuna);
    const penalidades =
      penalidadHolgura(capacidadUf, proyecto, peakRatio) +
      (comunaFueraDeLoDeclarado ? PENALIDAD_COMUNA : 0) +
      (tipoObjetivo && proyecto.tipo !== tipoObjetivo ? PENALIDAD_TIPO : 0) +
      penalidadClasificacion +
      penalidadBloqueadores(noCriticos);

    const afinidad = round1(Math.min(100, Math.max(0, 100 - penalidades)));
    const clasificacion =
      afinidad >= BANDA_COMPATIBLE
        ? "Compatible"
        : afinidad >= BANDA_CERCANO
          ? "Cercano"
          : "Marginal";

    // R4 — sin dirección declarada no hay reorientación posible.
    const fitDeclarado = (resultado.project_fit || {}).status;
    const reorientable =
      afinidad >= BANDA_CERCANO &&
      (comunaFueraDeLoDeclarado ||
        (clasificacion === "Compatible" &&
          (fitDeclarado === "out_of_reach" || fitDeclarado === "near")));

    matches.push({
      ...base,
      afinidad,
      clasificacion,
      motivo_exclusion: null,
      reorientable,
      bloqueador_principal: bloqueador,
      evidencia,
    });
  }

  matches.sort((a, b) => {
    if (b.afinidad !== a.afinidad) return b.afinidad - a.afinidad;
    const aPrincipal = principal && a.comuna === principal ? 0 : 1;
    const bPrincipal = principal && b.comuna === principal ? 0 : 1;
    if (aPrincipal !== bPrincipal) return aPrincipal - bPrincipal;
    return String(a.proyecto_id).localeCompare(String(b.proyecto_id));
  });

  excluidos.sort((a, b) => {
    if (a.precio_min_uf !== b.precio_min_uf) return a.precio_min_uf - b.precio_min_uf;
    return String(a.proyecto_id).localeCompare(String(b.proyecto_id));
  });

  return { matches, excluidos };
}
