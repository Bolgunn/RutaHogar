import React, { useEffect, useMemo, useState } from "react";
import { getScoringHistoryByEvaluation } from "../services/getScoringHistory";
import { getAvailableProjects } from "../services/projectService";
import { buildContactQuestions } from "../lib/commercial/contactQuestions";
import { detectContactOpportunities } from "../lib/matching/contactOpportunities";
import { buildLeadProjectComparison } from "../lib/matching/leadComparison";
import { comunasDeclaradas, matchLeadToProjects } from "../lib/matching/leadProjectMatching";
import { rankLeadsForProject } from "../lib/matching/leadRanking";
import { displayItemBenefit, displayItemText } from "../utils/text";
import NotificationToast from "./NotificationToast";
import { formatFormValue } from "../constants";
import {
  formatScore,
  getClassificationAdjustment,
  getClassificationClass,
  translateSeverity,
} from "../utils/helpers";

const DATE_RANGES = [
  { label: "Cualquier fecha", value: "todos" },
  { label: "Últimas 24 horas", value: "24h" },
  { label: "Última semana", value: "semana" },
  { label: "Último mes", value: "mes" },
];
const AGE_RANGES = [
  { label: "Todas las edades", min: 0, max: Infinity },
  { label: "18 - 25 años", min: 18, max: 25 },
  { label: "25 - 35 años", min: 25, max: 35 },
  { label: "35 - 45 años", min: 35, max: 45 },
  { label: "45 - 55 años", min: 45, max: 55 },
  { label: "55+ años", min: 55, max: Infinity },
];
const DISMISSED_OPPORTUNITIES_KEY = "RutaHogar_dismissed_contact_opportunities";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL");
}

function threshold(range) {
  const hours = { "24h": 24, semana: 24 * 7, mes: 24 * 30 }[range];
  return hours ? new Date(Date.now() - hours * 60 * 60 * 1000) : null;
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

function latestEvaluationPerLead(items = []) {
  const latestByLead = new Map();
  for (const item of items) {
    const key = leadIdentity(item);
    if (!key) continue;
    const current = latestByLead.get(key);
    if (!current || new Date(item.created_at || 0) > new Date(current.created_at || 0)) {
      latestByLead.set(key, item);
    }
  }
  return [...latestByLead.values()];
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

function readDismissedOpportunities(scope) {
  try {
    const stored = JSON.parse(localStorage.getItem(DISMISSED_OPPORTUNITIES_KEY)) || {};
    return new Set(stored[scope] || []);
  } catch {
    return new Set();
  }
}

function writeDismissedOpportunities(scope, ids) {
  try {
    const stored = JSON.parse(localStorage.getItem(DISMISSED_OPPORTUNITIES_KEY)) || {};
    stored[scope] = [...ids];
    localStorage.setItem(DISMISSED_OPPORTUNITIES_KEY, JSON.stringify(stored));
  } catch {
    // El descarte es una ayuda de interfaz; si localStorage falla, no bloquea la bandeja.
  }
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

function compareFlagText(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "Sin comuna declarada";
}

function comparisonCapacityStatus(item) {
  if (item.capacity.exclusion === "capacidad_requiere_antecedentes") return "Requiere antecedentes";
  if (item.capacity.reachesMin) return "Alcanza precio mínimo";
  return "No alcanza precio mínimo";
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
  const leadLike = {
    input,
    result,
    onboarding,
  };
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

export default function DashboardLeads({ evaluations, inmobiliariaId, ejecutivo }) {
  const [classification, setClassification] = useState("Alto");
  const [commune, setCommune] = useState("todas");
  const [age, setAge] = useState(0);
  const [date, setDate] = useState("todos");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState("");
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [sortBy, setSortBy] = useState("afinidad");
  const [showExcluded, setShowExcluded] = useState(false);
  const [showRequiresDocuments, setShowRequiresDocuments] = useState(false);
  const [showOpportunities, setShowOpportunities] = useState(false);
  const [visibleOpportunityCount, setVisibleOpportunityCount] = useState(6);
  const [showAllContactQuestions, setShowAllContactQuestions] = useState(false);
  const [questionsCopied, setQuestionsCopied] = useState(false);
  const [comparisonLeadIds, setComparisonLeadIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [dismissedOpportunities, setDismissedOpportunities] = useState(() => readDismissedOpportunities("global"));
  const [opportunityToastDismissed, setOpportunityToastDismissed] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [history, setHistory] = useState([]);
  const selectedResult = selectedLead?.result || {};
  const selectedInput = selectedLead?.input || {};
  const selectedOnboarding = selectedLead?.onboarding || {};
  const selectedPhone = selectedLead?.phone || selectedLead?.profile?.phone || "";
  const selectedFinalScore = selectedResult.adjusted_score ?? selectedResult.score;
  const selectedAdjustment = getClassificationAdjustment(selectedResult);
  const selectedMainBlocker = hasObjectData(selectedResult.main_blocker) ? selectedResult.main_blocker : null;
  const selectedProjectFit = hasObjectData(selectedResult.project_fit) ? selectedResult.project_fit : null;
  const selectedPriority = hasObjectData(selectedResult.commercial_priority_detail) ? selectedResult.commercial_priority_detail : null;
  const selectedFinancialIndicators = hasObjectData(selectedResult.financial_indicators) ? selectedResult.financial_indicators : {};
  const selectedCommunes = selectedLead ? comunasDeclaradas(selectedLead).declaradas : [];
  const selectedProjectGoal = selectedInput.project_goal || null;
  const selectedName = selectedLead?.full_name?.split(" ")[0] || "cliente";
  const selectedEmailHref = selectedLead
    ? `mailto:${selectedLead.email || ""}?subject=${encodeURIComponent("Contacto RutaHogar - Calificación financiera")}&body=${encodeURIComponent(`Hola ${selectedName},\n\nTe escribo a partir de tu calificación en RutaHogar.\n\nSaludos.`)}`
    : "#";
  const selectedWhatsappHref = selectedPhone
    ? `https://wa.me/${selectedPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hola ${selectedName}. Te escribo por RutaHogar.`)}`
    : "";

  const executiveId = ejecutivo?.id ?? null;
  const executiveEmail = ejecutivo?.email ?? null;
  const executiveScope = useMemo(
    () => executiveId || executiveEmail ? { id: executiveId, email: executiveEmail } : null,
    [executiveId, executiveEmail],
  );
  const dismissedScope = executiveId || executiveEmail || "global";
  const latestEvaluations = useMemo(() => latestEvaluationPerLead(evaluations), [evaluations]);
  const selectedLeadEvaluations = useMemo(
    () => evaluationsForSameLead(evaluations, selectedLead),
    [evaluations, selectedLead],
  );
  const comparisonLeads = useMemo(
    () => comparisonLeadIds.map((id) => latestEvaluations.find((lead) => lead.id === id)).filter(Boolean),
    [comparisonLeadIds, latestEvaluations],
  );

  useEffect(() => {
    let active = true;
    setProjectsLoaded(false);
    setProjectsError("");
    getAvailableProjects({ inmobiliariaId, ejecutivo: executiveScope })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setProjectsError("No se pudo cargar el catálogo de proyectos."); })
      .finally(() => { if (active) setProjectsLoaded(true); });
    return () => { active = false; };
  }, [inmobiliariaId, executiveScope]);

  useEffect(() => {
    if (!selectedLead) { setHistory([]); return; }
    let active = true;
    const evaluationIds = selectedLeadEvaluations.length
      ? selectedLeadEvaluations.map((item) => item.id)
      : [selectedLead.id];
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
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [selectedLead, selectedLeadEvaluations]);

  useEffect(() => {
    setSelectedLead((current) => {
      if (!current) return current;
      const currentKey = leadIdentity(current);
      return latestEvaluations.find((item) => leadIdentity(item) === currentKey) || current;
    });
  }, [latestEvaluations]);

  const communes = useMemo(() => [...new Set(latestEvaluations.flatMap((item) => [
    item.input?.comuna_objetivo || item.onboarding?.comuna_interes,
    item.onboarding?.comuna_alternativa,
  ]).filter(Boolean))].sort(), [latestEvaluations]);
  const counts = useMemo(() => latestEvaluations.reduce((result, item) => {
    if (item.result?.classification in result) result[item.result.classification] += 1;
    return result;
  }, { Alto: 0, Medio: 0, Bajo: 0 }), [latestEvaluations]);
  const selectedProject = useMemo(
    () => projects.find((item) => String(item.id) === projectId) || null,
    [projects, projectId],
  );
  const defaultClassification = selectedProject ? "todos" : "Alto";
  const filtered = useMemo(() => {
    const dateThreshold = threshold(date);
    const ageRange = AGE_RANGES[age];
    const term = search.trim().toLowerCase();
    return latestEvaluations.filter((item) => {
      const mainCommune = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
      if (classification !== "todos" && item.result?.classification !== classification) return false;
      if (commune !== "todas" && mainCommune !== commune && item.onboarding?.comuna_alternativa !== commune) return false;
      if (item.input?.edad != null && (item.input.edad < ageRange.min || item.input.edad >= ageRange.max)) return false;
      if (ageRange.min && item.input?.edad == null) return false;
      if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;
      return !term || `${item.full_name || ""} ${item.email || ""}`.toLowerCase().includes(term);
    });
  }, [latestEvaluations, classification, commune, age, date, search]);
  const { ranked, descartados, requiereAntecedentes } = useMemo(
    () => rankLeadsForProject(filtered, selectedProject, sortBy),
    [filtered, selectedProject, sortBy],
  );
  const contactOpportunities = useMemo(
    () => detectContactOpportunities(evaluations, projects),
    [evaluations, projects],
  );
  const activeOpportunities = useMemo(
    () => contactOpportunities.filter((item) => !dismissedOpportunities.has(item.id)),
    [contactOpportunities, dismissedOpportunities],
  );
  const visibleOpportunities = activeOpportunities.slice(0, visibleOpportunityCount);
  const remainingOpportunities = Math.max(activeOpportunities.length - visibleOpportunityCount, 0);

  useEffect(() => {
    setDismissedOpportunities(readDismissedOpportunities(dismissedScope));
  }, [dismissedScope]);

  useEffect(() => {
    setOpportunityToastDismissed(false);
  }, [activeOpportunities.length]);

  useEffect(() => {
    setShowAllContactQuestions(false);
    setQuestionsCopied(false);
  }, [selectedLead?.id]);

  useEffect(() => {
    setComparisonLeadIds([]);
    setShowComparison(false);
  }, [projectId]);

  const persistDismissedOpportunities = (next) => {
    setDismissedOpportunities(next);
    writeDismissedOpportunities(dismissedScope, next);
  };

  const dismissOpportunity = (id) => {
    const next = new Set(dismissedOpportunities);
    next.add(id);
    persistDismissedOpportunities(next);
  };

  const dismissAllOpportunities = () => {
    persistDismissedOpportunities(new Set(contactOpportunities.map((item) => item.id)));
    setShowOpportunities(false);
  };
  const selectedMatch = useMemo(() => {
    if (!selectedLead || !selectedProject) return null;
    const { matches, excluidos } = matchLeadToProjects(selectedLead, [selectedProject]);
    return matches[0] || excluidos[0] || null;
  }, [selectedLead, selectedProject]);
  const selectedProjectMatchesGoal = projectGoalMatchesSelected(selectedProjectGoal, selectedProject);
  const historyTimeline = useMemo(
    () => buildHistoryTimeline(history, selectedProject),
    [history, selectedProject],
  );
  const contactQuestions = useMemo(
    () => buildContactQuestions({ lead: selectedLead, selectedProject, selectedMatch }),
    [selectedLead, selectedProject, selectedMatch],
  );
  const leadComparison = useMemo(
    () => buildLeadProjectComparison(comparisonLeads, selectedProject),
    [comparisonLeads, selectedProject],
  );
  const visibleContactQuestions = showAllContactQuestions ? contactQuestions : contactQuestions.slice(0, 5);
  const activeFilters = classification !== defaultClassification || commune !== "todas" || age || date !== "todos" || search;
  const clearFilters = () => { setClassification(defaultClassification); setCommune("todas"); setAge(0); setDate("todos"); setSearch(""); };
  const selectProject = (nextId) => {
    setProjectId(nextId);
    setClassification(nextId ? "todos" : "Alto");
    setShowRequiresDocuments(false);
    setShowExcluded(false);
  };
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
  const toggleComparisonLead = (lead) => {
    if (!selectedProject) return;
    setComparisonLeadIds((current) => {
      if (current.includes(lead.id)) return current.filter((id) => id !== lead.id);
      const next = [...current, lead.id].slice(-2);
      if (next.length === 2) setShowComparison(true);
      return next;
    });
  };

  const leadCard = ({ lead, match }) => {
    const isComparisonSelected = comparisonLeadIds.includes(lead.id);
    return (
    <article
      key={lead.id}
      className={`executive-lead-card ${isComparisonSelected ? "is-selected-for-comparison" : ""}`}
      role="button"
      tabIndex="0"
      onClick={() => setSelectedLead(lead)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelectedLead(lead);
        }
      }}
      aria-label={`Ver ficha de ${lead.full_name || lead.email || "lead"}`}
    >
      <div className="executive-lead-card__identity">
        <div>
          <h3>{lead.full_name || lead.email || "Sin nombre"}</h3>
          <p>{lead.email || "Sin correo registrado"}</p>
          {selectedProject && match?.reorientable && (
            <span className="executive-lead-card__reorientable">
              <i className="ti ti-route" aria-hidden="true" />
              Reorientable para este proyecto
            </span>
          )}
        </div>
        <div className="executive-lead-card__status">
          <span className={`status-pill ${getClassificationClass(lead.result?.classification)}`}>{lead.result?.classification || "Sin dato"}</span>
          <small>{formatDate(lead.created_at)}</small>
        </div>
      </div>
      <dl className="executive-lead-card__facts">
        <div><dt>Comuna</dt><dd>{lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Sin dato"}</dd></div>
        {selectedProject ? <>
          <div><dt>Afinidad</dt><dd>{match?.afinidad ?? "-"}<small>{match?.clasificacion || "Sin dato"}</small></dd></div>
          <div><dt>Capacidad</dt><dd>{match?.evidencia?.capacidad_uf ?? "Sin dato"} UF<small>{match?.evidencia?.plazo_anios ? `${match.evidencia.plazo_anios} años` : "Sin dato"}</small></dd></div>
          <div><dt>Pie disponible</dt><dd>{match?.evidencia?.pie_disponible_uf ?? "Sin dato"} UF</dd></div>
          <div className="executive-lead-card__fact--wide"><dt>Bloqueador</dt><dd>{match?.bloqueador_principal?.titulo || "Sin bloqueador"}</dd></div>
        </> : <div className="executive-lead-card__fact--wide"><dt>Riesgos registrados</dt><dd>{lead.result?.risks?.slice(0, 2).map(displayItemText).join(" ") || "Sin riesgos relevantes"}</dd></div>}
      </dl>
      <div className="executive-lead-card__actions">
        {selectedProject && <button type="button" className={`secondary-button compact-button executive-compare-toggle ${isComparisonSelected ? "is-active" : ""}`} onClick={(event) => { event.stopPropagation(); toggleComparisonLead(lead); }}>{isComparisonSelected ? "Seleccionado" : "Comparar"}</button>}
        <span className="executive-lead-card__action">Ver detalle <i className="ti ti-chevron-right" aria-hidden="true" /></span>
      </div>
    </article>
    );
  };

  const opportunityCard = (opportunity, { showDismiss = false } = {}) => {
    const lead = opportunity.lead;
    const phone = lead?.phone || lead?.profile?.phone || "";
    const firstName = lead?.full_name?.split(" ")[0] || "cliente";
    const mailHref = `mailto:${lead?.email || ""}?subject=${encodeURIComponent("Oportunidad RutaHogar detectada")}&body=${encodeURIComponent(`Hola ${firstName},\n\nDetectamos una mejora en tu preparación financiera y queremos revisar alternativas compatibles contigo.\n\nSaludos.`)}`;
    const whatsappHref = phone
      ? `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hola ${firstName}. Detectamos una nueva oportunidad en RutaHogar y me gustaría comentarla contigo.`)}`
      : "";
    const secondaryTriggerLabels = [...new Set(opportunity.triggers.slice(1).map((trigger) => trigger.label))];

    return (
      <article className="executive-opportunity-card" key={opportunity.id}>
        <div className="executive-opportunity-card__main">
          <span className="eyebrow">{opportunity.primary.label}</span>
          <h3>{lead.full_name || lead.email || "Lead sin nombre"}</h3>
          <p>{opportunity.primary.detail}</p>
          <div className="executive-opportunity-card__signals">
            {opportunity.score_delta != null && <span>Score {formatScore(opportunity.previous_score) ?? "-"} a {formatScore(opportunity.latest_score) ?? "-"} ({opportunity.score_delta >= 0 ? "+" : ""}{opportunity.score_delta})</span>}
            {opportunity.primary.project && <span>{opportunity.primary.project.nombre}</span>}
            {opportunity.primary.match?.afinidad != null && <span>Afinidad {opportunity.primary.match.afinidad}</span>}
          </div>
          {secondaryTriggerLabels.length > 0 && (
            <p className="executive-opportunity-card__extra">
              También cumple: {secondaryTriggerLabels.join(", ")}.
            </p>
          )}
        </div>
        <div className="executive-opportunity-card__actions">
          <button type="button" className="secondary-button compact-button" onClick={() => setSelectedLead(lead)}>Ver ficha</button>
          {lead.email ? <a className="secondary-button compact-button" href={mailHref}>Correo</a> : <button type="button" className="secondary-button compact-button" disabled>Sin correo</button>}
          {phone ? <a className="primary-button compact-button" href={whatsappHref} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <button type="button" className="secondary-button compact-button" disabled>Sin WhatsApp</button>}
          {showDismiss && <button type="button" className="secondary-button compact-button" onClick={() => dismissOpportunity(opportunity.id)}>Descartar</button>}
        </div>
      </article>
    );
  };

  return <section className="section-block leads-panel admin-leads-page">
    <NotificationToast
      count={opportunityToastDismissed ? 0 : activeOpportunities.length}
      title={`${activeOpportunities.length} oportunidad${activeOpportunities.length === 1 ? "" : "es"} nueva${activeOpportunities.length === 1 ? "" : "s"}`}
      message="Hay leads con mejoras recientes listos para contactar."
      icon="🚀"
      className="notification-toast--opportunities"
      onClick={() => {
        setShowOpportunities(true);
        setVisibleOpportunityCount(6);
      }}
      onClose={() => setOpportunityToastDismissed(true)}
    />

    <header className="executive-leads-heading">
      <div className="section-heading">
        <span className="eyebrow">Gestión comercial</span>
        <h1>Mesa de oportunidades</h1>
        <p>Prioriza conversaciones con contexto financiero y habitacional.</p>
      </div>
      <div className="executive-leads-heading__note">
        <span>Vista de trabajo</span>
        <strong>{selectedProject ? "Con proyecto seleccionado" : "Prioridad general"}</strong>
      </div>
    </header>

    {projectsError && <p className="leads-hint is-error">{projectsError}</p>}
    {!projectsError && executiveScope && projectsLoaded && !projects.length && <p className="leads-hint">Todavía no tienes proyectos asignados para priorizar leads.</p>}

    {activeOpportunities.length > 0 && <section className="admin-surface executive-opportunities-panel executive-opportunities-panel--hero">
      <button
        type="button"
        className={`executive-opportunities-summary ${showOpportunities ? "is-open" : ""}`}
        onClick={() => {
          setShowOpportunities(true);
          setVisibleOpportunityCount(6);
        }}
        aria-expanded={showOpportunities}
      >
        <span className="executive-opportunities-summary__badge">Oportunidades</span>
        <span className="executive-opportunities-summary__copy">
          <strong>{activeOpportunities.length} oportunidad{activeOpportunities.length === 1 ? "" : "es"} activa{activeOpportunities.length === 1 ? "" : "s"}</strong>
          <small>Leads con una mejora reciente de prioridad, capacidad o afinidad frente a proyectos asignados.</small>
        </span>
        <span className="executive-opportunities-summary__cta">Revisar ahora</span>
      </button>
    </section>}

    <section className="admin-surface admin-section-gap executive-leads-controls">
      <div className="admin-surface__header">
        <div className="admin-surface__title">
          <h2>Encuentra la conversación adecuada</h2>
          <p>Combina una prioridad, territorio o perfil para enfocar la bandeja.</p>
        </div>
        {activeFilters && <button type="button" className="secondary-button compact-button" onClick={clearFilters}>Restablecer vista</button>}
        </div>
        <div className="executive-leads-controls__guide">
          <span>Cómo usar esta bandeja</span>
          <p>Selecciona primero un proyecto. Luego elige si quieres ver antes el mejor encaje o la mayor capacidad de compra; usa los filtros restantes solo para acotar la lista.</p>
        </div>
        <div className="executive-leads-controls__primary">
          <label className="executive-leads-controls__project">Proyecto<select value={projectId} onChange={(event) => selectProject(event.target.value)} disabled={Boolean(executiveScope) && projectsLoaded && !projects.length}><option value="">Sin proyecto: vista general</option>{projects.map((project) => <option key={project.id} value={String(project.id)}>{project.nombre} · {project.comuna} · {project.precio_min_uf}-{project.precio_max_uf} UF</option>)}</select><small>Al elegirlo, calculamos afinidad, capacidad y pie para ese proyecto.</small></label>
          <label className="executive-leads-controls__sort">Orden de la bandeja<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={!selectedProject}><option value="afinidad">Mejor afinidad con el proyecto</option><option value="capacidad">Mayor capacidad de compra</option></select><small>{selectedProject ? "Puedes cambiar el criterio sin perder los filtros aplicados." : "Disponible al seleccionar un proyecto."}</small></label>
        </div>
        <div className="executive-leads-controls__priority">
          <div><span className="eyebrow">Paso 2</span><strong>Prioridad de calificación</strong><p>Selecciona una tarjeta para mostrar solo esa prioridad.</p></div>
          <div className="admin-leads-metric-strip executive-priority-rail" aria-label="Filtrar leads por prioridad">
            {[
              ["todos", "Total", latestEvaluations.length, ""],
              ["Alto", "Alta prioridad", counts.Alto, "admin-leads-metric--high"],
              ["Medio", "Prioridad media", counts.Medio, "admin-leads-metric--medium"],
              ["Bajo", "Prioridad baja", counts.Bajo, "admin-leads-metric--low"],
            ].map(([value, label, count, tone]) => (
              <button type="button" key={value} className={`admin-leads-metric executive-priority-rail__item ${tone} ${classification === value ? "is-active" : ""}`} onClick={() => setClassification(value)} aria-pressed={classification === value}>
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-filters admin-toolbar-filters executive-leads-controls__secondary">
          <label>Buscar por nombre o correo<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej: Camila Retamal" /></label>
          <label>Comuna<select value={commune} onChange={(event) => setCommune(event.target.value)}><option value="todas">Todas las comunas</option>{communes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Edad<select value={age} onChange={(event) => setAge(Number(event.target.value))}>{AGE_RANGES.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select></label>
        <label>Fecha<select value={date} onChange={(event) => setDate(event.target.value)}>{DATE_RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
    </section>

    {selectedProject && <aside className="executive-project-context">
      <div><span className="eyebrow">Proyecto en foco</span><strong>{selectedProject.nombre}</strong><p>{selectedProject.comuna} · {selectedProject.precio_min_uf}-{selectedProject.precio_max_uf} UF</p></div>
      <p>La bandeja muestra afinidad, capacidad y pie para decidir a quién contactar primero.</p>
    </aside>}

    {selectedProject && comparisonLeadIds.length > 0 && (
      <aside className="executive-comparison-bar">
        <div>
          <span className="eyebrow">Comparación de leads</span>
          <strong>{comparisonLeadIds.length}/2 seleccionados</strong>
          <p>{comparisonLeads.map((lead) => lead.full_name || lead.email || "Lead sin nombre").join(" vs ")}</p>
        </div>
        <div className="executive-comparison-bar__actions">
          <button type="button" className="primary-button compact-button" disabled={comparisonLeadIds.length !== 2} onClick={() => setShowComparison(true)}>Comparar</button>
          <button type="button" className="secondary-button compact-button" onClick={() => { setComparisonLeadIds([]); setShowComparison(false); }}>Limpiar</button>
        </div>
      </aside>
    )}

    {showOpportunities && (
      <div className="admin-modal executive-opportunities-modal" onClick={() => setShowOpportunities(false)}>
        <div className="admin-modal-card admin-modal-card--xl executive-opportunities-modal__card" onClick={(event) => event.stopPropagation()}>
          <div className="admin-modal-header executive-opportunities-modal__header">
            <div className="admin-modal-heading">
              <span className="eyebrow">HU14 · E2</span>
              <h2>Oportunidades de contacto</h2>
              <p>Revisa mejoras recientes y decide si contactar, ver ficha o descartar.</p>
            </div>
            <div className="executive-opportunities-modal__actions">
              {activeOpportunities.length > 0 && <button type="button" className="secondary-button compact-button" onClick={dismissAllOpportunities}>Descartar todas</button>}
              <button type="button" className="secondary-button compact-button" onClick={() => setShowOpportunities(false)}>Cerrar</button>
            </div>
          </div>

          {activeOpportunities.length ? (
            <div className="executive-opportunities-list executive-opportunities-list--carousel">
              <div className="executive-opportunities-list__head">
                <strong>Mostrando {visibleOpportunities.length} de {activeOpportunities.length}</strong>
                <span>Las oportunidades superiores combinan mejora reciente, compatibilidad y señales comerciales.</span>
              </div>
              {visibleOpportunities.map((opportunity) => (
                <div className="executive-opportunity-slide" key={opportunity.id}>
                  {opportunityCard(opportunity, { showDismiss: true })}
                </div>
              ))}
              {remainingOpportunities > 0 && (
                <button type="button" className="secondary-button executive-opportunities-more" onClick={() => setVisibleOpportunityCount((current) => current + 6)}>
                  Ver {Math.min(6, remainingOpportunities)} más
                </button>
              )}
            </div>
          ) : (
            <div className="executive-leads-empty">
              <strong>No hay oportunidades activas.</strong>
              <span>Las oportunidades descartadas no volverán a mostrarse salvo que el lead tenga una nueva evaluación.</span>
            </div>
          )}
        </div>
      </div>
    )}

    {showComparison && selectedProject && leadComparison.length === 2 && (
      <div className="admin-modal executive-comparison-modal" onClick={() => setShowComparison(false)}>
        <div className="admin-modal-card admin-modal-card--xl executive-comparison-modal__card" onClick={(event) => event.stopPropagation()}>
          <div className="admin-modal-header executive-comparison-modal__header">
            <div className="admin-modal-heading">
              <span className="eyebrow">Comparación para proyecto</span>
              <h2>{selectedProject.nombre}</h2>
              <p>Resumen acotado de score, capacidad, afinidad y factores clave para decidir a quién contactar primero.</p>
            </div>
            <button type="button" className="secondary-button compact-button" onClick={() => setShowComparison(false)}>Cerrar</button>
          </div>

          <div className="executive-comparison-grid">
            {leadComparison.map((item) => (
              <article className="executive-comparison-card" key={item.lead.id}>
                <header>
                  <div>
                    <span className="eyebrow">Lead</span>
                    <h3>{item.name}</h3>
                  </div>
                  <span className={`status-pill ${getClassificationClass(item.classification)}`}>{item.classification}</span>
                </header>

                <div className="executive-comparison-kpis">
                  <div><span>Score</span><strong>{formatScore(item.score) ?? "-"}</strong></div>
                  <div><span>Capacidad</span><strong>{item.capacity.valueUf != null ? `${item.capacity.valueUf} UF` : "Sin dato"}</strong><small>{comparisonCapacityStatus(item)}</small></div>
                  <div><span>Afinidad</span><strong>{item.affinity.value != null ? item.affinity.value : "-"}</strong><small>{item.affinity.classification || "Sin dato"}</small></div>
                </div>

                <dl className="executive-comparison-signals">
                  <div><dt>Comuna del proyecto declarada</dt><dd>{compareFlagText(item.affinity.communeDeclared)}</dd></div>
                  <div><dt>Tipo de vivienda coincide</dt><dd>{compareFlagText(item.affinity.typeMatches)}</dd></div>
                  <div><dt>Bloqueador principal</dt><dd>{item.capacity.blocker || item.capacity.exclusion || "Sin bloqueador"}</dd></div>
                </dl>

                <div className="executive-comparison-factors">
                  <section>
                    <h4>Favorece</h4>
                    <ul>{(item.factors.positive.length ? item.factors.positive : ["Sin factores favorables destacados."]).map((factor, index) => <li key={`positive-${index}`}>{factor}</li>)}</ul>
                  </section>
                  <section>
                    <h4>Dificulta</h4>
                    <ul>{(item.factors.difficult.length ? item.factors.difficult : ["Sin dificultades destacadas."]).map((factor, index) => <li key={`difficult-${index}`}>{factor}</li>)}</ul>
                  </section>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    )}

    <section className="admin-surface executive-leads-inbox">
      <div className="admin-surface__header">
        <div className="admin-surface__title">
          <span className="eyebrow">Bandeja activa</span>
          <h2>{selectedProject ? "Leads con mejor encaje" : "Leads para revisar"}</h2>
          <p>{selectedProject ? `${ranked.length} de ${filtered.length} alcanzan ${selectedProject.nombre}.` : `${ranked.length} resultado${ranked.length === 1 ? "" : "s"} según la prioridad y los filtros aplicados.`}</p>
        </div>
        <span className="executive-leads-inbox__cue">Selecciona un lead para ver su ficha</span>
      </div>
      <div className="executive-leads-list executive-leads-list--scroll" aria-label="Bandeja de leads">{ranked.map(leadCard)}{!ranked.length && <div className="executive-leads-empty"><strong>No hay leads en esta vista.</strong><span>Ajusta los filtros o restablece la vista para recuperar resultados.</span></div>}</div>
    </section>

    {selectedProject && requiereAntecedentes.length > 0 && <section className="leads-group admin-surface executive-leads-followup"><div className="admin-surface__header"><div className="admin-surface__title"><span className="eyebrow">Seguimiento</span><h2>Requieren antecedentes ({requiereAntecedentes.length})</h2><p>Necesitan una calificación vigente para calcular su capacidad antes de priorizarlos.</p></div><button type="button" className="secondary-button compact-button" onClick={() => setShowRequiresDocuments((current) => !current)}>{showRequiresDocuments ? "Ocultar lista" : "Ver lista"}</button></div>{showRequiresDocuments && <div className="executive-leads-list executive-leads-list--scroll">{requiereAntecedentes.map(leadCard)}</div>}</section>}
    {selectedProject && descartados.length > 0 && <section className="leads-group admin-surface executive-leads-excluded"><div className="admin-surface__header"><div className="admin-surface__title"><span className="eyebrow">Sin encaje actual</span><h2>Leads descartados ({descartados.length})</h2><p>Conserva esta lista para reorientar oportunidades cuando cambie el proyecto o el perfil.</p></div><button type="button" className="secondary-button compact-button" onClick={() => setShowExcluded((current) => !current)}>{showExcluded ? "Ocultar lista" : "Ver lista"}</button></div>{showExcluded && <div className="executive-leads-list">{descartados.map(({ lead, match }) => <React.Fragment key={lead.id}>{leadCard({ lead, match })}<p className="lead-descartado-motivo">Motivo: {match.motivo_exclusion}</p></React.Fragment>)}</div>}</section>}
    {selectedLead && (
      <div className="admin-modal" onClick={() => setSelectedLead(null)}>
        <div className="admin-modal-card admin-modal-card--xl executive-lead-detail" onClick={(event) => event.stopPropagation()}>
          <div className="admin-modal-header">
            <div className="admin-modal-heading">
              <span className="eyebrow">Ficha comercial</span>
              <h2>{selectedLead.full_name || selectedLead.email || "Lead sin nombre"}</h2>
              <p>{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Comuna sin dato"} · Evaluado el {formatDate(selectedLead.created_at)}</p>
            </div>
            <button type="button" className="secondary-button compact-button" onClick={() => setSelectedLead(null)}>Cerrar ficha</button>
          </div>

          <section className={`executive-lead-brief ${selectedResult.executive_summary ? "" : "is-without-summary"}`}>
            <div className="executive-lead-brief__decision">
              <span className="eyebrow">Resultado de la calificación</span>
              <div>
                <strong>{formatScore(selectedFinalScore) ?? "-"}</strong>
                <span className={`status-pill ${getClassificationClass(selectedResult.classification)}`}>{selectedResult.classification || "Sin clasificación"}</span>
              </div>
              {selectedAdjustment && <small>{selectedAdjustment.message}</small>}
            </div>

            {selectedResult.executive_summary && <div className="executive-lead-brief__summary"><span className="eyebrow">Resumen ejecutivo</span><p>{selectedResult.executive_summary}</p></div>}

            <div className="executive-lead-brief__contact">
              <span className="eyebrow">Contacto</span>
              <div className="admin-action-grid">
                {selectedLead.email ? <a href={selectedEmailHref} className="secondary-button admin-link-button">Enviar correo</a> : <button type="button" className="secondary-button admin-link-button" disabled>Correo no disponible</button>}
                {selectedPhone ? <a href={selectedWhatsappHref} className="primary-button admin-link-button" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a> : <button type="button" className="secondary-button admin-link-button" disabled>WhatsApp no disponible</button>}
              </div>
            </div>
          </section>

          {selectedAdjustment && selectedAdjustment.detail && <div className="admin-callout executive-lead-detail__adjustment"><strong>{selectedAdjustment.detail}</strong>{selectedResult.score_adjustment_reason && <p>{selectedResult.score_adjustment_reason}</p>}</div>}

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
              <p className="lead-profile-blocker"><strong>Bloqueador para este proyecto: </strong>{selectedMatch.bloqueador_principal?.titulo || "Ninguno"}{selectedMatch.bloqueador_principal?.brecha_recurso_clp != null ? ` · faltan ${money(selectedMatch.bloqueador_principal.brecha_recurso_clp)} de ${selectedMatch.bloqueador_principal.brecha_recurso_tipo}` : ""}</p>
              {!selectedMatch.evidencia.alcanza_precio_min && <p className="lead-profile-warning">No alcanza el precio mínimo del proyecto: aparece por cercanía, no como oportunidad calificada.</p>}
              {selectedMatch.reorientable && <div className="lead-profile-reorientation"><strong><i className="ti ti-route" aria-hidden="true" /> Oportunidad reorientable</strong><p>{selectedCommunes.length && !selectedCommunes.includes(selectedProject.comuna) ? `Su capacidad permite evaluar ${selectedProject.nombre} en ${selectedProject.comuna}, aunque esa comuna queda fuera de las alternativas declaradas.` : `Su objetivo declarado no cierra, pero su capacidad permite evaluar ${selectedProject.nombre}.`}</p></div>}
              {selectedMatch.evidencia.desbloqueable_con_fogaes && <p className="lead-profile-note">Se puede desbloquear con FOGAES: con pie asistido de 10% alcanza este proyecto.</p>}
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
                <div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-user" aria-hidden="true" /></span><h3>Información del cliente</h3></div>
                <dl className="admin-definition-list executive-snapshot-list">
                  <DetailRow label="Correo">{selectedLead.email || "Sin dato"}</DetailRow>
                  <DetailRow label="Teléfono">{selectedPhone || "Sin dato"}</DetailRow>
                  <DetailRow label="Edad">{selectedInput.edad != null ? `${selectedInput.edad} años` : "Sin dato"}</DetailRow>
                  <DetailRow label="Comuna principal">{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Sin dato"}</DetailRow>
                  {selectedOnboarding.comuna_alternativa && <DetailRow label="Comuna alternativa">{selectedOnboarding.comuna_alternativa}</DetailRow>}
                </dl>
              </article>

              {selectedMainBlocker && <article className="admin-panel-card admin-panel-card--warning executive-snapshot-card executive-lead-detail__blocker"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-alert-triangle" aria-hidden="true" /></span><h3>Bloqueador principal</h3></div><p className="admin-panel-card__body-strong">{selectedMainBlocker.title || selectedMainBlocker.code || "Antecedente a revisar"}</p>{selectedMainBlocker.description && <p>{selectedMainBlocker.description}</p>}<span className="admin-inline-note">Severidad: {translateSeverity(selectedMainBlocker.severity)}</span></article>}

              {selectedResult.positive_indicators?.length > 0 && <article className="admin-panel-card admin-panel-card--success executive-snapshot-card executive-snapshot-card--insight executive-lead-detail__positive"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-circle-check" aria-hidden="true" /></span><h3>Indicadores positivos</h3></div><ul className="admin-bullet-list executive-snapshot-bullets">{selectedResult.positive_indicators.map((item, index) => <li key={index}>{displayItemText(item)}</li>)}</ul></article>}
              {selectedResult.risks?.length > 0 && <article className="admin-panel-card admin-panel-card--danger executive-snapshot-card executive-snapshot-card--insight executive-lead-detail__risks"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-shield-exclamation" aria-hidden="true" /></span><h3>Riesgos detectados</h3></div><ul className="admin-bullet-list executive-snapshot-bullets">{selectedResult.risks.map((item, index) => <li key={index}>{displayItemText(item)}</li>)}</ul></article>}
            </div>

            <div className="admin-stack">
              {selectedProjectFit && <article className="admin-panel-card executive-snapshot-card executive-lead-detail__fit"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-target-arrow" aria-hidden="true" /></span><h3>Compatibilidad con su objetivo</h3></div><dl className="admin-definition-list executive-snapshot-list"><DetailRow label="Clasificación">{selectedProjectFit.classification || selectedProjectFit.status || "Sin dato"}</DetailRow><DetailRow label="Score">{formatScore(selectedProjectFit.score) ?? "Sin dato"}</DetailRow><DetailRow label="Brecha de ingreso">{money(selectedProjectFit.income_gap)}</DetailRow><DetailRow label="Brecha de pie">{money(selectedProjectFit.down_payment_gap)}</DetailRow><DetailRow label="Compatible">{booleanText(selectedProjectFit.compatible)}</DetailRow></dl></article>}

              <article className="admin-panel-card executive-snapshot-card executive-lead-detail__signals">
                <div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-briefcase" aria-hidden="true" /></span><h3>Señales comerciales</h3></div>
                <dl className="admin-definition-list executive-snapshot-list"><DetailRow label="Plazo de compra">{purchaseTermLabel(selectedInput.plazo_compra)}</DetailRow><DetailRow label="Proyecto visto">{booleanText(selectedInput.tiene_propiedad_vista)}</DetailRow><DetailRow label="Pie estimado">{formatPercent(selectedFinancialIndicators.pie_ratio)}</DetailRow></dl>
              </article>

              {selectedPriority && <article className="admin-panel-card admin-panel-card--success executive-snapshot-card executive-snapshot-card--priority executive-lead-detail__priority"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-flame" aria-hidden="true" /></span><h3>Prioridad comercial</h3></div><dl className="admin-definition-list executive-snapshot-list"><DetailRow label="Acción">{selectedPriority.action || selectedPriority.level || "Sin dato"}</DetailRow><DetailRow label="Motivo">{selectedPriority.reason || "Sin motivo registrado"}</DetailRow><DetailRow label="Derivación sugerida">{booleanText(selectedPriority.send_to_crm)}</DetailRow></dl></article>}

              {selectedResult.recommendations?.length > 0 && <article className="admin-panel-card executive-snapshot-card executive-lead-detail__recommendations"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-list-check" aria-hidden="true" /></span><h3>Recomendaciones</h3></div><ul className="admin-bullet-list executive-snapshot-bullets">{selectedResult.recommendations.map((item, index) => <li key={index}>{displayItemText(item)}{displayItemBenefit(item) && <small className="lead-cell-sub">Beneficio esperado: {displayItemBenefit(item)}</small>}</li>)}</ul></article>}

              {!selectedPriority && selectedResult.commercial_guidance && <article className="admin-panel-card admin-panel-card--soft executive-snapshot-card executive-lead-detail__guidance"><div className="admin-panel-card__header"><span className="executive-snapshot-card__icon"><i className="ti ti-compass" aria-hidden="true" /></span><h3>Orientación comercial</h3></div><p>{selectedResult.commercial_guidance}</p></article>}

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
              <button type="button" className="secondary-button compact-button" onClick={copyContactQuestions}>{questionsCopied ? "Copiado" : "Copiar preguntas"}</button>
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
              <button type="button" className="executive-contact-questions__more" onClick={() => setShowAllContactQuestions((current) => !current)}>
                {showAllContactQuestions ? "Ver menos preguntas" : `Ver ${contactQuestions.length - 5} más`}
              </button>
            )}
          </section>

          <section className="admin-panel-card admin-panel-card--soft executive-lead-detail__history">
            <div className="admin-panel-card__header executive-history-header">
              <div>
                <h3>Historial de evolución</h3>
                <p>{selectedProject ? `Capacidad, compatibilidad y afinidad se calculan contra el proyecto seleccionado: ${selectedProject.nombre}.` : "Lectura temporal de cambios financieros. Selecciona un proyecto para ver capacidad, compatibilidad y afinidad frente a ese proyecto."}</p>
              </div>
              {historyTimeline.summary.count > 0 && <span className={`executive-history-trend is-${historyTimeline.summary.trend}`}>{historyTimeline.summary.trend === "improving" ? "Mejora" : historyTimeline.summary.trend === "declining" ? "Deterioro" : "Estable"}</span>}
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
                          <div className="executive-history-card__score"><strong>{formatScore(metrics.score) ?? "-"}</strong><span className={`status-pill ${getClassificationClass(metrics.classification)}`}>{metrics.classification}</span></div>
                        </header>

                        {selectedProject && metrics.matchesSelectedGoal && <div className="executive-history-goal-match">Meta del lead coincide con este proyecto seleccionado.</div>}

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
                          {changes.map((change, changeIndex) => <span className={`executive-history-change is-${change.tone}`} key={`${row.id}-${changeIndex}`}>{change.label}</span>)}
                        </div>

                        {row.component_scores && Object.keys(row.component_scores).length > 0 && (
                          <details className="executive-history-components-panel">
                            <summary>Ver componentes del score</summary>
                            <ul className="admin-history-components">{Object.entries(row.component_scores).map(([key, value]) => <li key={key}><span>{componentScoreLabel(key)}</span><strong>{value >= 0 ? `+${value}` : value}</strong></li>)}</ul>
                          </details>
                        )}

                        {row.events?.length > 0 && <div className="admin-history-events"><strong>Eventos del plan</strong><ul className="admin-event-list">{row.events.map((event, eventIndex) => <li key={`${row.id}-${eventIndex}`}><strong>{eventLabels[event.type] || event.type}</strong><span>{formatEventAt(event.at)}</span><p>{renderEventDetail(event)}</p></li>)}</ul></div>}
                      </article>
                    </li>
                  ))}
                </ol>
              </div>
            ) : <p>Sin registros de auditoría para esta calificación.</p>}
          </section>
        </div>
      </div>
    )}
  </section>;
}
