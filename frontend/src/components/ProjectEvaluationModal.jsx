import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAccessibleAlternatives,
  evaluateScenario,
  projectToScenario,
} from "../lib/simulation/compatibility";
import { formatProjectPrice } from "../lib/simulation/projectAdapter";
import { CLP_FORMATTER } from "../services/financialTracking";
import { propertyLabels } from "../constants";
import { submitProjectGoal } from "../lib/projectGoalAction";
import {
  trackGeneratedLead,
  trackProjectCompatibilityViewed,
} from "../lib/analytics";

const statusClass = {
  Compatible: "compatible",
  Cercano: "near",
  "Requiere ajuste": "adjust",
};

function formatClp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return CLP_FORMATTER.format(Math.round(number / 1000) * 1000);
}

export default function ProjectEvaluationModal({
  project,
  projects = [],
  context,
  ufValueClp,
  onboarding,
  contactEmail,
  onClose,
  onSelectProject,
  onSetGoal,
  onNavigate,
  onToggleFavorite,
  isFavorite,
  isCurrentGoal,
  compatibilityStatus,
}) {
  const [interestStatus, setInterestStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [goalPending, setGoalPending] = useState(false);
  const [goalSuccess, setGoalSuccess] = useState(false);
  const [confirmGoalChange, setConfirmGoalChange] = useState(false);
  const viewedProjectIdsRef = useRef(new Set());

  useEffect(() => {
    if (!project?.id || viewedProjectIdsRef.current.has(project.id)) return;

    viewedProjectIdsRef.current.add(project.id);
    trackProjectCompatibilityViewed({
      projectId: project.id,
      projectType: project.tipo_vivienda,
      projectRegion: project.region,
      sourcePage: "projects",
    });
  }, [project]);

  // La compatibilidad se calcula localmente con el mismo veredicto de simulación.
  const localEvaluation = useMemo(
    () => evaluateScenario(context, projectToScenario(project, ufValueClp)),
    [context, project, ufValueClp],
  );
  // El proyecto objetivo activo ya fue evaluado por el seguimiento. Su estado
  // debe ser idéntico al de "Estado actual"; otros proyectos siguen usando la
  // comparación local del catálogo.
  const evaluation = useMemo(() => (
    compatibilityStatus ? { ...localEvaluation, status: compatibilityStatus } : localEvaluation
  ), [compatibilityStatus, localEvaluation]);
  const alternatives = useMemo(() => {
    if (evaluation.status === "Compatible") return [];
    return buildAccessibleAlternatives(
      projects.filter((item) => item.id !== project.id),
      context,
      onboarding,
      4,
    ).slice(0, 3);
  }, [context, evaluation.status, onboarding, project.id, projects]);
  const isCompatible = evaluation.status === "Compatible";
  // Los avisos del portal no están en public.proyectos: favoritos, contacto con
  // ejecutivo y meta del plan dependen de esa tabla, así que solo se enlaza el aviso.
  const isPortal = project.origen === "portal";

  const handleInterest = async (contactExecutive) => {
    setActionError("");
    if (!contactExecutive) {
      const saved = onToggleFavorite ? await onToggleFavorite(project.id) : false;
      if (!saved) {
        setActionError("No pudimos actualizar tus favoritos. Intenta nuevamente.");
        return;
      }
      setInterestStatus(isFavorite ? "Proyecto quitado de tus favoritos." : "Proyecto guardado en tus favoritos.");
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proyecto_id: project.id, contactar_ejecutivo: true, email: contactEmail || undefined }),
      });
      if (!response.ok) throw new Error("No se pudo registrar tu solicitud.");
      trackGeneratedLead({
        leadSource: "project_interest",
        projectId: project.id,
        projectRegion: project.region,
        sourcePage: "projects",
      });
      setInterestStatus("Solicitud enviada. Un ejecutivo te contactará a la brevedad.");
    } catch (cause) {
      setActionError(cause.message || "No se pudo registrar tu solicitud.");
    }
  };

  const handleSetGoal = async () => {
    if (!onSetGoal) return;
    if (!confirmGoalChange) {
      setConfirmGoalChange(true);
      return;
    }
    setGoalPending(true);
    try {
      const outcome = await submitProjectGoal(onSetGoal, project);
      if (outcome.saved) setGoalSuccess(true);
      else setActionError(outcome.error);
    } finally {
      setGoalPending(false);
      setConfirmGoalChange(false);
    }
  };

  return <div className="project-evaluation-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="project-evaluation-modal__card" role="dialog" aria-modal="true" aria-labelledby="project-evaluation-title">
      <button type="button" className="project-evaluation-modal__close" onClick={onClose} aria-label="Cerrar calificación"><i className="ti ti-x" aria-hidden="true" /></button>
      <header className="project-evaluation-modal__header">
        <span className="eyebrow">Proyecto seleccionado</span>
        <h2 id="project-evaluation-title">{project.nombre}</h2>
        <p className="project-evaluation-modal__context">{project.comuna || "Comuna sin dato"} · {propertyLabels[project.tipo_vivienda] || project.tipo_vivienda || "Vivienda"}</p>
        {(project.descripcion || project.descripcion_corta) && <p className="project-evaluation-modal__context">{project.descripcion || project.descripcion_corta}</p>}
      </header>
      <div className={`project-evaluation-result ${isCompatible ? "is-compatible" : evaluation.status === "Cercano" ? "is-close" : "is-far"}`}>
        <div className="project-evaluation-result__heading"><span>Resultado referencial</span><strong className={`simulation-status ${statusClass[evaluation.status] || "adjust"}`}>{evaluation.status}</strong></div>
        <dl className="project-evaluation-result__metrics">
          <div><dt>Valor desde</dt><dd>{formatProjectPrice(project)}</dd></div>
          <div><dt>Pie mínimo</dt><dd>{formatClp(evaluation.pieMinimo)}</dd></div>
          <div><dt>Dividendo estimado</dt><dd>{formatClp(evaluation.dividend)}</dd></div>
        </dl>
      </div>
      {alternatives.length > 0 && <div className="project-evaluation-modal__alternatives">
        <p>Alternativas para comparar</p>
        {alternatives.map((item) => <button key={item.project.id} type="button" className="text-button" onClick={() => onSelectProject?.(item.project.id)}>
          {item.project.nombre} · {propertyLabels[item.project.tipo_vivienda] || item.project.tipo_vivienda} · {formatProjectPrice(item.project)}
        </button>)}
      </div>}
      {isPortal ? <div className="project-evaluation-modal__actions">
        <a href={project.url} target="_blank" rel="noopener noreferrer" className="primary-button">Ver publicación original ↗</a>
        {project.inmobiliaria && <p className="project-evaluation-modal__context">Publicado por {project.inmobiliaria} en Portal Inmobiliario.</p>}
      </div> : goalSuccess ? <div className="project-evaluation-modal__message is-success"><p>Meta financiera actualizada. Vuelve a revisar Subsidios y tu plan de mejora para ver cómo se ajustan a este proyecto.</p><button type="button" className="primary-button" onClick={() => onNavigate?.("subsidios")}>Revisar subsidios</button><button type="button" className="secondary-button" onClick={() => onNavigate?.("tracking")}>Revisar plan de mejora</button><button type="button" className="text-button" onClick={onClose}>Seguir explorando proyectos</button></div> : interestStatus ? <div className="project-evaluation-modal__message is-success"><p>{interestStatus}</p><button type="button" className="secondary-button" onClick={onClose}>Volver al catálogo</button></div> : <div className="project-evaluation-modal__actions">
        {actionError && <div className="project-evaluation-modal__message is-error"><p>{actionError}</p></div>}
        <button type="button" className="primary-button" onClick={() => handleInterest(isCompatible)}>{isCompatible ? "Solicitar contacto" : isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}</button>
        {isCurrentGoal ? <div className="project-current-goal-notice"><i className="ti ti-circle-check" aria-hidden="true" /><span>Este proyecto ya es tu preferencia de última evaluación.</span></div> : <button
          type="button"
          className={`secondary-button project-goal-confirm-button ${confirmGoalChange ? "is-confirming" : ""}`}
          disabled={goalPending}
          onClick={handleSetGoal}
        >
          {goalPending
            ? "Actualizando tu plan..."
            : confirmGoalChange
              ? "Confirmar cambio de preferencia"
              : "Usar como meta de mi plan"}
        </button>}
        {!isCurrentGoal && confirmGoalChange && (
          <button type="button" className="text-button" onClick={() => setConfirmGoalChange(false)}>
            Cancelar cambio
          </button>
        )}
      </div>}
    </section>
  </div>;
}
