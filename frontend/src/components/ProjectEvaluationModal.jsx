import React, { useState, useEffect } from "react";

// E2: Determinar la brecha principal
const getGapMessage = (scoreResult, planType) => {
  const ind = scoreResult.financial_indicators || {};
  
  if (ind.dividendo_viable === 0) {
    return "Tu nivel de deuda actual (RCI > 25%) no permite tomar un crédito hipotecario. Debes sanear tus deudas o complementar renta.";
  }
  if (ind.dividendo_estimado > ind.dividendo_viable) {
    return "Tus ingresos no alcanzan para el dividendo estimado. Intenta complementar renta o reducir tus deudas actuales.";
  }
  if (ind.brecha_pie_minimo > 0) {
    const ahorroMensual = planType === "acelerado" ? ind.ahorro_mensual_acelerado : ind.ahorro_mensual_conservador;
    const meses = ahorroMensual > 0 ? Math.ceil(ind.brecha_pie_minimo / ahorroMensual) : 999;
    if (meses > 12) {
      return "El tiempo requerido para ahorrar el pie supera 1 año. Prioriza aumentar tu ahorro mensual.";
    } else {
      return "Te falta ahorro para el pie, pero puedes lograrlo en corto plazo.";
    }
  }
  return "Existen factores de riesgo en tu estabilidad o historial crediticio.";
};

export default function ProjectEvaluationModal({ project, evaluationBase, onClose, allProjects, onSetGoal, onToggleFavorite, isFavorite }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [interestStatus, setInterestStatus] = useState(""); // success message
  
  // Re-evaluar el score con el precio del proyecto
  useEffect(() => {
    async function evaluateProject() {
      if (!evaluationBase || !evaluationBase.input) {
        setError("No tienes una preevaluación base. Por favor completa tu formulario inicial primero.");
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // Clonar input base
        const payload = { ...evaluationBase.input };
        // Sobreescribir con datos del proyecto
        payload.property_value = project.precio_min_uf;
        payload.property_value_unit = "uf";
        
        const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
        // Llamar a la API
        const res = await fetch(`${apiBase.replace(/\/$/, "")}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al evaluar el proyecto.");
        setResult(data);
      } catch (err) {
        setError(err.message || "Error al evaluar el proyecto.");
      } finally {
        setLoading(false);
      }
    }
    
    evaluateProject();
  }, [project, evaluationBase]);

  const handleInterest = async (contactarEjecutivo) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
      await fetch(`${apiBase.replace(/\/$/, "")}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: project.id,
          contactar_ejecutivo: contactarEjecutivo,
          email: "usuario@ejemplo.com"
        })
      });
      if (contactarEjecutivo) {
        setInterestStatus("¡Solicitud enviada! Un ejecutivo te contactará a la brevedad.");
      } else {
        if (onToggleFavorite) onToggleFavorite(project.id);
        setInterestStatus(!isFavorite ? "¡Proyecto guardado! Ahora tiene una marca de favorito en tu catálogo." : "Proyecto removido de tus favoritos.");
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar el interés.");
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" style={{ zIndex: 1000, position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="modal-content" style={{ maxWidth: "500px", textAlign: "center", padding: "3rem", backgroundColor: "#fff", borderRadius: "12px", width: "90%" }}>
          <h2 style={{ marginBottom: "1rem" }}>Evaluando Proyecto...</h2>
          <p>Calculando tu compatibilidad financiera con {project.nombre}.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" style={{ zIndex: 1000, position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="modal-content" style={{ maxWidth: "500px", backgroundColor: "#fff", borderRadius: "12px", padding: "2rem", width: "90%" }}>
          <h2>Aviso</h2>
          <p style={{ color: "var(--color-danger)" }}>{error}</p>
          <button className="primary-button" onClick={onClose} style={{ marginTop: "1rem" }}>Cerrar</button>
        </div>
      </div>
    );
  }

  const profile = result?.classification || "Bajo";
  const isCompatible = profile === "Alto" || profile === "Medio Alto";
  const isClose = profile === "Medio";
  const isFar = profile === "Bajo" || profile === "Medio Bajo";
  
  // E3: Sugerir proyecto del mismo sector más barato
  let suggestedProject = null;
  if (isClose && allProjects) {
    suggestedProject = allProjects
      .filter(p => p.comuna === project.comuna && p.precio_min_uf < project.precio_min_uf)
      .sort((a, b) => b.precio_min_uf - a.precio_min_uf)[0]; // El más cercano por debajo
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1000, position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="modal-content" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "12px", padding: "2rem", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
        
        <h2 style={{ marginBottom: "0.5rem" }}>Cotización: {project.nombre}</h2>
        <p style={{ color: "var(--color-neutral-600)", margin: 0 }}>{project.comuna} - Desde {project.precio_min_uf} UF</p>
        
        <div style={{ marginTop: "1.5rem", padding: "1.5rem", borderRadius: "8px", border: `1px solid ${isCompatible ? '#bbf7d0' : isClose ? '#fef08a' : '#fecaca'}`, backgroundColor: isCompatible ? '#f0fdf4' : isClose ? '#fefce8' : '#fef2f2' }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>Perfil Resultante:</h3>
            <span className={`score-badge ${profile.replace(" ", "")}`}>{profile}</span>
          </div>
          
          {/* E1 y E2: Brecha */}
          {isFar && (
            <div>
              <p style={{ fontWeight: "600", color: "#991b1b" }}>Este proyecto supera tu capacidad actual.</p>
              <p style={{ color: "#7f1d1d", fontSize: "0.9rem" }}>{getGapMessage({ input: evaluationBase.input, ...result }, "conservador")}</p>
            </div>
          )}
          
          {/* E3: Ajuste mínimo (sugerencia) */}
          {isClose && (
            <div>
              <p style={{ fontWeight: "600", color: "#854d0e" }}>Estás cerca de la capacidad requerida.</p>
              <p style={{ color: "#713f12", fontSize: "0.9rem" }}>Podrías alcanzar la meta mejorando tu ahorro o reduciendo deudas.</p>
              {suggestedProject && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "#fff", border: "1px solid #fde047", borderRadius: "6px" }}>
                  <strong>Alternativa en {project.comuna}:</strong> 
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>Te sugerimos evaluar <strong>{suggestedProject.nombre}</strong> (Desde {suggestedProject.precio_min_uf} UF).</p>
                </div>
              )}
            </div>
          )}
          
          {/* E4: Acciones */}
          {isCompatible && (
            <div>
              <p style={{ fontWeight: "600", color: "#166534" }}>¡El proyecto es financieramente compatible contigo!</p>
              <p style={{ color: "#14532d", fontSize: "0.9rem" }}>Cumples con los ratios bancarios requeridos para financiar este monto.</p>
            </div>
          )}
        </div>
        
        {/* Footer Actions E4 */}
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
              <button className="primary-button" style={{ width: "100%", padding: "0.6rem" }} onClick={() => handleInterest(isCompatible)}>
                {isCompatible ? "Contactar a un Ejecutivo" : (isFavorite ? "Quitar de mis Favoritos" : "Guardar en mis Favoritos")}
              </button>
              <button 
                className="secondary-button" 
                style={{ width: "100%", padding: "0.6rem", borderRadius: "6px", backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: "600", color: "#475569" }} 
                onClick={() => {
                  if (onSetGoal) onSetGoal(project, result);
                }}
              >
                Fijar como mi Meta (Actualizar Plan)
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
