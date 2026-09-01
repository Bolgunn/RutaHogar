import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildHousingAlternatives,
  buildHousingNotViableRecommendation,
  buildMonthlyHousingPlan,
  COSTO_VIDA_FIJO,
  determinePlanStatus,
  formatClp,
  formatMoneyInput,
  getHousingPropertyPrice,
  serializeHousingProgress,
  stripMoneyInput,
} from "../services/housingSavingsPlanService";
import { getCurrentMonthId, partitionMonths } from "../services/monthTimeline";

const pieTypeOptions = [
  { value: "minimo", label: "Pie mínimo (10%)" },
  { value: "recomendado", label: "Pie recomendado (20%)" },
];

const cardStatusLabels = {
  pendiente: "Pendiente",
  logrado: "Logrado",
  no_logrado: "No logrado",
};

const planStatusClass = (status) => {
  if (status === "alcanzado") return "status-alcanzado";
  if (status === "en_curso") return "status-en-curso";
  if (status === "en_progreso") return "status-en-progreso";
  return "status-pendiente";
};

export default function HousingSavingsPlan({ evaluation, onBack, initialPieType, onSaveHousingProgress, onLogScoringEvent }) {
  const [progressData, setProgressData] = useState(evaluation?.housing_plan?.progress || null);
  const [pieType, setPieType] = useState(initialPieType || "minimo");
  const [overrides, setOverrides] = useState({});
  const [expandedClosedIds, setExpandedClosedIds] = useState(() => new Set());

  const propertyPrice = useMemo(() => {
    return getHousingPropertyPrice(evaluation);
  }, [evaluation]);

  const baseline = useMemo(() => {
    const input = evaluation?.input || {};
    return {
      income: Number(input.ingreso_mensual) || 0,
      debt: Number(input.deuda_mensual) || 0,
      costOfLiving: COSTO_VIDA_FIJO,
      savings: Number(input.ahorro_disponible) || 0,
      price: propertyPrice,
      codeudorIncome: Number(input.ingreso_mensual_complementario) || 0,
      codeudorDebt: Number(input.deuda_mensual_complementario) || 0,
    };
  }, [evaluation, propertyPrice]);

  const realPlan = useMemo(
    () => buildMonthlyHousingPlan(evaluation?.input || {}, propertyPrice, pieType, progressData),
    [evaluation, propertyPrice, pieType, progressData],
  );

  const simPlan = useMemo(
    () => buildMonthlyHousingPlan(evaluation?.input || {}, propertyPrice, pieType, progressData, overrides),
    [evaluation, propertyPrice, pieType, progressData, overrides],
  );

  const autoStatus = useMemo(
    () => determinePlanStatus(realPlan, progressData, pieType, Boolean(evaluation?.housing_plan)),
    [realPlan, progressData, pieType, evaluation?.housing_plan],
  );

  const hasSimulation = useMemo(() => {
    return (
      overrides.includeCodeudor ||
      ["income", "debt", "costOfLiving", "savings", "price", "codeudorIncome", "codeudorDebt"].some(
        (key) => overrides[key] != null,
      )
    );
  }, [overrides]);

  const showAlternatives =
    (realPlan && !realPlan.error && !realPlan.isViable) ||
    (realPlan?.monthsRecomendado || 0) > 60 ||
    (realPlan?.monthsMinimo || 0) > 60;

  const alternatives = useMemo(
    () =>
      propertyPrice > 0 ? buildHousingAlternatives(evaluation, propertyPrice, pieType, { horizonMonths: 60 }) : [],
    [evaluation, propertyPrice, pieType],
  );

  const simMonths = pieType === "recomendado" ? simPlan.monthsRecomendado : simPlan.monthsMinimo;

  const simBreakdownMonths = simPlan.monthsUntilPie
    ? simPlan.monthsData.slice(0, simPlan.monthsUntilPie)
    : simPlan.monthsData;

  const realTimelineMonths = realPlan.monthsUntilPie
    ? realPlan.monthsData.slice(0, realPlan.monthsUntilPie)
    : realPlan.monthsData;
  const realClosedMonths = realPlan.monthsUntilPie
    ? realPlan.monthsData.length - realPlan.monthsUntilPie
    : 0;

  const currentMonthId = getCurrentMonthId();
  const { open: openMonths, closed: closedMonths } = useMemo(
    () => partitionMonths(realTimelineMonths, currentMonthId),
    [realTimelineMonths, currentMonthId],
  );
  const closedTotal = closedMonths.reduce((sum, month) => sum + (Number(month.savedAmount) || 0), 0);

  const toggleClosedMonth = (monthId) => {
    setExpandedClosedIds((prev) => {
      const next = new Set(prev);
      if (next.has(monthId)) {
        next.delete(monthId);
      } else {
        next.add(monthId);
      }
      return next;
    });
  };

  const realNotViable = useMemo(
    () => realPlan && !realPlan.error && !realPlan.isViable
      ? buildHousingNotViableRecommendation(realPlan)
      : null,
    [realPlan],
  );

  const simNotViable = useMemo(
    () => simPlan && !simPlan.error && !simPlan.isViable
      ? buildHousingNotViableRecommendation(simPlan)
      : null,
    [simPlan],
  );

  const simStatus = useMemo(() => {
    if (simPlan.error) return { type: "error", label: "Sin cálculo" };
    if (!simPlan.isViable) return { type: "no-viable", label: "No viable" };
    if ((simMonths || 0) > 60) return { type: "long", label: "Plazo > 60 meses" };
    return { type: "viable", label: "Viable" };
  }, [simPlan, simMonths]);

  const updateOverride = (key, raw) => {
    const parsed = raw === "" ? null : Math.max(Number(raw) || 0, 0);
    setOverrides((prev) => ({ ...prev, [key]: parsed }));
  };

  const toggleCodeudor = () => {
    setOverrides((prev) => ({ ...prev, includeCodeudor: !prev.includeCodeudor }));
  };

  const applyAlternative = (alt) => {
    if (!alt?.applyOverrides) return;
    const merged = { ...overrides, ...alt.applyOverrides };
    setOverrides(merged);

    const nextSim = buildMonthlyHousingPlan(evaluation?.input || {}, propertyPrice, pieType, progressData, merged);
    onLogScoringEvent?.({
      type: "apply_alternative",
      details: {
        alternative_id: alt.id,
        title: alt.title,
        result_viable: nextSim.isViable,
        months: pieType === "recomendado" ? nextSim.monthsRecomendado : nextSim.monthsMinimo,
        overrides: merged,
      },
    });
  };

  const simFiredKey = useRef(null);
  useEffect(() => {
    if (
      hasSimulation &&
      realPlan && !realPlan.error && !realPlan.isViable &&
      simPlan && !simPlan.error && simPlan.isViable
    ) {
      const key = `${pieType}:${simPlan.monthsMinimo || simPlan.monthsRecomendado || 0}`;
      if (simFiredKey.current !== key) {
        simFiredKey.current = key;
        onLogScoringEvent?.({
          type: "simulate_success",
          details: {
            pie_type: pieType,
            months: pieType === "recomendado" ? simPlan.monthsRecomendado : simPlan.monthsMinimo,
            overrides,
          },
        });
      }
    }
  }, [hasSimulation, realPlan, simPlan, pieType, overrides, onLogScoringEvent]);

  const resetSim = () => {
    setOverrides({});
  };

  const getSimInputValue = (key) => {
    const value = overrides[key];
    return formatMoneyInput(value != null ? value : baseline[key]);
  };

  const updateMonth = (monthId, value) => {
    const nextAmount = value === "" ? "" : Math.max(Number(value) || 0, 0);
    const draftProgress = {
      months: realPlan.monthsData.map((month) => ({
        id: month.id,
        label: month.label,
        savedAmount: month.id === monthId ? nextAmount : month.savedAmount,
      })),
    };
    const nextPlan = buildMonthlyHousingPlan(evaluation?.input || {}, propertyPrice, pieType, draftProgress);
    const serializedProgress = serializeHousingProgress(nextPlan.monthsData);
    setProgressData(serializedProgress);
    onSaveHousingProgress?.(serializedProgress);
    onLogScoringEvent?.({
      type: "register_savings",
      details: {
        total_registered: nextPlan.totalSaved,
        progress_percent: nextPlan.progressPercent,
        gap: nextPlan.gap,
        months_count: nextPlan.months,
      },
    });
  };

  const renderMonthCard = (month) => (
    <article className={"month-card " + month.status} key={month.id}>
      <div>
        <span className="eyebrow">{month.label}</span>
        <h3>{cardStatusLabels[month.status]}</h3>
        <p>Capacidad de ahorro: {formatClp(month.baseTarget)}</p>
        {month.remainingBeforePie > 0 && <p>Falta para el PIE: {formatClp(month.remainingBeforePie)}</p>}
        {month.remainingBeforePie <= 0 && <strong>PIE alcanzado</strong>}
      </div>

      <label>
        Cuanto lograste ahorrar este mes?
        <input
          type="text"
          inputMode="numeric"
          value={formatMoneyInput(month.savedAmount)}
          onChange={(event) => updateMonth(month.id, stripMoneyInput(event.target.value))}
          placeholder="Ej: 100.000"
        />
      </label>

      <div className="month-footer">
        <span>Ahorro acumulado: {formatClp(month.accumulated)}</span>
        <span>Pendiente para PIE: {formatClp(month.remainingBeforePie)}</span>
      </div>
    </article>
  );

  if (!propertyPrice) {
    return (
      <section className="section-block monthly-plan">
        <button className="secondary-button compact-button" type="button" onClick={onBack}>
          Volver al Plan de Mejora
        </button>
        <div className="section-heading compact">
          <span className="eyebrow">Plan de ahorro vivienda</span>
          <h1>Plan de ahorro para tu vivienda</h1>
        </div>
        <div className="empty-state">
          <strong>No hay un objetivo de vivienda definido.</strong>
          <p>Define un precio de vivienda o una comuna objetivo en tu precalificación para generar este plan.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section-block monthly-plan housing-plan-detail">
      <button className="secondary-button compact-button" type="button" onClick={onBack}>
        Volver al Plan de Mejora
      </button>

      <div className="section-heading compact">
        <span className="eyebrow">Plan de ahorro vivienda</span>
        <h1>Plan de ahorro para tu vivienda</h1>
        <p>
          Calculamos cuánto necesitas ahorrar para el pie de tu vivienda y cuánto tiempo te tomará
          según tu capacidad de ahorro actual.
        </p>
      </div>

      <div className="housing-plan-status">
        <div className={"status-badge " + planStatusClass(autoStatus.status)}>
          <span className="eyebrow">Estado del plan</span>
          <strong>{autoStatus.label}</strong>
          <small>
            {autoStatus.status === "pendiente" && "Aún no confirmas ni registras ahorro para este plan"}
            {autoStatus.status === "en_curso" && "Plan confirmado, registra tu ahorro mes a mes"}
            {autoStatus.status === "en_progreso" && "Vas avanzando, confirma tu plan para ponerlo en curso"}
            {autoStatus.status === "alcanzado" && "Completaste el ahorro necesario para este PIE"}
          </small>
        </div>
      </div>

      <div className="housing-savings-summary">
        <div className="summary-grid">
          <div className="summary-block">
            <span>Precio vivienda</span>
            <strong>{formatClp(realPlan.price)}</strong>
          </div>
          <div className="summary-block">
            <span>Ahorro disponible</span>
            <strong>{formatClp(realPlan.currentSavings)}</strong>
          </div>
          <div className="summary-block">
            <span>Capacidad de ahorro mensual</span>
            <strong>{formatClp(realPlan.monthlyCapacity)}</strong>
            <small>Ingreso - Deuda - ${COSTO_VIDA_FIJO.toLocaleString()} costo vida</small>
          </div>
        </div>

        <div className="pie-type-selector">
          <span className="eyebrow">Escenario de PIE</span>
          <div className="btn-group" role="group">
            {pieTypeOptions.map((opt) => (
              <button
                key={opt.value}
                className={pieType === opt.value ? "btn-group-selected" : ""}
                onClick={() => setPieType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="gap-summary">
          <div className="summary-block highlight">
            <span>PIE requerido</span>
            <strong>{formatClp(realPlan.pieRequired)}</strong>
          </div>
          <div className={"summary-block " + (realPlan.remainingGap > 0 ? "warning" : "ok")}>
            <span>Brecha</span>
            <strong>{formatClp(realPlan.remainingGap)}</strong>
            {realPlan.remainingGap > 0 ? (
              <small>Falta ahorrar esta cantidad</small>
            ) : (
              <small>Ya completaste este PIE</small>
            )}
          </div>
          <div className="summary-block highlight">
            <span>Tiempo estimado</span>
            {realPlan.monthsMinimo || realPlan.monthsRecomendado ? (
              <>
                <strong>{pieType === "recomendado" ? realPlan.monthsRecomendado : realPlan.monthsMinimo} meses</strong>
                <small>Ahorrando {formatClp(realPlan.monthlyCapacity)} mensual</small>
              </>
            ) : (
              <strong>{realPlan.isViable ? "Cálculo en progreso" : "No viable actualmente"}</strong>
            )}
          </div>
        </div>

        {!realPlan.isViable && !realPlan.error && (
          <div className="warning-note">
            {realNotViable?.message ||
              "Con tu ingreso menos las deudas no alcanzas para cubrir el costo de vida base."}
            {" "}Revisa las alternativas de abajo o ajusta variables en el simulador.
          </div>
        )}

        {realPlan.error && <div className="warning-note">{realPlan.error}</div>}
      </div>

      {simPlan.monthsData.length > 0 && (
        <div className="housing-breakdown">
          <div className="section-heading compact">
            <span className="eyebrow">Proyección</span>
            <h2>Desglose mes a mes</h2>
            <p>Ingreso, deuda, costo de vida y avance hacia el PIE, mes a mes.</p>
          </div>

          {hasSimulation && (
            <div className="scenario-note">
              Mostrando escenario simulado.
              <button type="button" onClick={resetSim}>
                Restablecer a tus datos
              </button>
            </div>
          )}

          <div className="table-wrap housing-breakdown-table">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Ingreso</th>
                  <th>Deuda</th>
                  <th>Costo de vida</th>
                  <th>Ahorro del mes</th>
                  <th>Acumulado hacia PIE</th>
                  <th>Faltante para PIE</th>
                </tr>
              </thead>
              <tbody>
                {simBreakdownMonths.map((month) => (
                  <tr key={month.id}>
                    <td>{month.label}</td>
                    <td>{formatClp(month.income)}</td>
                    <td>{formatClp(month.debt)}</td>
                    <td>{formatClp(month.costOfLiving)}</td>
                    <td>{formatClp(month.baseTarget)}</td>
                    <td>{formatClp(month.expectedAccumulated)}</td>
                    <td>{formatClp(Math.max(simPlan.gap - month.expectedAccumulated, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tracking-footnote">
            El acumulado proyectado considera ahorrar {formatClp(simPlan.monthlyCapacity)} mensual a partir del
            ahorro actual de {formatClp(simPlan.currentSavings)}.
          </p>
        </div>
      )}

      <div className="simulator-panel">
        <div className="section-heading compact">
          <span className="eyebrow">Simulador de escenarios</span>
          <h2>¿Qué pasa si cambio mis variables?</h2>
          <p>Mueve los valores y mira el recálculo en vivo. No modifica tus datos guardados.</p>
        </div>

        <div className="simulator-grid">
          <label className="simulator-field">
            Ingreso mensual
            <input
              type="text"
              inputMode="numeric"
              value={getSimInputValue("income")}
              onChange={(e) => updateOverride("income", stripMoneyInput(e.target.value))}
              placeholder="Ej: 1.200.000"
            />
          </label>
          <label className="simulator-field">
            Deuda mensual
            <input
              type="text"
              inputMode="numeric"
              value={getSimInputValue("debt")}
              onChange={(e) => updateOverride("debt", stripMoneyInput(e.target.value))}
              placeholder="Ej: 150.000"
            />
          </label>
          <label className="simulator-field">
            Costo de vida
            <input
              type="text"
              inputMode="numeric"
              value={getSimInputValue("costOfLiving")}
              onChange={(e) => updateOverride("costOfLiving", stripMoneyInput(e.target.value))}
              placeholder="Ej: 550.000"
            />
          </label>
          <label className="simulator-field">
            Ahorro disponible
            <input
              type="text"
              inputMode="numeric"
              value={getSimInputValue("savings")}
              onChange={(e) => updateOverride("savings", stripMoneyInput(e.target.value))}
              placeholder="Ej: 3.000.000"
            />
          </label>
          <label className="simulator-field">
            Precio de vivienda
            <input
              type="text"
              inputMode="numeric"
              value={getSimInputValue("price")}
              onChange={(e) => updateOverride("price", stripMoneyInput(e.target.value))}
              placeholder="Ej: 140.000.000"
            />
          </label>

          <label className="check-row simulator-codeudor-toggle">
            <input
              type="checkbox"
              checked={overrides.includeCodeudor || false}
              onChange={toggleCodeudor}
            />
            Complementar renta (codeudor)
          </label>

          {overrides.includeCodeudor && (
            <>
              <label className="simulator-field">
                Ingreso del codeudor
                <input
                  type="text"
                  inputMode="numeric"
                  value={getSimInputValue("codeudorIncome")}
                  onChange={(e) => updateOverride("codeudorIncome", stripMoneyInput(e.target.value))}
                  placeholder="Ej: 800.000"
                />
              </label>
              <label className="simulator-field">
                Deuda del codeudor
                <input
                  type="text"
                  inputMode="numeric"
                  value={getSimInputValue("codeudorDebt")}
                  onChange={(e) => updateOverride("codeudorDebt", stripMoneyInput(e.target.value))}
                  placeholder="Ej: 100.000"
                />
              </label>
            </>
          )}
        </div>

        <div className="simulator-result">
          <div className={"sim-badge " + simStatus.type}>{simStatus.label}</div>
          <div className="sim-metrics">
            <div className="metric">
              <span>Capacidad mensual</span>
              <strong>{formatClp(simPlan.monthlyCapacity)}</strong>
            </div>
            <div className="metric">
              <span>PIE requerido</span>
              <strong>{formatClp(simPlan.pieRequired)}</strong>
            </div>
            <div className="metric">
              <span>Brecha</span>
              <strong>{formatClp(simPlan.remainingGap)}</strong>
            </div>
            <div className="metric metric-highlight">
              <span>Tiempo estimado</span>
              <strong>{simMonths ? `${simMonths} meses` : "—"}</strong>
            </div>
          </div>
          {simNotViable && <p className="alternative-reason">{simNotViable.message}</p>}
          {hasSimulation && (
            <button className="secondary-button compact-button" type="button" onClick={resetSim}>
              Restablecer escenario
            </button>
          )}
        </div>
      </div>

      {showAlternatives && (
        <div className="alternatives-block">
          <div className="section-heading compact">
            <span className="eyebrow">Alternativas</span>
            <h2>Opciones para hacer viable tu plan</h2>
            <p>Aplica una alternativa y el simulador se actualizará en vivo. Puedes combinar más de una.</p>
          </div>

          <div className="alternative-grid">
            {alternatives.map((alt) => (
              <article className={"alternative-card" + (alt.applicable ? "" : " is-disabled")} key={alt.id}>
                <h3>{alt.title}</h3>
                <p>{alt.description}</p>
                {alt.changeLabel && <strong className="alternative-change">{alt.changeLabel}</strong>}
                {alt.benefitLabel && <p className="alternative-benefit">{alt.benefitLabel}</p>}
                {!alt.applicable && alt.disabledReason && (
                  <p className="alternative-reason">{alt.disabledReason}</p>
                )}
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!alt.applicable}
                  onClick={() => applyAlternative(alt)}
                >
                  Aplicar este escenario
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {realPlan.hasValidTarget && (
        <>
          <div className="plan-progress">
            <div>
              <span>Brecha por cubrir</span>
              <strong>{formatClp(realPlan.remainingGap)}</strong>
            </div>
            <div>
              <span>Ahorro adicional registrado</span>
              <strong>
                {formatClp(realPlan.totalSaved)} de {formatClp(realPlan.gap)}
              </strong>
            </div>
            <div>
              <span>Progreso</span>
              <strong>{realPlan.progressPercent}%</strong>
            </div>
          </div>

          <div className="progress-bar" aria-label={"Progreso del plan " + realPlan.progressPercent + "%"}>
            <span style={{ width: realPlan.progressPercent + "%" }} />
          </div>

          <div className="monthly-timeline">
            {closedMonths.length > 0 && (
              <div className="month-summary">
                <div className="month-summary-header">
                  <strong>Meses registrados</strong>
                  <span>Total: {formatClp(closedTotal)}</span>
                </div>
                {closedMonths.map((month) => (
                  <div
                    className={"month-summary-row" + (expandedClosedIds.has(month.id) ? " is-open" : "")}
                    key={month.id}
                  >
                    <button
                      type="button"
                      className="month-summary-toggle"
                      onClick={() => toggleClosedMonth(month.id)}
                      aria-expanded={expandedClosedIds.has(month.id)}
                    >
                      <span className="month-summary-label">{month.label}</span>
                      <span className="month-summary-amount">
                        {month.savedAmount === "" ? "Sin registrar" : formatClp(month.savedAmount)}
                      </span>
                      <span className={"month-status-badge " + month.status}>
                        {month.status === "logrado"
                          ? "\u2713 Logrado"
                          : month.status === "no_logrado"
                            ? "Parcial"
                            : "Pendiente"}
                      </span>
                      <span className="month-summary-chevron">{expandedClosedIds.has(month.id) ? "\u25b4" : "\u25be"}</span>
                    </button>
                    {expandedClosedIds.has(month.id) && (
                      <div className="month-summary-detail">{renderMonthCard(month)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {openMonths.map((month) => renderMonthCard(month))}
          </div>

          {realClosedMonths > 0 && (
            <div className="plan-closed-note">
              {realClosedMonths} meses restantes — No aplica (plan completado)
            </div>
          )}
        </>
      )}
    </section>
  );
}
