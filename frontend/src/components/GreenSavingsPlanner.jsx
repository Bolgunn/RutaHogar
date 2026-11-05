import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatDeliveryMonth } from "../lib/simulation/projectAdapter";
import {
  buildDeveloperInstallmentComparison,
  buildGreenSavingsGoalPayload,
  calculateGreenSavingsSchedule,
  calculateMonthsUntilDelivery,
  formatClpExact,
  formatUfAmount,
  getEffectiveGreenSavingsGoal,
  GREEN_PLANNER_TERM_PRESETS,
  isTrackingPlanActive,
  isUnderConstructionProject,
  resolveGreenPlannerUfReference,
  persistGreenSavingsGoal,
  resolveInitialPieUf,
  simulateInflationProtection,
} from "../services/greenSavingsPlannerService";
import { getProjectInstallmentScheme } from "../services/projectService";

export default function GreenSavingsPlanner({
  evaluation = null,
  trackingState = null,
  project = null,
  marketReference = null,
  initialPieUf = null,
  initialPlazoMeses = null,
  referenceDate = new Date(),
  onSaveGreenSavingsGoal = null,
  onScheduleChange = null,
}) {
  const ufRef = useMemo(
    () => resolveGreenPlannerUfReference(evaluation, marketReference),
    [evaluation, marketReference],
  );

  const defaultPieInfo = useMemo(
    () =>
      resolveInitialPieUf({
        project,
        evaluation,
        ufValueClp: ufRef.ufValueClp,
        piePercentage: 0.10,
      }),
    [project, evaluation, ufRef.ufValueClp],
  );

  // E2: la meta guardada en la evaluación puede no traer el esquema de cuotas
  // (metas fijadas antes de existir el campo). Se consulta al catálogo por id.
  const [catalogScheme, setCatalogScheme] = useState(null);
  const projectId = project?.id || null;
  const projectHasScheme = Boolean(project?.esquema_pie_inmobiliaria || project?.pie_cuotas_config);
  const projectHasDelivery = Boolean(project?.entrega_estimada && String(project.entrega_estimada).trim() !== "");

  useEffect(() => {
    if (!projectId || (projectHasScheme && projectHasDelivery)) return undefined;
    let active = true;
    getProjectInstallmentScheme(projectId)
      .then((data) => {
        if (!active || !data) return;
        const scheme = data.esquema_pie_inmobiliaria || (data.ofrece_cuotas !== undefined ? data : null);
        const entrega = data.entrega_estimada || null;
        setCatalogScheme({ esquema_pie_inmobiliaria: scheme, entrega_estimada: entrega });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, projectHasScheme, projectHasDelivery]);

  const comparisonProject = useMemo(() => {
    if (!project) return null;
    return {
      ...project,
      esquema_pie_inmobiliaria: project.esquema_pie_inmobiliaria || catalogScheme?.esquema_pie_inmobiliaria || null,
      entrega_estimada: project.entrega_estimada || catalogScheme?.entrega_estimada || null,
    };
  }, [project, catalogScheme]);

  const deliveryMonths = useMemo(
    () => calculateMonthsUntilDelivery(comparisonProject?.entrega_estimada, referenceDate),
    [comparisonProject?.entrega_estimada, referenceDate],
  );

  const existingGoal = useMemo(
    () => getEffectiveGreenSavingsGoal(evaluation, trackingState),
    [evaluation, trackingState],
  );

  const isConstructionProject = isUnderConstructionProject(comparisonProject);
  const hasConstructionProject = isConstructionProject || Boolean(existingGoal?.type === "pie_en_verde_blanco");

  const [pieUfInput, setPieUfInput] = useState(() => {
    if (initialPieUf != null && Number(initialPieUf) > 0) return String(initialPieUf);
    if (existingGoal?.pie_total_uf > 0) return String(existingGoal.pie_total_uf);
    return String(defaultPieInfo.pieUf);
  });

  const [plazoMesesInput, setPlazoMesesInput] = useState(() => {
    if (initialPlazoMeses != null && Number(initialPlazoMeses) > 0) return String(initialPlazoMeses);
    if (existingGoal?.plazo_meses > 0) return String(existingGoal.plazo_meses);
    if (deliveryMonths && deliveryMonths > 0) return String(deliveryMonths);
    return "18";
  });

  const isPlazoEditedRef = useRef(false);
  const prevProjectIdRef = useRef(projectId);

  // Si cambia el proyecto seleccionado, se reinicia la bandera de edición manual
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId;
      isPlazoEditedRef.current = false;
    }
  }, [projectId]);

  // Actualizar el plazo al resolver la fecha si el usuario todavía no lo editó
  // y no existe un plazo fijado explícitamente (ni por prop initialPlazoMeses ni por meta guardada)
  useEffect(() => {
    const hasExplicitPlazo =
      (initialPlazoMeses != null && Number(initialPlazoMeses) > 0) ||
      Boolean(existingGoal?.plazo_meses > 0);

    if (!isPlazoEditedRef.current && !hasExplicitPlazo && deliveryMonths && deliveryMonths > 0) {
      setPlazoMesesInput(String(deliveryMonths));
    }
  }, [deliveryMonths, initialPlazoMeses, existingGoal]);

  const [savedGoal, setSavedGoal] = useState(existingGoal);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // La meta vigente puede cambiar por fuera (nueva evaluación, recarga del seguimiento).
  useEffect(() => {
    setSavedGoal(existingGoal);
  }, [existingGoal]);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  const numericPieUf = Number(String(pieUfInput).replace(",", "."));
  const numericPlazoMeses = Math.round(Number(plazoMesesInput));

  const schedule = useMemo(
    () =>
      calculateGreenSavingsSchedule({
        pieUf: numericPieUf,
        plazoMeses: numericPlazoMeses,
        ufValueClp: ufRef.ufValueClp,
        entregaEstimada: comparisonProject?.entrega_estimada || null,
        ufEffectiveDate: ufRef.effectiveDate,
        ufSourceLabel: ufRef.sourceLabel,
      }),
    [numericPieUf, numericPlazoMeses, ufRef, comparisonProject?.entrega_estimada],
  );

  useEffect(() => {
    if (onScheduleChange && schedule.isValid && (project || existingGoal)) {
      onScheduleChange(schedule);
    }
  }, [schedule, onScheduleChange, project, existingGoal]);

  const developerComparison = useMemo(
    () =>
      buildDeveloperInstallmentComparison({
        project: comparisonProject,
        pieUf: numericPieUf,
        plazoPersonalMeses: numericPlazoMeses,
        ufValueClp: ufRef.ufValueClp,
      }),
    [comparisonProject, numericPieUf, numericPlazoMeses, ufRef.ufValueClp],
  );

  const inflationProjection = useMemo(
    () =>
      simulateInflationProtection({
        pieUf: numericPieUf,
        plazoMeses: numericPlazoMeses,
        ufValueClp: ufRef.ufValueClp,
        propertyUf: defaultPieInfo.propertyUf,
      }),
    [numericPieUf, numericPlazoMeses, ufRef.ufValueClp, defaultPieInfo.propertyUf],
  );

  const trackingActive = isTrackingPlanActive(evaluation, trackingState);
  const deliveryLabel = formatDeliveryMonth(comparisonProject?.entrega_estimada);

  const handleSelectPresetTerm = (months) => {
    isPlazoEditedRef.current = true;
    setPlazoMesesInput(String(months));
    setSaveMessage("");
  };

  const handleSelectPiePercentage = (pct) => {
    const nextPie = Math.round(defaultPieInfo.propertyUf * pct * 100) / 100;
    setPieUfInput(String(nextPie));
    setSaveMessage("");
  };

  const handleFixGreenGoal = async () => {
    if (!schedule.isValid || !trackingActive || saving) return;
    setSaving(true);
    setSaveMessage("");
    setSaveStatus("");
    try {
      const payload = buildGreenSavingsGoalPayload({
        schedule,
        project: comparisonProject || project,
        instrument: existingGoal?.instrumento_sugerido || "cuenta_uf",
      });
      const { status } = await persistGreenSavingsGoal({
        payload,
        evaluationId: evaluation?.id || trackingState?.current_evaluation_id || null,
        onSave: onSaveGreenSavingsGoal,
      });
      setSavedGoal(payload);
      setSaveStatus(status);
      const resumen = `${formatUfAmount(payload.cuota_mensual_uf)} / mes (${formatClpExact(payload.cuota_mensual_clp)} a valor de hoy) por ${payload.plazo_meses} meses`;
      setSaveMessage(
        status === "synced"
          ? `Meta fijada en tu dashboard: ${resumen}.`
          : `No pudimos guardar la meta en tu cuenta. Quedó guardada solo en este dispositivo (${resumen}); vuelve a presionar "Fijar meta de pie en verde" para reintentar.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const visibleCronograma = showFullSchedule
    ? schedule.cronograma
    : schedule.cronograma.slice(0, 6);

  return (
    <section
      className="section-block green-savings-planner"
      aria-labelledby="green-planner-title"
    >
      <div className="section-heading compact">
        <span className="eyebrow">Compra en Verde / Blanco (HU 29)</span>
        <h2 id="green-planner-title">Planificador interactivo de metas de ahorro para el pie</h2>
        <p className="green-planner-p-justified">
          Simula tu cronograma mensual de ahorro en UF hasta la recepción municipal y entrega del
          edificio. Este planificador te permite llegar a la escrituración con el pie completo y en
          instrumentos financieros reajustables, evitando sobreendeudarte en créditos de consumo.
        </p>
        {project?.nombre && (
          <div className="green-planner__project-badge">
            <span><strong>Proyecto:</strong> {project.nombre}</span>
            {deliveryLabel && <span>· <strong>Entrega estimada:</strong> {deliveryLabel}</span>}
            {defaultPieInfo.propertyUf > 0 && <span>· <strong>Valor ref.:</strong> {formatUfAmount(defaultPieInfo.propertyUf, 0)}</span>}
          </div>
        )}
      </div>

      {/* Controles E1: Pie en UF y Plazo en meses */}
      <div className="green-planner__controls">
        <div className="green-planner__field">
          <label htmlFor="green-planner-pie-uf">
            Valor del pie objetivo (UF)
          </label>
          <input
            id="green-planner-pie-uf"
            aria-label="Valor del pie objetivo (UF)"
            type="number"
            min="1"
            step="0.5"
            value={pieUfInput}
            onChange={(e) => {
              setPieUfInput(e.target.value);
              setSaveMessage("");
            }}
          />
          {defaultPieInfo.propertyUf > 0 && (
            <div className="green-planner__btn-group" role="group" aria-label="Porcentaje de pie referencial">
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => handleSelectPiePercentage(0.10)}
              >
                Pie 10% ({formatUfAmount(defaultPieInfo.propertyUf * 0.10, 0)})
              </button>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => handleSelectPiePercentage(0.20)}
              >
                Pie 20% ({formatUfAmount(defaultPieInfo.propertyUf * 0.20, 0)})
              </button>
            </div>
          )}
        </div>

        <div className="green-planner__field">
          <label htmlFor="green-planner-plazo-meses">
            Plazo restante hasta entrega (meses)
          </label>
          <input
            id="green-planner-plazo-meses"
            aria-label="Plazo restante hasta entrega (meses)"
            type="number"
            min="1"
            max="120"
            step="1"
            value={plazoMesesInput}
            onChange={(e) => {
              isPlazoEditedRef.current = true;
              setPlazoMesesInput(e.target.value);
              setSaveMessage("");
            }}
          />
          <div
            className="green-planner__btn-group"
            role="group"
            aria-label="Plazos frecuentes de entrega en obra"
          >
            {GREEN_PLANNER_TERM_PRESETS.map((months) => (
              <button
                key={months}
                type="button"
                className={
                  numericPlazoMeses === months
                    ? "primary-button compact-button"
                    : "secondary-button compact-button"
                }
                onClick={() => handleSelectPresetTerm(months)}
              >
                {months} meses
              </button>
            ))}
            {deliveryMonths && !GREEN_PLANNER_TERM_PRESETS.includes(deliveryMonths) && (
              <button
                type="button"
                className={
                  numericPlazoMeses === deliveryMonths
                    ? "primary-button compact-button"
                    : "secondary-button compact-button"
                }
                onClick={() => handleSelectPresetTerm(deliveryMonths)}
              >
                Entrega obra ({deliveryMonths} meses)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Resultado E1 */}
      {!schedule.isValid ? (
        <div className="warning-note" role="alert">
          {schedule.error}
        </div>
      ) : (
        <>
          <div className="summary-grid green-planner__metrics">
            <div className="summary-block highlight green-planner__metric-card is-highlight">
              <span className="metric-label">Cuota mensual sugerida (UF)</span>
              <strong className="metric-val" data-testid="green-monthly-uf">
                {formatUfAmount(schedule.cuotaMensualUfDisplay)} / mes
              </strong>
              <small className="metric-note">Para reunir {formatUfAmount(schedule.pieUf)} en {schedule.plazoMeses} meses</small>
            </div>

            <div className="summary-block highlight green-planner__metric-card is-highlight">
              <span className="metric-label">Equivalente a valor de hoy (CLP)</span>
              <strong className="metric-val" data-testid="green-monthly-clp">
                {formatClpExact(schedule.cuotaMensualClpHoy)} / mes
              </strong>
              <small className="metric-note">Calculado con UF hoy de {formatClpExact(schedule.ufValueClp)}</small>
            </div>

            <div className="summary-block green-planner__metric-card">
              <span className="metric-label">Pie total objetivo</span>
              <strong className="metric-val">{formatUfAmount(schedule.pieUf)}</strong>
              <small className="metric-note">Equivalente hoy: {formatClpExact(schedule.pieTotalClpHoy)}</small>
            </div>
          </div>

          {/* Supuestos transparentes E1 */}
          <div className="tracking-footnote green-planner__assumptions">
            <strong>Supuestos del cálculo (E1):</strong> Valor UF utilizado:{" "}
            <strong>{formatClpExact(schedule.supuestos.ufValueClp)}</strong> (Fuente:{" "}
            {schedule.supuestos.ufSourceLabel}
            {schedule.supuestos.ufEffectiveDate ? ` · Fecha: ${schedule.supuestos.ufEffectiveDate}` : ""}).{" "}
            {schedule.supuestos.formula}.
          </div>

          {/* E4: Fijar meta de pie en verde directamente en el bloque de simulación E1 solo si hay proyecto en construcción */}
          {hasConstructionProject && (
            <div
              className="green-goal-connection green-planner__e1-action"
              data-testid="green-goal-connection"
            >
              <div className="green-goal-connection__layout">
                <div className="green-goal-connection__info">
                  <span className="eyebrow">Seguimiento mensual (HU 13)</span>
                  <h3>Fijar cuota como meta de ahorro periódica</h3>
                  <p>
                    {trackingActive
                      ? `Al fijar esta meta, tu cuota mensual sugerida de ${formatUfAmount(schedule.cuotaMensualUfDisplay)} (${formatClpExact(schedule.cuotaMensualClpHoy)}/mes hoy) quedará vinculada automáticamente a tu dashboard de seguimiento mensual para monitorear tus abonos hasta la entrega de la vivienda.`
                      : "Activa primero el seguimiento de tu Plan de Mejora (HU 13) para poder fijar esta cuota mensual en tu dashboard personal."}
                  </p>
                  {savedGoal && !saveMessage && (
                    <div className="inline-note" style={{ marginTop: "0.85rem", color: "var(--rh-text-secondary, #5A6A7E)" }}>
                      <strong>Meta periódica activa:</strong> {formatUfAmount(savedGoal.cuota_mensual_uf)} / mes (
                      {formatClpExact(savedGoal.cuota_mensual_clp)}/mes) durante {savedGoal.plazo_meses} meses.
                    </div>
                  )}
                </div>

                <div className="green-goal-connection__actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!trackingActive || saving}
                    onClick={handleFixGreenGoal}
                  >
                    {saving ? "Guardando meta..." : "Fijar meta de pie en verde"}
                  </button>
                </div>
              </div>

              {saveMessage && (
                <div
                  className={saveStatus === "synced" ? "success-message" : "warning-note"}
                  role={saveStatus === "synced" ? "status" : "alert"}
                  data-testid="green-goal-save-message"
                  style={{ marginTop: "0.85rem" }}
                >
                  {saveMessage}
                </div>
              )}
            </div>
          )}

          {/* Cronograma resumido/expandible E1 */}
          <details
            className="green-planner__schedule-details"
            open={showFullSchedule}
            onToggle={(e) => setShowFullSchedule(e.currentTarget.open)}
          >
            <summary>
              Ver cronograma de ahorro mensual ({schedule.plazoMeses} meses)
            </summary>
            <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th>Aporte mensual (UF)</th>
                    <th>Equivalente hoy (CLP)</th>
                    <th>Acumulado (UF)</th>
                    <th>Restante pie (UF)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCronograma.map((row) => (
                    <tr key={row.mes}>
                      <td>Mes {row.mes}</td>
                      <td>{formatUfAmount(row.cuotaUf)}</td>
                      <td>{formatClpExact(row.cuotaClpHoy)}</td>
                      <td>{formatUfAmount(row.acumuladoUf)}</td>
                      <td>{formatUfAmount(row.restanteUf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* E2: Comparación condicional con esquemas comerciales de la inmobiliaria */}
          {developerComparison.disponible ? (
            <div
              className="green-developer-comparison"
              data-testid="green-developer-comparison"
            >
              <div className="section-heading compact">
                <span className="eyebrow">Comparativa comercial (E2)</span>
                <h3>Plan de ahorro personal vs. Cuotas de pie de la inmobiliaria</h3>
                <p className="green-planner-p-justified">
                  La inmobiliaria informa facilidades para pagar el pie en cuotas. Comparamos tu plan de
                  ahorro de {developerComparison.planPersonal.numeroCuotas} meses con el calendario de cada
                  modalidad: cuánto pagarías al mes, cuánto más pagarías en total y qué compromiso
                  financiero asumes en cada caso.
                </p>
              </div>

              <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Esquema</th>
                      <th>Plazo</th>
                      <th>Cuota mensual</th>
                      <th>Diferencia mensual vs. tu plan</th>
                      <th>Total pie</th>
                      <th>Custodia del dinero</th>
                      <th>Efecto financiero y endeudamiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>{developerComparison.planPersonal.nombre}</strong></td>
                      <td>{developerComparison.planPersonal.numeroCuotas} meses</td>
                      <td>
                        {formatUfAmount(developerComparison.planPersonal.cuotaMensualUf)}
                        <div className="green-planner-cell-sub">{formatClpExact(developerComparison.planPersonal.cuotaMensualClpHoy)} hoy</div>
                      </td>
                      <td><span className="green-planner-delta is-neutral">Referencia</span></td>
                      <td>
                        {formatUfAmount(developerComparison.planPersonal.pieTotalUf)}
                        <div className="green-planner-cell-sub">Sin recargo</div>
                      </td>
                      <td>
                        <span className="green-planner-badge is-own">{developerComparison.planPersonal.custodia}</span>
                        <div className="green-planner-cell-sub">{developerComparison.planPersonal.rendimiento}</div>
                      </td>
                      <td className="green-planner-table-cell-justified">
                        {developerComparison.planPersonal.riesgoSobreendeudamiento}
                      </td>
                    </tr>
                    {developerComparison.esquemas.map((esq) => (
                      <tr key={esq.id} data-testid={`green-scheme-${esq.id}`}>
                        <td><strong>{esq.nombre}</strong></td>
                        <td>
                          {esq.numeroCuotas} cuotas
                          {esq.diferenciaPlazoMeses !== 0 && (
                            <div className="green-planner-cell-sub">
                              {Math.abs(esq.diferenciaPlazoMeses)} meses {esq.diferenciaPlazoMeses < 0 ? "menos" : "más"} que tu plan
                            </div>
                          )}
                        </td>
                        <td>
                          {formatUfAmount(esq.cuotaMensualUf)}
                          <div className="green-planner-cell-sub">{formatClpExact(esq.cuotaMensualClpHoy)} hoy</div>
                        </td>
                        <td>
                          {esq.diferenciaMensualClpHoy === 0 ? (
                            <span className="green-planner-delta is-neutral">Igual a tu plan</span>
                          ) : (
                            <span className={`green-planner-delta ${esq.diferenciaMensualClpHoy > 0 ? "is-up" : "is-down"}`}>
                              {esq.diferenciaMensualClpHoy > 0 ? "+" : "−"}
                              {formatUfAmount(Math.abs(esq.diferenciaMensualUf))} / mes
                            </span>
                          )}
                          {esq.diferenciaMensualClpHoy !== 0 && (
                            <div className="green-planner-cell-sub">
                              {esq.diferenciaMensualClpHoy > 0 ? "+" : "−"}{formatClpExact(Math.abs(esq.diferenciaMensualClpHoy))} hoy
                            </div>
                          )}
                        </td>
                        <td>
                          {formatUfAmount(esq.pieTotalUf)}
                          <div className="green-planner-cell-sub">
                            {esq.costoAdicionalUf > 0
                              ? `+${formatUfAmount(esq.costoAdicionalUf)} (recargo ${esq.recargoPorcentaje}%)`
                              : "Sin recargo informado"}
                          </div>
                        </td>
                        <td>
                          <span className="green-planner-badge is-developer">{esq.custodia}</span>
                          <div className="green-planner-cell-sub">{esq.rendimiento}</div>
                        </td>
                        <td className="green-planner-table-cell-justified">
                          {esq.riesgoSobreendeudamiento}
                          {esq.notaCosto && <div className="green-planner-cell-sub">{esq.notaCosto}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="tracking-footnote green-planner-p-justified" style={{ marginTop: "0.75rem", fontSize: "0.82rem" }}>
                <strong>Supuestos (E2):</strong> plazos y recargos informados por la inmobiliaria para este
                proyecto. Montos en pesos a valor UF de hoy ({formatClpExact(developerComparison.supuestos.ufValueClp)}).
              </p>
            </div>
          ) : developerComparison.estado === "no_informado" || developerComparison.estado === "no_ofrece" ? (
            <p className="inline-note green-planner-p-justified" data-testid="green-developer-comparison-empty" style={{ margin: "0 0 1.5rem" }}>
              <strong>Cuotas de pie de la inmobiliaria (E2):</strong>{" "}
              {developerComparison.estado === "no_ofrece"
                ? "este proyecto no ofrece pago del pie en cuotas con tarjeta de crédito o pagarés."
                : "la inmobiliaria no ha informado facilidades de pago del pie para este proyecto, por lo que no hay un calendario con el cual comparar tu plan."}
            </p>
          ) : null}

          {/* E3: Simulación de protección inflacionaria */}
          {inflationProjection.isValid && (
            <div
              className="green-inflation-protection"
              data-testid="green-inflation-protection"
            >
              <div className="section-heading compact">
                <span className="eyebrow">Protección inflacionaria (E3)</span>
                <h3>Efecto de ahorrar en instrumentos reajustables (UF / DAP)</h3>
                <p className="green-planner-p-justified">
                  Como la propiedad se vende en UF ({formatUfAmount(inflationProjection.propiedad.valorUf, 0)}),
                  su valor en pesos aumenta con la inflación acumulada durante el período de construcción. El pie de{" "}
                  <strong>{formatUfAmount(inflationProjection.pie.valorUf)}</strong> pasaría de{" "}
                  <strong>{formatClpExact(inflationProjection.pie.valorClpHoy)}</strong> hoy a{" "}
                  <strong>{formatClpExact(inflationProjection.pie.valorClpEntrega)}</strong> a la fecha estimada de entrega
                  (un encarecimiento en pesos estimado de{" "}
                  <strong>+{formatClpExact(inflationProjection.pie.encarecimientoClp)}</strong>).
                  Mantener el dinero en cuentas reajustables o con interés garantiza que tu esfuerzo de ahorro conserve su poder adquisitivo real.
                </p>
              </div>

              <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Instrumento de ahorro</th>
                      <th>Tasa / Reajuste supuesto</th>
                      <th>UF reunidas a la entrega</th>
                      <th>Cobertura del pie en UF</th>
                      <th>Monto acumulado estimado (CLP)</th>
                      <th>Impacto en poder adquisitivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inflationProjection.instrumentos.map((inst) => (
                      <tr key={inst.id}>
                        <td>
                          <strong>{inst.nombre}</strong>
                        </td>
                        <td>{inst.tasaDescripcion}</td>
                        <td>{formatUfAmount(inst.ufAcumuladas)}</td>
                        <td>
                          <strong>{inst.coberturaPiePct}%</strong>
                        </td>
                        <td>{formatClpExact(inst.montoFinalClp)}</td>
                        <td className="green-planner-table-cell-justified">
                          {inst.explicacion}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="tracking-footnote">
                <strong>Supuestos de proyección inflacionaria (E3):</strong> Variación anual estimada de
                la UF: <strong>{inflationProjection.supuestos.inflacionAnualUfPct}% anual</strong>{" "}
                (UF inicial {formatClpExact(inflationProjection.supuestos.ufInicialClp)} → UF estimada a la
                entrega en {inflationProjection.supuestos.plazoMeses} meses:{" "}
                {formatClpExact(inflationProjection.supuestos.ufFinalEstimadaClp)}). Tasa Cuenta UF:{" "}
                <strong>UF + {inflationProjection.supuestos.tasaRealCuentaUfPct}% anual</strong>. Tasa
                Depósito a Plazo (DAP):{" "}
                <strong>{inflationProjection.supuestos.tasaNominalDapPct}% nominal anual</strong>.
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
