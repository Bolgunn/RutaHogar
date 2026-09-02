import React, { useMemo, useState } from "react";
import {
  buildAccessibleAlternatives,
  evaluateScenario,
  projectToScenario,
} from "../lib/simulation/compatibility";
import { formatProjectPrice } from "../lib/simulation/projectAdapter";
import { CLP_FORMATTER } from "../services/financialTracking";
import { propertyLabels } from "../constants";

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
  onToggleFavorite,
  isFavorite,
}) {
  const [interestStatus, setInterestStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [goalPending, setGoalPending] = useState(false);

  // La compatibilidad se calcula localmente con el mismo veredicto de simulación.
  const evaluation = useMemo(
    () => evaluateScenario(context, projectToScenario(project, ufValueClp)),
    [context, project, ufValueClp],
  );
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
      setInterestStatus("Solicitud enviada. Un ejecutivo te contactará a la brevedad.");
    } catch (cause) {
      setActionError(cause.message || "No se pudo registrar tu solicitud.");
    }
  };

  const handleSetGoal = async () => {
    if (!onSetGoal) return;
    setGoalPending(true);
    try {
      await onSetGoal(project);
    } finally {
      setGoalPending(false);
    }
  };

  return <div className="project-evaluation-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="project-evaluation-modal__card" role="dialog" aria-modal="true" aria-labelledby="project-evaluation-title">
      <button type="button" className="project-evaluation-modal__close" onClick={onClose} aria-label="Cerrar calificación">x</button>
      <span className="eyebrow">Proyecto seleccionado</span>
      <h2 id="project-evaluation-title">Compatibilidad con {project.nombre}</h2>
      <p className="project-evaluation-modal__context">{project.comuna || "Comuna sin dato"} · {formatProjectPrice(project)} · {formatClp(evaluation.valueClp)}</p>
      <div className={`project-evaluation-result ${isCompatible ? "is-compatible" : evaluation.status === "Cercano" ? "is-close" : "is-far"}`}>
        <span>Resultado referencial</span><strong className={`simulation-status ${statusClass[evaluation.status] || "adjust"}`}>{evaluation.status}</strong>
        <p>{evaluation.message}</p>
        <p>{evaluation.recommendation}</p>
      </div>
      <p className="project-evaluation-modal__context">Esta simulación es referencial y se basa en datos declarados. No corresponde a aprobación bancaria, preaprobación, tasación ni cotización formal.</p>
      {alternatives.length > 0 && <div className="project-evaluation-modal__actions">
        {alternatives.map((item) => <button key={item.project.id} type="button" className="text-button" onClick={() => onSelectProject?.(item.project.id)}>
          {item.project.nombre} · {propertyLabels[item.project.tipo_vivienda] || item.project.tipo_vivienda} · {formatProjectPrice(item.project)}
        </button>)}
      </div>}
      {interestStatus ? <div className="project-evaluation-modal__message is-success"><p>{interestStatus}</p><button type="button" className="secondary-button" onClick={onClose}>Volver al catálogo</button></div> : <div className="project-evaluation-modal__actions">
        {actionError && <div className="project-evaluation-modal__message is-error"><p>{actionError}</p></div>}
        <button type="button" className="primary-button" onClick={() => handleInterest(isCompatible)}>{isCompatible ? "Solicitar contacto" : isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}</button>
        <button type="button" className="secondary-button" disabled={goalPending} onClick={handleSetGoal}>{goalPending ? "Actualizando tu plan..." : "Usar como meta de mi plan"}</button>
        <button type="button" className="text-button" onClick={onClose}>Volver al catálogo</button>
      </div>}
    </section>
  </div>;
}
