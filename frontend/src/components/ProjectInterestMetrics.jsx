import React, { useEffect, useMemo, useState } from "react";
import FieldTooltip from "./FieldTooltip";
import { computeProjectInterestMetrics } from "../lib/commercial/projectInterestMetrics";
import { getProjectInterestFacts } from "../services/projectInterestService";

// HU 26 — interés por proyecto. Todo número sale de ALG-20 (computeProjectInterestMetrics); esta
// vista solo ordena y dibuja. La ayuda explica en palabras, nunca con los umbrales de ALG-10.

const HELP = {
  interesados: "Leads que vieron el detalle, guardaron una simulación o marcaron como favorito el proyecto. Un lead interesado en dos proyectos cuenta en ambos.",
  visualizaciones: "Días en que un lead abrió el detalle del proyecto en el catálogo. Cada lead cuenta como máximo una vez por día. Se registran desde la puesta en marcha de esta métrica.",
  simulaciones: "Escenarios de financiamiento que los leads guardaron para este proyecto en el simulador.",
  favoritos: "Leads que hoy tienen el proyecto marcado como favorito.",
  incompatibles: "Leads interesados que hoy no califican para el proyecto: su capacidad de compra está lejos del precio de entrada o tienen un bloqueador crítico, como morosidad vigente. El porcentaje se calcula sobre los leads que se pudieron evaluar.",
  compatibles: "Leads interesados que pueden optar al proyecto, incluidos los que están cerca de alcanzar el precio de la unidad más barata.",
  sin_datos: "Leads interesados sin una precalificación con datos suficientes para compararlos con el proyecto. No cuentan como incompatibles.",
  motivo: "El antecedente que más frena a los leads incompatibles con este proyecto.",
};

const MOTIVOS = {
  morosidad_vigente: ["Morosidad vigente", "Declaró deudas morosas vigentes: no se puede derivar a evaluación bancaria hasta regularizarlas."],
  carga_total_alta: ["Carga financiera total alta", "Sus deudas, sumadas al dividendo estimado, comprometen una parte demasiado alta de su ingreso."],
  pie_insuficiente_para_proyecto: ["Ahorro insuficiente para el pie", "Lo que más limita su capacidad es el ahorro: no alcanza a cubrir el pie de la unidad más barata del proyecto."],
  renta_insuficiente_para_proyecto: ["Renta insuficiente para el dividendo", "Lo que más limita su capacidad es la renta: el dividendo de la unidad más barata supera lo que su ingreso permite."],
  capacidad_insuficiente: ["Capacidad de compra insuficiente", "Su capacidad de compra estimada está lejos del precio de entrada del proyecto."],
  bloqueador_critico: ["Bloqueador crítico", "Tiene un antecedente que impide derivarlo a evaluación bancaria."],
};

const SORTS = [
  ["traccion", "Mayor tracción"],
  ["visualizaciones", "Más visualizaciones"],
  ["simulaciones", "Más simulaciones"],
  ["favoritos", "Más favoritos"],
  ["incompatibles", "Más incompatibles"],
];

function percent(rate) {
  return rate == null ? "—" : `${Math.round(rate * 100)} %`;
}

function motivoLabel(motivo) {
  return MOTIVOS[motivo]?.[0] || motivo;
}

function sortValue(row, sort) {
  return sort === "incompatibles" ? row.compatibilidad.incompatibles : row[sort];
}

function LabelHelp({ label, help, className = "cm-label" }) {
  return <span className="cm-label-row"><span className={className}>{label}</span><FieldTooltip text={help} /></span>;
}

function Kpi({ color, label, help, value, hint }) {
  return (
    <article className={`admin-kpi-card admin-kpi-card--${color}`}>
      <LabelHelp label={label} help={help} className="admin-kpi-card__label" />
      <strong className="admin-kpi-card__value">{value}</strong>
      <p className="admin-kpi-card__hint">{hint}</p>
    </article>
  );
}

function Bars({ rows, total }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="cm-hbars">
      {rows.map((row) => (
        <div key={row.key} className="cm-hbar">
          <span className="cm-hbar__label">{row.label}<FieldTooltip text={row.help} /></span>
          <span className="cm-hbar__track"><span className={`cm-hbar__fill ${row.fill || ""}`} style={{ width: `${(100 * row.value) / max}%` }} /></span>
          <span className="cm-hbar__val">{row.value} <small>({total ? percent(row.value / total) : "—"})</small></span>
        </div>
      ))}
    </div>
  );
}

export default function ProjectInterestMetrics() {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [sort, setSort] = useState("traccion");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let active = true;
    getProjectInterestFacts()
      .then((data) => { if (active) setState({ status: data ? "ready" : "offline", data, error: "" }); })
      .catch((error) => { if (active) setState({ status: "error", data: null, error: error.message }); });
    return () => { active = false; };
  }, []);

  const metrics = useMemo(
    () => (state.data ? computeProjectInterestMetrics({ proyectos: state.data.proyectos, leads: state.data.leads }) : null),
    [state.data],
  );

  if (state.status !== "ready" || !state.data.proyectos.length) {
    const message = state.status === "loading" ? "Cargando interés por proyecto…"
      : state.status === "offline" ? "Las métricas requieren conexión a Supabase."
        : state.status === "error" ? state.error
          : "Tu inmobiliaria todavía no tiene proyectos publicados.";
    return <article className="admin-surface cm-surface-gap"><p className="cm-empty">{message}</p></article>;
  }

  const m = metrics;
  const proyectoOf = (id) => state.data.proyectos.find((proyecto) => proyecto.id === id);
  const rows = sort === "traccion"
    ? m.ranking
    : [...m.ranking].sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || a.posicion - b.posicion);
  const selected = m.ranking.find((row) => row.proyecto_id === selectedId)
    || m.ranking.find((row) => row.compatibilidad.incompatibles > 0)
    || m.ranking[0];
  const selectedProyecto = proyectoOf(selected.proyecto_id);
  const c = selected.compatibilidad;

  return (
    <>
      <section className="admin-kpi-grid cm-surface-gap" aria-label="Indicadores de interés">
        <Kpi color="navy" label="Leads interesados" help={HELP.interesados} value={m.n_leads} hint="En al menos uno de tus proyectos" />
        <Kpi color="soft" label="Visualizaciones" help={HELP.visualizaciones} value={m.totales.visualizaciones} hint="Días con el detalle abierto" />
        <Kpi color="gold" label="Simulaciones" help={HELP.simulaciones} value={m.totales.simulaciones} hint="Escenarios guardados" />
        <Kpi color="success" label="Favoritos" help={HELP.favoritos} value={m.totales.favoritos} hint="Marcados hoy" />
      </section>

      <article className="admin-surface cm-surface-gap">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Ranking de proyectos por tracción</h2>
            <p>Ordenado por leads interesados; a igualdad, por favoritos, simulaciones y visualizaciones. Elige un proyecto para ver por qué sus leads no califican.</p>
          </div>
          <select className="cm-select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenar proyectos">
            {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {m.n_leads === 0 && <p className="cm-hint">Todavía ningún lead ha visto, simulado ni marcado como favorito tus proyectos.</p>}
        <div className="cm-scroll">
          <table className="cm-table pim-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Proyecto</th>
                <th className="num"><LabelHelp label="Interesados" help={HELP.interesados} className="" /></th>
                <th className="num"><LabelHelp label="Visualizaciones" help={HELP.visualizaciones} className="" /></th>
                <th className="num"><LabelHelp label="Simulaciones" help={HELP.simulaciones} className="" /></th>
                <th className="num"><LabelHelp label="Favoritos" help={HELP.favoritos} className="" /></th>
                <th className="num"><LabelHelp label="Incompatibles" help={HELP.incompatibles} className="" /></th>
                <th><LabelHelp label="Motivo principal" help={HELP.motivo} className="" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const proyecto = proyectoOf(row.proyecto_id);
                const isSelected = row.proyecto_id === selected.proyecto_id;
                return (
                  <tr
                    key={row.proyecto_id}
                    className={`pim-row ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedId(row.proyecto_id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(row.proyecto_id); } }}
                    tabIndex={0}
                    aria-selected={isSelected}
                  >
                    <td className="num">{row.posicion}</td>
                    <td>{proyecto?.nombre} {proyecto?.estado === "agotado" && <span className="cm-pill cm-pill--agotado">Agotado</span>}</td>
                    <td className="num"><strong>{row.interesados}</strong></td>
                    <td className="num">{row.visualizaciones}</td>
                    <td className="num">{row.simulaciones}</td>
                    <td className="num">{row.favoritos}</td>
                    <td className="num">
                      <span className="cm-count-rate"><strong>{row.compatibilidad.incompatibles}</strong><span className="cm-muted">({percent(row.compatibilidad.tasa_incompatibles)})</span></span>
                    </td>
                    <td>{row.motivos.length ? motivoLabel(row.motivos[0].motivo) : <span className="cm-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="admin-surface cm-surface-gap" aria-live="polite">
        <div className="admin-surface__header"><div className="admin-surface__title">
          <h2>Viabilidad de los interesados: {selectedProyecto?.nombre}</h2>
          <p>Compara la capacidad de compra actual de cada lead interesado con este proyecto.</p>
        </div></div>
        {selected.interesados === 0 ? (
          <p className="cm-empty">Ningún lead ha mostrado interés en este proyecto todavía.</p>
        ) : (
          <div className="admin-grid-2">
            <div>
              <h3 className="cm-subheading">{selected.interesados} {selected.interesados === 1 ? "lead interesado" : "leads interesados"}</h3>
              <Bars
                total={selected.interesados}
                rows={[
                  { key: "compatibles", label: "Compatibles", help: HELP.compatibles, value: c.compatibles },
                  { key: "incompatibles", label: "Incompatibles", help: HELP.incompatibles, value: c.incompatibles, fill: "pim-fill--alert" },
                  { key: "sin_datos", label: "Sin datos suficientes", help: HELP.sin_datos, value: c.sin_datos, fill: "cm-hbar__fill--soft" },
                ]}
              />
              <p className="cm-hint">
                {c.evaluables
                  ? `${c.incompatibles} de ${c.evaluables} leads evaluables (${percent(c.tasa_incompatibles)}) no califican hoy para este proyecto.`
                  : "Ningún interesado tiene datos suficientes para evaluarlo contra este proyecto."}
              </p>
            </div>
            <div>
              <h3 className="cm-subheading">Motivos que frenan la compra</h3>
              {selected.motivos.length ? (
                <Bars
                  total={c.incompatibles}
                  rows={selected.motivos.map(({ motivo, n }) => ({
                    key: motivo,
                    label: motivoLabel(motivo),
                    help: MOTIVOS[motivo]?.[1] || "Motivo informado por el motor de afinidad.",
                    value: n,
                    fill: "pim-fill--alert",
                  }))}
                />
              ) : (
                <p className="cm-empty">Ningún lead interesado es incompatible con este proyecto.</p>
              )}
              <p className="cm-hint">Cada lead incompatible aporta un solo motivo: el que más lo aleja de este proyecto. Los porcentajes son sobre los leads incompatibles.</p>
            </div>
          </div>
        )}
      </article>
    </>
  );
}
