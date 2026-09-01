import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAccessibleAlternatives,
  buildComparisonInsights,
  buildSimulationContext,
  evaluateScenario,
  getMaxValueRange,
  getScenarioFromManualValue,
} from "../lib/simulation/compatibility";
import {
  catalogProjectsToSimulation,
  formatDeliveryMonth,
  formatProjectPrice,
} from "../lib/simulation/projectAdapter";
import { getAvailableProjects } from "../services/projectService";
import { CLP_FORMATTER } from "../services/financialTracking";
import { plazoLabels, propertyLabels } from "../constants";

const TARGET_PROJECT_KEY = "rutahogar_simulation_target_project";

const statusClass = {
  Compatible: "compatible",
  Cercano: "near",
  "Requiere ajuste": "adjust",
};

const objetivoLabels = {
  comprar_ahora: "Comprar ahora",
  prepararme: "Prepararme para comprar más adelante",
  evaluar_capacidad: "Evaluar mi capacidad de compra",
  conocer_propiedad: "Conocer qué tipo de propiedad podría buscar",
};

function formatClp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return CLP_FORMATTER.format(Math.round(number / 1000) * 1000);
}

function formatUf(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0 UF";
  return `${Math.round(number).toLocaleString("es-CL")} UF`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(number * 100)}%`;
}

function formatUfClp(uf, clp) {
  return `${formatUf(uf)} · ${formatClp(clp)}`;
}

function getGapLabel(gap) {
  const labels = {
    ingreso: "Ingreso",
    pie: "Pie",
    deuda: "Deuda",
    "plazo/dividendo": "Plazo/dividendo",
    "valor objetivo": "Valor objetivo",
  };
  return labels[gap] || "Sin brecha crítica";
}

function getProjectLabel(project) {
  if (!project) return "Valor manual";
  return `${project.nombre} · ${project.comuna} · ${formatProjectPrice(project)}`;
}

function projectToComparable(project, context, ufValueClp) {
  if (!project) return null;
  const scenario = {
    id: project.id,
    source: "project",
    label: project.nombre,
    comuna: project.comuna,
    tipo_vivienda: project.tipo_vivienda,
    valueUf: Number(project.valor_uf) || 0,
    valueClp: Number(project.valor_clp) || Math.round((Number(project.valor_uf) || 0) * ufValueClp),
    project,
  };
  return evaluateScenario(context, scenario);
}

function getScenarioName(result) {
  return result?.scenario?.label || result?.project?.nombre || "Sin escenario";
}

function getScenarioChartName(result) {
  const name = getScenarioName(result);
  if (/referencial$/i.test(name.trim())) return name;
  if (result?.project || result?.scenario?.source === "project") return `${name} Referencial`;
  return name;
}

function getScenarioPlace(result) {
  return result?.scenario?.comuna || result?.project?.comuna || "Sin comuna";
}

function getScenarioType(result) {
  const rawType = result?.scenario?.tipo_vivienda || result?.project?.tipo_vivienda;
  return propertyLabels[rawType] || rawType || "Sin tipo";
}

function ProjectImagePlaceholder({ result, compact = false }) {
  const name = getScenarioName(result);
  const commune = getScenarioPlace(result);
  const type = getScenarioType(result);
  return (
    <div className={`project-image-placeholder ${compact ? "is-compact" : ""}`} aria-label={`Espacio para imagen de ${name}`}>
      <span>{type}</span>
      <strong>{commune}</strong>
      <small>Imagen referencial pendiente</small>
    </div>
  );
}

function formatMetricValue(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return unit ? `0 ${unit}` : "0";
  if (unit === "UF") return `${Math.round(number).toLocaleString("es-CL")} UF`;
  return Math.round(number).toLocaleString("es-CL");
}

function getMetricDeltaMeta(metric) {
  const delta = Number(metric.alternative) - Number(metric.current);
  const hasDelta = Number.isFinite(delta);
  const isNeutral = !hasDelta || Math.abs(delta) < 0.5;
  const improves = metric.lowerIsBetter ? delta < 0 : delta > 0;
  const tone = isNeutral ? "neutral" : improves ? "good" : "bad";

  if (metric.currentLabel || metric.alternativeLabel) {
    return {
      tone,
      value: `${metric.currentLabel || metric.current} -> ${metric.alternativeLabel || metric.alternative}`,
      caption: isNeutral ? "Sin cambio" : improves ? "Mejora" : "Empeora",
    };
  }

  const displayDelta = isNeutral ? 0 : delta;
  const sign = displayDelta > 0 ? "+" : "";
  return {
    tone,
    value: `${sign}${formatMetricValue(displayDelta, metric.unit)}`,
    caption: isNeutral ? "Sin cambio" : improves ? "Mejora" : "Empeora",
  };
}

function buildScenarioChecks(result) {
  if (!result) return [];
  const hasBaseData = Number(result.income) > 0 && Number(result.valueClp) > 0;
  const hasDeclaredDividend = Number(result.dividend) > 0;
  return [
    {
      label: "Pie mínimo",
      value: result.gapMinimo > 0 ? `Brecha ${formatUf(result.gapMinimoUf)}` : "Cubierto",
      state: result.gapMinimo > 0 ? "review" : "ok",
    },
    {
      label: "Pie recomendado",
      value: result.gapRecomendado > 0 ? `Brecha ${formatUf(result.gapRecomendadoUf)}` : "Cubierto",
      state: result.gapRecomendado > 0 ? "review" : "ok",
    },
    {
      label: "Deuda mensual",
      value: formatPercent(result.debtRatio),
      state: result.debtRatio > 0.4 ? "review" : "ok",
    },
    {
      label: "Dividendo",
      value: hasDeclaredDividend ? formatClp(result.dividend) : "No declarado",
      state: hasDeclaredDividend ? (result.dividend > result.prudentDividend ? "review" : "ok") : "neutral",
    },
    {
      label: "Datos base",
      value: hasBaseData ? "Completos" : "Incompletos",
      state: hasBaseData ? "ok" : "review",
    },
  ];
}

function AdvantageList({ title, items }) {
  return (
    <article>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function AlternativesCarousel({ children }) {
  const stripRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = stripRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
      observer.disconnect();
    };
  }, []);

  const scrollByPage = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 280) * direction;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className={`simulation-carousel ${canPrev ? "has-prev" : ""} ${canNext ? "has-next" : ""}`}>
      <button
        type="button"
        className="simulation-carousel-arrow is-left"
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label="Anterior"
      >
        <i className="ti ti-chevron-left" aria-hidden="true" />
      </button>
      <div className="simulation-carousel-strip" ref={stripRef}>
        {children}
      </div>
      <button
        type="button"
        className="simulation-carousel-arrow is-right"
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label="Siguiente"
      >
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}

function ComparisonQuickRead({ insights }) {
  const usefulAlternative = (insights.advantages?.alternative || []).find((item) => !item.startsWith("No presenta"));
  const usefulCurrent = (insights.advantages?.current || []).find((item) => !item.startsWith("No presenta"));
  const usefulTradeoff = (insights.considerations || []).find((item) => !item.startsWith("No se detecta"));
  const items = [
    usefulAlternative ? `Alternativa: ${usefulAlternative}` : null,
    usefulCurrent ? `Actual: ${usefulCurrent}` : null,
    usefulTradeoff ? `Tradeoff: ${usefulTradeoff}` : "No hay una diferencia dominante entre ambos escenarios.",
  ].filter(Boolean).slice(0, 3);

  return (
    <div className="comparison-quick-read">
      <div>
        <span className="eyebrow">LECTURA RÁPIDA</span>
        <strong>{insights.title}</strong>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function getMetricVisualPosition(metric, key) {
  const value = Number(metric[key]);
  const current = Number(metric.current);
  const alternative = Number(metric.alternative);
  const maxScale = Number(metric.max) || Math.max(current, alternative, 1);
  if (!Number.isFinite(value) || !Number.isFinite(current) || !Number.isFinite(alternative)) return 50;

  if (metric.id === "compatibilidad" || metric.id === "preferencias") {
    return Math.max(8, Math.min(96, (value / Math.max(maxScale, 1)) * 88 + 8));
  }

  const min = Math.min(current, alternative);
  const max = Math.max(current, alternative);
  if (Math.abs(max - min) < 0.5) {
    if (metric.id === "brecha-pie" && max <= 0) return 96;
    return 52;
  }

  const normalized = metric.lowerIsBetter ? (max - value) / (max - min) : (value - min) / (max - min);
  return 8 + Math.max(0, Math.min(1, normalized)) * 88;
}

function getMetricGuide(metric) {
  if (metric.id === "compatibilidad") return "Mejor estado conviene";
  if (metric.id === "preferencias") return "Más coincidencias conviene";
  return metric.lowerIsBetter ? "Menor conviene" : "Mayor conviene";
}

function getMetricShortDelta(metric) {
  const current = Number(metric.current);
  const alternative = Number(metric.alternative);
  const delta = alternative - current;

  if (metric.id === "compatibilidad") {
    return metric.currentLabel === metric.alternativeLabel ? "Mismo estado" : "Cambia estado";
  }
  if (metric.id === "preferencias") {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return "Mismas preferencias";
    const value = Math.round(delta);
    const suffix = Math.abs(value) === 1 ? "coincidencia" : "coincidencias";
    return `${value > 0 ? "+" : ""}${value} ${suffix}`;
  }
  if (metric.id === "brecha-pie" && current <= 0 && alternative <= 0) return "Sin brecha";
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return "Sin diferencia";
  return `${delta > 0 ? "+" : ""}${formatMetricValue(delta, metric.unit)}`;
}

function getMetricResultMeta(metric) {
  const current = Number(metric.current);
  const alternative = Number(metric.alternative);
  if (!Number.isFinite(current) || !Number.isFinite(alternative) || Math.abs(alternative - current) < 0.5) {
    return { label: "Similar", tone: "neutral" };
  }
  const alternativeWins = metric.lowerIsBetter ? alternative < current : alternative > current;
  return alternativeWins
    ? { label: "Gana alternativa", tone: "alternative" }
    : { label: "Gana actual", tone: "current" };
}

function ComparisonMetricValue({ tone, label, value, metric }) {
  return (
    <span className={`comparison-dumbbell-value ${tone}`}>
      <i className={tone} />
      <small>{label}</small>
      <b className={metric.id === "compatibilidad" ? "status-metric-value" : ""}>{value}</b>
    </span>
  );
}

function ComparisonDumbbell({ metrics, currentName, alternativeName }) {
  return (
    <div className="comparison-dumbbell-card" aria-label="Gráfico comparativo de indicadores">
      <div className="comparison-dumbbell-legend">
        <span><i className="current" />{currentName}</span>
        <span><i className="alternative" />{alternativeName}</span>
        <small>Más a la derecha = mejor condición referencial.</small>
      </div>
      {metrics.map((metric) => {
        const currentPosition = getMetricVisualPosition(metric, "current");
        const alternativePosition = getMetricVisualPosition(metric, "alternative");
        const start = Math.min(currentPosition, alternativePosition);
        const width = Math.abs(currentPosition - alternativePosition);
        const deltaMeta = getMetricDeltaMeta(metric);
        const resultMeta = getMetricResultMeta(metric);
        const deltaLabel = getMetricShortDelta(metric);
        const currentValue = metric.currentLabel || formatMetricValue(metric.current, metric.unit);
        const alternativeValue = metric.alternativeLabel || formatMetricValue(metric.alternative, metric.unit);

        return (
          <article className="comparison-dumbbell-row" key={metric.id}>
            <div className="comparison-dumbbell-meta">
              <strong>{metric.label}</strong>
              <span>{getMetricGuide(metric)}</span>
            </div>

            <div className="comparison-dumbbell-values">
              <ComparisonMetricValue tone="current" label="Actual" value={currentValue} metric={metric} />
              <ComparisonMetricValue tone="alternative" label="Alternativa" value={alternativeValue} metric={metric} />
            </div>

            <div className="comparison-dumbbell-track" aria-hidden="true">
              <i
                className="comparison-dumbbell-connector"
                style={{ left: `${start}%`, width: `${width}%` }}
              />
              <span className="comparison-dumbbell-point current" style={{ left: `${currentPosition}%` }} />
              <span className="comparison-dumbbell-point alternative" style={{ left: `${alternativePosition}%` }} />
            </div>

            <div className="comparison-dumbbell-result">
              <b className={`delta-value ${deltaMeta.tone}`}>{deltaLabel}</b>
              <span className={`comparison-result-chip ${resultMeta.tone}`}>{resultMeta.label}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ComparisonVisual({ metrics, currentName, alternativeName, insights }) {
  return (
    <details className="comparison-visual-details" open>
      <summary>
        <span>
          <span className="eyebrow">Vista comparativa</span>
          <h4>Indicadores principales</h4>
        </span>
        <span className="comparison-visual-summary-actions">
          <i className="ti ti-chevron-down" aria-hidden="true" />
        </span>
      </summary>
      <div className="comparison-visual">
        <ComparisonQuickRead insights={insights} />
        <ComparisonDumbbell metrics={metrics} currentName={currentName} alternativeName={alternativeName} />
        <p className="comparison-reference-conclusion">{insights.summary}</p>
      </div>
    </details>
  );
}

function ConceptHelpCta({ onNavigate }) {
  return (
    <section className="simulation-academy-cta" aria-labelledby="simulation-academy-title">
      <div>
        <span className="eyebrow">Academia financiera</span>
        <h2 id="simulation-academy-title">¿Tienes dudas con algún concepto?</h2>
        <p>Entra a la Academia e infórmate antes de decidir qué escenario quieres mirar con más detalle.</p>
      </div>
      {onNavigate ? (
        <button className="secondary-button compact-button" type="button" onClick={() => onNavigate("academia")}>
          Ir a Academia
        </button>
      ) : (
        <a className="secondary-button compact-button" href="/academia">
          Ir a Academia
        </a>
      )}
    </section>
  );
}

function RecommendationEmpty({ onStartEvaluation }) {
  return (
    <section className="section-block simulation-page">
      <div className="section-heading">
        <span className="eyebrow">Simulación</span>
        <h1>Simulación de compatibilidad</h1>
        <p>Necesitas una preevaluación guardada para comparar escenarios con tu perfil financiero actual.</p>
      </div>
      <div className="empty-state">
        <strong>Aún no tienes una evaluación disponible.</strong>
        <p>Completa la preevaluación para activar simulaciones referenciales de vivienda.</p>
        <button type="button" onClick={onStartEvaluation}>Ir a precalificación</button>
      </div>
    </section>
  );
}

export default function SimulationPage({ evaluation, onboarding, onStartEvaluation, onNavigate }) {
  const context = useMemo(
    () => buildSimulationContext(evaluation, onboarding),
    [evaluation, onboarding],
  );
  const ufValueClp = Number(context.uf_value_clp) || 40695;
  const [mode, setMode] = useState("project");
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [compareProjectId, setCompareProjectId] = useState("");
  const [manualUf, setManualUf] = useState("");
  const [comparison, setComparison] = useState(null);
  const [targetProject, setTargetProject] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TARGET_PROJECT_KEY)) || null;
    } catch {
      return null;
    }
  });
  const comparisonRef = useRef(null);
  const resultRef = useRef(null);

  // El catálogo (HU 7) es la única fuente de proyectos. Antes se leía un
  // arreglo hardcodeado en el bundle, que quedó fuera de sincronía con lo que
  // el administrador mantiene. Ver docs/stories/CATALOGO-UNICO/PLAN.md.
  useEffect(() => {
    let active = true;

    getAvailableProjects()
      .then((rows) => {
        if (!active) return;
        setProjects(catalogProjectsToSimulation(rows));
      })
      .catch((err) => {
        if (!active) return;
        setProjectsError(err.message || "No se pudieron cargar los proyectos.");
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!projects.length) return;
    setSelectedProjectId((prev) =>
      prev && projects.some((project) => project.id === prev) ? prev : projects[0].id,
    );
  }, [projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );
  const compareProject = useMemo(
    () => projects.find((project) => project.id === compareProjectId) || null,
    [compareProjectId, projects],
  );

  const manualScenario = useMemo(
    () => getScenarioFromManualValue(manualUf, ufValueClp),
    [manualUf, ufValueClp],
  );

  const scenario = useMemo(() => {
    if (mode === "manual") return manualScenario;
    if (!selectedProject) return null;
    return {
      id: selectedProject.id,
      source: "project",
      label: selectedProject.nombre,
      comuna: selectedProject.comuna,
      tipo_vivienda: selectedProject.tipo_vivienda,
      valueUf: Number(selectedProject.valor_uf) || 0,
      valueClp: Number(selectedProject.valor_clp) || Math.round((Number(selectedProject.valor_uf) || 0) * ufValueClp),
      project: selectedProject,
    };
  }, [manualScenario, mode, selectedProject, ufValueClp]);

  const scenarioResult = useMemo(
    () => scenario ? evaluateScenario(context, scenario) : null,
    [context, scenario],
  );
  const alternatives = useMemo(
    () => buildAccessibleAlternatives(projects, context, onboarding, 4),
    [context, onboarding, projects],
  );
  const maxRange = useMemo(() => getMaxValueRange(context), [context]);
  const hasManualValue = mode !== "manual" || Number(manualUf) > 0;
  const currentComparable = scenarioResult && hasManualValue ? scenarioResult : null;
  const targetProjectId = targetProject?.id || "";
  const compareProjectResult = useMemo(
    () => projectToComparable(compareProject, context, ufValueClp),
    [compareProject, context, ufValueClp],
  );
  const comparisonPreferences = useMemo(
    () => ({
      comuna_objetivo: onboarding?.comuna_interes || context.comuna_objetivo,
      tipo_vivienda_preferida: onboarding?.tipo_propiedad || context.tipo_vivienda_preferida,
      plazo_compra: onboarding?.plazo_compra || context.plazo_compra,
    }),
    [context.comuna_objetivo, context.plazo_compra, context.tipo_vivienda_preferida, onboarding],
  );
  const comparisonInsights = useMemo(
    () => buildComparisonInsights(comparison?.current || currentComparable, comparison?.alternative, comparisonPreferences),
    [comparison, comparisonPreferences, currentComparable],
  );
  const isSelfProjectComparison = mode === "project" && compareProjectId && compareProjectId === selectedProjectId;
  const comparisonAlternativeProjectId = comparison?.alternative?.project?.id || comparison?.alternative?.scenario?.id || "";
  const isComparisonAgainstCurrentProject =
    mode === "project" && comparisonAlternativeProjectId && comparisonAlternativeProjectId === selectedProjectId;

  useEffect(() => {
    if (!comparison) return;
    if (isComparisonAgainstCurrentProject) {
      setComparison(null);
      return;
    }
    if (resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [comparison, isComparisonAgainstCurrentProject]);

  useEffect(() => {
    if (comparison?.source !== "project-selector") return;
    if (!currentComparable || !compareProjectResult || isSelfProjectComparison) {
      setComparison(null);
      return;
    }
    if (comparison?.source === "project-selector") {
      setComparison({
        source: "project-selector",
        current: currentComparable,
        alternative: compareProjectResult,
      });
    }
  }, [comparison?.source, compareProjectResult, currentComparable, isSelfProjectComparison]);

  const handleSelectedProjectChange = (projectId) => {
    setSelectedProjectId(projectId);
    if (compareProjectId === projectId) {
      setComparison((prev) => (prev?.source === "project-selector" ? null : prev));
    }
  };

  const handleCompareProjectChange = (projectId) => {
    setCompareProjectId(projectId);
    if (!projectId) {
      setComparison((prev) => (prev?.source === "project-selector" ? null : prev));
      return;
    }
    if (mode === "project" && projectId === selectedProjectId) {
      setComparison((prev) => (prev?.source === "project-selector" ? null : prev));
      return;
    }
    const nextProject = projects.find((project) => project.id === projectId);
    const nextResult = projectToComparable(nextProject, context, ufValueClp);
    if (!currentComparable || !nextResult) {
      setComparison({ error: true });
      return;
    }
    setComparison({
      source: "project-selector",
      current: currentComparable,
      alternative: nextResult,
    });
  };

  const handleSelectTargetProject = (item) => {
    const project = item?.project;
    if (!project) return;
    const target = {
      id: project.id,
      nombre: project.nombre,
      comuna: project.comuna,
      tipo_vivienda: project.tipo_vivienda,
      valor_uf: project.valor_uf,
      precio_min_uf: project.precio_min_uf,
      precio_max_uf: project.precio_max_uf,
      valor_clp: item.valueClp,
      selected_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(TARGET_PROJECT_KEY, JSON.stringify(target));
    } catch {}
    setTargetProject(target);
  };

  const handleClearTargetProject = () => {
    try {
      localStorage.removeItem(TARGET_PROJECT_KEY);
    } catch {}
    setTargetProject(null);
  };

  const handleCompareAlternative = (item) => {
    if (mode === "project" && item?.project?.id === selectedProjectId) {
      setComparison((prev) => (prev?.source === "accessible-option" ? null : prev));
      return;
    }
    if (!currentComparable) {
      setComparison({ error: true });
      return;
    }
    setComparison({
      source: "accessible-option",
      current: currentComparable,
      alternative: item,
    });
  };

  if (!evaluation) {
    return <RecommendationEmpty onStartEvaluation={onStartEvaluation} />;
  }

  const hasProjects = projects.length > 0;
  const catalogNotice = projectsLoading
    ? "Cargando proyectos del catálogo…"
    : projectsError ||
      (hasProjects ? "" : "No hay proyectos disponibles en el catálogo por ahora. Puedes simular con un valor manual.");

  const typePreference =
    propertyLabels[onboarding?.tipo_propiedad] ||
    propertyLabels[context.tipo_vivienda_preferida] ||
    context.tipo_vivienda_preferida ||
    "Sin preferencia";
  const targetCommune = onboarding?.comuna_interes || context.comuna_objetivo || "Sin comuna";
  const horizon = plazoLabels[onboarding?.plazo_compra || context.plazo_compra] || "Sin plazo";
  const rawGoal =
    onboarding?.objetivo_principal ||
    evaluation?.onboarding?.objetivo_principal ||
    evaluation?.input?.objetivo_inmobiliario ||
    evaluation?.input?.objetivo_principal;
  const targetGoal = objetivoLabels[rawGoal] || rawGoal || "Sin objetivo declarado";

  return (
    <section className="section-block simulation-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Simulación</span>
          <h1>Compatibilidad y alternativas</h1>
          <p>
            Compara proyectos referenciales o ingresa un valor de vivienda para estimar brechas con los datos de tu última preevaluación.
          </p>
        </div>
      </div>

      <div className="simulation-disclaimer">
        <i className="ti ti-info-circle"></i>
        Esta simulación es referencial y se basa en datos declarados. No corresponde a aprobación bancaria, preaprobación, tasación ni cotización formal.
      </div>

      <div className="simulation-layout">
        <div className="simulator-panel">
          <div className="simulation-preferences is-prominent">
            <div className="simulation-panel-heading compact">
              <span className="eyebrow">Preferencias consideradas</span>
              <div className="simulation-preferences-copy">
                <p>
                  Estamos usando tus respuestas preliminares, si quieres cambiarlas, actualízalas desde tu Perfil.
                </p>
                {onNavigate ? (
                  <button className="secondary-button compact-button" type="button" onClick={() => onNavigate("profile")}>
                    Editar perfil
                  </button>
                ) : null}
              </div>
            </div>
            <div className="simulation-preference-list">
              <article>
                <span>Comuna objetivo</span>
                <strong>{targetCommune}</strong>
              </article>
              <article>
                <span>Tipo preferido</span>
                <strong>{typePreference}</strong>
              </article>
              <article>
                <span>Horizonte</span>
                <strong>{horizon}</strong>
              </article>
              <article>
                <span>Objetivo</span>
                <strong>{targetGoal}</strong>
              </article>
            </div>
          </div>

          <div className="simulation-panel-heading">
            <span className="eyebrow">Escenario base</span>
            <h2 className="recommendation-section-title"><i className="ti ti-settings"></i> Elige qué quieres evaluar</h2>
          </div>

          <div className="simulation-actions">
            <div className="regime-segmented-toggle simulation-mode">
              <button className={mode === "project" ? "is-active" : ""} type="button" onClick={() => setMode("project")}>
                Proyecto referencial
              </button>
              <button className={mode === "manual" ? "is-active" : ""} type="button" onClick={() => setMode("manual")}>
                Valor manual
              </button>
            </div>
          </div>

          <div className="simulation-selector-grid">
            {mode === "project" ? (
              <label className="simulator-field">
                Proyecto referencial
                <select
                  value={selectedProjectId}
                  disabled={!hasProjects}
                  onChange={(event) => handleSelectedProjectChange(event.target.value)}
                >
                  {hasProjects ? null : <option value="">Sin proyectos disponibles</option>}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {getProjectLabel(project)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="simulator-field">
                Valor de vivienda en UF
                <input
                  min="0"
                  inputMode="numeric"
                  type="number"
                  value={manualUf}
                  onChange={(event) => setManualUf(event.target.value)}
                  placeholder="Ej: 2800"
                />
              </label>
            )}

            <label className="simulator-field compare-field">
              Comparar con otro proyecto
              <select
                value={compareProjectId}
                disabled={!hasProjects}
                onChange={(event) => handleCompareProjectChange(event.target.value)}
              >
                <option value="">
                  {hasProjects ? "Selecciona proyecto para comparar" : "Sin proyectos disponibles"}
                </option>
                {projects.map((project) => {
                  const isCurrentProject = mode === "project" && project.id === selectedProjectId;
                  return (
                    <option disabled={isCurrentProject} key={project.id} value={project.id}>
                      {isCurrentProject ? `${getProjectLabel(project)} · Escenario actual` : getProjectLabel(project)}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <details className="simulation-range-details">
            <summary>
              <span><i className="ti ti-chart-line"></i> Rango referencial por ahorro</span>
              <i className="ti ti-chevron-down" aria-hidden="true" />
            </summary>
            <div className="simulation-range">
              <article>
                <span>Con pie recomendado</span>
                <strong>{formatUf(maxRange.minUf)}</strong>
                <small>{formatClp(maxRange.minClp)}</small>
              </article>
              <article>
                <span>Con pie mínimo</span>
                <strong>{formatUf(maxRange.maxUf)}</strong>
                <small>{formatClp(maxRange.maxClp)}</small>
              </article>
            </div>
          </details>
        </div>
      </div>

      {scenarioResult && hasManualValue ? (
        <div className="simulation-result-card compatibility-summary-card" ref={resultRef}>
          <div className="result-header">
            <div>
              <span className="eyebrow">Resultado</span>
              <h2 className="tracking-goal-title">{scenario.label}</h2>
              <p className="tracking-goal-desc">{scenario.comuna || "Valor ingresado manualmente"} · {scenario.tipo_vivienda || "Tipo no especificado"}</p>
              {scenario.project ? (
                <>
                  <p className="tracking-goal-desc">
                    {formatProjectPrice(scenario.project)}
                    {scenario.project.entrega_estimada
                      ? ` · Entrega estimada: ${formatDeliveryMonth(scenario.project.entrega_estimada)}`
                      : ""}
                  </p>
                  {scenario.project.descripcion_corta ? (
                    <p className="simulation-estimate-note">{scenario.project.descripcion_corta}</p>
                  ) : null}
                </>
              ) : null}
            </div>
            <span className={`simulation-status ${statusClass[scenarioResult.status] || "adjust"}`}>
              {scenarioResult.status}
            </span>
          </div>

          <div className="compatibility-summary-main">
            <article>
              <span>Brecha principal</span>
              <strong>{getGapLabel(scenarioResult.mainGap)}</strong>
            </article>
          </div>

          <div className="scenario-checklist">
            {buildScenarioChecks(scenarioResult).map((check) => (
              <article className={`scenario-check ${check.state}`} key={check.label}>
                <i className={`ti ${check.state === "ok" ? "ti-check" : check.state === "review" ? "ti-alert-circle" : "ti-minus"}`} aria-hidden="true" />
                <span>{check.label}</span>
                <strong>{check.value}</strong>
              </article>
            ))}
          </div>

          <div className="housing-metrics compact">
            <div className="metric metric-highlight">
              <span>Valor</span>
              <strong>{formatUfClp(scenarioResult.valueUf, scenarioResult.valueClp)}</strong>
            </div>
            <div className="metric">
              <span>Pie mínimo</span>
              <strong>{formatUfClp(scenarioResult.pieMinimoUf, scenarioResult.pieMinimo)}</strong>
            </div>
            <div className="metric">
              <span>Pie recomendado</span>
              <strong>{formatUfClp(scenarioResult.pieRecomendadoUf, scenarioResult.pieRecomendado)}</strong>
            </div>
            <div className="metric">
              <span>Ahorro</span>
              <strong>{formatUfClp(scenarioResult.savingsUf, scenarioResult.savings)}</strong>
            </div>
            <div className="metric">
              <span>Deuda/ingreso</span>
              <strong>{formatPercent(scenarioResult.debtRatio)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="warning-note">
          <i className="ti ti-alert-triangle"></i>
          {mode === "project"
            ? catalogNotice || "Selecciona un proyecto para calcular el escenario."
            : "Ingresa un valor de vivienda en UF para calcular el escenario manual."}
        </div>
      )}

      {comparison?.current && comparison?.alternative ? (
        <div className="simulation-comparison comparison-summary-panel" ref={comparisonRef}>
          <div className="section-heading compact">
            <span className="eyebrow">Comparación</span>
            <h2 className="recommendation-section-title"><i className="ti ti-arrows-left-right"></i> Comparación de escenarios</h2>
            <p>{comparisonInsights.summary}</p>
          </div>

          <div className="comparison-analysis">
            <ComparisonVisual
              metrics={comparisonInsights.metrics}
              currentName={getScenarioChartName(comparison.current)}
              alternativeName={getScenarioChartName(comparison.alternative)}
              insights={comparisonInsights}
            />

            <div className="comparison-insight-grid">
              <AdvantageList title="Ventajas del escenario actual" items={comparisonInsights.advantages.current} />
              <AdvantageList title="Ventajas de la alternativa" items={comparisonInsights.advantages.alternative} />
              <AdvantageList title="Puntos a considerar" items={comparisonInsights.considerations} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="alternatives-block">
        <div className="section-heading compact">
          <span className="eyebrow">Alternativas referenciales</span>
          <h2 className="recommendation-section-title"><i className="ti ti-home-search"></i> Opciones más accesibles</h2>
          <p>
            Ordenadas por compatibilidad, menor brecha, comuna y tipo de vivienda preferidos. El horizonte ajusta mensajes, no cambia el score.
          </p>
        </div>

        {targetProject ? (
          <div className="simulation-target-message">
            <div>
              <span className="eyebrow">Proyecto objetivo referencial</span>
              <strong>{targetProject.nombre}</strong>
              <small>
                {targetProject.comuna} · {propertyLabels[targetProject.tipo_vivienda] || targetProject.tipo_vivienda} · {formatProjectPrice(targetProject)}
              </small>
            </div>
            <button className="secondary-button compact-button" type="button" onClick={handleClearTargetProject}>
              Eliminar selección
            </button>
          </div>
        ) : null}

        {hasProjects ? null : (
          <div className="warning-note">
            <i className="ti ti-alert-triangle"></i>
            {catalogNotice}
          </div>
        )}

        <AlternativesCarousel>
          {alternatives.map((item) => (
            <article className="alternative-card simulation-alternative" key={item.project.id}>
              <ProjectImagePlaceholder result={item} compact />
              <div>
                <span className={`simulation-status ${statusClass[item.status] || "adjust"}`}>{item.status}</span>
                <h3>{item.project.nombre}</h3>
                <p>{item.project.comuna} · {propertyLabels[item.project.tipo_vivienda] || item.project.tipo_vivienda}</p>
              </div>
              <strong>{formatProjectPrice(item.project)} · {formatClp(item.valueClp)}</strong>
              <p>Brecha principal: {getGapLabel(item.mainGap)}</p>
              <p>Pie mínimo: {formatUfClp(item.pieMinimoUf, item.pieMinimo)}</p>
              {item.preference.communeMatch ? <span className="alternative-benefit">Coincide con tu comuna objetivo</span> : null}
              {item.preference.typeMatch ? <span className="alternative-benefit">Coincide con tu tipo de vivienda</span> : null}
              {item.project.entrega_estimada ? (
                <p>Entrega estimada: {formatDeliveryMonth(item.project.entrega_estimada)}</p>
              ) : null}
              <small>{item.project.descripcion_corta}</small>
              <div className="alternative-actions">
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={mode === "project" && item.project.id === selectedProjectId}
                  title={mode === "project" && item.project.id === selectedProjectId ? "Este es el escenario actual." : undefined}
                  onClick={() => handleCompareAlternative(item)}
                >
                  {mode === "project" && item.project.id === selectedProjectId ? "Escenario actual" : "Comparar con escenario actual"}
                </button>
                <button
                  className={`compact-button target-project-button ${targetProjectId === item.project.id ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => handleSelectTargetProject(item)}
                >
                  {targetProjectId === item.project.id ? "Proyecto objetivo seleccionado" : "Seleccionar como proyecto objetivo"}
                </button>
              </div>
            </article>
          ))}
        </AlternativesCarousel>
      </div>

      <ConceptHelpCta onNavigate={onNavigate} />
    </section>
  );
}
