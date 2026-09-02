import React, { useMemo, useState } from "react";
import { buildAccessibleAlternatives, evaluateScenario, projectToScenario } from "../lib/simulation/compatibility";
import { formatProjectPrice } from "../lib/simulation/projectAdapter";
import { CLP_FORMATTER } from "../services/financialTracking";
import { propertyLabels } from "../constants";

// Veredicto de compatibilidad de un proyecto del catálogo (HU 9).
//
// Antes este modal re-POSTeaba /score con property_value = precio_min_uf y leía
// de vuelta la `classification` del lead, más un getGapMessage() local. Eso era
// un segundo algoritmo respondiendo la misma pregunta que HU 6 —¿es este precio
// compatible con este perfil?— con otro vocabulario. Ahora usa evaluateScenario,
// que es puro y síncrono: el modal no hace ninguna llamada de red al abrirse.
//
// Alto/Medio/Bajo es un score de lead sobre todo el perfil; Compatible/Cercano/
// Requiere ajuste es el veredicto de UN escenario contra UN precio. No son la
// misma escala y por eso el badge cambió de vocabulario.
const statusClass = {
  Compatible: "compatible",
  Cercano: "near",
  "Requiere ajuste": "adjust",
};

const statusTone = {
  Compatible: { border: "#bbf7d0", background: "#f0fdf4" },
  Cercano: { border: "#fef08a", background: "#fefce8" },
  "Requiere ajuste": { border: "#fecaca", background: "#fef2f2" },
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

  const evaluation = useMemo(
    () => evaluateScenario(context, projectToScenario(project, ufValueClp)),
    [context, project, ufValueClp],
  );

  // REGLAS_HU6: las alternativas aparecen "cuando un escenario no sea
  // Compatible" — o sea también en Requiere ajuste, que es justamente quien más
  // necesita una opción más barata. El orden es financiero (compatibilidad,
  // luego brecha); comuna y tipo son desempate, nunca filtro.
  const alternatives = useMemo(() => {
    if (evaluation.status === "Compatible") return [];
    const others = projects.filter((item) => item.id !== project.id);
    return buildAccessibleAlternatives(others, context, onboarding, 4).slice(0, 3);
  }, [context, evaluation.status, onboarding, project.id, projects]);

  const isCompatible = evaluation.status === "Compatible";
  const tone = statusTone[evaluation.status] || statusTone["Requiere ajuste"];

  const handleInterest = async (contactarEjecutivo) => {
    setActionError("");

    if (!contactarEjecutivo) {
      // El error del toggle lo captura el catálogo, que está DETRÁS de este
      // overlay: si no se mira el resultado, el modal anuncia "guardado"
      // mientras la estrella revierte y el aviso queda invisible.
      const saved = onToggleFavorite ? await onToggleFavorite(project.id) : false;
      if (!saved) {
        setActionError("No pudimos actualizar tus favoritos. Intenta nuevamente.");
        return;
      }
      setInterestStatus(
        isFavorite
          ? "Proyecto removido de tus favoritos."
          : "¡Proyecto guardado! Ahora tiene una marca de favorito en tu catálogo.",
      );
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: project.id,
          contactar_ejecutivo: true,
          email: contactEmail || undefined,
        }),
      });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
      setInterestStatus("¡Solicitud enviada! Un ejecutivo te contactará a la brevedad.");
    } catch (err) {
      console.error(err);
      setActionError("No pudimos enviar tu solicitud. Intenta nuevamente.");
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

  return (
    <div className="modal-overlay" style={{ zIndex: 1000, position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="modal-content" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "12px", padding: "2rem", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>

        <h2 style={{ marginBottom: "0.5rem" }}>Cotización: {project.nombre}</h2>
        <p style={{ color: "var(--color-neutral-600)", margin: 0 }}>
          {project.comuna} · {formatProjectPrice(project)} · {formatClp(evaluation.valueClp)}
        </p>

        <div style={{ marginTop: "1.5rem", padding: "1.5rem", borderRadius: "8px", border: `1px solid ${tone.border}`, backgroundColor: tone.background }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Compatibilidad:</h3>
            <span className={`simulation-status ${statusClass[evaluation.status] || "adjust"}`}>{evaluation.status}</span>
          </div>

          <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>{evaluation.message}</p>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-neutral-700)" }}>{evaluation.recommendation}</p>
        </div>

        {/* El modal se titula "Cotización" y una cotización es precisamente lo
            que esto no es. La advertencia es la de REGLAS_HU6, textual. */}
        <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--color-neutral-600)", lineHeight: 1.5 }}>
          Esta simulación es referencial y se basa en datos declarados. No corresponde a aprobación
          bancaria, preaprobación, tasación ni cotización formal.
        </p>

        {alternatives.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Alternativas más accesibles</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {alternatives.map((item) => (
                <button
                  key={item.project.id}
                  type="button"
                  onClick={() => onSelectProject && onSelectProject(item.project.id)}
                  style={{ textAlign: "left", padding: "0.75rem", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#fff", cursor: "pointer" }}
                >
                  <span className={`simulation-status ${statusClass[item.status] || "adjust"}`}>{item.status}</span>
                  <strong style={{ display: "block", marginTop: "0.4rem" }}>{item.project.nombre}</strong>
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    {item.project.comuna} · {propertyLabels[item.project.tipo_vivienda] || item.project.tipo_vivienda} ·{" "}
                    {formatProjectPrice(item.project)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", marginTop: "2rem", flexDirection: "column" }}>
          {interestStatus ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem", backgroundColor: "#dcfce7", color: "#166534", borderRadius: "8px", textAlign: "center", fontWeight: "600" }}>
                ✓ {interestStatus}
              </div>
              <button className="secondary-button" style={{ width: "100%", padding: "0.6rem", border: "none" }} onClick={onClose}>
                Volver al Catálogo
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {actionError && (
                <div style={{ padding: "0.75rem", backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "0.875rem" }}>
                  {actionError}
                </div>
              )}
              <button className="primary-button" style={{ width: "100%", padding: "0.6rem" }} onClick={() => handleInterest(isCompatible)}>
                {isCompatible ? "Contactar a un Ejecutivo" : (isFavorite ? "Quitar de mis Favoritos" : "Guardar en mis Favoritos")}
              </button>
              <button
                className="secondary-button"
                disabled={goalPending}
                style={{ width: "100%", padding: "0.6rem", borderRadius: "6px", backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", cursor: goalPending ? "wait" : "pointer", fontWeight: "600", color: "#475569" }}
                onClick={handleSetGoal}
              >
                {goalPending ? "Actualizando tu plan..." : "Fijar como mi Meta (Actualizar Plan)"}
              </button>
              <button className="secondary-button" style={{ width: "100%", padding: "0.6rem", border: "none" }} onClick={onClose}>
                Volver al Catálogo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
