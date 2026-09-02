import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildFinancialTracking, goalStatuses } from "../services/financialTracking";
import { formatScore, getClassificationAdjustment, getScoreBadgeClass } from "../utils/helpers";
import { formatClp } from "../services/housingSavingsPlanService";
import BankingChecklist from "./BankingChecklist";
import FieldTooltip from "./FieldTooltip";

function GoalsCarousel({ children }) {
  const stripRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = stripRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
      observer.disconnect();
    };
  }, []);

  const scrollByPage = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 280) * direction;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className={`plan-carousel ${canPrev ? "has-prev" : ""} ${canNext ? "has-next" : ""}`}>
      <button
        type="button"
        className="plan-carousel-arrow is-left"
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label="Anterior"
      >
        <i className="ti ti-chevron-left" aria-hidden="true" />
      </button>
      <div className="plan-carousel-strip" ref={stripRef}>
        {children}
      </div>
      <button
        type="button"
        className="plan-carousel-arrow is-right"
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label="Siguiente"
      >
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}

const planStatusClass = (status) => {
  if (status === "alcanzado") return "status-alcanzado";
  if (status === "en_curso") return "status-en-curso";
  if (status === "en_progreso") return "status-en-progreso";
  return "status-pendiente";
};

const formatMonthsToYears = (months) => {
  if (months === undefined || months === null || isNaN(months)) return "0 meses";
  if (months >= 999) return "Tiempo no proyectable";
  if (months === 0) return "0 meses";
  if (months < 13) return `${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const yearStr = years === 1 ? "1 año" : `${years} años`;
  const monthStr = remainingMonths === 1 ? "1 mes" : `${remainingMonths} meses`;

  return remainingMonths === 0 ? yearStr : `${yearStr} y ${monthStr}`;
};

const CircularProgress = ({ percentage = 0, color = "var(--color-primary)", size = 50, stroke = 5 }) => {
  const clamped = Math.min(100, Math.max(0, Math.round(percentage)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div style={{ position: "relative", width: `${size}px`, height: `${size}px` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.6s ease",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--color-neutral-900)" }}>
          {clamped}%
        </span>
      </div>
    </div>
  );
};

export default function FinancialTracking({
  evaluation,
  goals = [],
  onAcceptPlan,
  onGoalStatusChange,
  onOpenGoalPlan,
  onStartEvaluation,
  onOpenHousingPlan,
  onLogScoringEvent,
  onOpenMilestoneRegistration,
  onNavigate,
  successMessage,
}) {
  const [planType, setPlanType] = useState(() => {
    return evaluation?.plan_type || sessionStorage.getItem("scoreleads_selected_plan_type") || null;
  });

  useEffect(() => {
    if (evaluation?.plan_type && evaluation.plan_type !== planType) {
      setPlanType(evaluation.plan_type);
    }
  }, [evaluation?.plan_type]);

  useEffect(() => {
    if (planType) {
      sessionStorage.setItem("scoreleads_selected_plan_type", planType);
    } else {
      sessionStorage.removeItem("scoreleads_selected_plan_type");
    }
  }, [planType]);

  const tracking = useMemo(() => buildFinancialTracking(evaluation), [evaluation]);
  const shouldShowHousingPlan = Boolean(evaluation?.input?.valor_propiedad && evaluation?.input?.ahorro_disponible);

  const adjustment = useMemo(
    () => getClassificationAdjustment(evaluation?.result),
    [evaluation?.result],
  );

  const [filterPriority, setFilterPriority] = useState("Todos");
  const [filterCategory, setFilterCategory] = useState("Todos");

  // Plazo de compra del contexto inicial (limite superior)
  const baseDesiredMonths = useMemo(() => {
    const p = evaluation?.input?.plazo_compra;
    if (p === "inmediato" || p === "0_a_3_meses") return 3;
    if (p === "3_a_6_meses") return 6;
    if (p === "6_a_12_meses") return 12;
    if (p === "mas_12_meses") return 24;
    return 12; // fallback
  }, [evaluation]);

  if (!tracking) {
    return (
      <section className="section-block tracking-panel">
        <div className="section-heading">
          <span className="eyebrow">Plan de Mejora</span>
          <h1>Mi plan de mejora</h1>
        </div>
        <div className="empty-state">
          <strong>Aún no tienes una precalificación.</strong>
          <p>Realiza una precalificación para generar tu plan de mejora.</p>
          <button type="button" onClick={onStartEvaluation}>Iniciar precalificación</button>
        </div>
        <BankingChecklist evaluation={evaluation} onNavigate={onNavigate} />
      </section>
    );
  }

  const indicators = evaluation?.result?.financial_indicators || {};
  
  if (indicators.ahorro_mensual_acelerado === undefined) {
    return (
      <section className="section-block tracking-panel">
        <div className="section-heading">
          <span className="eyebrow">Plan de Mejora</span>
          <h1>Mi plan de mejora</h1>
        </div>
        <div className="empty-state">
          <strong>Vuelve a precalificar para ver tu plan actualizado.</strong>
          <p>Hemos mejorado nuestro sistema de planes. Necesitamos que vuelvas a evaluar tu perfil para generar tus nuevas metas financieras.</p>
          <button type="button" className="primary-button" onClick={onStartEvaluation}>Precalificar nuevamente</button>
        </div>
        <BankingChecklist evaluation={evaluation} onNavigate={onNavigate} />
      </section>
    );
  }

  const {
    dividendo_estimado = 0,
    dividendo_viable = 0,
    brecha_pie_minimo = 0,
    ahorro_mensual_acelerado = 0,
    ahorro_mensual_conservador = 0,
    pie_minimo_clp = 0,
  } = indicators;

  // Calculo de ahorro y pie
  const currentAhorro = evaluation?.input?.ahorro_disponible || 0;
  const pie_necesario = brecha_pie_minimo + currentAhorro;
  const pieProgressPercent = pie_necesario > 0 ? (currentAhorro / pie_necesario) * 100 : (brecha_pie_minimo === 0 && pie_minimo_clp > 0 ? 100 : 0);

  // Computed times
  const computedMesesAcelerado = indicators.meses_acelerado !== undefined
    ? indicators.meses_acelerado
    : (brecha_pie_minimo > 0 && ahorro_mensual_acelerado > 0 ? Math.ceil(brecha_pie_minimo / ahorro_mensual_acelerado) : (brecha_pie_minimo > 0 ? 999 : 0));

  const computedMesesConservador = indicators.meses_conservador !== undefined
    ? indicators.meses_conservador
    : (brecha_pie_minimo > 0 && ahorro_mensual_conservador > 0 ? Math.ceil(brecha_pie_minimo / ahorro_mensual_conservador) : (brecha_pie_minimo > 0 ? 999 : 0));

  const currentPlanMonths = planType === "acelerado" ? computedMesesAcelerado : computedMesesConservador;
  const currentPlanAhorro = planType === "acelerado" ? ahorro_mensual_acelerado : ahorro_mensual_conservador;

  // Calculos de Deuda y Morosidad (E3)
  const currentDeudaMensual = Number(evaluation?.input?.deuda_mensual) || 0;
  const currentMorosidad = evaluation?.input?.morosidad_actual === "si" ? (Number(evaluation?.input?.monto_morosidad) || 0) : 0;
  const ingresoMensual = Number(evaluation?.input?.ingreso_mensual) || 0;

  // Limite del 25% para un RCI bancario sano
  const limiteDeudaSana = ingresoMensual * 0.25;
  const excedenteDeuda = Math.max(0, currentDeudaMensual - limiteDeudaSana);

  // Porcentaje de salud de deuda
  const rciHealthPercent = excedenteDeuda === 0 
    ? 100 
    : Math.max(0, Math.min(100, Math.round((limiteDeudaSana / currentDeudaMensual) * 100)));
  const morosidadHealthPercent = currentMorosidad === 0 ? 100 : 0;

  // Proyeccion de pago con perfiles conservador y acelerado
  const amortizacionAcelerada = ahorro_mensual_acelerado > 0 ? ahorro_mensual_acelerado : Math.round(ingresoMensual * 0.15);
  const amortizacionConservadora = ahorro_mensual_conservador > 0 ? ahorro_mensual_conservador : Math.round(ingresoMensual * 0.08);
  const currentAmortizacion = planType === "acelerado" ? amortizacionAcelerada : amortizacionConservadora;

  const mesesMorosidadAcelerado = currentMorosidad > 0
    ? (amortizacionAcelerada > 0 ? Math.ceil(currentMorosidad / amortizacionAcelerada) : 999)
    : 0;
  const mesesMorosidadConservador = currentMorosidad > 0
    ? (amortizacionConservadora > 0 ? Math.ceil(currentMorosidad / amortizacionConservadora) : 999)
    : 0;
  const currentPlanMorosidadMonths = planType === "acelerado" ? mesesMorosidadAcelerado : mesesMorosidadConservador;
  const totalSaneamientoRequerido = currentMorosidad + excedenteDeuda;

  // Formato monetario
  const formatCurrency = (val) => `$${Math.round(val || 0).toLocaleString("es-CL")}`;

  // Filtros de Acciones de Habilitacion
  const categories = ["Todos", ...new Set(tracking.goals.map((g) => g.category).filter(Boolean))];
  const priorities = ["Todos", "Bajo", "Medio", "Alto", "Opcional"];

  const filteredGoals = tracking.goals.filter((goal) => {
    const impact = goal.impact_level || "Medio";
    if (filterPriority !== "Todos" && impact !== filterPriority) {
      return false;
    }
    if (filterCategory !== "Todos" && goal.category !== filterCategory) {
      return false;
    }
    return true;
  });

  // Vista de Seleccion de Plan
  if (!planType) {
    return (
      <section className="section-block tracking-panel">
        <div className="section-heading">
          <span className="eyebrow">Configuración Inicial</span>
          <h1>Selecciona tu Plan de Mejora</h1>
          <p>Revisa las ventajas y desventajas de cada perfil y elige el que mejor se ajuste a tus capacidades.</p>
        </div>

        {computedMesesAcelerado > 12 && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "0.9rem", color: "#1e40af", lineHeight: "1.4" }}>
            <strong>Sugerencia:</strong> Tu pie proyectado toma más de 1 año incluso en el plan acelerado ({formatMonthsToYears(computedMesesAcelerado)}). Podrías alcanzar tu meta antes si evalúas cambiar tu vivienda objetivo o buscas en otros sectores más accesibles.
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", marginTop: "1.5rem" }}>
          {/* Plan Acelerado */}
          <div style={{ flex: "1 1 300px", padding: "1.5rem", borderRadius: "12px", border: "2px solid var(--color-primary)", backgroundColor: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
            <h2 style={{ fontSize: "1.25rem", color: "var(--color-primary)", margin: "0 0 1rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Plan Acelerado
              <span style={{ fontSize: "0.75rem", backgroundColor: "var(--color-primary)", color: "#fff", padding: "4px 8px", borderRadius: "12px" }}>Recomendado</span>
            </h2>
            <p style={{ fontSize: "0.9rem", color: "var(--color-neutral-600)", margin: "0 0 1rem 0" }}>
              Alcanza tu meta de pie en el menor tiempo posible.
            </p>
            <ul style={{ paddingLeft: "1.2rem", margin: "0 0 1.5rem 0", fontSize: "0.9rem", color: "var(--color-neutral-700)", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", lineHeight: "1.4" }}>
              <li><strong>Pros:</strong> Alcanzas tu meta de pie más rápido y estás listo antes para postular.</li>
              <li><strong>Pros:</strong> Saneas deudas o morosidad rápidamente, reduciendo los intereses que pagas al banco.</li>
              <li><strong>Contras:</strong> Exige un alto nivel de ahorro mensual ({formatCurrency(ahorro_mensual_acelerado)}/m).</li>
              <li><strong>Contras:</strong> Requiere un presupuesto mensual estricto, dejando poca holgura para imprevistos.</li>
            </ul>
            <button
              type="button"
              className="primary-button"
              style={{ width: "100%", padding: "0.75rem", fontSize: "1rem" }}
              onClick={() => {
                setPlanType("acelerado");
                if (onAcceptPlan) onAcceptPlan("acelerado");
              }}
            >
              Elegir Plan Acelerado
            </button>
          </div>

          {/* Plan Conservador */}
          <div style={{ flex: "1 1 300px", padding: "1.5rem", borderRadius: "12px", border: "1px solid #cbd5e1", backgroundColor: "#fff", display: "flex", flexDirection: "column", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
            <h2 style={{ fontSize: "1.25rem", color: "var(--color-neutral-800)", margin: "0 0 1rem 0" }}>Plan Conservador</h2>
            <p style={{ fontSize: "0.9rem", color: "var(--color-neutral-600)", margin: "0 0 1rem 0" }}>
              Cuota de ahorro menor y más cómoda, pero tomará más tiempo.
            </p>
            <ul style={{ paddingLeft: "1.2rem", margin: "0 0 1.5rem 0", fontSize: "0.9rem", color: "var(--color-neutral-700)", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", lineHeight: "1.4" }}>
              <li><strong>Pros:</strong> Ahorro mensual más cómodo y realista ({formatCurrency(ahorro_mensual_conservador)}/m).</li>
              <li><strong>Pros:</strong> Mayor holgura financiera mes a mes para destinar a otros gastos o imprevistos familiares.</li>
              <li><strong>Contras:</strong> Toma más tiempo lograr el pie ({formatMonthsToYears(computedMesesConservador)} estimados).</li>
              <li><strong>Contras:</strong> Si tienes deudas o morosidad, tardarás más en sanearlas, arrastrando intereses.</li>
            </ul>
            <button
              type="button"
              style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", backgroundColor: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "6px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#e2e8f0"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"}
              onClick={() => {
                setPlanType("conservador");
                if (onAcceptPlan) onAcceptPlan("conservador");
              }}
            >
              Elegir Plan Conservador
            </button>
          </div>
        </div>
        <BankingChecklist evaluation={evaluation} onNavigate={onNavigate} />
      </section>
    );
  }

  // Meta de tiempo dinamica según el plan seleccionado:
  const effectiveDesiredMonths = planType === "acelerado"
    ? Math.max(1, computedMesesAcelerado)
    : baseDesiredMonths;



  return (
    <section className="section-block tracking-panel">
      <div className="section-heading tracking-page-head">
        <div>
          <span className="eyebrow">Plan de Mejora {planType === "acelerado" ? "(Acelerado)" : "(Conservador)"}</span>
          <h1>Progreso del plan financiero</h1>
          <p>Una lectura referencial de las condiciones que conviene preparar antes de una evaluación bancaria.</p>
        </div>
        <div className="tracking-page-head__actions">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("projects")}
              className="secondary-button compact-button"
            >
              Explorar Proyectos y Cotizar
            </button>
          )}
          <button
            type="button"
            onClick={() => setPlanType(null)}
            className="text-button"
          >
            Cambiar de Plan
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="success-message" style={{ marginBottom: "2rem", marginTop: "1rem" }}>
          {successMessage}
        </div>
      )}

      <div className="recommendation-hero-row tracking-overview">
        <div className={`tracking-overview__score ${getScoreBadgeClass(tracking.classification)}`}>
          <span>Score financiero</span>
          <strong>{formatScore(tracking.score, "Sin score")}</strong>
          <small>Clasificación final: {tracking.classification || "Sin clasificación"}</small>
        </div>

        <div className="recommendation-hero-explanations">
          <div className="recommendation-summary">
            <span className="tracking-overview__label">Estado del plan</span>
            <p>{tracking.message}</p>
            {adjustment ? (
              <div className="score-adjustment-note">
                <strong>{adjustment.message}</strong>
                {adjustment.detail ? <p>{adjustment.detail}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {/* Gap Simulator UI - Cuadros Ajustables */}
      {indicators && (
        <div className="tracking-indicators">
          {/* Tarjeta 1: Capacidad de Dividendo */}
          <div className="tracking-indicator-card"
            style={{
              padding: "1.25rem",
              backgroundColor: "#fff",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ fontSize: "1rem", color: "var(--color-neutral-600)", margin: 0 }}>
                Capacidad de Dividendo <FieldTooltip text="Es el dividendo mensual referencial que tu renta y deudas actuales permitirían asumir. La banca define este límite en su evaluación formal." />
              </h3>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Dividendo requerido:</span>
              <strong style={{ fontSize: "1.05rem" }}>{formatCurrency(dividendo_estimado)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px dashed var(--border-light)",
                paddingTop: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Viable hoy (RCI):</span>
              <strong
                style={{
                  fontSize: "1.05rem",
                  color: dividendo_viable >= dividendo_estimado ? "var(--color-success)" : "var(--color-danger)",
                }}
              >
                {formatCurrency(dividendo_viable)}
              </strong>
            </div>

            <p className="tracking-indicator-note">Basado en el tope bancario referencial del 25% de renta líquida.</p>
          </div>

          {/* Tarjeta 2: Meta de Pie */}
          <div className="tracking-indicator-card"
            style={{
              padding: "1.25rem",
              backgroundColor: "#fff",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <h3 style={{ fontSize: "1rem", color: "var(--color-neutral-600)", margin: 0 }}>
                Meta de Pie (10%)
              </h3>
              <div style={{ marginTop: "-0.2rem", marginRight: "-0.2rem" }}>
                <CircularProgress
                  percentage={pieProgressPercent}
                  color={pieProgressPercent >= 100 ? "var(--color-success)" : "var(--color-primary)"}
                  size={40}
                  stroke={4}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Ahorrado:</span>
              <strong style={{ fontSize: "1.05rem" }}>{formatCurrency(currentAhorro)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px dashed var(--border-light)",
                paddingTop: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Faltante:</span>
              <strong
                style={{
                  fontSize: "1.05rem",
                  color: brecha_pie_minimo === 0 ? "var(--color-success)" : "var(--color-warning)",
                }}
              >
                {formatCurrency(brecha_pie_minimo)}
              </strong>
            </div>
          </div>

          {/* Tarjeta 3.1: Morosidad */}
          {currentMorosidad > 0 && (
            <div className="tracking-indicator-card"
              style={{
                padding: "1.25rem",
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: "1px solid var(--border-light)",
                boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem", color: "var(--color-neutral-600)", margin: 0 }}>
                  Morosidad
                </h3>
                <div style={{ marginTop: "-0.2rem", marginRight: "-0.2rem" }}>
                  <CircularProgress
                    percentage={morosidadHealthPercent}
                    color={currentMorosidad === 0 ? "var(--color-success)" : "#f59e0b"}
                    size={40}
                    stroke={4}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>
                  Monto a regularizar:
                </span>
                <strong style={{ fontSize: "1.05rem", color: "var(--color-danger)" }}>
                  {formatCurrency(currentMorosidad)}
                </strong>
              </div>

              <div style={{ marginTop: "auto", fontSize: "0.8rem", color: "var(--color-neutral-600)", borderTop: "1px dotted #e2e8f0", paddingTop: "0.4rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Pago sugerido:</span>
                  <strong>{formatCurrency(currentAmortizacion)}/m</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Tiempo estimado pago:</span>
                  <strong style={{ color: "var(--color-primary)" }}>{formatMonthsToYears(currentPlanMorosidadMonths)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Tarjeta 3.2: Carga Financiera (RCI) */}
            <div className="tracking-indicator-card"
            style={{
              padding: "1.25rem",
              backgroundColor: "#fff",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <h3 style={{ fontSize: "1rem", color: "var(--color-neutral-600)", margin: 0, display: "flex", alignItems: "center", gap: "0.4rem", position: "relative" }}>
                Carga Financiera <FieldTooltip text="Monto de deuda mensual que excede el 25% de tu ingreso. Los bancos te pedirán reducirlo para darte un crédito." />
              </h3>
              <div style={{ marginTop: "-0.2rem", marginRight: "-0.2rem" }}>
                <CircularProgress
                  percentage={rciHealthPercent}
                  color={excedenteDeuda === 0 ? "var(--color-success)" : "#f59e0b"}
                  size={40}
                  stroke={4}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>
                Deuda mensual (RCI):
              </span>
              <strong style={{ fontSize: "1.05rem", color: "var(--color-neutral-900)" }}>
                {formatCurrency(currentDeudaMensual)}
              </strong>
            </div>

            {excedenteDeuda > 0 ? (
            <div className="tracking-indicator-card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px dashed var(--border-light)",
                  paddingTop: "0.5rem",
                  marginTop: "0.25rem",
                  marginBottom: "0.75rem",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Exceso sobre 25%:</span>
                <strong style={{ fontSize: "1.05rem", color: "var(--color-danger)" }}>
                  {formatCurrency(excedenteDeuda)}
                </strong>
              </div>
            ) : (
              <div style={{ marginTop: "auto", color: "var(--color-success)", fontSize: "0.8rem", fontWeight: "600", textAlign: "center", paddingTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <span>✓ Nivel de deuda compatible.</span>
                {currentMorosidad === 0 && <span>✓ Sin morosidad activa.</span>}
              </div>
            )}
          </div>

          {/* Tarjeta 4: Ahorro Pie */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "#fff",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3 style={{ fontSize: "1rem", color: "var(--color-neutral-600)", margin: "0 0 1rem 0" }}>Ahorro Pie</h3>

            {brecha_pie_minimo === 0 && totalSaneamientoRequerido === 0 ? (
              <div style={{ color: "var(--color-success)", fontSize: "0.85rem", padding: "0.5rem", backgroundColor: "#f0fdf4", borderRadius: "6px", textAlign: "center" }}>
                <strong>¡Objetivo listo para postular!</strong> Cumples con el pie y ratios bancarios.
              </div>
            ) : currentPlanMonths >= 999 ? (
              <div style={{ color: "var(--color-danger)", fontSize: "0.85rem", lineHeight: "1.3" }}>
                <strong>Plan no viable temporalmente.</strong> Tu capacidad de ahorro proyectada es insuficiente. Prioriza reducir deudas o complementar renta.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Ahorro sugerido:</span>
                  <strong style={{ fontSize: "1.05rem" }}>
                    {brecha_pie_minimo === 0 ? "Lograda" : `${formatCurrency(currentPlanAhorro)}/m`}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px dashed var(--border-light)",
                    paddingTop: "0.5rem",
                    marginTop: "0.25rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Tiempo mínimo pie:</span>
                  <strong style={{ fontSize: "1.05rem", color: "var(--color-primary)" }}>
                    {formatMonthsToYears(currentPlanMonths)}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px dashed var(--border-light)",
                    paddingTop: "0.5rem",
                    marginTop: "0.25rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "var(--color-neutral-700)" }}>Meta Proyectada:</span>
                  <strong style={{ fontSize: "0.95rem", color: "var(--color-neutral-900)" }}>
                    {formatMonthsToYears(effectiveDesiredMonths)}
                  </strong>
                </div>



                {/* Viabilidad Exitosa si está en tiempo */}
                {currentPlanMonths <= 12 && currentPlanMonths <= effectiveDesiredMonths && (
                  <div
                    style={{
                      color: "#166534",
                      fontSize: "0.8rem",
                      lineHeight: "1.25",
                      padding: "0.4rem 0.6rem",
                      backgroundColor: "#dcfce7",
                      borderRadius: "6px",
                      marginTop: "auto",
                      textAlign: "center"
                    }}
                  >
                    <strong>¡Viable a tiempo!</strong> Ahorrando lo sugerido alcanzarás la meta.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Seccion de Acciones de Habilitacion */}
      <div className="improvement-plan-section tracking-improvement-plan">
        <h2><i className="ti ti-road"></i> Pasos sugeridos para mejorar</h2>
        <p>Priorizadas para mejorar tu aprobación bancaria. Actualiza tus avances para recalcular tu score.</p>

      {tracking.warning && <div className="warning-note"><i className="ti ti-alert-triangle"></i>{tracking.warning}</div>}

      {shouldShowHousingPlan && (
        <div className="housing-plan-block" style={{ padding: "1.5rem", border: "1px solid var(--border-light)", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <span className="eyebrow">Plan de ahorro vivienda</span>
            <h2 className="recommendation-section-title" style={{ margin: 0 }}><i className="ti ti-home-heart"></i> Detalle de PIE y Dividendos</h2>
            <p style={{ margin: "0.5rem 0 0 0", color: "var(--color-neutral-600)", fontSize: "0.9rem" }}>Calcula tu capacidad de ahorro, brechas y plazos específicos para tu meta inmobiliaria.</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onOpenHousingPlan?.("minimo")}
          >
            Ir al plan detallado
          </button>
        </div>
      )}




      {/* Barra de Filtros -- el registro de avance vive en cada meta */}
      <div className="tracking-goals-toolbar">
        <div className="tracking-goals-filters">
          <span className="tracking-goals-filters__label">Filtrar acciones</span>
          <div className="tracking-goals-filter">
            <label htmlFor="goal-priority">Prioridad</label>
            <select
              id="goal-priority"
              name="goal-priority"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              {priorities.map((pri) => (
                <option key={pri} value={pri}>
                  {pri}
                </option>
              ))}
            </select>
          </div>

          <div className="tracking-goals-filter">
            <label htmlFor="goal-category">Tema</label>
            <select
              id="goal-category"
              name="goal-category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              {categories.map((cat) => {
                const label = cat === 'Saneamiento' ? 'Morosidad' : cat;
                return (
                  <option key={cat} value={cat}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {(filterPriority !== "Todos" || filterCategory !== "Todos") && (
            <button
              type="button"
              onClick={() => {
                setFilterPriority("Todos");
                setFilterCategory("Todos");
              }}
              className="tracking-goals-clear"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {filteredGoals.length === 0 ? (
        <div className="empty-state">
          <strong>No hay acciones que coincidan con los filtros seleccionados.</strong>
          <p>Prueba cambiando o limpiando los filtros de prioridad o tema.</p>
        </div>
      ) : null}

      <GoalsCarousel>
        {filteredGoals.map((goal) => {
          const impact = goal.impact_level || "Medio";
          const impactClass = impact === "Alto" ? "alto" : impact === "Medio" ? "medio" : "bajo";
          const displayCat = goal.category === "Saneamiento" ? "Morosidad" : goal.category;

          return (
            <article
              className={`plan-card plan-card--${impactClass} tracking-plan-card`}
              key={goal.id}
            >
              <div className="plan-card-header">
                <strong>{displayCat || "Acción"}</strong>
                <span className={`impact-badge impact-badge--${impactClass}`}>Impacto: {impact}</span>
              </div>
              <h3>{goal.title}</h3>
              {goal.description && <p className="plan-card-desc">{goal.description}</p>}
              {goal.expected_benefit && <div className="plan-card-benefit"><strong>Beneficio esperado:</strong> {goal.expected_benefit}</div>}
              <div className="goal-actions">
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => onOpenMilestoneRegistration?.(goal)}
                >
                  Registrar Avance
                </button>
              </div>
            </article>
          );
        })}
      </GoalsCarousel>

       {tracking.ufNote && (
         <div style={{ marginTop: "1.5rem", padding: "1rem", borderTop: "1px solid var(--border-light)" }}>
           <p className="field-help" style={{ margin: 0 }}>
             {tracking.ufNote}
           </p>
         </div>
       )}
      </div>

      <section className="tracking-checklist-section" aria-label="Checklist bancario">
        <BankingChecklist evaluation={evaluation} onNavigate={onNavigate} />
      </section>
    </section>
  );
}
