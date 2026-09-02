import React, { useEffect, useRef, useState } from "react";

function gapMessage(result) {
  const indicators = result.financial_indicators || {};
  if (indicators.dividendo_viable === 0) return "Tu nivel de deuda actual no permite asumir un crédito hipotecario referencial.";
  if (indicators.dividendo_estimado > indicators.dividendo_viable) return "El dividendo estimado supera tu capacidad de pago referencial.";
  if (indicators.brecha_pie_minimo > 0) return "Aún necesitas reunir parte del pie mínimo para este proyecto.";
  return "Revisa los factores de tu evaluación antes de avanzar.";
}

export default function ProjectEvaluationModal({ project, evaluationBase, onClose, allProjects, onSetGoal, onToggleFavorite, isFavorite }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [interestStatus, setInterestStatus] = useState("");
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    if (!evaluationBase?.input) { setError("Completa una precalificación para revisar la compatibilidad con este proyecto."); setLoading(false); return undefined; }
    const payload = { ...evaluationBase.input, property_value: project.precio_min_uf, property_value_unit: "uf" };
    const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
    fetch(`${apiBase.replace(/\/$/, "")}/score`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.message || "No se pudo evaluar el proyecto."); return data; })
      .then((data) => { if (active) setResult(data); })
      .catch((cause) => { if (active) setError(cause.message || "No se pudo evaluar el proyecto."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [evaluationBase, project]);

  const handleInterest = async (contactExecutive) => {
    if (!contactExecutive) { onToggleFavorite?.(project.id); setInterestStatus(isFavorite ? "Proyecto quitado de tus favoritos." : "Proyecto guardado en tus favoritos."); return; }
    if (!evaluationBase?.email) { setError("No encontramos tu correo de contacto. Actualízalo en tu perfil para solicitar contacto."); return; }
    try {
      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/interest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proyecto_id: project.id, contactar_ejecutivo: true, email: evaluationBase.email }) });
      if (!response.ok) throw new Error("No se pudo registrar tu solicitud.");
      setInterestStatus("Solicitud enviada. Un ejecutivo te contactará a la brevedad.");
    } catch (cause) { setError(cause.message || "No se pudo registrar tu solicitud."); }
  };

  const classification = result?.classification || "Bajo";
  const compatible = classification === "Alto" || classification === "Medio Alto";
  const closeOnBackdrop = (event) => { if (event.target === event.currentTarget) onClose(); };
  const title = loading ? "Evaluando compatibilidad" : error ? "No pudimos completar la evaluación" : `Compatibilidad con ${project.nombre}`;

  return <div className="project-evaluation-modal" role="presentation" onMouseDown={closeOnBackdrop}>
    <section className="project-evaluation-modal__card" role="dialog" aria-modal="true" aria-labelledby="project-evaluation-title">
      <button ref={closeButtonRef} type="button" className="project-evaluation-modal__close" onClick={onClose} aria-label="Cerrar evaluación">x</button>
      <span className="eyebrow">Proyecto seleccionado</span>
      <h2 id="project-evaluation-title">{title}</h2>
      <p className="project-evaluation-modal__context">{project.comuna || "Comuna sin dato"} · Desde {project.precio_min_uf} UF</p>
      {loading ? <div className="admin-compact-empty"><strong>Calculando con los datos de tu precalificación...</strong></div> : error ? <div className="project-evaluation-modal__message is-error"><p>{error}</p><button type="button" className="primary-button" onClick={onClose}>Volver al catálogo</button></div> : (
        <>
          <div className={`project-evaluation-result ${compatible ? "is-compatible" : classification === "Medio" ? "is-close" : "is-far"}`}>
            <span>Resultado referencial</span><strong>{classification}</strong>
            <p>{compatible ? "Este proyecto es compatible con tu evaluación referencial actual." : gapMessage(result)}</p>
          </div>
          {interestStatus ? <div className="project-evaluation-modal__message is-success"><p>{interestStatus}</p><button type="button" className="secondary-button" onClick={onClose}>Volver al catálogo</button></div> : <div className="project-evaluation-modal__actions">
            <button type="button" className="primary-button" onClick={() => handleInterest(compatible)}>{compatible ? "Solicitar contacto" : isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}</button>
            <button type="button" className="secondary-button" onClick={() => onSetGoal?.(project, result)}>Usar como meta de mi plan</button>
            <button type="button" className="text-button" onClick={onClose}>Volver al catálogo</button>
          </div>}
        </>
      )}
    </section>
  </div>;
}
