import React, { useEffect, useMemo, useState } from "react";
import "./financing.css";
import { createScenarioDraft, allowedTerms, closeComposition } from "../../lib/financing/scenarioDraft";
import { currentUfReference, projectUf } from "../../lib/financing/ufProjection";
import { applyRangeReferenceAmount, benefitOptions, evaluateBenefit } from "../../lib/financing/benefitScenario";
import { BENEFIT_ESTIMATION_BASELINE } from "../../lib/financing/benefitEstimationBaseline";
import SubsidyDashboard from "./subsidies/SubsidyDashboard";
import FinancingOverview, { FinancingAdjustments } from "./FinancingOverview";
import SectionNumber from "./SectionNumber";
import ScenarioStatus from "./ScenarioStatus";
import { calculateScenarioResult } from "../../lib/financing/scenarioResult";
import { getMarketReferenceHistory } from "../../services/marketReferenceService";
import { getHousingBenefitCatalog } from "../../services/housingBenefitCatalogService";
import { deleteMortgageScenario, draftFromMortgageScenario, listMortgageScenarios, saveMortgageScenario } from "../../services/mortgageScenarioService";
import { getCurrentProjectGoal } from "../../lib/projectGoalDisplay";
import { formatProjectPrice } from "../../lib/simulation/projectAdapter";
import { propertyLabels } from "../../constants";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const apiBase = () => String(import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");
const snapshot = (project) => ({ id: project?.id || null, nombre: project?.nombre || "Vivienda manual", comuna: project?.comuna || "", tipo_vivienda: project?.tipo_vivienda || "", precio_uf: Number(project?.precio_uf || project?.precio_min_uf || project?.valor_uf) || 0, vivienda_nueva: project?.estado === "en_construccion" });

export default function FinancingSimulatorPanel({ evaluation, projects = [], onNavigate, initialProjectId }) {
  const market = evaluation?.result?.financial_indicators?.capacidad_supuestos?.market_snapshot || {};
  const goal = getCurrentProjectGoal(evaluation);
  const consented = evaluation?.input?.consentimiento === true;
  const [selectedId, setSelectedId] = useState(() => initialProjectId || (goal ? "__project_goal__" : null));
  const [projection, setProjection] = useState(false);
  const [history, setHistory] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState([]);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const project = useMemo(() => selectedId === "__project_goal__" ? goal || projects[0] || null : projects.find((item) => String(item.id) === String(selectedId)) || goal || projects[0] || null, [selectedId, goal, projects]);
  const current = currentUfReference(market);
  const future = projection ? projectUf(history, draft?.fecha_compra) : null;
  const ufReference = future || current;
  const benefits = benefitOptions(catalogue);
  const entry = benefits.find((item) => item.identifier === draft?.selected_benefit);
  const evaluatedBenefit = evaluateBenefit(entry, evaluation, snapshot(project), ufReference?.uf_value_clp);
  const benefit = applyRangeReferenceAmount(evaluatedBenefit, draft?.selected_benefit_range_amount_clp);
  const benefitStates = useMemo(() => Object.fromEntries(benefits.map((item) => [
    item.identifier,
    evaluateBenefit(item, evaluation, snapshot(project), ufReference?.uf_value_clp),
  ])), [benefits, evaluation, project, ufReference?.uf_value_clp]);
  const result = draft && ufReference ? calculateScenarioResult({ draft, ufReference, marketReference: market, benefit }) : null;
  const terms = allowedTerms(evaluation?.input?.edad);

  useEffect(() => { if (project && current) setDraft((old) => old || createScenarioDraft({ evaluation, project: snapshot(project), marketReference: market })); }, [project, current, evaluation, market]);
  useEffect(() => {
    if (!initialProjectId || !projects.some((item) => String(item.id) === String(initialProjectId)) || !current) return;
    const nextProject = projects.find((item) => String(item.id) === String(initialProjectId));
    setSelectedId(initialProjectId);
    setDraft(createScenarioDraft({ evaluation, project: snapshot(nextProject), marketReference: market }));
    setHasUnsavedChanges(true);
  }, [initialProjectId, projects, current?.uf_value_clp, evaluation]);
  useEffect(() => { let active = true; Promise.allSettled([getMarketReferenceHistory({ apiBase: apiBase() }), getHousingBenefitCatalog({ apiBase: apiBase() })]).then(([historyResponse, catalogueResponse]) => { if (!active) return; if (historyResponse.status === "fulfilled") setHistory(historyResponse.value); if (catalogueResponse.status === "fulfilled") setCatalogue(catalogueResponse.value); }); return () => { active = false; }; }, []);
  const refresh = async () => { try { setSaved(await listMortgageScenarios(evaluation.id)); } catch { setNotice("No pudimos cargar los escenarios guardados. Reintenta después de aplicar la migración de HU17."); } };
  useEffect(() => { if (consented) refresh(); }, [evaluation?.id, consented]);
  if (!consented) return null;
  const update = (field, value) => { setHasUnsavedChanges(true); setDraft((old) => ({ ...old, [field]: value })); };
  const updatePie = (value) => { setHasUnsavedChanges(true); setDraft((old) => closeComposition(old, "pie_clp", value, benefit.amount_clp, result?.precio_clp)); };
  const updateCredit = (value) => { setHasUnsavedChanges(true); setDraft((old) => closeComposition(old, "credito_clp", value, benefit.amount_clp, result?.precio_clp)); };
  const save = async () => {
    if (!result || !draft || isSaving) return null;
    setIsSaving(true);
    try {
      const savedScenario = await saveMortgageScenario({ evaluationId: evaluation.id, projectId: project?.id || null, parentScenarioId: draft.parent_scenario_id || null, name: name.trim() || `Mi escenario · ${new Date().toLocaleDateString("es-CL")}`, projectSnapshot: snapshot(project), inputSnapshot: { ...draft, credito_clp: result.credito_clp }, resultSnapshot: result, marketReferenceSnapshot: { persisted_market: market, selected_uf: ufReference }, benefitCatalogueSnapshot: catalogue?.entries?.length ? { version: catalogue.version, benefit } : { version: BENEFIT_ESTIMATION_BASELINE.version, benefit } });
      setDraft((old) => ({ ...old, parent_scenario_id: savedScenario.id }));
      setActiveScenarioId(savedScenario.id);
      setName("");
      setHasUnsavedChanges(false);
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
    setDraft(draftFromMortgageScenario(scenario));
    setName(scenario.name || "");
    setActiveScenarioId(scenario.id);
    setHasUnsavedChanges(false);
    setNotice(`Escenario “${scenario.name}” seleccionado.`);
  };
  const requestScenarioSelection = (scenario) => {
    if (scenario.id === activeScenarioId && !hasUnsavedChanges) return;
    if (hasUnsavedChanges) { setPendingAction({ type: "select", scenario }); return; }
    selectScenario(scenario);
  };
  const requestScenarioDeletion = (scenario) => setPendingAction({ type: "delete", scenario });
  const toggleProjection = (enabled) => {
    setProjection(enabled);
    setHasUnsavedChanges(true);
    if (enabled && !draft.fecha_compra) update("fecha_compra", new Date().toISOString().slice(0, 10));
  };
  const confirmPendingAction = async (decision) => {
    const action = pendingAction;
    if (!action) return;
    if (action.type === "select") {
      if (decision === "save") {
        const savedScenario = await save();
        if (!savedScenario) return;
      }
      selectScenario(action.scenario);
      setPendingAction(null);
      return;
    }
    if (action.type === "delete" && decision === "delete") {
      setIsDeleting(true);
      try {
        await deleteMortgageScenario(action.scenario.id);
        if (action.scenario.id === activeScenarioId) {
          setActiveScenarioId(null);
          setHasUnsavedChanges(true);
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
    {!draft || !result ? <div className="warning-note">No hay referencia UF persistida disponible para iniciar esta simulación.</div> : <>
      <section className="financing-step financing-property-step"><SectionNumber number="1" /><div><h3>Vivienda seleccionada</h3></div><article className="financing-selected-property"><span className="financing-selected-property__marker"><i className="ti ti-target-arrow" aria-hidden="true" /></span><div className="financing-selected-property__content"><small>Tu meta actual</small><strong>{project?.nombre || "Vivienda sin seleccionar"}</strong><p>{project?.comuna || "Comuna sin dato"} · {formatProjectPrice(project)}</p>{project?.inmobiliaria ? <b>Inmobiliaria: {project.inmobiliaria}</b> : null}<div className="financing-selected-property__details"><span>{propertyLabels[project?.tipo_vivienda] || project?.tipo_vivienda || "Vivienda"}</span>{project?.estado ? <span>{project.estado === "en_construccion" ? "En construcción" : project.estado === "disponible" ? "Disponible" : project.estado}</span> : null}</div></div><button type="button" className="financing-change-property" onClick={() => onNavigate?.("projects")}>Cambiar vivienda</button></article></section>
      <FinancingOverview draft={draft} result={result} ufReference={ufReference} />
      <SubsidyDashboard
        evaluation={evaluation}
        benefitStates={benefitStates}
        selectedBenefit={draft.selected_benefit}
        selectedVariant={draft.selected_benefit_variant}
        onSelectBenefit={(identifier, variant) => { setHasUnsavedChanges(true); setDraft((old) => ({ ...old, selected_benefit: identifier, selected_benefit_variant: variant, selected_benefit_range_amount_clp: null })); }}
        onClearBenefit={() => { setHasUnsavedChanges(true); setDraft((old) => ({ ...old, selected_benefit: null, selected_benefit_variant: null, selected_benefit_range_amount_clp: null })); }}
      />
      <FinancingAdjustments draft={draft} result={result} ufReference={ufReference} terms={terms} onPieChange={updatePie} onCreditChange={updateCredit} onRangeAmountChange={(value) => update("selected_benefit_range_amount_clp", value)} onUpdate={update} />
      <ScenarioStatus result={result} ufReference={ufReference} projection={projection} hasProjectionHistory={Boolean(projectUf(history, new Date().toISOString().slice(0, 10)))} draft={draft} onProjectionChange={toggleProjection} onDateChange={(value) => update("fecha_compra", value)} />
      <section className="financing-save"><div><strong>Guardar esta configuración</strong><p>{hasUnsavedChanges ? "Tienes cambios sin guardar. Se creará una nueva instancia de financiamiento." : "Esta configuración ya está guardada."}</p></div><input value={name} maxLength="120" placeholder="Nombre opcional" onChange={(event) => setName(event.target.value)} /><button type="button" className="primary-button compact-button" onClick={save} disabled={isSaving}>{isSaving ? "Guardando…" : "Guardar escenario"}</button>{notice ? <span>{notice}</span> : null}</section>
      <section className="financing-saved"><h3>Escenarios guardados</h3>{saved.length ? saved.map((item) => <article key={item.id} className={item.id === activeScenarioId ? "is-selected" : ""}><div><strong>{item.name}</strong><span>{money(item.result_snapshot?.dividendo_clp)} mensuales</span>{item.id === activeScenarioId ? <small>Escenario seleccionado</small> : null}</div><button type="button" onClick={() => requestScenarioSelection(item)} disabled={item.id === activeScenarioId && !hasUnsavedChanges}>{item.id === activeScenarioId ? "Seleccionado" : "Seleccionar"}</button><button type="button" className="financing-saved__delete" onClick={() => requestScenarioDeletion(item)}>Eliminar</button></article>) : <p>Aún no guardas escenarios.</p>}</section>
      {pendingAction ? <div className="financing-confirmation-backdrop" role="presentation" onMouseDown={() => !isSaving && !isDeleting && setPendingAction(null)}><section className="financing-confirmation" role="dialog" aria-modal="true" aria-labelledby="financing-confirmation-title" onMouseDown={(event) => event.stopPropagation()}>{pendingAction.type === "select" ? <><span className="eyebrow">Cambiar escenario</span><h3 id="financing-confirmation-title">Tienes cambios sin guardar</h3><p>¿Quieres guardarlos antes de seleccionar “{pendingAction.scenario.name}”?</p><div className="financing-confirmation__actions"><button type="button" className="secondary-button" onClick={() => setPendingAction(null)} disabled={isSaving}>Cancelar</button><button type="button" className="secondary-button financing-confirmation__discard" onClick={() => confirmPendingAction("discard")} disabled={isSaving}>Descartar cambios</button><button type="button" className="primary-button" onClick={() => confirmPendingAction("save")} disabled={isSaving}>{isSaving ? "Guardando…" : "Guardar y cambiar"}</button></div></> : <><h3 id="financing-confirmation-title">¿Eliminar este escenario?</h3><p>Se eliminará “{pendingAction.scenario.name}”. Esta acción no se puede deshacer.</p><div className="financing-confirmation__actions"><button type="button" className="secondary-button" onClick={() => setPendingAction(null)} disabled={isDeleting}>Cancelar</button><button type="button" className="primary-button financing-confirmation__delete" onClick={() => confirmPendingAction("delete")} disabled={isDeleting}>{isDeleting ? "Eliminando…" : "Sí, eliminar"}</button></div></>}</section></div> : null}
    </>}
  </section>;
}
