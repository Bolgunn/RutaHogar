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
 
function formatFecha(created_at) {
  if (!created_at) return "-";
  const d = new Date(created_at);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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
  const d = event.details || {};
  switch (event.type) {
    case "no_viable_shown":
      return d.message || "Se presentó la condición No viable";
    case "apply_alternative":
      return `${d.title || d.alternative_id || "Alternativa"} → ${d.result_viable ? "viable" : "no viable"}`;
    case "simulate_success":
      return d.months ? `Viable ahorrando en ${d.months} meses` : "Escenario simulado viable";
    case "accept_plan":
      return `Meta ${formatEventMoney(d.monthly_target)} / ${d.months ?? "-"} meses`;
    case "register_savings":
      return `${formatEventMoney(d.total_registered) || "$0"} acumulado (${d.progress_percent ?? 0}%)`;
    default:
      return "";
  }
}

function formatEventAt(at) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  const fecha = d.toLocaleDateString("es-CL");
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fecha} ${hora}`;
}

const AGE_RANGES = [
  { label: "Todas las edades", min: 0, max: Infinity },
  { label: "18 – 25 años", min: 18, max: 25 },
  { label: "25 – 35 años", min: 25, max: 35 },
  { label: "35 – 45 años", min: 35, max: 45 },
  { label: "45 – 55 años", min: 45, max: 55 },
  { label: "55 – 65 años", min: 55, max: 65 },
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
    case "24h":   return new Date(now - 24 * 60 * 60 * 1000);
    case "semana": return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "mes":   return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "anio":  return new Date(now - 365 * 24 * 60 * 60 * 1000);
    default:      return null;
  }
}

export default function DashboardLeads({ evaluations }) {
  const [filter, setFilter] = useState(DEFAULT_CLASSIFICATION_FILTER);
  const [filterCommune, setFilterCommune] = useState("todas");
  const [filterAge, setFilterAge] = useState(0);
  const [filterDate, setFilterDate] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadHistory, setLeadHistory] = useState([]);
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
    if (!selectedLead) { setLeadHistory([]); return; }
    let active = true;
    getScoringHistoryByEvaluation(selectedLead.id)
      .then((data) => { if (active) setLeadHistory(data); })
      .catch((err) => console.error(err));
    return () => { active = false; };
  }, [selectedLead]);

  const allCommunes = useMemo(() => {
    const set = new Set();
    evaluations.forEach((item) => {
      const main = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
      const alt = item.onboarding?.comuna_alternativa;
      if (main) set.add(main);
      if (alt) set.add(alt);
    });
    return [...set].sort();
  }, [evaluations]);

  const counts = useMemo(() => {
    const c = { Alto: 0, Medio: 0, Bajo: 0 };
    evaluations.forEach((item) => {
      const classification = item.result?.classification;
      if (c[classification] !== undefined) c[classification]++;
    });
    return c;
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

  return (
    <section className="section-block">
      <div className="section-heading">
        <span className="eyebrow">Gestión comercial</span>
        <h1>Dashboard Leads</h1>
        <p>Vista para revisar leads evaluados y priorizar acciones comerciales.</p>
      </div>

      <div className="toolbar-filters">
        {/* Búsqueda por nombre/correo */}
        <label style={{ flexBasis: "100%" }}>
          Buscar por nombre o correo
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ej: Juan Pérez o juan@correo.cl"
            style={{ marginTop: "0.5rem" }}
          />
        </label>

        <label>
          Clasificación
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="todos">Todos ({evaluations.length})</option>
            <option value="Alto">Alto ({counts.Alto})</option>
            <option value="Medio">Medio ({counts.Medio})</option>
            <option value="Bajo">Bajo ({counts.Bajo})</option>
          </select>
        </label>

        <label>
          Comuna
          <select value={filterCommune} onChange={(e) => setFilterCommune(e.target.value)}>
            <option value="todas">Todas las comunas</option>
            {allCommunes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label>
          Rango de edad
          <select value={filterAge} onChange={(e) => setFilterAge(Number(e.target.value))}>
            {AGE_RANGES.map((range, i) => (
              <option key={i} value={i}>{range.label}</option>
            ))}
          </select>
        </label>

        <label>
          Fecha
          <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        {/* Botón limpiar filtros — solo visible si hay algún filtro activo */}
        {hasActiveFilters && (
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={clearFilters}
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Contador de resultados */}
      <p style={{ fontSize: "0.88rem", color: "#526174", marginBottom: "12px" }}>
        {filtered.length === evaluations.length
          ? `${evaluations.length} leads en total`
          : `${filtered.length} de ${evaluations.length} leads`}
      </p>

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
                <td>{item.full_name || item.email || emptyValue}</td>
                <td>{item.input?.comuna_objetivo || item.onboarding?.comuna_interes || emptyValue}</td>
                <td>
                  <span className={`status-pill ${getClassificationClass(item.result?.classification)}`}>
                    {item.result?.classification || emptyValue}
                  </span>
                </td>
                <td>
                  {item.result?.risks?.length
                    ? item.result.risks.slice(0, 2).join(" ")
                    : "Sin riesgos relevantes"}
                </td>
                <td>
                  <button
                    className="secondary-button compact-button"
                    onClick={() => setSelectedLead(item)}
                  >
                    Ver detalles
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan="6">
                  {hasActiveFilters
                    ? "No hay leads que coincidan con los filtros aplicados."
                    : "Aún no existen leads para esta clasificación."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de detalles */}
      {selectedLead && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="lead-detail-card"
            style={{
              background: "var(--color-surface, #fff)",
              borderRadius: "14px",
              padding: "2rem",
              maxWidth: "80%",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid #eaeaea", paddingBottom: "1rem" }}>
              <h2 style={{ margin: 0 }}>Perfil del Lead</h2>
              <button className="secondary-button compact-button" onClick={() => setSelectedLead(null)}>
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
                {selectedResult.score_adjustment_reason ? <small>Ajustado por bloqueadores</small> : null}
              </div>
              <div className={getClassificationClass(selectedResult.classification)}>
                <span>Clasificación final</span>
                <strong>{selectedResult.classification || emptyValue}</strong>
              </div>
            </div>
            {selectedAdjustment ? (
              <div className="score-adjustment-note">
                <strong>{selectedAdjustment.message}</strong>
                {selectedAdjustment.detail ? <p>{selectedAdjustment.detail}</p> : null}
                {selectedResult.score_adjustment_reason ? <p>{selectedResult.score_adjustment_reason}</p> : null}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
              {/* Columna Izquierda */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Datos del lead */}
                <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "#334155" }}>Información del Cliente</h3>
                  <div style={{ display: "grid", gap: "0.6rem", fontSize: "0.95rem", color: "#475569" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Nombre:</strong> <span style={{ textAlign: "right" }}>{selectedLead.full_name || emptyValue}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Email:</strong> <span style={{ textAlign: "right" }}>{selectedLead.email || emptyValue}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Teléfono:</strong> <span style={{ textAlign: "right" }}>{selectedPhone || emptyValue}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Edad:</strong> <span style={{ textAlign: "right" }}>{selectedInput.edad != null ? `${selectedInput.edad} años` : emptyValue}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Comuna principal:</strong> <span style={{ textAlign: "right" }}>{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || emptyValue}</span></div>
                    {selectedOnboarding.comuna_alternativa && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Comuna alternativa:</strong> <span style={{ textAlign: "right" }}>{selectedOnboarding.comuna_alternativa}</span></div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Fecha evaluación:</strong> <span style={{ textAlign: "right" }}>{formatFecha(selectedLead.created_at)}</span></div>
                  </div>
                </div>

                {selectedMainBlocker && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Bloqueador principal</h3>
                    <div style={{ background: "#fff7ed", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #fb923c", color: "#475569", fontSize: "0.95rem", lineHeight: "1.5" }}>
                      <strong>{selectedMainBlocker.title || selectedMainBlocker.code || "Antecedente a revisar"}</strong>
                      {selectedMainBlocker.description ? <p style={{ margin: "0.5rem 0" }}>{selectedMainBlocker.description}</p> : null}
                      <span>Severidad: {translateSeverity(selectedMainBlocker.severity)}</span>
                    </div>
                  </div>
                )}

                {/* Indicadores positivos */}
                {selectedPositiveIndicators.length > 0 && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                       <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span> Indicadores positivos
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#475569", fontSize: "0.95rem", lineHeight: "1.5" }}>
                      {selectedPositiveIndicators.map((ind, i) => (
                        <li key={i} style={{ marginBottom: "0.25rem" }}>{ind}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Riesgos detectados */}
                {selectedRisks.length > 0 && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                       <span style={{ color: "#ef4444", fontWeight: "bold" }}>⚠</span> Riesgos detectados
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#475569", fontSize: "0.95rem", lineHeight: "1.5" }}>
                      {selectedRisks.map((r, i) => (
                        <li key={i} style={{ marginBottom: "0.25rem" }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Columna Derecha */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {selectedProjectFit && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Compatibilidad con objetivo</h3>
                    <dl style={{ margin: 0, display: "grid", gap: "0.5rem", color: "#475569", fontSize: "0.95rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><dt>Clasificación</dt><dd style={{ margin: 0 }}>{selectedProjectFit.classification || selectedProjectFit.status || emptyValue}</dd></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><dt>Score</dt><dd style={{ margin: 0 }}>{formatScore(selectedProjectFit.score) ?? emptyValue}</dd></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><dt>Brecha ingreso</dt><dd style={{ margin: 0 }}>{money(selectedProjectFit.income_gap)}</dd></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><dt>Brecha pie</dt><dd style={{ margin: 0 }}>{money(selectedProjectFit.down_payment_gap)}</dd></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><dt>Compatible</dt><dd style={{ margin: 0 }}>{booleanText(selectedProjectFit.compatible)}</dd></div>
                    </dl>
                  </div>
                )}

                <div>
                  <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Señales comerciales declaradas</h3>
                  <dl style={{ margin: 0, display: "grid", gap: "0.5rem", color: "#475569", fontSize: "0.95rem", background: "#f8fafc", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #93c5fd" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <dt>Plazo de compra</dt>
                      <dd style={{ margin: 0, textAlign: "right" }}>{purchaseTermLabel(selectedInput.plazo_compra)}</dd>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <dt>Propiedad o proyecto visto</dt>
                      <dd style={{ margin: 0, textAlign: "right" }}>{booleanText(selectedInput.tiene_propiedad_vista)}</dd>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <dt>Pie estimado</dt>
                      <dd style={{ margin: 0, textAlign: "right" }}>{formatPercent(selectedFinancialIndicators.pie_ratio)}</dd>
                    </div>
                  </dl>
                </div>

                {selectedCommercialPriority && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Prioridad comercial</h3>
                    <p style={{ margin: 0, color: "#475569", fontSize: "0.95rem", lineHeight: "1.6", background: "#f0fdf4", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #4ade80" }}>
                      <strong>Acción:</strong> {selectedCommercialPriority.action || selectedCommercialPriority.level || emptyValue}
                      <br />
                      <strong>Motivo:</strong> {selectedCommercialPriority.reason || "Sin motivo registrado."}
                      <br />
                      <strong>Derivación sugerida:</strong> {booleanText(selectedCommercialPriority.send_to_crm)}
                    </p>
                  </div>
                )}

                {selectedRecommendations.length > 0 && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Recomendaciones</h3>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#475569", fontSize: "0.95rem", lineHeight: "1.5" }}>
                      {selectedRecommendations.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedResult.executive_summary && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Resumen Ejecutivo</h3>
                    <p style={{ margin: 0, color: "#475569", fontSize: "0.95rem", lineHeight: "1.6", background: "#f8fafc", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #cbd5e1" }}>
                       {selectedResult.executive_summary}
                    </p>
                  </div>
                )}
                
                {!selectedCommercialPriority && selectedResult.commercial_guidance && (
                  <div>
                    <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.05rem", color: "#334155" }}>Orientación Comercial</h3>
                    <p style={{ margin: 0, color: "#475569", fontSize: "0.95rem", lineHeight: "1.6", background: "#f0fdf4", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #4ade80" }}>
                      {selectedResult.commercial_guidance}
                    </p>
                  </div>
                )}

                <div style={{ marginTop: "auto" }}>
                  <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.05rem", color: "#334155" }}>Acciones Rápidas</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <a
                      href={`mailto:${selectedLead.email || ""}?subject=${encodeURIComponent("Contacto RutaHogar - Evaluación Financiera")}&body=${encodeURIComponent(`Hola ${selectedLead.full_name?.split(" ")[0] || "Cliente"},\n\nTe escribo a partir de tu evaluación en RutaHogar.\n\nSaludos.`)}`}
                      className="secondary-button compact-button"
                      style={{ textDecoration: "none", textAlign: "center", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0.6rem" }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                      Correo
                    </a>
                    <a
                      href={`https://wa.me/${selectedPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hola ${selectedLead.full_name?.split(" ")[0] || "Cliente"}! Te escribo por RutaHogar.`)}`}
                      style={{ textDecoration: "none", textAlign: "center", backgroundColor: "#25D366", color: "white", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0.6rem", fontWeight: "500", fontSize: "0.9rem", border: "none", cursor: "pointer" }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                      </svg>
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid var(--color-border, #e0e0e0)" }} />

            <section>
              <h3 style={{ marginBottom: "1rem" }}>Historial inmutable (auditoría)</h3>
              {leadHistory.length > 0 ? (
                <div className="history-list" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {leadHistory.map((item) => (
                    <article
                      className="history-card"
                      key={item.id}
                      style={{
                        padding: "1rem",
                        border: "1px solid var(--color-border, #e0e0e0)",
                        borderRadius: "10px",
                        background: "var(--color-surface-secondary, #f9f9f9)",
                      }}
                    >
                      <div className="history-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <span className="eyebrow">{(() => { const d = new Date(item.created_at); const fecha = d.toLocaleDateString("es-CL"); const hora = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`; return `${fecha} ${hora} UTC`; })()}</span>
                        <strong>
                          Score base: {formatScore(item.base_score ?? item.score, "Sin score")} · Score final: {formatScore(item.adjusted_score ?? item.score, "Sin score")} · Clasificación final: {item.classification || emptyValue}
                        </strong>
                      </div>
                      <dl style={{ margin: 0, display: "grid", gap: "0.3rem", fontSize: "0.9rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <dt style={{ fontWeight: 600, minWidth: "140px" }}>Comuna objetivo</dt>
                          <dd style={{ margin: 0 }}>{item.snapshot?.comuna_objetivo || "No declarada"}</dd>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <dt style={{ fontWeight: 600, minWidth: "140px" }}>Canal de origen</dt>
                          <dd style={{ margin: 0 }}>{channelLabels[item.channel] || item.channel || "web"}</dd>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <dt style={{ fontWeight: 600, minWidth: "140px" }}>Versión del algoritmo</dt>
                          <dd style={{ margin: 0 }}>{item.algorithm_version || "—"}</dd>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <dt style={{ fontWeight: 600, minWidth: "140px" }}>Desglose por componente</dt>
                          <dd style={{ margin: 0 }}>
                            {item.component_scores && Object.keys(item.component_scores).length > 0 ? (
                              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                                {Object.entries(item.component_scores).map(([key, value]) => (
                                  <li key={key}>
                                    <span>{key.replace(/_/g, " ")} </span>
                                    <span style={{ color: value >= 0 ? "var(--color-positive, #16a34a)" : "var(--color-negative, #dc2626)" }}>
                                      {value >= 0 ? `+${value}` : value}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : "—"}
                          </dd>
                        </div>
                      </dl>

                      {(item.events || []).length > 0 && (
                        <div style={{ marginTop: "0.75rem", borderTop: "1px dashed var(--color-border, #e0e0e0)", paddingTop: "0.75rem" }}>
                          <span className="eyebrow">Eventos del plan de ahorro</span>
                          <ul style={{ margin: "0.5rem 0 0", padding: 0, listStyle: "none", display: "grid", gap: "0.45rem", fontSize: "0.9rem" }}>
                            {(item.events || []).map((event, i) => (
                              <li key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                                <span style={{ whiteSpace: "nowrap", color: "var(--color-muted, #888)", minWidth: "70px" }}>
                                  {formatEventAt(event.at)}
                                </span>
                                <strong style={{ whiteSpace: "nowrap" }}>
                                  {eventLabels[event.type] || event.type}
                                </strong>
                                <span style={{ color: "#475569" }}>{renderEventDetail(event)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ color: "var(--color-muted, #888)", fontStyle: "italic" }}>
                  <p style={{ margin: 0 }}>No hay registros de auditoría para esta evaluación.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
