import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAccessibleAlternatives,
  buildComparisonInsights,
  buildSimulationContext,
  evaluateScenario,
  getMaxValueRange,
  getScenarioFromManualValue,
} from "../lib/simulation/compatibility";
import { resolveActiveComparison, shouldShowComparisonWarning } from "../lib/simulation/comparisonState";
import { CLP_FORMATTER } from "../services/financialTracking";
import {
  getSimulationProjectById,
  getSimulationProjects,
  projectToSimulationScenario,
} from "../services/projectSimulationService";
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
  return `${project.nombre} · ${project.comuna} · ${formatUf(project.valor_uf)}`;
}

function projectToComparable(project, context, ufValueClp) {
  if (!project) return null;
  const scenario = projectToSimulationScenario(project, ufValueClp);
  return evaluateScenario(context, scenario);
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
  { id: "goals", label: "Metas" },
  { id: "bars", label: "Barras" },
  { id: "deltas", label: "Diferencias" },
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

function getPercent(value, max) {
  const numericValue = Number(value);
  const numericMax = Number(max);
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericMax) || numericMax <= 0) return 0;
  return Math.max(0, Math.min(100, (numericValue / numericMax) * 100));
}

function getSavingsGoal(result) {
  if (!result) return null;
  if (result.savingsUf >= result.pieRecomendadoUf) {
    return { label: "Cubre recomendado", tone: "good" };
  }
  if (result.savingsUf >= result.pieMinimoUf) {
    return { label: "Cubre minimo", tone: "near" };
  }
  return { label: "Falta pie", tone: "adjust" };
}

function getDividendGoal(result) {
  if (!result || result.dividend <= 0 || result.prudentDividend <= 0) {
    return { label: "Sin dividendo declarado", tone: "muted" };
  }
  if (result.dividend <= result.prudentDividend) {
    return { label: "Dentro del limite", tone: "good" };
  }
  return { label: "Sobre el limite", tone: "adjust" };
}

function BulletGoal({ title, measuredLabel, measuredValue, measuredPercent, markers = [], status }) {
  return (
    <div className="comparison-goal">
      <div className="comparison-goal-heading">
        <span>{title}</span>
        <strong className={`goal-status ${status.tone}`}>{status.label}</strong>
      </div>
      <div className="comparison-goal-track" aria-label={`${title}: ${measuredLabel}`}>
        <i className={`goal-fill ${status.tone}`} style={{ width: `${Math.max(4, measuredPercent)}%` }} />
        {markers.map((marker) => (
          <b
            className={`goal-marker ${marker.tone || ""}`}
            key={marker.label}
            style={{ left: `${marker.percent}%` }}
            title={marker.label}
          />
        ))}
      </div>
      <div className="comparison-goal-legend">
        <span>{measuredLabel}</span>
        <strong>{measuredValue}</strong>
      </div>
      {markers.length ? (
        <div className="comparison-goal-markers">
          {markers.map((marker) => (
            <small key={marker.label}>{marker.label}: {marker.value}</small>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScenarioGoals({ result, name }) {
  const savingsMax = Math.max(result.savingsUf, result.pieRecomendadoUf, result.pieMinimoUf, 1);
  const dividendMax = Math.max(result.dividend, result.prudentDividend, 1);
  const savingsStatus = getSavingsGoal(result);
  const dividendStatus = getDividendGoal(result);

  return (
    <article className="comparison-goal-card">
      <strong>{name}</strong>
      <BulletGoal
        title="Pie"
        measuredLabel="Ahorro disponible"
        measuredValue={formatUf(result.savingsUf)}
        measuredPercent={getPercent(result.savingsUf, savingsMax)}
        status={savingsStatus}
        markers={[
          { label: "Minimo", value: formatUf(result.pieMinimoUf), percent: getPercent(result.pieMinimoUf, savingsMax), tone: "minimum" },
          { label: "Recomendado", value: formatUf(result.pieRecomendadoUf), percent: getPercent(result.pieRecomendadoUf, savingsMax), tone: "recommended" },
        ]}
      />
      <BulletGoal
        title="Dividendo"
        measuredLabel={result.dividend > 0 ? "Dividendo declarado" : "Dato no declarado"}
        measuredValue={result.dividend > 0 ? formatClp(result.dividend) : "$0"}
        measuredPercent={getPercent(result.dividend, dividendMax)}
        status={dividendStatus}
        markers={result.prudentDividend > 0 ? [
          { label: "Limite prudente", value: formatClp(result.prudentDividend), percent: getPercent(result.prudentDividend, dividendMax), tone: "recommended" },
        ] : []}
      />
    </article>
  );
}

function ComparisonGoals({ current, alternative, currentName, alternativeName }) {
  return (
    <div className="comparison-goal-grid" aria-label="Metas financieras de escenarios comparados">
      <ScenarioGoals result={current} name={currentName} />
      <ScenarioGoals result={alternative} name={alternativeName} />
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

function ComparisonVisual({ metrics, current, alternative, currentName, alternativeName, view, onViewChange }) {
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
      ) : view === "bars" ? (
        <ComparisonBars metrics={metrics} currentName={currentName} alternativeName={alternativeName} />
      ) : (
        <ComparisonGoals current={current} alternative={alternative} currentName={currentName} alternativeName={alternativeName} />
      )}
    </div>
  );
}

function ConceptHelpCta({ onNavigate }) {
  return (
    <section className="simulation-academy-cta" aria-labelledby="simulation-academy-title">
      <div>
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
  const simulationProjects = useMemo(() => getSimulationProjects(), []);
  const [mode, setMode] = useState("project");
  const [selectedProjectId, setSelectedProjectId] = useState(simulationProjects[0]?.id || "");
  const [compareProjectId, setCompareProjectId] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualUnit, setManualUnit] = useState("uf");
  const [comparison, setComparison] = useState(null);
  const [comparisonView, setComparisonView] = useState("goals");
  const [targetProject, setTargetProject] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TARGET_PROJECT_KEY)) || null;
    } catch {
      return null;
    }
  });
  const comparisonRef = useRef(null);

  const selectedProject = useMemo(
    () => getSimulationProjectById(selectedProjectId) || simulationProjects[0] || null,
    [selectedProjectId, simulationProjects],
  );
  const compareProject = useMemo(
    () => getSimulationProjectById(compareProjectId),
    [compareProjectId],
  );

  const manualScenario = useMemo(
    () => getScenarioFromManualValue(manualValue, ufValueClp, manualUnit),
    [manualUnit, manualValue, ufValueClp],
  );

  const scenario = useMemo(() => {
    if (mode === "manual") return manualScenario;
    if (!selectedProject) return null;
    return projectToSimulationScenario(selectedProject, ufValueClp);
  }, [manualScenario, mode, selectedProject, ufValueClp]);

  const scenarioResult = useMemo(
    () => scenario ? evaluateScenario(context, scenario) : null,
    [context, scenario],
  );
  const alternatives = useMemo(
    () => buildAccessibleAlternatives(simulationProjects, context, onboarding, 4),
    [context, onboarding, simulationProjects],
  );
  const maxRange = useMemo(() => getMaxValueRange(context), [context]);
  const hasManualValue = mode !== "manual" || Number(manualValue) > 0;
  const currentComparable = scenarioResult && hasManualValue ? scenarioResult : null;
  const targetProjectId = targetProject?.id || "";
  const compareProjectResult = useMemo(
    () => projectToComparable(compareProject, context, ufValueClp),
    [compareProject, context, ufValueClp],
  );
  const selectorComparison = useMemo(() => {
    if (!currentComparable || !compareProjectResult) return null;
    return {
      source: "project-selector",
      current: currentComparable,
      alternative: compareProjectResult,
    };
  }, [compareProjectResult, currentComparable]);
  const activeComparison = useMemo(
    () => resolveActiveComparison(comparison, selectorComparison),
    [comparison, selectorComparison],
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
    () => buildComparisonInsights(activeComparison?.current || currentComparable, activeComparison?.alternative, comparisonPreferences),
    [activeComparison, comparisonPreferences, currentComparable],
  );
  const showScenarioWarning = mode === "manual" && !hasManualValue;
  const showComparisonWarning = shouldShowComparisonWarning(comparison, activeComparison, showScenarioWarning);

  useEffect(() => {
    if ((activeComparison || showComparisonWarning) && comparisonRef.current) {
      comparisonRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeComparison, showComparisonWarning]);

  const handleCompareProjectChange = (projectId) => {
    setCompareProjectId(projectId);
    if (!projectId) {
      setComparison((prev) => (prev?.source === "project-selector" ? null : prev));
      return;
    }
    const nextProject = getSimulationProjectById(projectId);
    const nextResult = projectToComparable(nextProject, context, ufValueClp);
    if (!currentComparable || !nextResult) {
      setComparison({ source: "project-selector", error: true });
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
      <div className="section-heading">
        <span className="eyebrow">Simulación</span>
        <h1>Compatibilidad y alternativas</h1>
        <p>
          Compara proyectos referenciales o ingresa un valor de vivienda para estimar brechas con los datos de tu última preevaluación.
        </p>
      </div>

      <div className="simulation-disclaimer">
        Esta simulación es referencial y se basa en datos declarados. No corresponde a aprobación bancaria, preaprobación, tasación ni cotización formal.
      </div>

      <div className="simulation-layout">
        <div className="simulator-panel">
          <div className="simulation-panel-heading">
            <span className="eyebrow">Escenario base</span>
            <h2>Elige qué quieres evaluar</h2>
          </div>

          <div className="simulation-actions">
            <div className="segmented-control simulation-mode">
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
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  {simulationProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {getProjectLabel(project)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="simulator-field">
                Valor de vivienda
                <div className="manual-value-input">
                  <input
                    min="0"
                    inputMode="numeric"
                    type="number"
                    value={manualValue}
                    onChange={(event) => setManualValue(event.target.value)}
                    placeholder={manualUnit === "uf" ? "Ej: 2800" : "Ej: 112000000"}
                  />
                  <div className="segmented-control manual-unit-toggle" aria-label="Unidad del valor manual">
                    <button
                      className={manualUnit === "uf" ? "is-active" : ""}
                      type="button"
                      onClick={() => setManualUnit("uf")}
                      aria-pressed={manualUnit === "uf"}
                    >
                      UF
                    </button>
                    <button
                      className={manualUnit === "clp" ? "is-active" : ""}
                      type="button"
                      onClick={() => setManualUnit("clp")}
                      aria-pressed={manualUnit === "clp"}
                    >
                      CLP
                    </button>
                  </div>
                </div>
                <span className="field-help">
                  {manualUnit === "uf"
                    ? "Se mostrará su equivalente aproximado en CLP usando la UF referencial disponible."
                    : "Se mostrará su equivalente aproximado en UF usando la UF referencial disponible."}
                </span>
                {Number(manualValue) > 0 ? (
                  <span className="field-help">
                    Equivalencia referencial: {formatUfClp(manualScenario.valueUf, manualScenario.valueClp)}.
                  </span>
                ) : null}
              </label>
            )}

            <label className="simulator-field compare-field">
              Comparar con otro proyecto
              <select value={compareProjectId} onChange={(event) => handleCompareProjectChange(event.target.value)}>
                <option value="">Selecciona proyecto para comparar</option>
                {simulationProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {getProjectLabel(project)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="simulation-preferences">
            <div className="simulation-panel-heading compact">
              <span className="eyebrow">Preferencias consideradas</span>
              <div className="simulation-preferences-copy">
                <p>
                  Estamos usando tus respuestas preliminares. Si quieres cambiarlas, actualízalas.
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
          <h2>Rango referencial por ahorro</h2>
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
          <h2>Comparación de escenarios</h2>
          <p>
            {activeComparison?.current && activeComparison?.alternative
              ? comparisonInsights.summary
              : "Selecciona un proyecto en el comparador o usa una opción accesible para contrastarla con tu escenario actual."}
          </p>
        </div>

        {showComparisonWarning ? (
          <div className="warning-box">
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
            {activeComparison?.alternative ? (
              <>
                <ProjectImagePlaceholder result={activeComparison.alternative} compact />
                <strong>{getScenarioName(activeComparison.alternative)}</strong>
                <small>{formatUfClp(activeComparison.alternative.valueUf, activeComparison.alternative.valueClp)} · {activeComparison.alternative.status}</small>
              </>
            ) : (
              <small>Selecciona un proyecto para comparar o usa una opción accesible.</small>
            )}
          </article>
        </div>

        {activeComparison?.current && activeComparison?.alternative ? (
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
              current={activeComparison.current}
              alternative={activeComparison.alternative}
              currentName={getScenarioChartName(activeComparison.current)}
              alternativeName={getScenarioChartName(activeComparison.alternative)}
              view={comparisonView}
              onViewChange={setComparisonView}
            />
          </div>
        ) : null}

        <div className="comparison-grid">
          {[{ label: "Escenario A", data: activeComparison?.current || currentComparable }, { label: "Escenario B", data: activeComparison?.alternative }].map((item) => (
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
              <h2>{scenario.label}</h2>
              <p>{scenario.comuna || "Valor ingresado manualmente"} · {scenario.tipo_vivienda || "Tipo no especificado"}</p>
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

          <div className="sim-metrics">
            <div className="metric">
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
        <div className="warning-box">
          Ingresa un valor de vivienda en UF o CLP para calcular el escenario manual.
        </div>
      )}

      <div className="alternatives-block">
        <div className="section-heading compact">
          <h2>Opciones más accesibles</h2>
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
                {targetProject.comuna} · {propertyLabels[targetProject.tipo_vivienda] || targetProject.tipo_vivienda} · {formatUf(targetProject.valor_uf)}
              </small>
            </div>
            <button className="secondary-button compact-button" type="button" onClick={handleClearTargetProject}>
              Eliminar selección
            </button>
          </div>
        ) : null}

        <div className="alternative-grid">
          {alternatives.map((item) => (
            <article className="alternative-card simulation-alternative" key={item.project.id}>
              <ProjectImagePlaceholder result={item} compact />
              <div>
                <span className={`simulation-status ${statusClass[item.status] || "adjust"}`}>{item.status}</span>
                <h3>{item.project.nombre}</h3>
                <p>{item.project.comuna} · {propertyLabels[item.project.tipo_vivienda] || item.project.tipo_vivienda}</p>
              </div>
              <strong>{formatUf(item.valueUf)} · {formatClp(item.valueClp)}</strong>
              <p>Brecha principal: {getGapLabel(item.mainGap)}</p>
              <p>Pie mínimo: {formatUfClp(item.pieMinimoUf, item.pieMinimo)}</p>
              {item.preference.communeMatch ? <span className="alternative-benefit">Coincide con tu comuna objetivo</span> : null}
              {item.preference.typeMatch ? <span className="alternative-benefit">Coincide con tu tipo de vivienda</span> : null}
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
        </div>
      </div>

      <ConceptHelpCta onNavigate={onNavigate} />
    </section>
  );
}
