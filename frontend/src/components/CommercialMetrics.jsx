import React, { useEffect, useMemo, useState } from "react";
import FieldTooltip from "./FieldTooltip";
import { BarsChart, RateChart } from "./CommercialCharts";
import { computeFunnelMetrics } from "../lib/commercial/funnelMetrics";
import { PRIORITY_ACTIONS, SIN_PRIORIDAD } from "../lib/commercial/priorityActions";
import { STAGES } from "../lib/commercial/stageRules";
import { roles } from "../lib/roles";
import { getCommercialFunnelFacts } from "../services/commercialMetricsService";

// HU 15 — métricas comerciales. Todo número sale de ALG-18 (computeFunnelMetrics); esta vista
// solo filtra y dibuja. Copia y estructura: frontend/mockups/hu15-metricas.html.

const EMPTY_FILTERS = { proyecto_id: null, afinidad: [], capacidad: [], prioridad: [] };
const LADDER = STAGES.filter((stage) => stage.value !== "perdido");
const TIME_STAGES = LADDER.filter((stage) => stage.value !== "venta_cerrada");

const ANTECEDENTES = "Su precalificación más reciente no tiene datos suficientes para estimar su capacidad de compra. Necesita volver a precalificarse; no significa que no pueda comprar.";
const MEJORES_HELP = "Solo leads Compatible que además alcanzan a comprar: los que tienen más probabilidad de cerrar.";

const AFINIDAD = [
  ["Compatible", "Compatible", "Alta afinidad con al menos uno de tus proyectos disponibles: su capacidad de compra, la comuna y el tipo de vivienda que busca y su situación financiera calzan bien."],
  ["Cercano", "Cercano", "Afinidad media con su mejor proyecto: calza en lo principal, pero algo le resta, como poca holgura de capacidad, otra comuna u otro tipo de vivienda."],
  ["Marginal", "Marginal", "Podría optar a alguno de tus proyectos, pero con baja afinidad: varios factores le restan."],
  ["fuera_de_alcance", "Fuera de alcance", "No calza con ninguno de tus proyectos disponibles: su capacidad está lejos del precio de entrada o tiene un bloqueador crítico, como morosidad vigente."],
  ["requiere_antecedentes", "Requiere antecedentes", ANTECEDENTES],
];

const CAPACIDAD = [
  ["alcanza", "Alcanza", "Su capacidad de compra estimada alcanza el precio de la unidad más barata de al menos uno de tus proyectos disponibles."],
  ["cercano_por_capacidad", "Cerca de alcanzar", "Todavía no alcanza la unidad más barata, pero está cerca: con algo más de ahorro o renta, o con apoyos como FOGAES, podría lograrlo."],
  ["insuficiente", "Insuficiente", "Su capacidad de compra está lejos del precio de entrada de tus proyectos, o tiene un bloqueador crítico que impide derivarlo."],
  ["requiere_antecedentes", "Requiere antecedentes", ANTECEDENTES],
];

const PRIORIDAD = [...Object.entries(PRIORITY_ACTIONS), [SIN_PRIORIDAD, "Sin prioridad"]];

const ETAPA_HELP = {
  nuevo: "El lead está asociado a tus proyectos (los marcó como favoritos o busca en su comuna) y nadie lo ha contactado todavía.",
  contactado: "Un ejecutivo registró el primer contacto con el lead.",
  en_plan_mejora: "El lead está trabajando un plan para mejorar su perfil financiero antes de comprar. Lo registra el ejecutivo.",
  en_negociacion: "El lead está negociando una unidad de un proyecto específico.",
  reserva: "El lead reservó una unidad del proyecto.",
  venta_cerrada: "El lead firmó la promesa de compraventa. Si la venta se revierte, deja de contarse como venta.",
};

const ACCIONES = [
  ["favorito", "Favorito", "El lead marcó como favorito uno de tus proyectos."],
  ["postulacion", "Postulación", "El lead fijó uno de tus proyectos como su meta de compra. Se cuenta la primera vez por proyecto, aunque después cambie de meta."],
  ["reprecalificacion", "Re-precalificación", "El lead volvió a precalificarse teniendo uno de tus proyectos como meta. Su primera precalificación no cuenta."],
  ["plan_aceptado", "Plan aceptado", "El lead aceptó un plan de mejora orientado a uno de tus proyectos."],
  ["actualizacion_progreso", "Actualización de progreso", "El lead registró avances (datos nuevos o una nueva evaluación) en su plan de mejora orientado a uno de tus proyectos."],
  ["meta_confirmada", "Meta confirmada", "El lead cumplió y confirmó una meta de su plan de mejora orientado a uno de tus proyectos."],
];

const GRANULARIDADES = [["semana", "Semana"], ["mes", "Mes"], ["año", "Año"]];

const ETAPA_LABEL = Object.fromEntries(STAGES.map((stage) => [stage.value, stage.label]));

const DIMENSIONES = [
  ["proyecto", "Proyecto"],
  ["afinidad", "Afinidad"],
  ["capacidad", "Capacidad de compra"],
  ["prioridad", "Prioridad comercial"],
];

const TIEMPOS_SERIE = [
  ["ciclo", "Ciclo de venta"],
  ["postular", "Días hasta postular"],
  ...LADDER.slice(0, -1).map((stage, index) => [`par-${index}`, `${stage.label} → ${LADDER[index + 1].label}`]),
];

function days(value) {
  return value == null ? "—" : value.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function percent(rate) {
  return rate == null ? "—" : `${Math.round(rate * 100)} %`;
}

// Una tasa nula nunca es "0 %": no hay datos (ALG-18, obligaciones de la interfaz).
function Rate({ rate, n }) {
  return <span className="cm-rate">{rate == null ? `— sin datos (n = ${n})` : `(${percent(rate)})`}</span>;
}

function asOf(now) {
  return new Date(now).toLocaleString("es-CL", {
    timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function periodLabel(clave, granularidad) {
  if (granularidad !== "mes") return clave;
  const [year, month] = clave.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleString("es-CL", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function LabelHelp({ label, help, className = "cm-label" }) {
  return <span className="cm-label-row"><span className={className}>{label}</span><FieldTooltip text={help} /></span>;
}

function Kpi({ color, label, help, value, hint, action = null }) {
  return (
    <article className={`admin-kpi-card admin-kpi-card--${color}`}>
      <LabelHelp label={label} help={help} className="admin-kpi-card__label" />
      <strong className="admin-kpi-card__value">{value}</strong>
      <p className="admin-kpi-card__hint">{hint}</p>
      {action}
    </article>
  );
}

function ContactItem({ label, help, value, hint, alert = false, children }) {
  return (
    <div className={`cm-contact__item ${alert ? "cm-contact__item--alert" : ""}`}>
      <LabelHelp label={label} help={help} />
      <span className="cm-contact__value">{value}</span>
      <p className="cm-contact__hint">{hint}</p>
      {children}
    </div>
  );
}

function ViewSwitch({ value, onChange }) {
  return (
    <div className="cm-view">
      {[["todos", "Todos"], ["mejores", "Mejores leads"]].map(([key, label]) => (
        <button key={key} type="button" className={value === key ? "is-active" : ""} onClick={() => onChange(key)}>{label}</button>
      ))}
      <FieldTooltip text={MEJORES_HELP} />
    </div>
  );
}

function HBars({ rows, total, fill = "", onPick }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="cm-hbars">
      {rows.map((row) => (
        <div
          key={row.key}
          className={`cm-hbar ${onPick ? "cm-hbar--click" : ""}`}
          onClick={onPick ? () => onPick(row.key) : undefined}
          role={onPick ? "button" : undefined}
          tabIndex={onPick ? 0 : undefined}
          onKeyDown={onPick ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPick(row.key); } } : undefined}
        >
          <span className="cm-hbar__label">{row.label}<FieldTooltip text={row.help} /></span>
          <span className="cm-hbar__track"><span className={`cm-hbar__fill ${row.fill || fill}`} style={{ width: `${(100 * row.value) / max}%` }} /></span>
          <span className="cm-hbar__val">{row.value} <small>({total ? percent(row.value / total) : "—"})</small></span>
        </div>
      ))}
    </div>
  );
}

function Funnel({ embudo, scopeLabel, captura = null, planMejora = null }) {
  const top = embudo.etapas[0].alcanzaron;
  const ventas = embudo.etapas[embudo.etapas.length - 1].alcanzaron;
  return (
    <div className="cm-funnel">
      {captura && (
        <p className="cm-funnel__general cm-label-row">
          Tasa de captura: <strong>{captura.postulan} de {captura.n}</strong> leads postularon a un proyecto
          <Rate rate={captura.tasa} n={captura.n} />
          <FieldTooltip text="Leads que fijaron uno de tus proyectos como su meta de compra al menos una vez, sobre el total de leads." />
        </p>
      )}
      <p className="cm-funnel__general cm-label-row">
        Conversión general: <strong>{ventas} de {embudo.n}</strong> leads llegaron a venta cerrada
        <Rate rate={embudo.conversion_general} n={embudo.n} />
        <FieldTooltip text="Leads con una venta vigente sobre todos los leads del embudo: la conversión de punta a punta, desde que el lead llega hasta la venta cerrada." />
      </p>
      {planMejora && (
        <p className="cm-funnel__general cm-label-row">
          Registrados en 'En plan de mejora' que cerraron venta: <strong>{planMejora.con_venta} de {planMejora.en_plan_mejora}</strong>
          <Rate rate={planMejora.tasa} n={planMejora.en_plan_mejora} />
          <FieldTooltip text="Leads a los que se les registró la etapa 'En plan de mejora' y después cerraron una venta vigente. Cuenta solo si la etapa se registró antes de la venta. No incluye a quienes saltaron la etapa, por eso puede ser menor que la barra 'En plan de mejora' del embudo." />
        </p>
      )}
      {embudo.etapas.map((etapa, index) => {
        const label = LADDER[index].label;
        const saltaron = planMejora && etapa.etapa === "en_plan_mejora" ? etapa.alcanzaron - planMejora.en_plan_mejora : 0;
        return (
          <div key={etapa.etapa} className={`cm-funnel__row ${etapa.etapa === "venta_cerrada" ? "cm-funnel__row--sale" : ""}`}>
            <span className="cm-funnel__name cm-label-row">{label}<FieldTooltip text={ETAPA_HELP[etapa.etapa]} /></span>
            <div className="cm-funnel__track">
              <div className="cm-funnel__bar" style={{ width: `${top ? (100 * etapa.alcanzaron) / top : 0}%` }}>{etapa.alcanzaron}</div>
            </div>
            <span className="cm-funnel__conv">
              {index === 0 ? scopeLabel : etapa.conversion == null ? "— sin datos" : `${percent(etapa.conversion)} desde la anterior`}
              {saltaron > 0 && <small className="cm-muted"> · incluye {saltaron} que {saltaron === 1 ? "saltó" : "saltaron"} la etapa</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FunnelStatus({ embudo, perdidoLabel, perdidoHelp }) {
  const ventas = embudo.etapas.find((etapa) => etapa.etapa === "venta_cerrada").alcanzaron;
  const { total, por_gestion: gestion, por_agotamiento: agotamiento } = embudo.perdido_actual;
  return (
    <div className="cm-status">
      <div className="cm-status__item">
        <LabelHelp label="Abiertos" help="Leads que hoy no tienen una venta vigente ni están perdidos: todavía se puede trabajar con ellos." />
        <strong>{embudo.abiertos}</strong><p>Ni vendidos ni perdidos</p>
      </div>
      <div className="cm-status__item">
        <LabelHelp label="Ventas vigentes" help="Leads con una promesa de compraventa firmada en alguno de tus proyectos que no ha sido revertida." />
        <strong>{ventas}</strong><p>Promesa firmada, no revertida</p>
      </div>
      <div className="cm-status__item">
        <LabelHelp label={perdidoLabel} help={perdidoHelp} />
        <strong>{total}</strong><p>{gestion} por gestión · {agotamiento} por proyecto agotado</p>
      </div>
    </div>
  );
}

function TimesTable({ enEtapa }) {
  const th = (label, help, numeric = true) => (
    <th className={numeric ? "num" : ""}>
      <span className="cm-label-row" style={numeric ? { justifyContent: "flex-end" } : undefined}>{label}<FieldTooltip text={help} /></span>
    </th>
  );
  return (
    <table className="cm-table">
      <thead>
        <tr>
          {th("Etapa", "La etapa comercial en que estuvo el lead.", false)}
          {th("Promedio (días)", "Promedio de días en la etapa de los leads que ya salieron de ella. Si un lead pasó dos veces por la misma etapa, se suman ambas estadías.")}
          {th("Mediana (días)", "El valor del medio: la mitad de los leads estuvo menos y la mitad más. Si es muy distinta del promedio, unos pocos leads muy lentos o muy rápidos lo están moviendo.")}
          {th("n", "Cuántos leads ya salieron de la etapa y entran al cálculo.")}
          {th("Siguen en la etapa", "Leads que hoy están en esa etapa. No entran al cálculo porque su tiempo todavía no termina.")}
        </tr>
      </thead>
      <tbody>
        {TIME_STAGES.map((stage) => {
          const stat = enEtapa[stage.value];
          return (
            <tr key={stage.value}>
              <td><span className="cm-label-row">{stage.label}<FieldTooltip text={ETAPA_HELP[stage.value]} /></span></td>
              <td className="num">{days(stat.promedio)}</td>
              <td className="num">{days(stat.mediana)}</td>
              <td className="num">{stat.n}</td>
              <td className="num">{stat.en_curso}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BetweenTable({ rows }) {
  const th = (label, help, numeric = true) => (
    <th className={numeric ? "num" : ""}>
      <span className="cm-label-row" style={numeric ? { justifyContent: "flex-end" } : undefined}>{label}<FieldTooltip text={help} /></span>
    </th>
  );
  return (
    <table className="cm-table">
      <thead>
        <tr>
          {th("De → a", "Dos etapas consecutivas del proceso comercial.", false)}
          {th("Promedio (días)", "Días promedio desde que el lead llegó por primera vez a la primera etapa hasta que llegó a la siguiente.")}
          {th("Mediana (días)", "El valor del medio: la mitad de los leads tardó menos y la mitad más.")}
          {th("n", "Leads que pasaron de una etapa a la siguiente y entran al cálculo.")}
          {th("Llegaron sin pasar por la primera", "Leads que llegaron a la segunda etapa sin haber estado antes en la primera, por ejemplo porque el ejecutivo la saltó. No entran al cálculo.")}
          {th("Esperan en la primera", "Leads que hoy están en la primera etapa y todavía no llegan a la siguiente.")}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.desde}>
            <td>{ETAPA_LABEL[row.desde]} → {ETAPA_LABEL[row.hasta]}</td>
            <td className="num">{days(row.promedio)}</td>
            <td className="num">{days(row.mediana)}</td>
            <td className="num">{row.n}</td>
            <td className="num">{row.saltaron}</td>
            <td className="num">{row.en_curso}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DesgloseTable({ rows, labelOf }) {
  const cell = (count, tasa) => <span className="cm-count-rate"><strong>{count}</strong><span className="cm-muted">({percent(tasa)})</span></span>;
  return (
    <table className="cm-table">
      <thead>
        <tr>
          <th>Grupo</th>
          <th className="num">Leads</th>
          <th className="num">Postularon</th>
          <th className="num">Activos</th>
          <th className="num">Activos este mes</th>
          <th className="num">Ventas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.clave}>
            <td>{labelOf(row.clave)}</td>
            <td className="num">{row.leads}</td>
            <td className="num">{cell(row.postulan, row.tasa_postulacion)}</td>
            <td className="num">{cell(row.activos, row.tasa_activos)}</td>
            <td className="num">{cell(row.activos_mes, row.tasa_activos_mes)}</td>
            <td className="num">{cell(row.ventas, row.tasa_venta)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CommercialMetrics({ role, onNavigate }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [filtros, setFiltros] = useState(EMPTY_FILTERS);
  const [granularidad, setGranularidad] = useState("mes");
  const [tab, setTab] = useState("embudo");
  const [view, setView] = useState({ funnel: "todos", times: "todos" });
  const [dimension, setDimension] = useState("proyecto");
  const [tiempoSerie, setTiempoSerie] = useState("ciclo");
  const isEjecutivo = role === roles.sales;

  useEffect(() => {
    let active = true;
    getCommercialFunnelFacts()
      .then((data) => { if (active) setState({ status: data ? "ready" : "offline", data, error: "" }); })
      .catch((error) => { if (active) setState({ status: "error", data: null, error: error.message }); });
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => {
    if (!state.data) return null;
    const { facts, proyectos, now } = state.data;
    return computeFunnelMetrics({ facts, proyectos, filtros, now, granularidad });
  }, [state.data, filtros, granularidad]);

  const heading = (
    <div className="section-heading">
      <span className="eyebrow">Gestión comercial</span>
      <h1>Métricas comerciales</h1>
      <p>{isEjecutivo
        ? "Conversión, tiempos y seguimiento de los leads de tus proyectos asignados."
        : "Conversión, tiempos y seguimiento de los leads de tu inmobiliaria, en todos tus proyectos."}</p>
      {state.data && <span className="cm-asof">Datos al {asOf(state.data.now)}</span>}
    </div>
  );

  if (state.status !== "ready" || !state.data.facts.length) {
    const message = state.status === "loading" ? "Cargando métricas…"
      : state.status === "offline" ? "Las métricas requieren conexión a Supabase."
        : state.status === "error" ? state.error
          : isEjecutivo ? "Todavía no hay leads asociados a tus proyectos asignados."
            : "Todavía no hay leads asociados a los proyectos de tu inmobiliaria.";
    return (
      <section className="section-block cm-page">
        {heading}
        <article className="admin-surface"><p className="cm-empty">{message}</p></article>
      </section>
    );
  }

  const { proyectos, facts } = state.data;
  const m = metrics;
  const sinCatalogo = m.bandas.sin_catalogo;
  const projectView = Boolean(filtros.proyecto_id) || isEjecutivo;
  const perdidoLabel = projectView ? "Perdidos en este proyecto" : "Leads perdidos";
  const perdidoHelp = projectView
    ? "Leads cuya oportunidad en este proyecto está cerrada. 'Por gestión': un ejecutivo la cerró. 'Por proyecto agotado': se cerró solo porque el proyecto se agotó."
    : "Leads cuyas oportunidades en tus proyectos están todas cerradas. 'Por gestión': un ejecutivo lo marcó como perdido. 'Por proyecto agotado': se cerró solo porque el proyecto se agotó. Un lead puede reactivarse si el ejecutivo lo vuelve a trabajar.";
  const mejores = m.mejores;
  const funnelData = view.funnel === "mejores" && mejores ? mejores.embudo : m.embudo;
  const timesData = view.times === "mejores" && mejores ? mejores.en_etapa : m.tiempos.en_etapa;
  const proyectoNombre = (id) => proyectos.find((proyecto) => proyecto.id === id)?.nombre || "Proyecto";
  const betweenData = view.times === "mejores" && mejores ? mejores.entre_etapas : m.tiempos.entre_etapas;
  const desgloseDimension = sinCatalogo && (dimension === "afinidad" || dimension === "capacidad") ? "proyecto" : dimension;
  const desgloseLabel = {
    proyecto: proyectoNombre,
    afinidad: (key) => AFINIDAD.find(([value]) => value === key)?.[1] || key,
    capacidad: (key) => CAPACIDAD.find(([value]) => value === key)?.[1] || key,
    prioridad: (key) => PRIORIDAD.find(([value]) => value === key)?.[1] || key,
  }[desgloseDimension];
  const tiempoValue = (period) => {
    if (tiempoSerie === "ciclo") return period.tiempos.ciclo_venta;
    if (tiempoSerie === "postular") return period.tiempos.dias_hasta_postular;
    return period.tiempos.entre_etapas[Number(tiempoSerie.split("-")[1])];
  };
  const mejoresScope = mejores ? `Solo leads Compatible + Alcanza (${mejores.n} de ${m.n})` : "";

  const toggle = (dimension, value) => setFiltros((current) => ({
    ...current,
    [dimension]: current[dimension].includes(value)
      ? current[dimension].filter((item) => item !== value)
      : [...current[dimension], value],
  }));
  const pick = (dimension) => (value) => {
    setFiltros((current) => (current[dimension].includes(value) ? current : { ...current, [dimension]: [...current[dimension], value] }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeFilters = [
    ...(filtros.proyecto_id ? [{ dimension: "proyecto_id", key: filtros.proyecto_id, label: `Proyecto: ${proyectoNombre(filtros.proyecto_id)}` }] : []),
    ...[["afinidad", "Afinidad", AFINIDAD], ["capacidad", "Capacidad", CAPACIDAD], ["prioridad", "Prioridad", PRIORIDAD]].flatMap(([dimension, title, options]) =>
      sinCatalogo && dimension !== "prioridad" ? [] : options.filter(([key]) => filtros[dimension].includes(key)).map(([key, label]) => ({ dimension, key, label: `${title}: ${label}` }))),
  ];

  const chips = (dimension, options, disabled = false) => (
    <div className="cm-chips">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`cm-chip ${filtros[dimension].includes(key) ? "is-active" : ""}`}
          disabled={disabled}
          aria-pressed={filtros[dimension].includes(key)}
          onClick={() => toggle(dimension, key)}
        ><i className={`ti ${filtros[dimension].includes(key) ? "ti-check" : "ti-plus"}`} aria-hidden="true" />{label}</button>
      ))}
    </div>
  );

  const periods = m.serie.periodos.map((period) => ({ ...period, label: periodLabel(period.clave, granularidad) }));
  const ventas = (embudo) => embudo.etapas.find((etapa) => etapa.etapa === "venta_cerrada").alcanzaron;
  const tpc = m.contacto.tiempo_primer_contacto;
  const ciclo = m.tiempos.ciclo_venta;
  const postular = m.tiempos.dias_hasta_postular;

  return (
    <section className="section-block cm-page">
      {heading}

      <article className="admin-surface cm-filters" aria-label="Filtros de métricas">
        <div className="cm-filters__scope">
          <div><h2>Acota las métricas</h2><p>Elige un proyecto y filtra los leads que quieres analizar.</p></div>
          <label className="cm-filters__project">
            <span><i className="ti ti-building-estate" aria-hidden="true" />Proyecto a analizar</span>
            <select
              value={filtros.proyecto_id || ""}
              onChange={(event) => setFiltros((current) => ({ ...current, proyecto_id: event.target.value || null }))}
            >
              <option value="">{isEjecutivo ? "Todos tus proyectos" : "Todos los proyectos"}</option>
              {proyectos.map((proyecto) => (
                <option key={proyecto.id} value={proyecto.id}>{proyecto.nombre}{proyecto.estado === "agotado" ? " (agotado)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="cm-filters__instructions">Puedes elegir varias opciones por grupo. Sin selección, se incluyen todas.</p>
        <div className="cm-filters__criteria">
          <fieldset className="cm-filters__group" disabled={sinCatalogo}>
            <legend>Afinidad con el proyecto</legend>
            <p>Qué tan bien coincide el perfil con la vivienda.</p>
            {chips("afinidad", AFINIDAD, sinCatalogo)}
          </fieldset>
          <fieldset className="cm-filters__group" disabled={sinCatalogo}>
            <legend>Capacidad de compra</legend>
            <p>Si la capacidad estimada alcanza el precio.</p>
            {chips("capacidad", CAPACIDAD, sinCatalogo)}
          </fieldset>
          <fieldset className="cm-filters__group cm-filters__priority">
            <legend>Prioridad comercial</legend>
            <p>Qué acción de seguimiento corresponde al lead.</p>
            {chips("prioridad", PRIORIDAD)}
          </fieldset>
        </div>
        {sinCatalogo && (
          <p className="cm-hint">Afinidad y capacidad no están disponibles: todos tus proyectos están agotados, así que no hay con qué compararlos. Elige un proyecto para verlas contra él.</p>
        )}
        <div className="cm-filters__foot">
          <span className="cm-summary" role="status">
            Mostrando <strong>{m.n} de {facts.length} leads</strong> · {activeFilters.length ? `${activeFilters.length} filtro${activeFilters.length === 1 ? "" : "s"} activo${activeFilters.length === 1 ? "" : "s"}` : "Sin filtros activos"}
            {m.prioridad_no_reconocida > 0 && ` · ${m.prioridad_no_reconocida} con una prioridad que no se reconoce (cuentan como sin prioridad)`}
          </span>
          <button className="secondary-button compact-button" type="button" disabled={!activeFilters.length} onClick={() => setFiltros(EMPTY_FILTERS)}>Limpiar filtros</button>
        </div>
        {activeFilters.length > 0 && <div className="cm-filters__active" aria-label="Filtros activos">
          {activeFilters.map(({ dimension, key, label }) => <button type="button" key={`${dimension}-${key}`} aria-label={`Quitar filtro ${label}`} onClick={() => dimension === "proyecto_id" ? setFiltros((current) => ({ ...current, proyecto_id: null })) : toggle(dimension, key)}>
            {label}<i className="ti ti-x" aria-hidden="true" />
          </button>)}
        </div>}
      </article>

      <div className="cm-tabs" role="tablist">
        {[["embudo", "Embudo y seguimiento"], ["historia", "Evoluciones históricas"]].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`cm-tab ${tab === key ? "is-active" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "embudo" ? (
        <>
          <section className="admin-kpi-grid cm-kpis-5 cm-surface-gap" aria-label="Indicadores">
            <Kpi
              color="navy"
              label="Postularon a un proyecto"
              help="Leads que fijaron uno de tus proyectos como su meta de compra al menos una vez."
              value={m.captura.postulan}
              hint={<><Rate rate={m.captura.tasa} n={m.captura.n} /> de {m.captura.n} leads</>}
            />
            <Kpi
              color="success"
              label="Registrados en plan de mejora que cerraron venta"
              help="Leads a los que se les registró la etapa 'En plan de mejora' y después cerraron una venta vigente. Cuenta solo si la etapa se registró antes de la venta; no incluye a quienes la saltaron."
              value={m.plan_mejora_a_venta.con_venta}
              hint={<>de {m.plan_mejora_a_venta.en_plan_mejora} registrados en plan de mejora <Rate rate={m.plan_mejora_a_venta.tasa} n={m.plan_mejora_a_venta.en_plan_mejora} /></>}
            />
            <Kpi
              color="success"
              label="Ventas con plan de mejora"
              help="Leads que aceptaron un plan de mejora orientado a uno de tus proyectos y después cerraron una venta vigente."
              value={m.plan_a_venta.con_plan_y_venta}
              hint={<>de {m.plan_a_venta.con_plan} leads con plan <Rate rate={m.plan_a_venta.tasa} n={m.plan_a_venta.con_plan} /></>}
            />
            <Kpi
              color="gold"
              label="Leads activos este mes"
              help="Leads que hicieron al menos una acción sobre tus proyectos este mes: favorito, postulación, re-precalificación o avance en su plan de mejora."
              value={m.engagement.mes_actual.activos}
              hint={<><Rate rate={m.engagement.mes_actual.tasa} n={m.engagement.mes_actual.n} /> de {m.engagement.mes_actual.n} leads</>}
            />
            <Kpi
              color="soft"
              label="Ciclo de venta"
              help="Días promedio desde la primera precalificación hasta la venta cerrada, considerando solo ventas vigentes. La mediana es el valor del medio: si es muy distinta del promedio, unas pocas ventas muy lentas o muy rápidas lo están moviendo."
              value={<>{days(ciclo.promedio)} <small>días (promedio)</small></>}
              hint={`mediana ${days(ciclo.mediana)} · n = ${ciclo.n} ventas`}
              action={(
                <button
                  type="button"
                  className="cm-link"
                  onClick={() => document.getElementById("cm-entre-etapas")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >Ver tiempos entre etapas →</button>
              )}
            />
          </section>

          <article className="admin-surface cm-surface-gap">
            <div className="admin-surface__header"><div className="admin-surface__title">
              <h2>Seguimiento de contacto</h2>
              <p>{isEjecutivo
                ? "Leads que esperan un primer llamado en tus proyectos, y tus contactos."
                : "Leads que esperan un primer llamado y qué tan rápido responde tu equipo."}</p>
            </div></div>
            <div className={`cm-contact ${isEjecutivo ? "" : "cm-contact--3"}`}>
              <ContactItem
                alert
                label="Sin contactar"
                help="Leads que nadie ha marcado todavía como contactados (y que no están perdidos). La antigüedad se cuenta desde su primera precalificación."
                value={m.contacto.sin_contactar.n}
                hint={m.contacto.sin_contactar.n
                  ? `esperan ${days(m.contacto.sin_contactar.antiguedad_mediana)} días (mediana) · el más antiguo, ${days(m.contacto.sin_contactar.antiguedad_maxima)} días`
                  : "ningún lead espera su primer contacto"}
              >
                <button type="button" className="cm-link" onClick={() => onNavigate("leads")}>Ver en Leads →</button>
              </ContactItem>
              <ContactItem
                label="Contactados este mes"
                help="Leads que recibieron su primer contacto registrado durante este mes."
                value={m.contacto.contactados_mes_actual}
                hint={isEjecutivo ? "primeros contactos en tus proyectos" : "primeros contactos de tu equipo"}
              />
              {isEjecutivo && (
                <ContactItem
                  label="Contactados por ti"
                  help="Leads cuyo primer contacto registraste tú. Solo tú ves este número."
                  value={m.contacto.contactados_por_mi.total}
                  hint={`${m.contacto.contactados_por_mi.mes_actual} este mes`}
                />
              )}
              <ContactItem
                label="Primer contacto a los mejores leads"
                help="Días desde la precalificación hasta el primer contacto, solo para leads Compatible y que alcanzan a comprar. Se mide cuando la etapa se registra en RutaHogar, no cuando ocurrió la llamada."
                value={tpc ? <>{days(tpc.mediana)} <small>días (mediana)</small></> : "—"}
                hint={tpc
                  ? <>n = {tpc.n} leads Compatible + Alcanza · <strong>{tpc.en_curso}</strong> aún sin contactar</>
                  : "No disponible: no hay proyectos con los que comparar a los leads."}
              />
            </div>
          </article>

          <article className="admin-surface cm-surface-gap">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Embudo comercial</h2>
                <p className="cm-label-row">
                  Leads que alcanzaron cada etapa alguna vez. Junto a cada barra, la conversión desde la etapa anterior.
                  <FieldTooltip text="Un lead cuenta en una etapa si llegó a ella en algún momento, aunque después haya avanzado, retrocedido o se haya perdido. Si saltó etapas, cuenta también en las que se saltó. Así cada etapa siempre tiene igual o menos leads que la anterior." />
                </p>
              </div>
              {mejores && <ViewSwitch value={view.funnel} onChange={(value) => setView((current) => ({ ...current, funnel: value }))} />}
            </div>
            {view.funnel === "mejores" && mejores && <p className="cm-scope">{mejoresScope}</p>}
            <div className="cm-funnel-wrap">
              <Funnel
                embudo={funnelData}
                scopeLabel={view.funnel === "mejores" && mejores ? "mejores leads" : "todos los leads"}
                captura={view.funnel === "mejores" && mejores ? null : m.captura}
                planMejora={view.funnel === "mejores" && mejores ? null : m.plan_mejora_a_venta}
              />
              <FunnelStatus embudo={funnelData} perdidoLabel={perdidoLabel} perdidoHelp={perdidoHelp} />
            </div>
          </article>

          <article className="admin-surface cm-surface-gap">
            <div className="admin-surface__header"><div className="admin-surface__title">
              <h2>Comparación por proyecto</h2>
              <p>{filtros.proyecto_id
                ? "Filtrado por un proyecto: quita el filtro de proyecto para compararlo con los demás."
                : "Cada fila cuenta solo los leads asociados a ese proyecto. Un lead interesado en dos proyectos aparece en ambos."}</p>
            </div></div>
            <div className="cm-scroll">
              <table className="cm-table">
                <thead><tr><th>Proyecto</th><th className="num">Leads</th><th className="num">Postularon</th><th className="num">Ventas</th><th className="num">Sin contactar</th></tr></thead>
                <tbody>
                  {m.por_proyecto.map((row) => {
                    const proyecto = proyectos.find((item) => item.id === row.proyecto_id);
                    return (
                      <tr key={row.proyecto_id}>
                        <td>{proyecto?.nombre} {proyecto?.estado === "agotado" && <span className="cm-pill cm-pill--agotado">Agotado</span>}</td>
                        <td className="num">{row.leads}</td>
                        <td className="num"><span className="cm-count-rate"><strong>{row.postulan}</strong><span className="cm-muted">({row.leads ? percent(row.postulan / row.leads) : "—"})</span></span></td>
                        <td className="num">{row.ventas}</td>
                        <td className="num">{row.sin_contactar}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="admin-surface cm-surface-gap">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Tiempo en cada etapa</h2>
                <p>Días que los leads permanecieron en cada etapa (promedio y mediana). Los que siguen en ella no entran al cálculo. Los tiempos se miden desde que la etapa se registra en RutaHogar.</p>
              </div>
              {mejores && <ViewSwitch value={view.times} onChange={(value) => setView((current) => ({ ...current, times: value }))} />}
            </div>
            {view.times === "mejores" && mejores && <p className="cm-scope">{mejoresScope}</p>}
            <div className="cm-scroll"><TimesTable enEtapa={timesData} /></div>
            <h3 className="cm-subheading cm-label-row" id="cm-entre-etapas">
              Tiempo entre etapas
              <FieldTooltip text="Días desde que el lead llegó por primera vez a una etapa hasta que llegó a la siguiente. Los leads que se saltaron la primera se cuentan aparte, sin inventarles un tiempo." />
            </h3>
            <div className="cm-scroll"><BetweenTable rows={betweenData} /></div>
            <div className="cm-callout">
              <span className="cm-label-row">Días hasta postular<FieldTooltip text="Días desde la primera precalificación del lead hasta que fijó por primera vez uno de tus proyectos como su meta." /></span>
              <strong>{days(postular.mediana)}</strong> mediana · n = {postular.n}
              <span className="cm-muted">(promedio {days(postular.promedio)})</span>
            </div>
          </article>

          <div className="admin-grid-2">
            <article className="admin-surface">
              <div className="admin-surface__header"><div className="admin-surface__title">
                <h2>Engagement por acción</h2>
                <p>Leads que realizaron cada acción sobre tus proyectos al menos una vez.</p>
              </div></div>
              <HBars
                total={m.engagement.n}
                fill="cm-hbar__fill--gold"
                rows={ACCIONES.map(([key, label, help]) => ({ key, label, help, value: m.engagement.por_accion[key].leads }))}
              />
            </article>
            <article className="admin-surface">
              <div className="admin-surface__header"><div className="admin-surface__title">
                <h2>Afinidad y capacidad</h2>
                <p>Cada lead cuenta una vez, en su mejor resultado entre tus proyectos disponibles, según su precalificación más reciente.</p>
              </div></div>
              {sinCatalogo ? (
                <p className="cm-empty">No disponible: todos tus proyectos están agotados. Elige un proyecto en los filtros para ver a los leads contra él.</p>
              ) : (
                <>
                  <span className="cm-label">Afinidad</span>
                  <div className="cm-bands"><HBars
                    total={m.bandas.n}
                    onPick={pick("afinidad")}
                    rows={AFINIDAD.map(([key, label, help]) => ({ key, label, help, value: m.bandas.afinidad[key], fill: key === "requiere_antecedentes" ? "cm-hbar__fill--soft" : "" }))}
                  /></div>
                  <span className="cm-label">Capacidad de compra</span>
                  <div className="cm-bands"><HBars
                    total={m.bandas.n}
                    onPick={pick("capacidad")}
                    rows={CAPACIDAD.map(([key, label, help]) => ({ key, label, help, value: m.bandas.capacidad[key], fill: key === "requiere_antecedentes" ? "cm-hbar__fill--soft" : "" }))}
                  /></div>
                  <p className="cm-hint">Haz clic en una barra para filtrar el dashboard por ese grupo.</p>
                </>
              )}
            </article>
          </div>

          <article className="admin-surface cm-surface-top">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Desglose de engagement y conversión</h2>
                <p>Las mismas métricas para cada grupo, lado a lado. Los filtros de arriba siguen aplicándose.</p>
              </div>
              <div className="cm-view">
                {DIMENSIONES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={desgloseDimension === key ? "is-active" : ""}
                    disabled={sinCatalogo && (key === "afinidad" || key === "capacidad")}
                    onClick={() => setDimension(key)}
                  >{label}</button>
                ))}
              </div>
            </div>
            <p className="cm-hint cm-hint--top">
              {desgloseDimension === "proyecto"
                ? "Cada fila cuenta los leads asociados a ese proyecto y sus acciones sobre él; un lead interesado en dos proyectos aparece en ambos."
                : "Cada lead aparece en un solo grupo; las filas suman el total de leads."}
            </p>
            <div className="cm-scroll"><DesgloseTable rows={m.desglose[desgloseDimension]} labelOf={desgloseLabel} /></div>
          </article>
        </>
      ) : (
        <>
          <div className="cm-gran">
            <div className="executive-home-recent-filter">
              {GRANULARIDADES.map(([key, label]) => (
                <button key={key} type="button" className={granularidad === key ? "is-active" : ""} onClick={() => setGranularidad(key)}>{label}</button>
              ))}
            </div>
            <span className="cm-summary">Desde la primera precalificación hasta hoy</span>
          </div>

          {periods.length === 0 ? (
            <article className="admin-surface"><p className="cm-empty">Ningún lead coincide con los filtros.</p></article>
          ) : (
            <>
              <article className="admin-surface cm-surface-gap">
                <div className="admin-surface__header"><div className="admin-surface__title">
                  <h2>Cohortes: leads, postulaciones y ventas</h2>
                  <p>Leads agrupados por el período de su primera precalificación. Las cohortes recientes aún pueden avanzar.</p>
                </div></div>
                <BarsChart
                  periods={periods}
                  width={900}
                  height={260}
                  label="Cohortes"
                  series={[
                    { key: "n", name: "Leads nuevos", color: "rgba(19,43,74,.16)", value: (p) => p.embudo.n },
                    { key: "post", name: "Postularon", color: "#132B4A", value: (p) => p.captura.postulan },
                    { key: "venta", name: "Ventas", color: "#2d8a4e", value: (p) => ventas(p.embudo) },
                  ]}
                />
                <div className="cm-legend">
                  <span><i style={{ background: "rgba(19,43,74,.16)" }} />Leads nuevos</span>
                  <span><i style={{ background: "var(--rh-blue)" }} />Postularon</span>
                  <span><i style={{ background: "#2d8a4e" }} />Ventas</span>
                  <span><i className="cm-legend__curso" />Período en curso</span>
                </div>
                <div className="cm-scroll">
                  <table className="cm-table cm-table--spaced">
                    <thead><tr><th>Cohorte</th><th className="num">Leads</th><th className="num">Postularon</th><th className="num">Ventas</th><th className="num">Aún abiertos</th><th /></tr></thead>
                    <tbody>
                      {periods.slice(-6).map((p) => (
                        <tr key={p.clave}>
                          <td>{p.label}</td>
                          <td className="num">{p.embudo.n}</td>
                          <td className="num"><span className="cm-count-rate"><strong>{p.captura.postulan}</strong><span className="cm-muted">({percent(p.captura.tasa)})</span></span></td>
                          <td className="num">{ventas(p.embudo)}</td>
                          <td className="num">{p.embudo.abiertos} de {p.embudo.n}</td>
                          <td>{p.en_curso && <span className="cm-pill cm-pill--curso">En curso</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="admin-surface cm-surface-gap">
                <div className="admin-surface__header"><div className="admin-surface__title">
                  <h2>Tasas de conversión por cohorte</h2>
                  <p>Cómo cambian las tasas de conversión de cada cohorte. Las cohortes recientes aún pueden subir.</p>
                </div></div>
                <RateChart
                  periods={periods}
                  width={900}
                  height={240}
                  label="Tasas de conversión por cohorte"
                  series={[
                    { key: "post", name: "Postularon / leads", color: "#132B4A", value: (p) => p.captura.tasa, detail: (p) => `${p.captura.postulan} de ${p.captura.n}` },
                    { key: "venta", name: "Ventas / leads", color: "#2d8a4e", value: (p) => p.embudo.conversion_general, detail: (p) => `${ventas(p.embudo)} de ${p.embudo.n}` },
                    { key: "plan", name: "En plan de mejora → venta", color: "#C4841D", value: (p) => p.plan_mejora_a_venta.tasa, detail: (p) => `${p.plan_mejora_a_venta.con_venta} de ${p.plan_mejora_a_venta.en_plan_mejora}` },
                  ]}
                />
                <div className="cm-legend">
                  <span><i style={{ background: "#132B4A" }} />Postularon / leads</span>
                  <span><i style={{ background: "#2d8a4e" }} />Ventas / leads</span>
                  <span><i style={{ background: "#C4841D" }} />En plan de mejora → venta</span>
                </div>
              </article>

              <div className="admin-grid-2">
                <article className="admin-surface">
                  <div className="admin-surface__header"><div className="admin-surface__title">
                    <h2>Leads activos y contactados</h2>
                    <p>Leads con alguna acción sobre tus proyectos, y primeros contactos registrados, por período.</p>
                  </div></div>
                  <BarsChart
                    periods={periods}
                    width={440}
                    height={230}
                    label="Activos y contactados"
                    rateLine={{ name: "Tasa de activos", color: "#C4841D", value: (p) => p.engagement.tasa }}
                    series={[
                      { key: "act", name: "Activos", color: "#D4A843", value: (p) => p.engagement.activos },
                      { key: "cont", name: "Contactados", color: "#132B4A", value: (p) => p.contacto.contactados },
                    ]}
                  />
                  <div className="cm-legend">
                    <span><i style={{ background: "var(--rh-yellow)" }} />Activos</span>
                    <span><i style={{ background: "var(--rh-blue)" }} />Contactados</span>
                    <span><i className="cm-legend__line" style={{ borderColor: "#C4841D" }} />Tasa de activos (eje derecho)</span>
                  </div>
                  <p className="cm-hint">La tasa de activos se calcula sobre los leads que ya existían en cada período.</p>
                </article>
                <article className="admin-surface">
                  <div className="admin-surface__header"><div className="admin-surface__title">
                    <h2>Tiempos</h2>
                    <p>Mediana de días por período, según el período en que terminó cada tiempo.</p>
                  </div></div>
                  <select className="cm-select" value={tiempoSerie} onChange={(event) => setTiempoSerie(event.target.value)} aria-label="Tiempo a mostrar">
                    {TIEMPOS_SERIE.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <BarsChart
                    periods={periods}
                    width={440}
                    height={230}
                    label="Tiempos"
                    format={(value, p) => `${days(value)} (n=${tiempoValue(p).n})`}
                    series={[{ key: "mediana", name: "Mediana", color: "#132B4A", value: (p) => tiempoValue(p).mediana }]}
                  />
                </article>
              </div>
            </>
          )}
        </>
      )}

      <p className="cm-disclaimer">Orientativo: estas métricas no aprueban créditos ni reemplazan una evaluación bancaria.</p>
    </section>
  );
}
