import React, { useEffect, useMemo, useState } from "react";
import { buildMonthlyPlan, formatClp, isMonetaryPlanGoal, serializeMonthlyProgress } from "../services/monthlyPlanService";
import { formatMoneyInput, stripMoneyInput } from "../services/moneyFormat";
import { getCurrentMonthId, partitionMonths } from "../services/monthTimeline";

const statusLabels = {
  pendiente: "Pendiente",
  logrado: "Logrado",
  no_logrado: "No logrado",
};

export default function MonthlyPlan({ evaluation, goal, onBack, onSaveProgress }) {
  const [progressData, setProgressData] = useState(goal?.progress_data || null);
  const [expandedClosedIds, setExpandedClosedIds] = useState(() => new Set());
  const hasMonetaryGoal = isMonetaryPlanGoal(goal);
  const plan = useMemo(() => buildMonthlyPlan(evaluation, progressData), [evaluation, progressData]);

  useEffect(() => {
    setProgressData(goal?.progress_data || null);
  }, [goal?.id, goal?.progress_data]);

  const currentMonthId = getCurrentMonthId();
  const { open: openMonths, closed: closedMonths } = useMemo(
    () => partitionMonths(plan.monthsData, currentMonthId),
    [plan.monthsData, currentMonthId],
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

  const updateMonth = (monthId, value) => {
    const nextAmount = value === "" ? "" : Math.max(Number(value) || 0, 0);
    const draftProgress = {
      months: plan.monthsData.map((month) => ({
        id: month.id,
        label: month.label,
        savedAmount: month.id === monthId ? nextAmount : month.savedAmount,
      })),
    };
    const nextPlan = buildMonthlyPlan(evaluation, draftProgress);
    const serializedProgress = serializeMonthlyProgress(nextPlan.monthsData);

    setProgressData(serializedProgress);
    onSaveProgress?.(goal.id, serializedProgress);
  };

  const renderMonthCard = (month) => (
    <article className={"month-card " + month.status} key={month.id}>
      <div>
        <span className="eyebrow">{month.label}</span>
        <h3>{statusLabels[month.status]}</h3>
        <p>Meta base: {formatClp(month.baseTarget)}</p>
        <p>Deficit anterior: {formatClp(month.previousDeficit)}</p>
        <strong>Meta ajustada: {formatClp(month.adjustedTarget)}</strong>
      </div>

      <label>
        ¿Cuánto lograste ahorrar este mes?
        <input
          type="text"
          inputMode="numeric"
          value={formatMoneyInput(month.savedAmount)}
          onChange={(event) => updateMonth(month.id, stripMoneyInput(event.target.value))}
          placeholder="Ej: 100.000"
        />
      </label>

      <div className="month-footer">
        <span>Acumulado esperado: {formatClp(month.expectedAccumulated)}</span>
        <span>Acumulado real: {formatClp(month.accumulated)}</span>
      </div>
    </article>
  );

  return (
    <section className="section-block monthly-plan">
      <button className="secondary-button compact-button" type="button" onClick={onBack}>Volver al Plan de Mejora</button>

      <div className="section-heading compact">
        <span className="eyebrow">Plan mensual</span>
        <h1>{goal?.title || "Plan mensual de ahorro"}</h1>
        <p>Este plan considera avances desde hoy. Los datos ya declarados se muestran aparte y no se vuelven a contar como avance mensual.</p>
      </div>

      {!hasMonetaryGoal ? (
        <div className="empty-state">
          <strong>Esta meta no requiere ahorro mensual directo.</strong>
          <p>Se activa cuando completes avances relevantes o cuando pase el periodo recomendado antes de volver a precalificar.</p>
        </div>
      ) : !plan.hasValidTarget ? (
        <div className="empty-state">
          <strong>Plan sin metas monetarias calculadas.</strong>
          <p>No hay una meta adicional de ahorro o reducción mensual para esta calificación. Mantén estabilidad y revisa tus avances antes de volver a evaluar.</p>
        </div>
      ) : (
        <>
          <div className="plan-progress">
            <div>
              <span>Ahorro declarado actual</span>
              <strong>{formatClp(plan.currentSavings)}</strong>
            </div>
            <div>
              <span>Ahorro adicional logrado</span>
              <strong>{formatClp(plan.totalSaved)} de {formatClp(plan.additionalTarget)}</strong>
            </div>
            <div>
              <span>Progreso del plan</span>
              <strong>{plan.progressPercent}%</strong>
            </div>
          </div>

          <div className="progress-bar" aria-label={`Progreso del plan ${plan.progressPercent}%`}>
            <span style={{ width: `${plan.progressPercent}%` }} />
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
        </>
      )}
    </section>
  );
}
