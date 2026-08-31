import React, { useEffect, useMemo, useState } from "react";
import { getScoringHistoryByEvaluation } from "../services/getScoringHistory";
import {
  formatScore,
  getBaseClassification,
  getClassificationAdjustment,
  getClassificationClass,
  getScoreBadgeClassByScore,
  translateSeverity,
} from "../utils/helpers";

function formatFecha(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFechaHora(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const eventLabels = {
  no_viable_shown: "Plan no viable presentado",
  apply_alternative: "Aplicó alternativa",
  simulate_success: "Simulación viable",
  accept_plan: "Aceptó el plan",
  register_savings: "Registró ahorro",
};

function formatEventMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(number / 1000) * 1000);
}

function renderEventDetail(event) {
  const details = event.details || {};
  switch (event.type) {
    case "no_viable_shown":
      return details.message || "Se presentó la condición No viable";
    case "apply_alternative":
      return `${details.title || details.alternative_id || "Alternativa"} -> ${details.result_viable ? "viable" : "no viable"}`;
    case "simulate_success":
      return details.months ? `Viable ahorrando en ${details.months} meses` : "Escenario simulado viable";
    case "accept_plan":
      return `Meta ${formatEventMoney(details.monthly_target)} / ${details.months ?? "-"} meses`;
    case "register_savings":
      return `${formatEventMoney(details.total_registered) || "$0"} acumulado (${details.progress_percent ?? 0}%)`;
    default:
      return "";
  }
}

function formatEventAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const fecha = date.toLocaleDateString("es-CL");
  const hora = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${fecha} ${hora}`;
}

const AGE_RANGES = [
  { label: "Todas las edades", min: 0, max: Infinity },
  { label: "18 - 25 años", min: 18, max: 25 },
  { label: "25 - 35 años", min: 25, max: 35 },
  { label: "35 - 45 años", min: 35, max: 45 },
  { label: "45 - 55 años", min: 45, max: 55 },
  { label: "55 - 65 años", min: 55, max: 65 },
  { label: "65+ años", min: 65, max: Infinity },
];

const channelLabels = {
  web: "Web",
  chatbot: "Chatbot",
  whatsapp: "WhatsApp",
  vendedor: "Vendedor",
};

const DATE_RANGES = [
  { label: "Cualquier fecha", value: "todos" },
  { label: "Últimas 24 horas", value: "24h" },
  { label: "Última semana", value: "semana" },
  { label: "Último mes", value: "mes" },
  { label: "Último año", value: "anio" },
];

const DEFAULT_CLASSIFICATION_FILTER = "Alto";
const emptyValue = "-";
const CLP_FORMATTER = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function hasObjectData(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function money(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "Sin dato";
  return CLP_FORMATTER.format(Math.round(numericValue));
}

function booleanText(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "Sin dato";
}

function formatPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "Sin dato";
  return `${Math.round(numericValue * 1000) / 10}%`;
}

function purchaseTermLabel(value) {
  const labels = {
    inmediato: "Inmediato",
    "0_3_meses": "0 a 3 meses",
    "3_a_6_meses": "3 a 6 meses",
    "3_6_meses": "3 a 6 meses",
    "6_a_12_meses": "6 a 12 meses",
    "6_12_meses": "6 a 12 meses",
    mas_12_meses: "Más de 12 meses",
    solo_explorando: "Solo explorando",
  };
  return labels[value] || "Sin dato";
}

function getDateThreshold(value) {
  const now = new Date();
  switch (value) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "semana":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "mes":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "anio":
      return new Date(now - 365 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function DataRow({ label, value }) {
  return (
    <div className="admin-definition-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ListCard({ title, items, tone = "default" }) {
  if (!items.length) return null;
  return (
    <article className={`admin-panel-card ${tone !== "default" ? `admin-panel-card--${tone}` : ""}`}>
      <div className="admin-panel-card__header">
        <h3>{title}</h3>
      </div>
      <ul className="admin-bullet-list">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

export default function DashboardLeads({ evaluations }) {
  const [filter, setFilter] = useState(DEFAULT_CLASSIFICATION_FILTER);
  const [filterCommune, setFilterCommune] = useState("todas");
  const [filterAge, setFilterAge] = useState(0);
  const [filterDate, setFilterDate] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadHistory, setLeadHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const selectedResult = selectedLead?.result || {};
  const selectedInput = selectedLead?.input || {};
  const selectedOnboarding = selectedLead?.onboarding || {};
  const selectedMainBlocker = hasObjectData(selectedResult.main_blocker) ? selectedResult.main_blocker : null;
  const selectedAdjustment = getClassificationAdjustment(selectedResult);
  const selectedProjectFit = hasObjectData(selectedResult.project_fit) ? selectedResult.project_fit : null;
  const selectedCommercialPriority = hasObjectData(selectedResult.commercial_priority_detail)
    ? selectedResult.commercial_priority_detail
    : null;
  const selectedRecommendations = Array.isArray(selectedResult.recommendations) ? selectedResult.recommendations : [];
  const selectedPositiveIndicators = Array.isArray(selectedResult.positive_indicators) ? selectedResult.positive_indicators : [];
  const selectedRisks = Array.isArray(selectedResult.risks) ? selectedResult.risks : [];
  const selectedFinancialIndicators = hasObjectData(selectedResult.financial_indicators)
    ? selectedResult.financial_indicators
    : {};
  const selectedPhone = selectedLead?.phone || selectedLead?.profile?.phone || "";
  const selectedBaseScore = selectedResult.base_score ?? selectedResult.score;
  const selectedFinalScore = selectedResult.adjusted_score ?? selectedResult.score;
  const selectedLeadName = selectedLead?.full_name?.split(" ")[0] || "Cliente";
  const selectedEmailHref = selectedLead
    ? `mailto:${selectedLead.email || ""}?subject=${encodeURIComponent("Contacto RutaHogar - Evaluación Financiera")}&body=${encodeURIComponent(`Hola ${selectedLeadName},\n\nTe escribo a partir de tu evaluación en RutaHogar.\n\nSaludos.`)}`
    : "#";
  const selectedWhatsappHref = selectedPhone
    ? `https://wa.me/${selectedPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hola ${selectedLeadName}. Te escribo por RutaHogar.`)}`
    : "";
  const hasActiveFilters =
    filter !== DEFAULT_CLASSIFICATION_FILTER ||
    filterCommune !== "todas" ||
    filterAge !== 0 ||
    filterDate !== "todos" ||
    search !== "";

  const clearFilters = () => {
    setFilter(DEFAULT_CLASSIFICATION_FILTER);
    setFilterCommune("todas");
    setFilterAge(0);
    setFilterDate("todos");
    setSearch("");
  };

  useEffect(() => {
    if (!selectedLead) {
      setLeadHistory([]);
      setHistoryLoading(false);
      setHistoryError("");
      return;
    }

    let active = true;
    setHistoryLoading(true);
    setHistoryError("");

    getScoringHistoryByEvaluation(selectedLead.id)
      .then((data) => {
        if (!active) return;
        setLeadHistory(data);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        setHistoryError("No se pudo cargar el historial de auditoría.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLead]);

  const allCommunes = useMemo(() => {
    const communes = new Set();
    evaluations.forEach((item) => {
      const main = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
      const alt = item.onboarding?.comuna_alternativa;
      if (main) communes.add(main);
      if (alt) communes.add(alt);
    });
    return [...communes].sort();
  }, [evaluations]);

  const counts = useMemo(() => {
    const result = { Alto: 0, Medio: 0, Bajo: 0 };
    evaluations.forEach((item) => {
      const classification = item.result?.classification;
      if (result[classification] !== undefined) result[classification] += 1;
    });
    return result;
  }, [evaluations]);

  const filtered = useMemo(() => {
    const ageRange = AGE_RANGES[filterAge];
    const dateThreshold = getDateThreshold(filterDate);
    const searchLower = search.trim().toLowerCase();

    return evaluations.filter((item) => {
      if (filter !== "todos" && item.result?.classification !== filter) return false;

      if (filterCommune !== "todas") {
        const main = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
        const alt = item.onboarding?.comuna_alternativa;
        if (main !== filterCommune && alt !== filterCommune) return false;
      }

      if (ageRange.min > 0 || ageRange.max !== Infinity) {
        const age = item.input?.edad;
        if (age == null || age < ageRange.min || age >= ageRange.max) return false;
      }

      if (dateThreshold) {
        const itemDate = item.created_at ? new Date(item.created_at) : null;
        if (!itemDate || itemDate < dateThreshold) return false;
      }

      if (searchLower) {
        const name = (item.full_name || "").toLowerCase();
        const email = (item.email || "").toLowerCase();
        if (!name.includes(searchLower) && !email.includes(searchLower)) return false;
      }

      return true;
    });
  }, [evaluations, filter, filterCommune, filterAge, filterDate, search]);

  const latestLead = useMemo(() => {
    return [...evaluations].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  }, [evaluations]);

  const latestHighLead = useMemo(() => {
    return [...evaluations]
      .filter((item) => item.result?.classification === "Alto")
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  }, [evaluations]);

  return (
    <section className="section-block admin-leads-page">
      <div className="section-heading">
        <span className="eyebrow">Gestión comercial</span>
        <h1>Leads</h1>
        <p>
          Revisa el flujo evaluado, prioriza seguimientos y entra al detalle financiero-comercial con una lectura más clara.
        </p>
      </div>

      <div className="admin-hero admin-hero--compact admin-section-gap">
        <div className="admin-hero__content">
          <div className="admin-hero__meta">
            <span className="admin-tag">Seguimiento activo</span>
            <span className="admin-hero__subtle">
              {filtered.length === evaluations.length
                ? `${evaluations.length} leads visibles`
                : `${filtered.length} leads filtrados de ${evaluations.length}`}
            </span>
          </div>
          <h2>Una bandeja de trabajo orientada a prioridad, contexto y acción.</h2>
          <p>
            Filtra por clasificación, comuna, edad o fecha para que el equipo comercial no pierda foco entre registros de distinto valor.
          </p>
        </div>

        <div className="admin-hero__aside admin-hero__aside--stacked">
          <div className="mini-stat">
            <span>Último lead</span>
            <strong>{latestLead ? formatFecha(latestLead.created_at) : "Sin datos"}</strong>
          </div>
          <div className="mini-stat">
            <span>Último alto potencial</span>
            <strong>{latestHighLead ? formatFecha(latestHighLead.created_at) : "Sin datos"}</strong>
          </div>
          <div className="mini-stat">
            <span>Comunas activas</span>
            <strong>{allCommunes.length}</strong>
          </div>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-kpi-card--navy">
          <span className="admin-kpi-card__label">Total evaluado</span>
          <strong className="admin-kpi-card__value">{evaluations.length}</strong>
          <p className="admin-kpi-card__hint">Volumen consolidado de leads listos para revisión.</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--success">
          <span className="admin-kpi-card__label">Alta prioridad</span>
          <strong className="admin-kpi-card__value">{counts.Alto}</strong>
          <p className="admin-kpi-card__hint">Compatibilidad más alta para activación comercial inmediata.</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--gold">
          <span className="admin-kpi-card__label">Prioridad media</span>
          <strong className="admin-kpi-card__value">{counts.Medio}</strong>
          <p className="admin-kpi-card__hint">Casos cercanos que pueden avanzar con orientación adicional.</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--danger">
          <span className="admin-kpi-card__label">Prioridad baja</span>
          <strong className="admin-kpi-card__value">{counts.Bajo}</strong>
          <p className="admin-kpi-card__hint">Leads que requieren más preparación antes del siguiente paso.</p>
        </article>
      </div>

      <div className="admin-surface admin-section-gap">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Filtros de búsqueda</h2>
            <p>Ajusta la bandeja para centrar el trabajo diario en los casos más relevantes.</p>
          </div>
          {hasActiveFilters && (
            <button type="button" className="secondary-button compact-button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="toolbar-filters admin-toolbar-filters">
          <label style={{ flexBasis: "100%" }}>
            Buscar por nombre o correo
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej: Camila Retamal o camila@correo.cl"
              style={{ marginTop: "0.5rem" }}
            />
          </label>

          <label>
            Clasificación
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="todos">Todos ({evaluations.length})</option>
              <option value="Alto">Alto ({counts.Alto})</option>
              <option value="Medio">Medio ({counts.Medio})</option>
              <option value="Bajo">Bajo ({counts.Bajo})</option>
            </select>
          </label>

          <label>
            Comuna
            <select value={filterCommune} onChange={(event) => setFilterCommune(event.target.value)}>
              <option value="todas">Todas las comunas</option>
              {allCommunes.map((commune) => (
                <option key={commune} value={commune}>
                  {commune}
                </option>
              ))}
            </select>
          </label>

          <label>
            Rango de edad
            <select value={filterAge} onChange={(event) => setFilterAge(Number(event.target.value))}>
              {AGE_RANGES.map((range, index) => (
                <option key={index} value={index}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fecha
            <select value={filterDate} onChange={(event) => setFilterDate(event.target.value)}>
              {DATE_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="admin-surface">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Bandeja de leads</h2>
            <p>
              {filtered.length === evaluations.length
                ? `${evaluations.length} leads listos para revisión.`
                : `${filtered.length} leads coinciden con los filtros aplicados.`}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Comuna</th>
                <th>Clasificación</th>
                <th>Riesgos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{formatFecha(item.created_at)}</td>
                  <td>
                    <strong>{item.full_name || item.email || emptyValue}</strong>
                    <br />
                    <span className="admin-table-meta">{item.email || "Sin correo"}</span>
                  </td>
                  <td>{item.input?.comuna_objetivo || item.onboarding?.comuna_interes || emptyValue}</td>
                  <td>
                    <span className={`status-pill ${getClassificationClass(item.result?.classification)}`}>
                      {item.result?.classification || emptyValue}
                    </span>
                  </td>
                  <td>
                    {item.result?.risks?.length
                      ? item.result.risks.slice(0, 2).join(" · ")
                      : "Sin riesgos relevantes"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => setSelectedLead(item)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">
                      <strong>{hasActiveFilters ? "No hay coincidencias" : "Aún no hay leads en esta vista"}</strong>
                      <p>
                        {hasActiveFilters
                          ? "Ajusta los filtros para ampliar la búsqueda y recuperar más resultados."
                          : "Cuando existan evaluaciones aparecerán aquí con su prioridad comercial."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLead && (
        <div className="admin-modal" onClick={() => setSelectedLead(null)}>
          <div className="admin-modal-card admin-modal-card--xl" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <span className="eyebrow">Lead seleccionado</span>
                <h2>{selectedLead.full_name || selectedLead.email || "Lead sin nombre"}</h2>
                <p>
                  {selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Comuna sin dato"} · {formatFechaHora(selectedLead.created_at)}
                </p>
              </div>
              <button type="button" className="secondary-button compact-button" onClick={() => setSelectedLead(null)}>
                Cerrar
              </button>
            </div>

            <div className="lead-score-highlight">
              <div className={getScoreBadgeClassByScore(selectedBaseScore)}>
                <span>Score base</span>
                <strong>{formatScore(selectedBaseScore) ?? emptyValue}</strong>
                <small>Base: {getBaseClassification(selectedResult)}</small>
              </div>
              <div className={getClassificationClass(selectedResult.classification)}>
                <span>Score final</span>
                <strong>{formatScore(selectedFinalScore) ?? emptyValue}</strong>
                <small>{selectedResult.score_adjustment_reason ? "Ajustado por bloqueadores" : "Sin ajuste adicional"}</small>
              </div>
              <div className={getClassificationClass(selectedResult.classification)}>
                <span>Clasificación final</span>
                <strong>{selectedResult.classification || emptyValue}</strong>
              </div>
            </div>

            {selectedAdjustment && (
              <div className="admin-callout admin-callout--warning admin-section-gap">
                <strong>{selectedAdjustment.message}</strong>
                {selectedAdjustment.detail ? <p>{selectedAdjustment.detail}</p> : null}
                {selectedResult.score_adjustment_reason ? <p>{selectedResult.score_adjustment_reason}</p> : null}
              </div>
            )}

            <div className="admin-detail-grid">
              <div className="admin-stack">
                <article className="admin-panel-card">
                  <div className="admin-panel-card__header">
                    <h3>Información del cliente</h3>
                  </div>
                  <dl className="admin-definition-list">
                    <DataRow label="Nombre" value={selectedLead.full_name || emptyValue} />
                    <DataRow label="Correo" value={selectedLead.email || emptyValue} />
                    <DataRow label="Teléfono" value={selectedPhone || emptyValue} />
                    <DataRow label="Edad" value={selectedInput.edad != null ? `${selectedInput.edad} años` : emptyValue} />
                    <DataRow label="Comuna principal" value={selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || emptyValue} />
                    {selectedOnboarding.comuna_alternativa ? (
                      <DataRow label="Comuna alternativa" value={selectedOnboarding.comuna_alternativa} />
                    ) : null}
                    <DataRow label="Fecha evaluación" value={formatFechaHora(selectedLead.created_at)} />
                  </dl>
                </article>

                {selectedMainBlocker && (
                  <article className="admin-panel-card admin-panel-card--warning">
                    <div className="admin-panel-card__header">
                      <h3>Bloqueador principal</h3>
                    </div>
                    <p className="admin-panel-card__body-strong">
                      {selectedMainBlocker.title || selectedMainBlocker.code || "Antecedente a revisar"}
                    </p>
                    {selectedMainBlocker.description ? <p>{selectedMainBlocker.description}</p> : null}
                    <span className="admin-inline-note">Severidad: {translateSeverity(selectedMainBlocker.severity)}</span>
                  </article>
                )}

                <ListCard title="Indicadores positivos" items={selectedPositiveIndicators} tone="success" />
                <ListCard title="Riesgos detectados" items={selectedRisks} tone="danger" />
              </div>

              <div className="admin-stack">
                {selectedProjectFit && (
                  <article className="admin-panel-card">
                    <div className="admin-panel-card__header">
                      <h3>Compatibilidad con objetivo</h3>
                    </div>
                    <dl className="admin-definition-list">
                      <DataRow label="Clasificación" value={selectedProjectFit.classification || selectedProjectFit.status || emptyValue} />
                      <DataRow label="Score" value={formatScore(selectedProjectFit.score) ?? emptyValue} />
                      <DataRow label="Brecha ingreso" value={money(selectedProjectFit.income_gap)} />
                      <DataRow label="Brecha pie" value={money(selectedProjectFit.down_payment_gap)} />
                      <DataRow label="Compatible" value={booleanText(selectedProjectFit.compatible)} />
                    </dl>
                  </article>
                )}

                <article className="admin-panel-card">
                  <div className="admin-panel-card__header">
                    <h3>Señales comerciales declaradas</h3>
                  </div>
                  <dl className="admin-definition-list">
                    <DataRow label="Plazo de compra" value={purchaseTermLabel(selectedInput.plazo_compra)} />
                    <DataRow label="Proyecto visto" value={booleanText(selectedInput.tiene_propiedad_vista)} />
                    <DataRow label="Pie estimado" value={formatPercent(selectedFinancialIndicators.pie_ratio)} />
                  </dl>
                </article>

                {selectedCommercialPriority && (
                  <article className="admin-panel-card admin-panel-card--success">
                    <div className="admin-panel-card__header">
                      <h3>Prioridad comercial</h3>
                    </div>
                    <dl className="admin-definition-list">
                      <DataRow label="Acción" value={selectedCommercialPriority.action || selectedCommercialPriority.level || emptyValue} />
                      <DataRow label="Motivo" value={selectedCommercialPriority.reason || "Sin motivo registrado."} />
                      <DataRow label="Derivación sugerida" value={booleanText(selectedCommercialPriority.send_to_crm)} />
                    </dl>
                  </article>
                )}

                <ListCard title="Recomendaciones" items={selectedRecommendations} />

                {selectedResult.executive_summary && (
                  <article className="admin-panel-card">
                    <div className="admin-panel-card__header">
                      <h3>Resumen ejecutivo</h3>
                    </div>
                    <p>{selectedResult.executive_summary}</p>
                  </article>
                )}

                {!selectedCommercialPriority && selectedResult.commercial_guidance && (
                  <article className="admin-panel-card admin-panel-card--soft">
                    <div className="admin-panel-card__header">
                      <h3>Orientación comercial</h3>
                    </div>
                    <p>{selectedResult.commercial_guidance}</p>
                  </article>
                )}

                <article className="admin-panel-card">
                  <div className="admin-panel-card__header">
                    <h3>Acciones rápidas</h3>
                  </div>
                  <div className="admin-action-grid">
                    <a
                      href={selectedEmailHref}
                      className="secondary-button admin-link-button"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Correo
                    </a>
                    {selectedPhone ? (
                      <a
                        href={selectedWhatsappHref}
                        className="primary-button admin-link-button"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <button type="button" className="secondary-button admin-link-button" disabled>
                        WhatsApp no disponible
                      </button>
                    )}
                  </div>
                </article>
              </div>
            </div>

            <section className="admin-panel-card admin-panel-card--soft admin-history-section">
              <div className="admin-panel-card__header">
                <h3>Historial inmutable</h3>
              </div>

              {historyLoading ? (
                <div className="admin-table-loading">
                  <span className="admin-skeleton-line full"></span>
                  <span className="admin-skeleton-line full"></span>
                  <span className="admin-skeleton-line medium"></span>
                </div>
              ) : historyError ? (
                <div className="error-message">{historyError}</div>
              ) : leadHistory.length > 0 ? (
                <div className="admin-history-list">
                  {leadHistory.map((item) => (
                    <article className="admin-history-card" key={item.id}>
                      <div className="admin-history-card__head">
                        <span className="admin-tag admin-tag--soft">{formatFechaHora(item.created_at)} UTC</span>
                        <strong>
                          Score base: {formatScore(item.base_score ?? item.score, "Sin score")} · Score final: {formatScore(item.adjusted_score ?? item.score, "Sin score")} · Clasificación final: {item.classification || emptyValue}
                        </strong>
                      </div>

                      <dl className="admin-definition-list">
                        <DataRow label="Comuna objetivo" value={item.snapshot?.comuna_objetivo || "No declarada"} />
                        <DataRow label="Canal de origen" value={channelLabels[item.channel] || item.channel || "web"} />
                        <DataRow label="Versión del algoritmo" value={item.algorithm_version || "-"} />
                        <div className="admin-definition-row admin-definition-row--stacked">
                          <dt>Desglose por componente</dt>
                          <dd>
                            {item.component_scores && Object.keys(item.component_scores).length > 0 ? (
                              <ul className="admin-bullet-list admin-bullet-list--compact">
                                {Object.entries(item.component_scores).map(([key, value]) => (
                                  <li key={key}>
                                    {key.replace(/_/g, " ")} {value >= 0 ? `+${value}` : value}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              "-"
                            )}
                          </dd>
                        </div>
                      </dl>

                      {(item.events || []).length > 0 && (
                        <div className="admin-history-events">
                          <span className="admin-tag admin-tag--soft">Eventos del plan</span>
                          <ul className="admin-event-list">
                            {(item.events || []).map((event, index) => (
                              <li key={`${item.id}-${index}`}>
                                <strong>{eventLabels[event.type] || event.type}</strong>
                                <span>{formatEventAt(event.at)}</span>
                                <p>{renderEventDetail(event)}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>Sin registros de auditoría</strong>
                  <p>No hay eventos históricos asociados a esta evaluación.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
