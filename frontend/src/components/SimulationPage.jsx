import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAccessibleAlternatives,
  buildComparisonInsights,
  buildSimulationContext,
  evaluateScenario,
  getMaxValueRange,
  getScenarioFromManualValue,
  projectToScenario,
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
  return evaluateScenario(context, projectToScenario(project, ufValueClp));
}

function getScenarioName(result) {
  return result?.scenario?.label || result?.project?.nombre || "Sin escenario";
}

function getScenarioChartName(result) {
  const name = getScenarioName(result);
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

function getRecommendationLabel(recommendation) {
  const labels = {
    escenario_actual: "Escenario actual",
    alternativa: "Alternativa",
    similar: "Similares",
    sin_datos_suficientes: "Sin datos suficientes",
  };
  return labels[recommendation] || "Referencial";
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

const chartViews = [
  { id: "bars", label: "Barras" },
  { id: "deltas", label: "Diferencias" },
  { id: "cards", label: "Resumen" },
];

function ChartViewIcon({ type }) {
  return (
    <span className={`chart-view-icon ${type}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function ComparisonViewToggle({ value, onChange }) {
  return (
    <div className="comparison-chart-toggle" aria-label="Cambiar visualización de comparación">
      {chartViews.map((view) => (
        <button
          className={value === view.id ? "is-active" : ""}
          key={view.id}
          type="button"
          title={view.label}
          aria-label={`Ver ${view.label.toLowerCase()}`}
          aria-pressed={value === view.id}
          onClick={() => onChange(view.id)}
        >
          <ChartViewIcon type={view.id} />
        </button>
      ))}
    </div>
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

function ComparisonBars({ metrics, currentName, alternativeName }) {
  return (
    <div className="comparison-bars" aria-label="Visualización comparativa de escenarios">
      {metrics.map((metric) => {
        const currentWidth = metric.max > 0 ? Math.max(4, Math.min(100, (metric.current / metric.max) * 100)) : 4;
        const alternativeWidth = metric.max > 0 ? Math.max(4, Math.min(100, (metric.alternative / metric.max) * 100)) : 4;
        const currentBetter = metric.lowerIsBetter ? metric.current < metric.alternative : metric.current > metric.alternative;
        const alternativeBetter = metric.lowerIsBetter ? metric.alternative < metric.current : metric.alternative > metric.current;

        return (
          <article className="comparison-bar-row" key={metric.id}>
            <div className="comparison-bar-heading">
              <strong>{metric.label}</strong>
              <span>{metric.lowerIsBetter ? "Menor es mejor" : "Mayor es mejor"}</span>
            </div>
            <div className="comparison-bar-pair">
              <span className="comparison-scenario-name">{currentName}</span>
              <div className="comparison-bar-track">
                <i
                  className={`is-current ${currentBetter ? "is-better" : ""}`}
                  style={{ width: `${currentWidth}%` }}
                />
              </div>
              <strong>{metric.currentLabel || formatMetricValue(metric.current, metric.unit)}</strong>
            </div>
            <div className="comparison-bar-pair">
              <span className="comparison-scenario-name">{alternativeName}</span>
              <div className="comparison-bar-track">
                <i
                  className={`is-alternative ${alternativeBetter ? "is-better" : ""}`}
                  style={{ width: `${alternativeWidth}%` }}
                />
              </div>
              <strong>{metric.alternativeLabel || formatMetricValue(metric.alternative, metric.unit)}</strong>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function getMetricDelta(metric) {
  if (metric.currentLabel || metric.alternativeLabel) {
    return `${metric.currentLabel || metric.current} / ${metric.alternativeLabel || metric.alternative}`;
  }
  const delta = Number(metric.alternative) - Number(metric.current);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatMetricValue(delta, metric.unit)}`;
}

function ComparisonDeltas({ metrics, currentName, alternativeName }) {
  return (
    <div className="comparison-delta-grid" aria-label="Diferencias principales entre escenarios">
      {metrics.map((metric) => {
        const currentBetter = metric.lowerIsBetter ? metric.current < metric.alternative : metric.current > metric.alternative;
        const alternativeBetter = metric.lowerIsBetter ? metric.alternative < metric.current : metric.alternative > metric.current;
        return (
          <article key={metric.id}>
            <span>{metric.label}</span>
            <strong>{getMetricDelta(metric)}</strong>
            <small>
              {currentBetter && `${currentName} queda mejor en este indicador.`}
              {alternativeBetter && `${alternativeName} queda mejor en este indicador.`}
              {!currentBetter && !alternativeBetter && "Ambos escenarios quedan parecidos en este indicador."}
            </small>
          </article>
        );
      })}
    </div>
  );
}

function ComparisonCards({ metrics, currentName, alternativeName }) {
  return (
    <div className="comparison-card-visual" aria-label="Resumen visual de escenarios">
      {[{ name: currentName, key: "current" }, { name: alternativeName, key: "alternative" }].map((scenario) => (
        <article key={scenario.key}>
          <strong>{scenario.name}</strong>
          {metrics.map((metric) => (
            <p key={metric.id}>
              <span>{metric.label}</span>
              <b>{metric[`${scenario.key}Label`] || formatMetricValue(metric[scenario.key], metric.unit)}</b>
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}

function ComparisonVisual({ metrics, currentName, alternativeName, view, onViewChange }) {
  return (
    <div className="comparison-visual">
      <div className="comparison-visual-heading">
        <div>
          <span className="eyebrow">Vista comparativa</span>
          <h4>Indicadores principales</h4>
        </div>
        <ComparisonViewToggle value={view} onChange={onViewChange} />
      </div>
      {view === "deltas" ? (
        <ComparisonDeltas metrics={metrics} currentName={currentName} alternativeName={alternativeName} />
      ) : view === "cards" ? (
        <ComparisonCards metrics={metrics} currentName={currentName} alternativeName={alternativeName} />
      ) : (
        <ComparisonBars metrics={metrics} currentName={currentName} alternativeName={alternativeName} />
      )}
    </div>
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
  const [comparisonView, setComparisonView] = useState("bars");
  const [targetProject, setTargetProject] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TARGET_PROJECT_KEY)) || null;
    } catch {
      return null;
    }
  });
  const comparisonRef = useRef(null);

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
    return projectToScenario(selectedProject, ufValueClp);
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
  const hasDeclaredDividend = Number(context.dividendo_estimado) > 0;
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

  useEffect(() => {
    if (comparison && comparisonRef.current) {
      comparisonRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [comparison]);

  useEffect(() => {
    if (comparison?.source === "project-selector" && currentComparable && compareProjectResult) {
      setComparison({
        source: "project-selector",
        current: currentComparable,
        alternative: compareProjectResult,
      });
    }
  }, [comparison?.source, compareProjectResult, currentComparable]);

  const handleCompareProjectChange = (projectId) => {
    setCompareProjectId(projectId);
    if (!projectId) {
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
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  {hasProjects ? null : <option value="">Sin proyectos disponibles</option>}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {getProjectLabel(project)}
                    </option>
                  ))}
                </select>
                <span className="field-help">
                  {catalogNotice ||
                    "Los proyectos mostrados son referenciales para simulación y pueden no representar disponibilidad real. El precio parte en la unidad más económica del proyecto."}
                </span>
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
                <span className="field-help">Se mostrará su equivalente aproximado en CLP usando la UF referencial disponible.</span>
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
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {getProjectLabel(project)}
                  </option>
                ))}
              </select>
              <span className="field-help">
                Este selector compara el escenario base contra cualquier proyecto referencial.
              </span>
            </label>
          </div>

          <div className="simulation-preferences">
            <div className="simulation-panel-heading compact">
              <span className="eyebrow">Preferencias consideradas</span>
              <div className="simulation-preferences-copy">
                <p>
                  Estamos usando tus respuestas preliminares para comuna, tipo, horizonte y objetivo. Si quieres cambiarlas, actualízalas desde tu Perfil.
                </p>
                {onNavigate ? (
                  <button className="secondary-button compact-button" type="button" onClick={() => onNavigate("profile")}>
                    Editar en Perfil
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
        </div>

        <div className="simulator-panel simulation-range-panel">
          <h2 className="recommendation-section-title"><i className="ti ti-chart-line"></i> Rango referencial por ahorro</h2>
          <p>
            Este rango estima valores de vivienda según tu ahorro disponible. No es el pie requerido del proyecto ni representa financiamiento aprobado.
          </p>
          <p className="simulation-formula-note">
            Pie mínimo del escenario = 10% del valor. Pie recomendado = 20% del valor.
          </p>
          <div className="simulation-range">
            <article>
              <span>Vivienda estimada con pie recomendado</span>
              <strong>{formatUf(maxRange.minUf)}</strong>
              <small>{formatClp(maxRange.minClp)}</small>
            </article>
            <article>
              <span>Vivienda estimada con pie mínimo</span>
              <strong>{formatUf(maxRange.maxUf)}</strong>
              <small>{formatClp(maxRange.maxClp)}</small>
            </article>
          </div>
        </div>
      </div>

      <div className="simulation-comparison comparison-summary-panel" ref={comparisonRef}>
        <div className="section-heading compact">
          <span className="eyebrow">Comparación</span>
          <h2 className="recommendation-section-title"><i className="ti ti-arrows-left-right"></i> Comparación de escenarios</h2>
          <p>
            {comparison?.current && comparison?.alternative
              ? comparisonInsights.summary
              : "Selecciona un proyecto en el comparador o usa una opción accesible para contrastarla con tu escenario actual."}
          </p>
        </div>

        {comparison?.error || !currentComparable ? (
          <div className="warning-note">
            <i className="ti ti-alert-triangle"></i>
            Primero selecciona un proyecto o ingresa un valor manual para comparar.
          </div>
        ) : null}

        <div className="comparison-overview" aria-label="Resumen de escenarios comparados">
          <article>
            <span>Escenario actual</span>
            {currentComparable ? (
              <>
                <ProjectImagePlaceholder result={currentComparable} compact />
                <strong>{getScenarioName(currentComparable)}</strong>
                <small>{formatUfClp(currentComparable.valueUf, currentComparable.valueClp)} · {currentComparable.status}</small>
              </>
            ) : (
              <small>Primero selecciona un proyecto o ingresa un valor manual.</small>
            )}
          </article>
          <article>
            <span>Alternativa</span>
            {comparison?.alternative ? (
              <>
                <ProjectImagePlaceholder result={comparison.alternative} compact />
                <strong>{getScenarioName(comparison.alternative)}</strong>
                <small>{formatUfClp(comparison.alternative.valueUf, comparison.alternative.valueClp)} · {comparison.alternative.status}</small>
              </>
            ) : (
              <small>Selecciona un proyecto para comparar o usa una opción accesible.</small>
            )}
          </article>
        </div>

        {comparison?.current && comparison?.alternative ? (
          <div className="comparison-analysis">
            <div className="comparison-recommendation">
              <span>Recomendación referencial</span>
              <strong>{comparisonInsights.title}</strong>
              <small>{getRecommendationLabel(comparisonInsights.recommendation)}</small>
            </div>

            <div className="comparison-insight-grid">
              <AdvantageList title="Ventajas del escenario actual" items={comparisonInsights.advantages.current} />
              <AdvantageList title="Ventajas de la alternativa" items={comparisonInsights.advantages.alternative} />
              <AdvantageList title="Puntos a considerar" items={comparisonInsights.considerations} />
            </div>

            <ComparisonVisual
              metrics={comparisonInsights.metrics}
              currentName={getScenarioChartName(comparison.current)}
              alternativeName={getScenarioChartName(comparison.alternative)}
              view={comparisonView}
              onViewChange={setComparisonView}
            />
          </div>
        ) : null}

        <div className="comparison-grid">
          {[{ label: "Escenario A", data: comparison?.current || currentComparable }, { label: "Escenario B", data: comparison?.alternative }].map((item) => (
            <article className={!item.data ? "comparison-empty" : ""} key={item.label}>
              <span className="eyebrow">{item.label}</span>
              {item.data ? (
                <>
                  <h3>{getScenarioName(item.data)}</h3>
                  <dl>
                    <dt>Valor vivienda</dt>
                    <dd>{formatUfClp(item.data.valueUf, item.data.valueClp)}</dd>
                    <dt>Comuna</dt>
                    <dd>{getScenarioPlace(item.data)}</dd>
                    <dt>Tipo vivienda</dt>
                    <dd>{getScenarioType(item.data)}</dd>
                    <dt>Estado</dt>
                    <dd>{item.data.status}</dd>
                    <dt>Pie mínimo requerido</dt>
                    <dd>{formatUfClp(item.data.pieMinimoUf, item.data.pieMinimo)}</dd>
                    <dt>Pie recomendado</dt>
                    <dd>{formatUfClp(item.data.pieRecomendadoUf, item.data.pieRecomendado)}</dd>
                    <dt>Ahorro disponible</dt>
                    <dd>{formatUfClp(item.data.savingsUf, item.data.savings)}</dd>
                    <dt>Brecha de pie</dt>
                    <dd>{formatUfClp(item.data.gapMinimoUf, item.data.gapMinimo)}</dd>
                    <dt>Brecha principal</dt>
                    <dd>{getGapLabel(item.data.mainGap)}</dd>
                  </dl>
                </>
              ) : (
                <p>Selecciona una alternativa para compararla con tu escenario actual.</p>
              )}
            </article>
          ))}
        </div>
      </div>

      {scenarioResult && hasManualValue ? (
        <div className="simulation-result-card">
          <div className="result-header">
            <div>
              <span className="eyebrow">Escenario evaluado</span>
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

          <p className="simulation-message">{scenarioResult.message}</p>
          <p className="simulation-message"><strong>Recomendación:</strong> {scenarioResult.recommendation}</p>
          {!hasDeclaredDividend ? (
            <p className="simulation-estimate-note">
              La compatibilidad se estima con los datos disponibles, principalmente ahorro, deuda e ingreso declarado. El dividendo exacto dependería de condiciones bancarias formales.
            </p>
          ) : null}
          <p className="simulation-horizon">{scenarioResult.horizonMessage}</p>

          <div className="housing-metrics">
            <div className="metric metric-highlight">
              <span>Valor escenario</span>
              <strong>{formatUfClp(scenarioResult.valueUf, scenarioResult.valueClp)}</strong>
            </div>
            <div className="metric">
              <span>Pie mínimo requerido</span>
              <strong>{formatUfClp(scenarioResult.pieMinimoUf, scenarioResult.pieMinimo)}</strong>
              <small>Brecha: {formatUfClp(scenarioResult.gapMinimoUf, scenarioResult.gapMinimo)}</small>
            </div>
            <div className="metric">
              <span>Pie recomendado</span>
              <strong>{formatUfClp(scenarioResult.pieRecomendadoUf, scenarioResult.pieRecomendado)}</strong>
              <small>Brecha: {formatUfClp(scenarioResult.gapRecomendadoUf, scenarioResult.gapRecomendado)}</small>
            </div>
            <div className="metric">
              <span>Ahorro disponible</span>
              <strong>{formatUfClp(scenarioResult.savingsUf, scenarioResult.savings)}</strong>
              <small>UF referencial: {formatClp(scenarioResult.ufValueClp)}</small>
            </div>
            <div className="metric">
              <span>Brecha principal</span>
              <strong>{getGapLabel(scenarioResult.mainGap)}</strong>
              <small>Deuda/ingreso: {formatPercent(scenarioResult.debtRatio)}</small>
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
                  onClick={() => handleCompareAlternative(item)}
                >
                  Comparar con escenario actual
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
