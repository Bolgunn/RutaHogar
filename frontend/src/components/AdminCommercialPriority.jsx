import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./admin-management.css";
import "./admin-commercial-priority.css";
import FieldTooltip from "./FieldTooltip";
import { getAvailableProjects } from "../services/projectService";
import {
  getCommercialConfig,
  previewCommercialConfig,
  saveCommercialConfig,
} from "../services/commercialConfigService";
import {
  CRITERIA_HELP,
  CRITERIA_LABELS,
  countDeltas,
  deltaText,
  formatCambios,
  formatCriterionValue,
  getCriterion,
  priorityProjectsImpact,
  setCriterion,
} from "../lib/commercial/commercialConfigView";

// HU 21 — el administrador de una inmobiliaria decide cómo su equipo prioriza leads (ALG-19).
// Los controles se dibujan desde `opciones` del backend; la validación vive solo en el backend.

const SET_CHOICE_KEYS = [
  "contactar_ahora.clasificaciones",
  "contactar_ahora.compatibilidades",
  "contactar_con_revision.clasificaciones",
  "contactar_con_revision.compatibilidades",
];
const SELECT_KEYS = ["subir_con_senales", "umbral_reorientar", "orden_desempate"];

const LOCKED_RULES = [
  ["Complemento de renta incompleto", "Solicitar antecedentes"],
  ["Morosidad vigente o carga financiera total alta", "No derivar todavía"],
  ["Faltan datos para evaluar el objetivo inmobiliario", "Solicitar antecedentes"],
];

const sameSet = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL");
}

export default function AdminCommercialPriority({ evaluations, inmobiliariaId }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState(null);
  const [projects, setProjects] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewKey, setPreviewKey] = useState("");
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const config = await getCommercialConfig();
      setData(config);
      setDraft(config.vigente?.criterios || config.defaults);
      setPreview(null);
      setPreviewKey("");
      setErrors([]);
    } catch (error) {
      setLoadError(error.message || "No se pudo cargar la configuración comercial.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    getAvailableProjects({ inmobiliariaId })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, [inmobiliariaId]);

  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);
  const vigenteCriterios = data?.vigente?.criterios || data?.defaults;
  const isDirty = Boolean(draft && vigenteCriterios) && draftKey !== JSON.stringify(vigenteCriterios);
  const previewIsCurrent = Boolean(preview) && previewKey === draftKey;
  const baseVersion = data?.vigente?.version ?? null;
  const opciones = data?.opciones || {};
  const maxProjects = opciones.proyectos_prioritarios?.max ?? 0;
  const latestLeads = useMemo(() => {
    const byLead = new Map();
    for (const item of evaluations || []) {
      const key = item.user_id || item.id;
      const current = byLead.get(key);
      if (!current || new Date(item.created_at || 0) > new Date(current.created_at || 0)) byLead.set(key, item);
    }
    return [...byLead.values()];
  }, [evaluations]);
  const projectsImpact = useMemo(
    () => (previewIsCurrent ? priorityProjectsImpact(latestLeads, projects, draft?.proyectos_prioritarios) : []),
    [previewIsCurrent, latestLeads, projects, draft],
  );
  const errorsByKey = useMemo(() => new Map(errors.map((error) => [error.key, error.code])), [errors]);

  const update = (key, value) => {
    setDraft((current) => setCriterion(current, key, value));
    setMessage("");
  };

  const runPreview = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await previewCommercialConfig(baseVersion, draft);
      setPreview(result);
      setPreviewKey(draftKey);
      setErrors([]);
    } catch (error) {
      setPreview(null);
      setErrors(error.errors || []);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveCommercialConfig(baseVersion, draft);
      await load();
      setMessage(`Configuración aplicada: versión ${saved.version}.`);
    } catch (error) {
      if (error.code === "config_version_conflict") {
        await load();
        setMessage("Otro administrador cambió la configuración; revisa los cambios.");
      } else {
        setErrors(error.errors || []);
        setMessage(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setDraft(vigenteCriterios);
    setPreview(null);
    setPreviewKey("");
    setErrors([]);
    setMessage("");
  };

  const fieldError = (key) => errorsByKey.has(key) && (
    <small className="leads-hint is-error">Valor no permitido ({errorsByKey.get(key)}).</small>
  );

  if (loadError) {
    return <section className="section-block"><p className="leads-hint is-error">{loadError}</p>
      <button type="button" className="secondary-button" onClick={load}>Reintentar</button></section>;
  }
  if (!data || !draft) return <section className="section-block"><p>Cargando configuración comercial…</p></section>;

  return (
    <section className="section-block admin-catalog admin-catalog-page commercial-priority-page">
      <div className="section-heading">
        <span className="eyebrow">Administración</span>
        <h1>Priorización comercial</h1>
        <p>Estos criterios ordenan la bandeja de tu equipo. No cambian el score ni la clasificación financiera de los leads.</p>
      </div>

      <section className="admin-surface admin-section-gap">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Configuración vigente</h2>
            <p>
              {data.vigente
                ? `Versión ${data.vigente.version} · ${formatDateTime(data.vigente.created_at)} · ${data.vigente.created_by_name || "Autor no disponible"}`
                : "Valores por defecto: la prioridad es la que sugiere el motor de RutaHogar."}
            </p>
          </div>
        </div>
      </section>

      <section className="admin-surface admin-section-gap" aria-label="Reglas fijas">
        <div className="admin-surface__header"><div className="admin-surface__title">
          <h2>Reglas fijas</h2>
          <p>Protegen a los leads con bloqueadores o datos incompletos. No se pueden modificar.</p>
        </div></div>
        <ul className="admin-bullet-list commercial-priority-locked">
          {LOCKED_RULES.map(([condition, action]) => <li key={condition}>{condition} → <strong>{action}</strong></li>)}
        </ul>
      </section>

      <section className="admin-surface admin-section-gap" aria-label="Criterios editables">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Criterios de tu inmobiliaria</h2>
            <p>Cambia un criterio y previsualiza su efecto antes de aplicarlo.</p>
          </div>
          <button type="button" className="secondary-button compact-button" onClick={() => { setDraft(data.defaults); setMessage(""); }}>
            Restaurar valores por defecto
          </button>
        </div>

        <div className="commercial-priority-grid">
          {SET_CHOICE_KEYS.map((key) => (
            <fieldset key={key} className="commercial-priority-field">
              <legend>{CRITERIA_LABELS[key]}<FieldTooltip text={CRITERIA_HELP[key]} /></legend>
              {(opciones[key] || []).map((option) => (
                <label key={option.join("+")} className="inline-choice">
                  <input type="radio" name={key} checked={sameSet(getCriterion(draft, key), option)} onChange={() => update(key, option)} />
                  <span>{option.join(" + ")}</span>
                </label>
              ))}
              {fieldError(key)}
            </fieldset>
          ))}

          <fieldset className="commercial-priority-field">
            <legend>{CRITERIA_LABELS["senales.plazos"]}<FieldTooltip text={CRITERIA_HELP["senales.plazos"]} /></legend>
            {(opciones["senales.plazos"] || []).map((plazo) => {
              const selected = draft.senales.plazos.includes(plazo);
              return (
                <label key={plazo} className="inline-choice">
                  <input type="checkbox" checked={selected} onChange={() => update("senales.plazos",
                    selected ? draft.senales.plazos.filter((item) => item !== plazo) : [...draft.senales.plazos, plazo])} />
                  <span>{formatCriterionValue("senales.plazos", [plazo])}</span>
                </label>
              );
            })}
            {fieldError("senales.plazos")}
            <label className="inline-choice">
              <input type="checkbox" checked={draft.senales.propiedad_vista} onChange={(event) => update("senales.propiedad_vista", event.target.checked)} />
              <span>{CRITERIA_LABELS["senales.propiedad_vista"]}</span>
              <FieldTooltip text={CRITERIA_HELP["senales.propiedad_vista"]} />
            </label>
            {fieldError("senales.propiedad_vista")}
          </fieldset>

          {SELECT_KEYS.map((key) => (
            <label key={key} className="commercial-priority-field">
              <span>{CRITERIA_LABELS[key]}<FieldTooltip text={CRITERIA_HELP[key]} /></span>
              <select value={String(getCriterion(draft, key))} onChange={(event) => {
                const option = (opciones[key] || []).find((item) => String(item) === event.target.value);
                update(key, option);
              }}>
                {(opciones[key] || []).map((option) => (
                  <option key={String(option)} value={String(option)}>{formatCriterionValue(key, option)}</option>
                ))}
              </select>
              {fieldError(key)}
            </label>
          ))}

          <fieldset className="commercial-priority-field commercial-priority-field--wide">
            <legend>{CRITERIA_LABELS.proyectos_prioritarios} (máximo {maxProjects})<FieldTooltip text={CRITERIA_HELP.proyectos_prioritarios} /></legend>
            {projects.length === 0 && <p className="leads-hint">No hay proyectos disponibles en tu catálogo.</p>}
            {projects.map((project) => {
              const id = String(project.id);
              const selected = draft.proyectos_prioritarios.map(String).includes(id);
              return (
                <label key={id} className="inline-choice">
                  <input type="checkbox" checked={selected}
                    disabled={!selected && draft.proyectos_prioritarios.length >= maxProjects}
                    onChange={() => update("proyectos_prioritarios", selected
                      ? draft.proyectos_prioritarios.filter((item) => String(item) !== id)
                      : [...draft.proyectos_prioritarios, project.id])} />
                  <span>{project.nombre} · {project.comuna}</span>
                </label>
              );
            })}
            {fieldError("proyectos_prioritarios")}
          </fieldset>
        </div>

        <div className="commercial-priority-actions">
          <button type="button" className="secondary-button" onClick={runPreview} disabled={busy}>Previsualizar</button>
          <button type="button" className="primary-button" onClick={apply} disabled={busy || !previewIsCurrent}>Aplicar configuración</button>
          <button type="button" className="secondary-button" onClick={discard} disabled={busy || (!isDirty && !preview)}>Descartar cambios</button>
        </div>
        {!previewIsCurrent && preview && <p className="leads-hint">Editaste los criterios: vuelve a previsualizar antes de aplicar.</p>}
        {message && <p className="leads-hint" role="status">{message}</p>}
      </section>

      {previewIsCurrent && (
        <section className="admin-surface admin-section-gap" aria-label="Previsualización">
          <div className="admin-surface__header"><div className="admin-surface__title">
            <h2>Previsualización</h2>
            <p>{preview.leads_que_cambian} lead{preview.leads_que_cambian === 1 ? "" : "s"} cambiaría{preview.leads_que_cambian === 1 ? "" : "n"} de acción. Nada se guarda hasta aplicar.</p>
          </div></div>
          {preview.cambios.length ? (
            <ul className="admin-bullet-list">
              {formatCambios(preview.cambios, projects).map((cambio) => (
                <li key={cambio.key}><strong>{cambio.label}:</strong> {cambio.before} → {cambio.after}</li>
              ))}
            </ul>
          ) : <p>Sin cambios respecto de la configuración vigente.</p>}
          <table className="admin-table commercial-priority-table">
            <thead><tr><th>Acción</th><th>Hoy</th><th>Con estos criterios</th><th>Qué cambia</th></tr></thead>
            <tbody>
              {countDeltas(preview.conteos).map((row) => (
                <tr key={row.key}>
                  <td data-label="Acción">{row.label}</td>
                  <td data-label="Hoy">{row.vigente}</td>
                  <td data-label="Con estos criterios">{row.borrador}</td>
                  <td data-label="Qué cambia" className={row.delta > 0 ? "commercial-priority-delta--up" : row.delta < 0 ? "commercial-priority-delta--down" : "commercial-priority-delta--same"}>
                    <span>
                      {row.delta !== 0 && <i className={`ti ${row.delta > 0 ? "ti-arrow-up" : "ti-arrow-down"}`} aria-hidden="true" />} {deltaText(row.delta, row.key)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projectsImpact.map((item) => <p key={item.proyecto_id} className="leads-hint">{item.texto}.</p>)}
        </section>
      )}

      <section className="admin-surface admin-section-gap" aria-label="Historial">
        <div className="admin-surface__header"><div className="admin-surface__title">
          <h2>Historial</h2>
          <p>Cada aplicación crea una versión nueva; las anteriores no se modifican.</p>
        </div></div>
        {data.historial.length ? (
          <ul className="admin-bullet-list commercial-priority-history">
            {data.historial.map((item) => (
              <li key={item.version}>
                <strong>Versión {item.version}</strong> · {formatDateTime(item.created_at)} · {item.created_by_name || "Autor no disponible"}
                <ul>
                  {item.cambios.length
                    ? formatCambios(item.cambios, projects).map((cambio) => (
                      <li key={cambio.key}>{cambio.label}: {cambio.before} → {cambio.after}</li>
                    ))
                    : <li>Sin cambios respecto de la versión anterior.</li>}
                </ul>
              </li>
            ))}
          </ul>
        ) : <p>Todavía no hay configuraciones guardadas.</p>}
      </section>
    </section>
  );
}
