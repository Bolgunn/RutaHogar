import React, { useEffect, useMemo, useState } from "react";
import { getScoringHistoryByEvaluation } from "../services/getScoringHistory";
import { getEvaluations } from "../services/evaluationService";
import { reportLead, resolveLeadStatus } from "../services/leadManagementService";
import { buildContactQuestions } from "../lib/commercial/contactQuestions";
import { comunasDeclaradas, matchLeadToProjects } from "../lib/matching/leadProjectMatching";
import { displayItemBenefit, displayItemText } from "../utils/text";
import CommercialStagePanel from "./CommercialStagePanel";
import { getCommercialRecords } from "../services/commercialStageService";
import { createLeadRecordsReloader } from "../lib/commercial/leadRecordsReloader";
import { formatFormValue } from "../constants";
import {
  formatScore,
  getClassificationAdjustment,
  getClassificationClass,
  translateSeverity,
} from "../utils/helpers";

function getReliabilityBadgeCard(status) {
  switch (status) {
    case "sospechoso": return <span className="status-pill bajo">Sospechoso</span>;
    case "en_revision": return <span className="status-pill medio">En revisión</span>;
    case "descartado":
    case "silenciado": return <span className="status-pill requiere-antecedentes">Silenciado</span>;
    case "reactivado": return <span className="status-pill alto">Reactivado</span>;
    case "normal": default: return <span className="status-pill alto">Normal</span>;
  }
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL");
}

function DetailRow({ label, children }) {
  return <div className="admin-definition-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

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
  return Number.isFinite(numericValue) ? CLP_FORMATTER.format(Math.round(numericValue)) : "Sin dato";
}

function booleanText(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "Sin dato";
}

function formatPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue * 1000) / 10}%` : "Sin dato";
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

const eventLabels = {
  no_viable_shown: "Plan no viable presentado",
  apply_alternative: "Aplicó alternativa",
  simulate_success: "Simulación viable",
  accept_plan: "Aceptó el plan",
  register_savings: "Registró ahorro",
};

function formatEventAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL");
}

function leadIdentity(item) {
  return item?.user_id || item?.email || item?.id || null;
}

function evaluationsForSameLead(items = [], lead) {
  const key = leadIdentity(lead);
  if (!key) return [];
  return items
    .filter((item) => leadIdentity(item) === key)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function historyFallbackFromEvaluation(item) {
  if (!item) return null;
  const result = item.result || {};
  return {
    id: `evaluation-${item.id}`,
    evaluation_id: item.id,
    score: result.score,
    base_score: result.base_score,
    adjusted_score: result.adjusted_score,
    score_adjustment_reason: result.score_adjustment_reason || "",
    original_classification: result.original_classification || "",
    classification: result.classification,
    snapshot: {
      ...(item.input || {}),
      input: item.input || {},
      onboarding: item.onboarding || {},
      result,
    },
    component_scores: result.component_scores || {},
    algorithm_version: result.algorithm_version || "",
    created_at: item.created_at,
    events: [],
  };
}

function renderEventDetail(event) {
  const details = event.details || {};
  if (event.type === "apply_alternative") return details.title || details.alternative_id || "Alternativa aplicada";
  if (event.type === "simulate_success") return details.months ? `Escenario viable en ${details.months} meses` : "Escenario viable";
  if (event.type === "accept_plan") return details.months ? `Meta aceptada a ${details.months} meses` : "Meta aceptada";
  if (event.type === "register_savings") return `${details.progress_percent ?? 0}% de avance registrado`;
  return details.message || "Sin detalle adicional";
}

function componentScoreLabel(key) {
  const labels = {
    ahorro_pie: "Ahorro y pie",
    pie_ahorro: "Ahorro y pie",
    calidad_datos: "Información declarada",
    endeudamiento: "Deudas",
    capacidad_pago: "Capacidad de pago",
    historial_pago: "Historial de pagos",
    complemento_renta: "Renta complementaria",
    estabilidad_laboral: "Estabilidad laboral",
    perfil_compra: "Objetivo de compra",
  };
  return labels[key] || key.replace(/_/g, " ");
}

function historySnapshot(row = {}) {
  const snapshot = row.snapshot || {};
  const result = snapshot.result || snapshot.result_snapshot || row.result || {};
  const input = snapshot.input || snapshot.input_snapshot || snapshot || {};
  const onboarding = snapshot.onboarding || {};
  return { input, result, onboarding };
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectMatchStatusLabel(match) {
  if (!match) return "Sin dato";
  if (match.clasificacion) return match.clasificacion;
  const labels = {
    capacidad_requiere_antecedentes: "Requiere antecedentes para calcular capacidad",
    capacidad_insuficiente: "Capacidad insuficiente para este proyecto",
    bloqueador_critico: "Excluido por bloqueador crítico",
  };
  return labels[match.motivo_exclusion] || match.motivo_exclusion || "Sin dato";
}

function formatSignedNumber(value, suffix = "") {
  const parsed = numberOrNull(value);
  if (parsed == null || parsed === 0) return null;
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${Math.round(parsed * 10) / 10}${suffix}`;
}

function formatSignedMoney(value) {
  const parsed = numberOrNull(value);
  if (parsed == null || parsed === 0) return null;
  const sign = parsed > 0 ? "+" : "-";
  return `${sign}${money(Math.abs(parsed))}`;
}

function compatibilityForHistory(row, project) {
  if (!project) return null;
  const { input, result, onboarding } = historySnapshot(row);
  const leadLike = { input, result, onboarding };
  const { matches, excluidos } = matchLeadToProjects(leadLike, [project]);
  return matches[0] || excluidos[0] || null;
}

function projectGoalMatchesSelected(projectGoal, project) {
  if (!projectGoal || !project) return false;
  if (projectGoal.id != null && project.id != null && String(projectGoal.id) === String(project.id)) return true;
  const sameName = projectGoal.nombre && project.nombre && projectGoal.nombre.trim().toLowerCase() === project.nombre.trim().toLowerCase();
  const sameCommune = projectGoal.comuna && project.comuna && projectGoal.comuna.trim().toLowerCase() === project.comuna.trim().toLowerCase();
  return Boolean(sameName && sameCommune);
}

function metricFromHistory(row, project) {
  const { input, result } = historySnapshot(row);
  const projectMatch = compatibilityForHistory(row, project);
  return {
    score: numberOrNull(row.adjusted_score ?? row.score ?? result.adjusted_score ?? result.score),
    classification: row.classification || result.classification || "Sin clasificación",
    income: numberOrNull(input.ingreso_mensual),
    debt: numberOrNull(input.deuda_mensual),
    savings: numberOrNull(input.ahorro_disponible),
    workType: input.tipo_contrato || "Sin dato",
    capacityUf: project ? numberOrNull(projectMatch?.evidencia?.capacidad_uf) : null,
    projectCompatibility: project ? projectMatchStatusLabel(projectMatch) : null,
    projectAffinity: project ? numberOrNull(projectMatch?.afinidad) : null,
    matchesSelectedGoal: projectGoalMatchesSelected(input.project_goal, project),
  };
}

function buildHistoryChangeChips(current, previous) {
  if (!previous) return [{ label: "Primera calificación registrada", tone: "neutral" }];

  const chips = [];
  const scoreDelta = current.score != null && previous.score != null ? current.score - previous.score : null;
  if (scoreDelta) chips.push({ label: `Score ${formatSignedNumber(scoreDelta)}`, tone: scoreDelta > 0 ? "positive" : "negative" });

  const incomeDelta = current.income != null && previous.income != null ? current.income - previous.income : null;
  if (incomeDelta) chips.push({ label: `Ingreso ${formatSignedMoney(incomeDelta)}`, tone: incomeDelta > 0 ? "positive" : "negative" });

  const debtDelta = current.debt != null && previous.debt != null ? current.debt - previous.debt : null;
  if (debtDelta) chips.push({ label: `Deuda ${formatSignedMoney(debtDelta)}`, tone: debtDelta < 0 ? "positive" : "negative" });

  const savingsDelta = current.savings != null && previous.savings != null ? current.savings - previous.savings : null;
  if (savingsDelta) chips.push({ label: `Ahorro ${formatSignedMoney(savingsDelta)}`, tone: savingsDelta > 0 ? "positive" : "negative" });

  const capacityDelta = current.capacityUf != null && previous.capacityUf != null ? current.capacityUf - previous.capacityUf : null;
  if (capacityDelta) chips.push({ label: `Capacidad ${formatSignedNumber(capacityDelta, " UF")}`, tone: capacityDelta > 0 ? "positive" : "negative" });

  if (current.workType !== previous.workType) {
    chips.push({ label: `Situación laboral: ${formatFormValue(previous.workType)} -> ${formatFormValue(current.workType)}`, tone: "neutral" });
  }

  if (current.projectCompatibility && previous.projectCompatibility && current.projectCompatibility !== previous.projectCompatibility) {
    chips.push({ label: `Compatibilidad: ${previous.projectCompatibility} -> ${current.projectCompatibility}`, tone: current.projectCompatibility === "Compatible" ? "positive" : "neutral" });
  }

  return chips.length ? chips : [{ label: "Sin cambios materiales detectados", tone: "neutral" }];
}

function buildHistoryTimeline(history = [], project = null) {
  const chronological = [...history].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const items = chronological.map((row, index) => {
    const metrics = metricFromHistory(row, project);
    const previousMetrics = index > 0 ? metricFromHistory(chronological[index - 1], project) : null;
    return {
      row,
      metrics,
      changes: buildHistoryChangeChips(metrics, previousMetrics),
    };
  });

  const first = items[0]?.metrics;
  const last = items[items.length - 1]?.metrics;
  const scoreDelta = first?.score != null && last?.score != null ? last.score - first.score : null;
  const capacityDelta = first?.capacityUf != null && last?.capacityUf != null ? last.capacityUf - first.capacityUf : null;
  const debtDelta = first?.debt != null && last?.debt != null ? last.debt - first.debt : null;
  const trend = scoreDelta == null || Math.abs(scoreDelta) < 1
    ? "stable"
    : scoreDelta > 0
      ? "improving"
      : "declining";

  return {
    items: items.reverse(),
    summary: {
      trend,
      scoreDelta,
      capacityDelta,
      debtDelta,
      count: items.length,
    },
  };
}

export default function LeadDetailModal({
  lead,
  onClose,
  evaluations = [],
  selectedProject = null,
  role = "admin",
  profile = null,
  executiveScope = null,
  onLeadUpdated = null,
  commercialRecords = null,
  onStageChanged = null,
  crm = null,
}) {
  const [activeLead, setActiveLead] = useState(lead);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [adminAction, setAdminAction] = useState(null); // { status }
  const [adminReason, setAdminReason] = useState("");
  const [resolving, setResolving] = useState(false);
  const [showAllContactQuestions, setShowAllContactQuestions] = useState(false);
  const [questionsCopied, setQuestionsCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [ownCommercialRecords, setOwnCommercialRecords] = useState({});

  useEffect(() => {
    setActiveLead(lead);
  }, [lead]);

  // Load evaluation details if missing (e.g. opened from admin reported list with minimal payload)
  useEffect(() => {
    const targetUserId = activeLead?.user_id || activeLead?.id;
    if ((!activeLead?.result || !activeLead?.result?.score) && targetUserId) {
      const foundInList = (evaluations || []).find(
        (e) => (e.user_id && e.user_id === targetUserId) || e.id === targetUserId
      );
      if (foundInList && foundInList.result?.score) {
        setActiveLead((prev) => ({ ...foundInList, ...prev, result: foundInList.result, input: foundInList.input, onboarding: foundInList.onboarding }));
      } else {
        getEvaluations(targetUserId, role)
          .then((list) => {
            if (list && list.length > 0) {
              const latest = list[0];
              setActiveLead((prev) => ({
                ...latest,
                ...prev,
                result: latest.result || {},
                input: latest.input || {},
                onboarding: latest.onboarding || {},
              }));
            }
          })
          .catch(() => {});
      }
    }
  }, [activeLead?.id, activeLead?.user_id, evaluations, role]);

  // Load scoring history
  const selectedLeadEvaluations = useMemo(
    () => evaluationsForSameLead(evaluations, activeLead),
    [evaluations, activeLead]
  );

  useEffect(() => {
    if (!activeLead) {
      setHistory([]);
      return;
    }
    let active = true;
    const evaluationIds = selectedLeadEvaluations.length
      ? selectedLeadEvaluations.map((item) => item.id)
      : [activeLead.id].filter(Boolean);

    Promise.all(evaluationIds.map((id) => getScoringHistoryByEvaluation(id).catch(() => [])))
      .then((groups) => {
        if (!active) return;
        const rows = groups.flat().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        if (rows.length) {
          setHistory(rows);
          return;
        }
        setHistory(selectedLeadEvaluations.map(historyFallbackFromEvaluation).filter(Boolean));
      })
      .catch(() => {
        if (active) setHistory([]);
      });

    return () => {
      active = false;
    };
  }, [activeLead, selectedLeadEvaluations]);

  // Sin registros del padre (p. ej. AdminReportedLeads), la ficha carga los suyos.
  useEffect(() => {
    const uid = activeLead?.user_id || activeLead?.id;
    if (commercialRecords || !uid) return;
    let active = true;
    getCommercialRecords([uid]).then((records) => {
      if (active) setOwnCommercialRecords(records);
    });
    return () => {
      active = false;
    };
  }, [commercialRecords, activeLead?.user_id, activeLead?.id]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const selectedResult = activeLead?.result || {};
  const selectedInput = activeLead?.input || {};
  const selectedOnboarding = activeLead?.onboarding || {};
  const selectedPhone = activeLead?.phone || activeLead?.profile?.phone || "";
  const selectedFinalScore = selectedResult.adjusted_score ?? selectedResult.score;
  const selectedAdjustment = getClassificationAdjustment(selectedResult);
  const selectedMainBlocker = hasObjectData(selectedResult.main_blocker) ? selectedResult.main_blocker : null;
  const selectedProjectFit = hasObjectData(selectedResult.project_fit) ? selectedResult.project_fit : null;
  const selectedPriority = hasObjectData(selectedResult.commercial_priority_detail) ? selectedResult.commercial_priority_detail : null;
  const selectedFinancialIndicators = hasObjectData(selectedResult.financial_indicators) ? selectedResult.financial_indicators : {};
  const selectedCommunes = activeLead ? comunasDeclaradas(activeLead).declaradas : [];
  const selectedProjectGoal = selectedInput.project_goal || null;
  const selectedName = activeLead?.full_name?.split(" ")[0] || "cliente";

  const selectedEmailHref = activeLead?.email
    ? `mailto:${activeLead.email}?subject=${encodeURIComponent("Contacto RutaHogar - Calificación financiera")}&body=${encodeURIComponent(`Hola ${selectedName},\n\nTe escribo a partir de tu calificación en RutaHogar.\n\nSaludos.`)}`
    : "#";

  const selectedWhatsappHref = selectedPhone
    ? `https://wa.me/${selectedPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hola ${selectedName}. Te escribo por RutaHogar.`)}`
    : "";

  const selectedMatch = useMemo(() => {
    if (!activeLead || !selectedProject) return null;
    const { matches, excluidos } = matchLeadToProjects(activeLead, [selectedProject]);
    return matches[0] || excluidos[0] || null;
  }, [activeLead, selectedProject]);

  const selectedProjectMatchesGoal = projectGoalMatchesSelected(selectedProjectGoal, selectedProject);

  const historyTimeline = useMemo(
    () => buildHistoryTimeline(history, selectedProject),
    [history, selectedProject]
  );

  const contactQuestions = useMemo(
    () => buildContactQuestions({ lead: activeLead, selectedProject, selectedMatch }),
    [activeLead, selectedProject, selectedMatch]
  );

  const visibleContactQuestions = showAllContactQuestions ? contactQuestions : contactQuestions.slice(0, 5);

  const copyContactQuestions = async () => {
    const text = contactQuestions.map((item, index) => `${index + 1}. ${item.question}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setQuestionsCopied(true);
      window.setTimeout(() => setQuestionsCopied(false), 1800);
    } catch {
      setQuestionsCopied(false);
    }
  };

  const reloadOwnRecords = useMemo(() => createLeadRecordsReloader(
    (leadId) => getCommercialRecords([leadId]),
    (leadId, records) => setOwnCommercialRecords((current) => ({ ...current, [leadId]: records })),
  ), []);
  const handleStageChanged = onStageChanged || reloadOwnRecords;
  const leadCommercialRecords = commercialRecords || ownCommercialRecords;

  const isAdmin = role === "admin" || role === "admin_inmobiliario" || profile?.role === "admin" || profile?.role === "admin_inmobiliario";

  const handleAdminResolve = async (newStatus, reason) => {
    setResolving(true);
    try {
      const targetId = activeLead.user_id || activeLead.id;
      await resolveLeadStatus(targetId, profile?.id, newStatus, reason);
      const updated = { ...activeLead, reliability_status: newStatus };
      setActiveLead(updated);
      onLeadUpdated?.(updated);
      setAdminAction(null);
      setAdminReason("");
      alert(`Lead actualizado a estado: ${newStatus}`);
    } catch (err) {
      alert("Error al actualizar lead: " + err.message);
    } finally {
      setResolving(false);
    }
  };

  const handleReport = async () => {
    if (executiveScope) {
      try {
        await reportLead(activeLead.user_id || activeLead.id, executiveScope.id, reportReason);
        const updated = { ...activeLead, reliability_status: "en_revision" };
        setActiveLead(updated);
        onLeadUpdated?.(updated);
        setIsReporting(false);
        setReportReason("");
        alert("Lead reportado correctamente. Pasará a estado de revisión.");
      } catch (e) {
        alert("Error al reportar lead: " + e.message);
      }
    }
  };

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-card admin-modal-card--xl executive-lead-detail" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-heading">
            <span className="eyebrow">Ficha comercial {getReliabilityBadgeCard(activeLead.reliability_status || "normal")}</span>
            <h2>{activeLead.full_name || activeLead.email || "Lead sin nombre"}</h2>
            <p>{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Comuna sin dato"} · Evaluado el {formatDate(activeLead.created_at)}</p>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => {
              onClose();
              setIsReporting(false);
              setAdminAction(null);
            }}
          >
            Cerrar ficha
          </button>
        </div>

        {/* Administration Status Controls for Admin */}
        {isAdmin && (
          <section className="admin-surface admin-section-gap" style={{ background: "var(--rh-surface, #ffffff)", border: "1px solid var(--rh-border, #e2e8f0)", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <strong style={{ display: "block", fontSize: "0.95rem" }}>Gestión de confiabilidad del lead (Administrador)</strong>
                <small style={{ color: "var(--rh-text-muted, #64748b)" }}>Estado actual: <strong>{activeLead.reliability_status || "normal"}</strong></small>
              </div>
              {!adminAction && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => { setAdminAction({ status: "normal" }); setAdminReason(""); }}
                    disabled={resolving || activeLead.reliability_status === "normal"}
                  >
                    <i className="ti ti-user-check" /> Marcar Normal
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    style={{ color: "var(--color-warning, #ed6c02)" }}
                    onClick={() => { setAdminAction({ status: "en_revision" }); setAdminReason(""); }}
                    disabled={resolving || activeLead.reliability_status === "en_revision"}
                  >
                    <i className="ti ti-alert-triangle" /> En revisión
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    style={{ color: "var(--color-success, #2e7d32)" }}
                    onClick={() => { setAdminAction({ status: "reactivado" }); setAdminReason(""); }}
                    disabled={resolving || activeLead.reliability_status === "reactivado"}
                  >
                    <i className="ti ti-check" /> Reactivar
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    style={{ color: "var(--color-danger, #d32f2f)" }}
                    onClick={() => { setAdminAction({ status: "silenciado" }); setAdminReason(""); }}
                    disabled={resolving || activeLead.reliability_status === "silenciado"}
                  >
                    <i className="ti ti-volume-off" /> Silenciar
                  </button>
                </div>
              )}
            </div>

            {adminAction && (
              <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <textarea
                  placeholder={`Motivo para cambiar estado a ${adminAction.status} (obligatorio)...`}
                  className="admin-textarea"
                  value={adminReason}
                  onChange={(e) => setAdminReason(e.target.value)}
                  rows={2}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button type="button" className="secondary-button compact-button" onClick={() => setAdminAction(null)}>Cancelar</button>
                  <button
                    type="button"
                    className="primary-button compact-button"
                    disabled={resolving || !adminReason.trim()}
                    onClick={() => handleAdminResolve(adminAction.status, adminReason)}
                  >
                    Confirmar cambio
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Executive Reporting Block */}
        {!isAdmin && isReporting && (
          <section className="admin-surface admin-section-gap" style={{ background: "var(--color-surface-mixed)" }}>
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Reportar lead sospechoso</h2>
                <p>¿Estás seguro de que quieres reportar a este lead por información inconsistente? Su perfil pasará a revisión por un administrador.</p>
              </div>
            </div>
            <textarea
              className="admin-textarea"
              placeholder="Motivo del reporte (obligatorio)"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows="3"
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <div className="admin-action-grid">
              <button type="button" className="secondary-button" onClick={() => setIsReporting(false)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={!reportReason.trim()} onClick={handleReport}>
                Sí, reportar lead
              </button>
            </div>
          </section>
        )}

        <section className={`executive-lead-brief ${selectedResult.executive_summary ? "" : "is-without-summary"}`}>
          <div className="executive-lead-brief__decision">
            <span className="eyebrow">Resultado de la calificación</span>
            <div>
              <strong>{formatScore(selectedFinalScore) ?? "-"}</strong>
              <span className={`status-pill ${getClassificationClass(selectedResult.classification)}`}>
                {selectedResult.classification || "Sin clasificación"}
              </span>
            </div>
            {selectedAdjustment && <small>{selectedAdjustment.message}</small>}
          </div>

          {selectedResult.executive_summary && (
            <div className="executive-lead-brief__summary">
              <span className="eyebrow">Resumen ejecutivo</span>
              <p>{selectedResult.executive_summary}</p>
            </div>
          )}

          <div className="executive-lead-brief__contact">
            <span className="eyebrow">Contacto</span>
            {activeLead.reliability_status === "silenciado" || activeLead.reliability_status === "descartado" || activeLead.reliability_status === "en_revision" ? (
              <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "var(--color-surface-mixed, #f8fafc)", border: "1px solid var(--color-border, #e2e8f0)", color: "var(--color-text-muted, #64748b)", fontSize: "0.88rem" }}>
                <i className="ti ti-volume-off" style={{ marginRight: "0.5rem", color: "var(--color-danger, #d32f2f)" }} />
                <strong>Contacto bloqueado:</strong> Este lead se encuentra {activeLead.reliability_status === "en_revision" ? "en revisión" : "silenciado"} y no puede ser contactado comercialmente a menos que sea reactivado por un administrador.
              </div>
            ) : (
              <div className="admin-action-grid">
                {activeLead.email ? (
                  <a href={selectedEmailHref} className="secondary-button admin-link-button">Enviar correo</a>
                ) : (
                  <button type="button" className="secondary-button admin-link-button" disabled>Correo no disponible</button>
                )}
                {selectedPhone ? (
                  <a href={selectedWhatsappHref} className="primary-button admin-link-button" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
                ) : (
                  <button type="button" className="secondary-button admin-link-button" disabled>WhatsApp no disponible</button>
                )}
                {crm && (
                  <button
                    type="button"
                    className="secondary-button admin-link-button"
                    onClick={() => crm.onSync(activeLead, selectedMatch)}
                    disabled={crm.syncing || activeLead.input?.consentimiento === false}
                    title={activeLead.input?.consentimiento === false ? "El lead no otorgó consentimiento de datos" : "Derivar a CRM Simulado"}
                  >
                    {crm.syncing ? "Sincronizando..." : (crm.leads[activeLead.id] ? "Actualizar en CRM" : "Derivar a CRM Simulado")}
                  </button>
                )}
                {!isAdmin && !isReporting && (activeLead.reliability_status === "normal" || activeLead.reliability_status === "reactivado") && (
                  <button
                    type="button"
                    className="secondary-button admin-link-button"
                    style={{ color: "var(--color-danger, #d32f2f)", borderColor: "var(--color-danger, #d32f2f)", transition: "all 0.2s ease" }}
                    onClick={() => setIsReporting(true)}
                  >
                    <i className="ti ti-alert-triangle" /> Reportar lead
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {selectedAdjustment && selectedAdjustment.detail && (
          <div className="admin-callout executive-lead-detail__adjustment">
            <strong>{selectedAdjustment.detail}</strong>
            {selectedResult.score_adjustment_reason && <p>{selectedResult.score_adjustment_reason}</p>}
          </div>
        )}

        {selectedProject && selectedProjectMatchesGoal && (
          <div className="admin-callout executive-lead-detail__goal-match">
            <strong>Proyecto meta del lead coincide con el proyecto seleccionado</strong>
            <p>{selectedProject.nombre} es la meta declarada por el lead y también el proyecto que estás usando para revisar compatibilidad.</p>
          </div>
        )}

        {selectedProject && selectedMatch && !selectedMatch.motivo_exclusion && (
          <section className="lead-profile-zone lead-profile-verdict">
            <span className="eyebrow">Veredicto frente al proyecto</span>
            <h3>{selectedProject.nombre}</h3>
            <dl className="lead-profile-facts">
              <div><dt>Afinidad</dt><dd>{selectedMatch.afinidad}<small>{selectedMatch.clasificacion}</small></dd></div>
              <div><dt>Capacidad de compra</dt><dd>{selectedMatch.evidencia.capacidad_uf} UF<small>{selectedMatch.evidencia.plazo_anios} años{selectedMatch.evidencia.plazo_origen ? ` · ${selectedMatch.evidencia.plazo_origen}` : ""}{selectedMatch.evidencia.restriccion_vinculante ? ` · limita ${selectedMatch.evidencia.restriccion_vinculante}` : ""}</small></dd></div>
              <div><dt>Pie disponible</dt><dd>{selectedMatch.evidencia.pie_disponible_uf} UF</dd></div>
              <div><dt>Rango del proyecto</dt><dd>{selectedMatch.precio_min_uf}-{selectedMatch.precio_max_uf} UF</dd></div>
            </dl>
            <p className="lead-profile-blocker">
              <strong>Bloqueador para este proyecto: </strong>
              {selectedMatch.bloqueador_principal?.titulo || "Ninguno"}
              {selectedMatch.bloqueador_principal?.brecha_recurso_clp != null ? ` · faltan ${money(selectedMatch.bloqueador_principal.brecha_recurso_clp)} de ${selectedMatch.bloqueador_principal.brecha_recurso_tipo}` : ""}
            </p>
            {!selectedMatch.evidencia.alcanza_precio_min && (
              <p className="lead-profile-warning">No alcanza el precio mínimo del proyecto: aparece por cercanía, no como oportunidad calificada.</p>
            )}
            {selectedMatch.reorientable && (
              <div className="lead-profile-reorientation">
                <strong><i className="ti ti-route" aria-hidden="true" /> Oportunidad reorientable</strong>
                <p>{selectedCommunes.length && !selectedCommunes.includes(selectedProject.comuna) ? `Su capacidad permite evaluar ${selectedProject.nombre} en ${selectedProject.comuna}, aunque esa comuna queda fuera de las alternativas declaradas.` : `Su objetivo declarado no cierra, pero su capacidad permite evaluar ${selectedProject.nombre}.`}</p>
              </div>
            )}
            {selectedMatch.evidencia.desbloqueable_con_fogaes && (
              <p className="lead-profile-note">Se puede desbloquear con FOGAES: con pie asistido de 10% alcanza este proyecto.</p>
            )}
          </section>
        )}

        <section className="executive-lead-snapshot">
          <div className="executive-lead-snapshot__header">
            <div>
              <span className="eyebrow">Ficha ejecutiva</span>
              <h3>Datos clave para priorizar el contacto</h3>
            </div>
            <p>Información del cliente, señales comerciales y diagnóstico financiero ordenados por uso comercial.</p>
          </div>

          <div className="admin-detail-grid executive-lead-detail__matrix">
            <div className="admin-stack">
              <article className="admin-panel-card executive-snapshot-card executive-lead-detail__client">
                <div className="admin-panel-card__header">
                  <span className="executive-snapshot-card__icon"><i className="ti ti-user" aria-hidden="true" /></span>
                  <h3>Información del cliente</h3>
                </div>
                <dl className="admin-definition-list executive-snapshot-list">
                  <DetailRow label="Correo">{activeLead.email || "Sin dato"}</DetailRow>
                  <DetailRow label="Teléfono">{selectedPhone || "Sin dato"}</DetailRow>
                  <DetailRow label="Edad">{selectedInput.edad != null ? `${selectedInput.edad} años` : "Sin dato"}</DetailRow>
                  <DetailRow label="Comuna principal">{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Sin dato"}</DetailRow>
                  {selectedOnboarding.comuna_alternativa && <DetailRow label="Comuna alternativa">{selectedOnboarding.comuna_alternativa}</DetailRow>}
                </dl>
              </article>

              {selectedMainBlocker && (
                <article className="admin-panel-card admin-panel-card--warning executive-snapshot-card executive-lead-detail__blocker">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-alert-triangle" aria-hidden="true" /></span>
                    <h3>Bloqueador principal</h3>
                  </div>
                  <p className="admin-panel-card__body-strong">{selectedMainBlocker.title || selectedMainBlocker.code || "Antecedente a revisar"}</p>
                  {selectedMainBlocker.description && <p>{selectedMainBlocker.description}</p>}
                  <span className="admin-inline-note">Severidad: {translateSeverity(selectedMainBlocker.severity)}</span>
                </article>
              )}

              {selectedResult.positive_indicators?.length > 0 && (
                <article className="admin-panel-card admin-panel-card--success executive-snapshot-card executive-snapshot-card--insight executive-lead-detail__positive">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-circle-check" aria-hidden="true" /></span>
                    <h3>Indicadores positivos</h3>
                  </div>
                  <ul className="admin-bullet-list executive-snapshot-bullets">
                    {selectedResult.positive_indicators.map((item, index) => <li key={index}>{displayItemText(item)}</li>)}
                  </ul>
                </article>
              )}

              {selectedResult.risks?.length > 0 && (
                <article className="admin-panel-card admin-panel-card--danger executive-snapshot-card executive-snapshot-card--insight executive-lead-detail__risks">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-shield-exclamation" aria-hidden="true" /></span>
                    <h3>Riesgos detectados</h3>
                  </div>
                  <ul className="admin-bullet-list executive-snapshot-bullets">
                    {selectedResult.risks.map((item, index) => <li key={index}>{displayItemText(item)}</li>)}
                  </ul>
                </article>
              )}
            </div>

            <div className="admin-stack">
              {selectedProjectFit && (
                <article className="admin-panel-card executive-snapshot-card executive-lead-detail__fit">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-target-arrow" aria-hidden="true" /></span>
                    <h3>Compatibilidad con su objetivo</h3>
                  </div>
                  <dl className="admin-definition-list executive-snapshot-list">
                    <DetailRow label="Clasificación">{selectedProjectFit.classification || selectedProjectFit.status || "Sin dato"}</DetailRow>
                    <DetailRow label="Score">{formatScore(selectedProjectFit.score) ?? "Sin dato"}</DetailRow>
                    <DetailRow label="Brecha de ingreso">{money(selectedProjectFit.income_gap)}</DetailRow>
                    <DetailRow label="Brecha de pie">{money(selectedProjectFit.down_payment_gap)}</DetailRow>
                    <DetailRow label="Compatible">{booleanText(selectedProjectFit.compatible)}</DetailRow>
                  </dl>
                </article>
              )}

              <article className="admin-panel-card executive-snapshot-card executive-lead-detail__signals">
                <div className="admin-panel-card__header">
                  <span className="executive-snapshot-card__icon"><i className="ti ti-briefcase" aria-hidden="true" /></span>
                  <h3>Señales comerciales</h3>
                </div>
                <dl className="admin-definition-list executive-snapshot-list">
                  <DetailRow label="Plazo de compra">{purchaseTermLabel(selectedInput.plazo_compra)}</DetailRow>
                  <DetailRow label="Proyecto visto">{booleanText(selectedInput.tiene_propiedad_vista)}</DetailRow>
                  <DetailRow label="Pie estimado">{formatPercent(selectedFinancialIndicators.pie_ratio)}</DetailRow>
                </dl>
              </article>

              {selectedPriority && (
                <article className="admin-panel-card admin-panel-card--success executive-snapshot-card executive-snapshot-card--priority executive-lead-detail__priority">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-flame" aria-hidden="true" /></span>
                    <h3>Prioridad comercial</h3>
                  </div>
                  <dl className="admin-definition-list executive-snapshot-list">
                    <DetailRow label="Acción">{selectedPriority.action || selectedPriority.level || "Sin dato"}</DetailRow>
                    <DetailRow label="Motivo">{selectedPriority.reason || "Sin motivo registrado"}</DetailRow>
                    <DetailRow label="Derivación sugerida">{booleanText(selectedPriority.send_to_crm)}</DetailRow>
                  </dl>
                </article>
              )}

              {selectedResult.recommendations?.length > 0 && (
                <article className="admin-panel-card executive-snapshot-card executive-lead-detail__recommendations">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-list-check" aria-hidden="true" /></span>
                    <h3>Recomendaciones</h3>
                  </div>
                  <ul className="admin-bullet-list executive-snapshot-bullets">
                    {selectedResult.recommendations.map((item, index) => (
                      <li key={index}>
                        {displayItemText(item)}
                        {displayItemBenefit(item) && <small className="lead-cell-sub">Beneficio esperado: {displayItemBenefit(item)}</small>}
                      </li>
                    ))}
                  </ul>
                </article>
              )}

              {!selectedPriority && selectedResult.commercial_guidance && (
                <article className="admin-panel-card admin-panel-card--soft executive-snapshot-card executive-lead-detail__guidance">
                  <div className="admin-panel-card__header">
                    <span className="executive-snapshot-card__icon"><i className="ti ti-compass" aria-hidden="true" /></span>
                    <h3>Orientación comercial</h3>
                  </div>
                  <p>{selectedResult.commercial_guidance}</p>
                </article>
              )}
            </div>
          </div>
        </section>

        <section className="admin-panel-card executive-contact-questions">
          <div className="admin-panel-card__header executive-contact-questions__header">
            <div>
              <span className="eyebrow">Abordaje comercial</span>
              <h3>Preguntas sugeridas para el contacto</h3>
              <p>Enfocadas en información contextual que no se infiere únicamente desde los datos financieros.</p>
            </div>
            <button type="button" className="secondary-button compact-button" onClick={copyContactQuestions}>
              {questionsCopied ? "Copiado" : "Copiar preguntas"}
            </button>
          </div>

          <div className="executive-contact-questions__grid">
            {visibleContactQuestions.map((item) => (
              <article className="executive-contact-question" key={item.id}>
                <span>{item.category}</span>
                <strong>{item.question}</strong>
                <p>{item.reason}</p>
              </article>
            ))}
          </div>

          {contactQuestions.length > 5 && (
            <button
              type="button"
              className="executive-contact-questions__more"
              onClick={() => setShowAllContactQuestions((current) => !current)}
            >
              {showAllContactQuestions ? "Ver menos preguntas" : `Ver ${contactQuestions.length - 5} más`}
            </button>
          )}
        </section>

        {(activeLead.user_id || activeLead.id) && (
          <CommercialStagePanel
            leadId={activeLead.user_id || activeLead.id}
            records={leadCommercialRecords[activeLead.user_id || activeLead.id]}
            role={role}
            onChanged={handleStageChanged}
          />
        )}

        <section className="admin-panel-card admin-panel-card--soft executive-lead-detail__history">
          <div className="admin-panel-card__header executive-history-header">
            <div>
              <h3>Historial de evolución</h3>
              <p>{selectedProject ? `Capacidad, compatibilidad y afinidad se calculan contra el proyecto seleccionado: ${selectedProject.nombre}.` : "Lectura temporal de cambios financieros. Selecciona un proyecto para ver capacidad, compatibilidad y afinidad frente a ese proyecto."}</p>
            </div>
            {historyTimeline.summary.count > 0 && (
              <span className={`executive-history-trend is-${historyTimeline.summary.trend}`}>
                {historyTimeline.summary.trend === "improving" ? "Mejora" : historyTimeline.summary.trend === "declining" ? "Deterioro" : "Estable"}
              </span>
            )}
          </div>

          {historyTimeline.items.length ? (
            <div className="executive-history-timeline-wrap">
              <div className="executive-history-summary">
                <div><span>Registros</span><strong>{historyTimeline.summary.count}</strong></div>
                <div><span>Variación score</span><strong>{formatSignedNumber(historyTimeline.summary.scoreDelta) || "0"}</strong></div>
                {selectedProject && <div><span>Capacidad vs proyecto seleccionado</span><strong>{formatSignedNumber(historyTimeline.summary.capacityDelta, " UF") || "0 UF"}</strong></div>}
                <div><span>Deuda mensual</span><strong>{formatSignedMoney(historyTimeline.summary.debtDelta) || "Sin cambio"}</strong></div>
              </div>

              <ol className="executive-history-timeline">
                {historyTimeline.items.map(({ row, metrics, changes }, index) => (
                  <li className="executive-history-item" key={row.id}>
                    <div className="executive-history-item__marker" aria-hidden="true"><span>{historyTimeline.items.length - index}</span></div>
                    <article className="executive-history-card">
                      <header className="executive-history-card__head">
                        <div>
                          <span className="eyebrow">{index === 0 ? "Última evaluación" : "Evaluación histórica"}</span>
                          <h4>{formatEventAt(row.created_at)}</h4>
                        </div>
                        <div className="executive-history-card__score">
                          <strong>{formatScore(metrics.score) ?? "-"}</strong>
                          <span className={`status-pill ${getClassificationClass(metrics.classification)}`}>
                            {metrics.classification}
                          </span>
                        </div>
                      </header>

                      {selectedProject && metrics.matchesSelectedGoal && (
                        <div className="executive-history-goal-match">Meta del lead coincide con este proyecto seleccionado.</div>
                      )}

                      <dl className="executive-history-metrics">
                        <div><dt>Ingreso</dt><dd>{metrics.income != null ? money(metrics.income) : "Sin dato"}</dd></div>
                        <div><dt>Deuda</dt><dd>{metrics.debt != null ? money(metrics.debt) : "Sin dato"}</dd></div>
                        <div><dt>Ahorro</dt><dd>{metrics.savings != null ? money(metrics.savings) : "Sin dato"}</dd></div>
                        <div><dt>Laboral</dt><dd>{formatFormValue(metrics.workType, "Sin dato")}</dd></div>
                        {selectedProject && <div><dt>Capacidad vs proyecto seleccionado</dt><dd>{metrics.capacityUf != null ? `${metrics.capacityUf} UF` : "Sin dato"}</dd></div>}
                        {selectedProject && <div><dt>Compatibilidad vs proyecto seleccionado</dt><dd>{metrics.projectCompatibility}</dd></div>}
                        {selectedProject && metrics.projectAffinity != null && <div><dt>Afinidad vs proyecto seleccionado</dt><dd>{metrics.projectAffinity}</dd></div>}
                      </dl>

                      <div className="executive-history-changes">
                        {changes.map((change, changeIndex) => (
                          <span className={`executive-history-change is-${change.tone}`} key={`${row.id}-${changeIndex}`}>
                            {change.label}
                          </span>
                        ))}
                      </div>

                      {row.component_scores && Object.keys(row.component_scores).length > 0 && (
                        <details className="executive-history-components-panel">
                          <summary>Ver componentes del score</summary>
                          <ul className="admin-history-components">
                            {Object.entries(row.component_scores).map(([key, value]) => (
                              <li key={key}>
                                <span>{componentScoreLabel(key)}</span>
                                <strong>{value >= 0 ? `+${value}` : value}</strong>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {row.events?.length > 0 && (
                        <div className="admin-history-events">
                          <strong>Eventos del plan</strong>
                          <ul className="admin-event-list">
                            {row.events.map((event, eventIndex) => (
                              <li key={`${row.id}-${eventIndex}`}>
                                <strong>{eventLabels[event.type] || event.type}</strong>
                                <span>{formatEventAt(event.at)}</span>
                                <p>{renderEventDetail(event)}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p>Sin registros de auditoría para esta calificación.</p>
          )}
        </section>
      </div>
    </div>
  );
}
