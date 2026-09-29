import React, { useEffect, useMemo, useState } from "react";
import "./financing.css";
import { createScenarioDraft, allowedTerms, closeComposition } from "../../lib/financing/scenarioDraft";
import { currentUfReference } from "../../lib/financing/ufProjection";
import { applyRangeReferenceAmount, benefitOptions, evaluateBenefit } from "../../lib/financing/benefitScenario";
import { BENEFIT_ESTIMATION_BASELINE } from "../../lib/financing/benefitEstimationBaseline";
import SubsidyDashboard from "./subsidies/SubsidyDashboard";
import FinancingOverview, { FinancingAdjustments } from "./FinancingOverview";
import SectionNumber from "./SectionNumber";
import ScenarioStatus from "./ScenarioStatus";
import SuggestedConfiguration from "./SuggestedConfiguration";
import SuggestedAlternatives from "./SuggestedAlternatives";
import ScenarioComparison from "./ScenarioComparison";
import { calculateScenarioResult } from "../../lib/financing/scenarioResult";
import { getHousingBenefitCatalog } from "../../services/housingBenefitCatalogService";
import { deleteMortgageScenario, draftFromMortgageScenario, listMortgageScenarios, saveMortgageScenario } from "../../services/mortgageScenarioService";
import { getCurrentProjectGoal } from "../../lib/projectGoalDisplay";
import { formatProjectPrice } from "../../lib/simulation/projectAdapter";
import { propertyLabels } from "../../constants";
import { persistedScenarioStatus, referenceAlternatives, suggestedDraftFromResult } from "../../lib/financing/scenarioSuggestions";
import { applyDraftScenario, synchronizeScenario } from "../../lib/financing/scenarioState";
import { toggleComparisonSelection } from "../../lib/financing/comparisonSelection";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const apiBase = () => String(import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");
const snapshot = (project) => ({ id: project?.id || null, nombre: project?.nombre || "Vivienda manual", comuna: project?.comuna || "", tipo_vivienda: project?.tipo_vivienda || "", precio_uf: Number(project?.precio_uf || project?.precio_min_uf || project?.valor_uf) || 0, vivienda_nueva: project?.estado === "en_construccion" });
const savedStatusTone = (status) => status === "Compatible" ? "compatible" : status === "Cercano" ? "near" : "adjustment";

export default function FinancingSimulatorPanel({ evaluation, projects = [], onNavigate, initialProjectId }) {
  const market = evaluation?.result?.financial_indicators?.capacidad_supuestos?.market_snapshot || {};
  const goal = getCurrentProjectGoal(evaluation);
  const consented = evaluation?.input?.consentimiento === true;
  const [selectedId, setSelectedId] = useState(() => initialProjectId || (goal ? "__project_goal__" : null));
  const [catalogue, setCatalogue] = useState(null);
  const [draft, setDraft] = useState(null);
  const [activeDraft, setActiveDraft] = useState(null);
  const [saved, setSaved] = useState([]);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [startedFromSuggested, setStartedFromSuggested] = useState(false);
  const [comparisonIds, setComparisonIds] = useState([]);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const project = useMemo(() => selectedId === "__project_goal__" ? goal || projects[0] || null : projects.find((item) => String(item.id) === String(selectedId)) || goal || projects[0] || null, [selectedId, goal, projects]);
  const current = currentUfReference(market);
  const ufReference = current;
  const benefits = benefitOptions(catalogue);
  const draftEntry = benefits.find((item) => item.identifier === draft?.selected_benefit);
  const draftEvaluatedBenefit = evaluateBenefit(draftEntry, evaluation, snapshot(project), ufReference?.uf_value_clp);
  const draftBenefit = applyRangeReferenceAmount(draftEvaluatedBenefit, draft?.selected_benefit_range_amount_clp);
  const activeEntry = benefits.find((item) => item.identifier === activeDraft?.selected_benefit);
  const activeEvaluatedBenefit = evaluateBenefit(activeEntry, evaluation, snapshot(project), ufReference?.uf_value_clp);
  const activeBenefit = applyRangeReferenceAmount(activeEvaluatedBenefit, activeDraft?.selected_benefit_range_amount_clp);
  const benefitStates = useMemo(() => Object.fromEntries(benefits.map((item) => [
    item.identifier,
    evaluateBenefit(item, evaluation, snapshot(project), ufReference?.uf_value_clp),
  ])), [benefits, evaluation, project, ufReference?.uf_value_clp]);
  const draftResult = draft && ufReference ? calculateScenarioResult({ draft, ufReference, marketReference: market, benefit: draftBenefit }) : null;
  const activeResult = activeDraft && ufReference ? calculateScenarioResult({ draft: activeDraft, ufReference, marketReference: market, benefit: activeBenefit }) : null;
  const terms = allowedTerms(evaluation?.input?.edad);
  const suggestedDraft = activeDraft && activeResult ? suggestedDraftFromResult(activeDraft, activeResult) : null;
  const suggestedResult = suggestedDraft && ufReference ? calculateScenarioResult({ draft: suggestedDraft, ufReference, marketReference: market, benefit: activeBenefit }) : null;
  const alternatives = useMemo(() => referenceAlternatives(activeDraft, activeResult).map((alternative) => ({ ...alternative, result: calculateScenarioResult({ draft: alternative.draft, ufReference, marketReference: market, benefit: activeBenefit }) })), [activeDraft, activeResult, ufReference, market, activeBenefit]);

  useEffect(() => {
    if (!project || !current) return;
    const initial = createScenarioDraft({ evaluation, project: snapshot(project), marketReference: market });
    setDraft((old) => old || initial);
    setActiveDraft((old) => old || initial);
  }, [project, current, evaluation, market]);
  useEffect(() => {
    if (!initialProjectId || !projects.some((item) => String(item.id) === String(initialProjectId)) || !current) return;
    const nextProject = projects.find((item) => String(item.id) === String(initialProjectId));
    setSelectedId(initialProjectId);
    const nextDraft = createScenarioDraft({ evaluation, project: snapshot(nextProject), marketReference: market });
    setDraft(nextDraft);
    setActiveDraft(nextDraft);
    setHasUnsavedChanges(false);
    setStartedFromSuggested(false);
  }, [initialProjectId, projects, current?.uf_value_clp, evaluation]);
  useEffect(() => { let active = true; getHousingBenefitCatalog({ apiBase: apiBase() }).then((value) => { if (active) setCatalogue(value); }).catch(() => { if (active) setCatalogue(null); }); return () => { active = false; }; }, []);
  const refresh = async () => { try { setSaved(await listMortgageScenarios(evaluation.id)); } catch { setNotice("No pudimos cargar los escenarios guardados. Reintenta después de aplicar la migración de HU17."); } };
  useEffect(() => { if (consented) refresh(); }, [evaluation?.id, consented]);
  if (!consented) return null;
  const update = (field, value) => { setHasUnsavedChanges(true); setDraft((old) => ({ ...old, [field]: value })); };
  const updatePie = (value) => { setHasUnsavedChanges(true); setDraft((old) => closeComposition(old, "pie_clp", value, draftBenefit.amount_clp, draftResult?.precio_clp)); };
  const updateCredit = (value) => { setHasUnsavedChanges(true); setDraft((old) => closeComposition(old, "credito_clp", value, draftBenefit.amount_clp, draftResult?.precio_clp)); };
  const applyDraftChanges = () => {
    if (!draft || !draftResult) return;
    const nextDraft = applyDraftScenario(draft, draftResult);
    setActiveDraft(nextDraft);
    setDraft(nextDraft);
    setHasUnsavedChanges(false);
    setNotice("Cambios aplicados al escenario actual.");
  };
  const save = async ({ scenarioDraft = activeDraft, scenarioResult = activeResult, scenarioBenefit = activeBenefit } = {}) => {
    if (!scenarioResult || !scenarioDraft || isSaving) return null;
    setIsSaving(true);
    try {
      const savedScenario = await saveMortgageScenario({ evaluationId: evaluation.id, projectId: project?.id || null, parentScenarioId: scenarioDraft.parent_scenario_id || null, name: name.trim() || `Mi escenario · ${new Date().toLocaleDateString("es-CL")}`, projectSnapshot: snapshot(project), inputSnapshot: { ...scenarioDraft, credito_clp: scenarioResult.credito_clp }, resultSnapshot: scenarioResult, marketReferenceSnapshot: { persisted_market: market, selected_uf: ufReference }, benefitCatalogueSnapshot: catalogue?.entries?.length ? { version: catalogue.version, benefit: scenarioBenefit } : { version: BENEFIT_ESTIMATION_BASELINE.version, benefit: scenarioBenefit } });
      setActiveDraft((old) => old ? { ...old, parent_scenario_id: savedScenario.id } : old);
      if (!hasUnsavedChanges) setDraft((old) => old ? { ...old, parent_scenario_id: savedScenario.id } : old);
      setActiveScenarioId(savedScenario.id);
      setName("");
      if (!hasUnsavedChanges) setHasUnsavedChanges(false);
      setNotice("Escenario guardado.");
      await refresh();
      return savedScenario;
    } catch {
      setNotice("No pudimos guardar la simulación. Tu borrador sigue disponible para reintentar.");
      return null;
    } finally { setIsSaving(false); }
  };
  const selectScenario = (scenario) => {
    if (scenario.project_id && projects.some((item) => String(item.id) === String(scenario.project_id))) setSelectedId(scenario.project_id);
    const loadedDraft = synchronizeScenario(draftFromMortgageScenario(scenario));
    setDraft(loadedDraft);
    setActiveDraft(loadedDraft);
    setName(scenario.name || "");
    setActiveScenarioId(scenario.id);
    setHasUnsavedChanges(false);
    setStartedFromSuggested(false);
    setNotice(`Escenario “${scenario.name}” seleccionado.`);
  };
  const requestScenarioSelection = (scenario) => {
    if (scenario.id === activeScenarioId && !hasUnsavedChanges) return;
    if (hasUnsavedChanges) { setPendingAction({ type: "select", scenario }); return; }
    selectScenario(scenario);
  };
  const requestScenarioDeletion = (scenario) => setPendingAction({ type: "delete", scenario });
  const toggleScenarioComparison = (scenario) => {
    const next = toggleComparisonSelection(comparisonIds, scenario.id);
    if (next.limited) setNotice("Puedes comparar hasta 2 escenarios a la vez.");
    else setComparisonIds(next.ids);
  };
  const clearScenarioComparison = () => {
    setComparisonIds([]);
    setIsComparisonOpen(false);
  };
  const comparisonScenarios = saved.filter((scenario) => comparisonIds.includes(scenario.id));
  const requestSuggestedDraft = (nextDraft) => {
    setPendingAction({ type: "suggested", draft: nextDraft });
  };
  const applySuggestedDraft = (nextDraft, { suggested = false } = {}) => {
    const next = synchronizeScenario(nextDraft);
    setDraft(next);
    setActiveDraft(next);
    setHasUnsavedChanges(false);
    setStartedFromSuggested(suggested);
    setNotice(suggested ? "Configuración referencial aplicada al escenario actual." : "Alternativa aplicada al escenario actual.");
  };
  const confirmPendingAction = async (decision) => {
    const action = pendingAction;
    if (!action) return;
    if (action.type === "select") {
      if (decision === "save") {
        const savedScenario = await save({ scenarioDraft: draft, scenarioResult: draftResult, scenarioBenefit: draftBenefit });
        if (!savedScenario) return;
      }
      selectScenario(action.scenario);
      setPendingAction(null);
      return;
    }
    if (action.type === "suggested" && decision === "use") {
      applySuggestedDraft(action.draft, { suggested: true });
      setPendingAction(null);
      return;
    }
    if (action.type === "delete" && decision === "delete") {
      setIsDeleting(true);
      try {
        await deleteMortgageScenario(action.scenario.id);
        setComparisonIds((ids) => ids.filter((id) => id !== action.scenario.id));
        if (action.scenario.id === activeScenarioId) {
          setActiveScenarioId(null);
          setHasUnsavedChanges(false);
        }
        setNotice("Escenario eliminado.");
        await refresh();
        setPendingAction(null);
      } catch { setNotice("No pudimos eliminar el escenario. Reintenta nuevamente."); }
      finally { setIsDeleting(false); }
    }
  };
  return <section className="financing-panel" aria-labelledby="financing-title">
    <div className="financing-hero"><span className="eyebrow">Simulación de financiamiento</span><h2 id="financing-title">Entiende cuánto necesitarías financiar</h2><p>Partimos desde tu última precalificación. Puedes ajustar los supuestos sin cambiarla.</p></div>
    {!draft || !draftResult || !activeDraft || !activeResult ? <div className="warning-note">No hay referencia UF persistida disponible para iniciar esta simulación.</div> : <>
      <section className="financing-step financing-property-step"><SectionNumber number="1" /><div><h3>Vivienda seleccionada</h3></div><article className="financing-selected-property"><span className="financing-selected-property__marker"><i className="ti ti-target-arrow" aria-hidden="true" /></span><div className="financing-selected-property__content"><small>Tu meta actual</small><strong>{project?.nombre || "Vivienda sin seleccionar"}</strong><p>{project?.comuna || "Comuna sin dato"} · {formatProjectPrice(project)}</p>{project?.inmobiliaria ? <b>Inmobiliaria: {project.inmobiliaria}</b> : null}<div className="financing-selected-property__details"><span>{propertyLabels[project?.tipo_vivienda] || project?.tipo_vivienda || "Vivienda"}</span>{project?.estado ? <span>{project.estado === "en_construccion" ? "En construcción" : project.estado === "disponible" ? "Disponible" : project.estado}</span> : null}</div></div><button type="button" className="financing-change-property" onClick={() => onNavigate?.("projects")}>Cambiar vivienda</button></article></section>
      <FinancingOverview draft={activeDraft} result={activeResult} ufReference={ufReference} />
      <SubsidyDashboard
        evaluation={evaluation}
        benefitStates={benefitStates}
        selectedBenefit={draft.selected_benefit}
        selectedVariant={draft.selected_benefit_variant}
        onSelectBenefit={(identifier, variant) => { setHasUnsavedChanges(true); setDraft((old) => ({ ...old, selected_benefit: identifier, selected_benefit_variant: variant, selected_benefit_range_amount_clp: null })); }}
        onClearBenefit={() => { setHasUnsavedChanges(true); setDraft((old) => ({ ...old, selected_benefit: null, selected_benefit_variant: null, selected_benefit_range_amount_clp: null })); }}
      />
      <SuggestedConfiguration draft={activeDraft} result={activeResult} suggestedDraft={suggestedDraft} suggestedResult={suggestedResult} benefit={activeBenefit} onUse={requestSuggestedDraft} />
      <FinancingAdjustments draft={draft} result={draftResult} ufReference={ufReference} terms={terms} fromSuggested={startedFromSuggested} hasDraftChanges={hasUnsavedChanges} onApply={applyDraftChanges} onPieChange={updatePie} onCreditChange={updateCredit} onRangeAmountChange={(value) => update("selected_benefit_range_amount_clp", value)} onUpdate={update} />
      <ScenarioStatus result={activeResult} ufReference={ufReference} />
      <SuggestedAlternatives alternatives={alternatives} onTry={applySuggestedDraft} />
      <section className="financing-save"><div><strong>Guardar esta configuración</strong><p>{hasUnsavedChanges ? "Tienes cambios por aplicar. Guardará la configuración actualmente aplicada." : "Se creará una nueva instancia de financiamiento con la configuración aplicada."}</p></div><input value={name} maxLength="120" placeholder="Nombre opcional" onChange={(event) => setName(event.target.value)} /><button type="button" className="primary-button compact-button" onClick={() => save()} disabled={isSaving}>{isSaving ? "Guardando…" : "Guardar escenario"}</button>{notice ? <span>{notice}</span> : null}</section>
      <section className="financing-saved"><h3>Escenarios guardados</h3>{saved.length ? <>{saved.map((item) => { const status = persistedScenarioStatus(item.result_snapshot); const selectedForComparison = comparisonIds.includes(item.id); return <article key={item.id} className={`${item.id === activeScenarioId ? "is-selected" : ""} ${selectedForComparison ? "is-comparison-selected" : ""}`}><div><strong>{item.name}</strong><small className={`financing-saved__status is-${savedStatusTone(status)}`}>{status}</small><span>{money(item.result_snapshot?.dividendo_clp)} mensuales</span>{item.id === activeScenarioId ? <small>Escenario seleccionado</small> : null}{selectedForComparison ? <small className="financing-saved__comparison-label">Seleccionado para comparar</small> : null}</div><button type="button" onClick={() => requestScenarioSelection(item)} disabled={item.id === activeScenarioId && !hasUnsavedChanges}>{item.id === activeScenarioId ? "Seleccionado" : "Seleccionar"}</button><button type="button" onClick={() => toggleScenarioComparison(item)}>{selectedForComparison ? "Quitar" : "Comparar"}</button><button type="button" className="financing-saved__delete" onClick={() => requestScenarioDeletion(item)}>Eliminar</button></article>; })}{comparisonIds.length ? <div className="financing-comparison-bar"><span>{comparisonIds.length} {comparisonIds.length === 1 ? "escenario seleccionado" : "escenarios seleccionados"}</span><div><button type="button" className="secondary-button" onClick={clearScenarioComparison}>Cancelar comparación</button>{comparisonIds.length === 2 ? <button type="button" className="primary-button" onClick={() => setIsComparisonOpen(true)}>Comparar escenarios</button> : null}</div></div> : null}</> : <p>Aún no guardas escenarios.</p>}</section>
      {isComparisonOpen ? <ScenarioComparison scenarios={comparisonScenarios} onClose={() => setIsComparisonOpen(false)} /> : null}
      {pendingAction ? <div className="financing-confirmation-backdrop" role="presentation" onMouseDown={() => !isSaving && !isDeleting && setPendingAction(null)}><section className="financing-confirmation" role="dialog" aria-modal="true" aria-labelledby="financing-confirmation-title" onMouseDown={(event) => event.stopPropagation()}>{pendingAction.type === "select" ? <><span className="eyebrow">Cambiar escenario</span><h3 id="financing-confirmation-title">Tienes cambios sin guardar</h3><p>¿Quieres guardarlos antes de seleccionar “{pendingAction.scenario.name}”?</p><div className="financing-confirmation__actions"><button type="button" className="secondary-button" onClick={() => setPendingAction(null)} disabled={isSaving}>Cancelar</button><button type="button" className="secondary-button financing-confirmation__discard" onClick={() => confirmPendingAction("discard")} disabled={isSaving}>Descartar cambios</button><button type="button" className="primary-button" onClick={() => confirmPendingAction("save")} disabled={isSaving}>{isSaving ? "Guardando…" : "Guardar y cambiar"}</button></div></> : pendingAction.type === "suggested" ? <><span className="eyebrow">Configuración referencial</span><h3 id="financing-confirmation-title">¿Usar esta configuración?</h3><p>Los valores actuales del simulador serán reemplazados por esta configuración sugerida. Tus escenarios guardados no se eliminarán.</p><div className="financing-confirmation__actions"><button type="button" className="secondary-button" onClick={() => setPendingAction(null)}>Cancelar</button><button type="button" className="primary-button" onClick={() => confirmPendingAction("use")}>Usar configuración</button></div></> : <><h3 id="financing-confirmation-title">¿Eliminar este escenario?</h3><p>Se eliminará “{pendingAction.scenario.name}”. Esta acción no se puede deshacer.</p><div className="financing-confirmation__actions"><button type="button" className="secondary-button" onClick={() => setPendingAction(null)} disabled={isDeleting}>Cancelar</button><button type="button" className="primary-button financing-confirmation__delete" onClick={() => confirmPendingAction("delete")} disabled={isDeleting}>{isDeleting ? "Eliminando…" : "Sí, eliminar"}</button></div></>}</section></div> : null}
    </>}
  </section>;
}
