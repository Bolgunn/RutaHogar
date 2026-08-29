import React, { useEffect, useState } from "react";
import { submitFeedback } from "../services/feedbackService";

export const landingStyles = `
.sl * { box-sizing: border-box; margin: 0; padding: 0; }

.sl {
  --sl-navy:  var(--rh-blue);
  --sl-navy2: var(--rh-blue-dark);
  --sl-accent: var(--rh-yellow);
  --sl-blue-light: var(--rh-blue-light);
  --sl-yellow-light: var(--rh-yellow-light);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: var(--rh-background);
  color: var(--rh-text);
}

/* ── Nav ── */
.sl-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: .5rem 2rem;
  background: var(--rh-white);
  border-bottom: 1px solid var(--rh-border);
  position: sticky;
  top: 0;
  z-index: 20;
}
.sl-logo-img { width: 190px; height: 96px; object-fit: contain; object-position: left center; display: block; }
.sl-nav-cta {
  background: var(--rh-blue); color: var(--rh-white);
  padding: 9px 20px; border-radius: 8px;
  font-size: 14px; font-weight: 600; border: none; cursor: pointer; min-height: unset;
  transition: background .15s;
  font-family: inherit;
}
.sl-nav-cta:hover { background: var(--rh-blue-dark); }
.sl-nav-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.sl-nav-secondary,
.sl-nav-link {
  padding: 9px 14px; border-radius: 8px; min-height: unset; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 600;
}
.sl-nav-secondary { background: var(--rh-white); color: var(--rh-blue); border: 1px solid var(--rh-blue); }
.sl-nav-secondary:hover { background: var(--rh-blue-light); }
.sl-nav-link { background: transparent; color: #4a5568; border: none; }
.sl-nav-link:hover { background: var(--rh-blue-light); color: var(--rh-blue); }

/* ── Hero ── */
.sl-hero {
  background: linear-gradient(180deg, var(--rh-white), var(--rh-blue-light));
  padding: 4.5rem 2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.sl-hero::before {
  content: '';
  position: absolute; top: -60px; right: -80px;
  width: 300px; height: 300px; border-radius: 50%;
  background: rgba(255,183,0,.18);
}
.sl-hero::after {
  content: '';
  position: absolute; bottom: -80px; left: -60px;
  width: 240px; height: 240px; border-radius: 50%;
  background: rgba(0,50,185,.08);
}
.sl-hero-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }
.sl-hero-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--rh-yellow-light); color: var(--rh-blue);
  font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
  padding: 5px 14px; border-radius: 999px; margin-bottom: 1.5rem;
  border: 1px solid rgba(255,183,0,.45);
}
.sl-hero h1 {
  font-size: 40px; font-weight: 800; line-height: 1.15;
  color: var(--rh-text); margin-bottom: 1rem; letter-spacing: -1px;
}
.sl-hero h1 span { color: var(--rh-blue); }
.sl-hero-sub {
  font-size: 17px; color: var(--rh-text-secondary); line-height: 1.7;
  margin-bottom: 2.5rem; max-width: 480px; margin-left: auto; margin-right: auto;
}
.sl-hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 1.5rem; }
.sl-btn-primary {
  background: var(--rh-blue); color: var(--rh-white);
  padding: 14px 28px; border-radius: 8px;
  font-size: 15px; font-weight: 700; border: none; cursor: pointer; min-height: unset;
  transition: background .15s; text-decoration: none;
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit;
}
.sl-btn-primary:hover { background: var(--rh-blue-dark); }
.sl-btn-ghost {
  background: var(--rh-white); color: var(--rh-blue);
  padding: 14px 28px; border-radius: 8px;
  font-size: 15px; font-weight: 600;
  border: 1px solid var(--rh-blue); cursor: pointer; min-height: unset;
  transition: all .15s; text-decoration: none;
  font-family: inherit;
}
.sl-btn-ghost:hover { background: var(--rh-blue-light); }
.sl-hero-trust {
  font-size: 13px; color: var(--rh-text-secondary);
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.sl-hero-trust svg { color: var(--rh-yellow); }

/* ── Stats ── */
.sl-stats { background: var(--rh-white); padding: 1.5rem 2rem; border-top: 1px solid var(--rh-border); border-bottom: 1px solid var(--rh-border); }
.sl-stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr));
  gap: 1px; max-width: 640px; margin: 0 auto;
}
.sl-stat      { text-align: center; padding: .75rem 1rem; }
.sl-stat-num  { font-size: 26px; font-weight: 800; color: var(--rh-blue); line-height: 1; }
.sl-stat-label{ font-size: 12px; color: var(--rh-text-secondary); margin-top: 3px; font-weight: 500; }

/* ── Score preview / Para quién es ── */
.sl-score-section { background: var(--rh-background); padding: 3.5rem 2rem; }
.sl-score-inner {
  max-width: 760px; margin: 0 auto;
  display: grid; grid-template-columns: 1fr 1fr; gap: 2.5rem; align-items: center;
}
.sl-section-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase; color: var(--rh-blue); margin-bottom: .5rem;
}
.sl-score-copy h2 { font-size: 26px; font-weight: 800; color: var(--rh-text); line-height: 1.2; margin-bottom: .75rem; }
.sl-score-copy p  { font-size: 14px; color: #4a5568; line-height: 1.7; margin-bottom: 1.25rem; }
.sl-score-list { list-style: none; margin: 0 0 1.5rem; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.sl-score-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: #2d3748; line-height: 1.5; }
.sl-score-list svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; color: var(--rh-blue); }
.sl-score-card {
  background: var(--rh-white); border-radius: 16px;
  padding: 1.5rem; border: 1px solid var(--rh-border);
  box-shadow: var(--rh-shadow);
}
.sl-score-preview-label {
  font-size: 11px; color: #a0aec0; text-transform: uppercase;
  letter-spacing: .06em; margin-bottom: .75rem; font-weight: 600;
}
.sl-score-top { display: flex; align-items: center; gap: 14px; margin-bottom: 1rem; }
.sl-score-ring {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--rh-blue); display: flex; flex-direction: column;
  align-items: center; justify-content: center; flex-shrink: 0;
}
.sl-score-ring-num { font-size: 22px; font-weight: 800; color: #fff; line-height: 1; }
.sl-score-ring-den { font-size: 11px; color: rgba(255,255,255,.5); }
.sl-score-badge-alto {
  background: rgba(22,163,74,.12); color: var(--rh-success);
  font-size: 12px; font-weight: 700;
  padding: 3px 10px; border-radius: 999px;
  display: inline-block; margin-bottom: 5px;
}
.sl-score-msg  { font-size: 13px; color: #4a5568; line-height: 1.5; }
.sl-score-bar-wrap { margin-top: .75rem; }
.sl-score-bar-track {
  height: 8px; border-radius: 999px;
  background: var(--rh-blue-light); overflow: hidden; position: relative;
}
.sl-score-bar-fill {
  position: absolute; left: 0; top: 0; height: 100%;
  background: var(--rh-blue); border-radius: 999px;
}
.sl-score-bar-labels {
  display: flex; justify-content: space-between;
  font-size: 11px; color: #a0aec0; margin-top: 4px;
}
.sl-score-factors { display: flex; flex-direction: column; gap: 7px; margin-top: 1rem; }
.sl-factor        { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.sl-factor-dot    { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sl-factor-dot.ok   { background: var(--rh-success); }
.sl-factor-dot.warn { background: var(--rh-warning); }
.sl-factor-label  { color: #4a5568; }

/* ── Steps ── */
.sl-steps-section { padding: 3.5rem 2rem; background: #fff; }
.sl-steps-inner   { max-width: 760px; margin: 0 auto; }
.sl-section-title { font-size: 28px; font-weight: 800; color: var(--rh-text); margin-bottom: .5rem; }
.sl-section-sub   { font-size: 15px; color: #718096; line-height: 1.7; margin-bottom: 2rem; }
.sl-steps-grid    { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 12px; }
.sl-step-card {
  background: #F7FAFC; border-radius: 12px;
  padding: 1.25rem; border: 1px solid #e2e8f0;
}
.sl-step-num {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--rh-blue); color: var(--rh-white);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; margin-bottom: .75rem;
}
.sl-step-title { font-size: 14px; font-weight: 700; color: var(--rh-text); margin-bottom: 4px; }
.sl-step-desc  { font-size: 13px; color: #718096; line-height: 1.55; }
.sl-step-time  { font-size: 11px; color: var(--rh-blue); font-weight: 600; margin-top: 6px; }

/* ── Benefits (Por qué) ── */
.sl-benefits-section { background: var(--rh-blue-light); padding: 3.5rem 2rem; }
.sl-benefits-inner   { max-width: 760px; margin: 0 auto; }
.sl-benefits-title   { font-size: 28px; font-weight: 800; color: var(--rh-text); margin-bottom: .5rem; }
.sl-benefits-sub     { font-size: 15px; color: var(--rh-text-secondary); line-height: 1.7; margin-bottom: 2rem; }
.sl-benefits-grid    { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 12px; }
.sl-benefit {
  background: var(--rh-white);
  border: 1px solid var(--rh-border);
  border-radius: 12px; padding: 1.25rem;
  transition: transform .2s, background .2s;
}
.sl-benefit:hover { transform: translateY(-3px); background: var(--rh-white); border-color: rgba(0,50,185,.24); }
.sl-benefit-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--rh-yellow-light);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: .75rem; color: var(--rh-blue);
}
.sl-benefit-icon svg { width: 20px; height: 20px; }
.sl-benefit-title { font-size: 14px; font-weight: 700; color: var(--rh-text); margin-bottom: 4px; }
.sl-benefit-desc  { font-size: 13px; color: var(--rh-text-secondary); line-height: 1.55; }

/* ── FAQ ── */
.sl-faq-section { background: var(--rh-background); padding: 3.5rem 2rem; }
.sl-faq-inner   { max-width: 680px; margin: 0 auto; }
.sl-faq-list    { display: flex; flex-direction: column; margin-top: 1.5rem; }
.sl-faq-item    { border-bottom: 1px solid #e2e8f0; }
.sl-faq-item:first-child { border-top: 1px solid #e2e8f0; }
.sl-faq-q-btn {
  width: 100%; background: none; border: none; padding: 1rem 0; min-height: unset;
  cursor: pointer; text-align: left; font-family: inherit;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-size: 14px; font-weight: 700; color: var(--rh-text);
  transition: color .15s;
}
.sl-faq-q-btn:hover { background: none; color: var(--rh-blue); }
.sl-faq-chevron {
  width: 16px; height: 16px; flex-shrink: 0; color: var(--rh-blue);
  transition: transform .25s ease;
}
.sl-faq-chevron.open { transform: rotate(180deg); }
.sl-faq-a { font-size: 14px; color: #718096; line-height: 1.65; padding: 0 0 1rem; }

/* ── Feedback ── */
.sl-feedback-section { background: var(--rh-white); padding: 3.5rem 2rem; }
.sl-feedback-inner {
  max-width: 920px; margin: 0 auto;
  display: grid; grid-template-columns: minmax(220px, .85fr) minmax(0, 1.35fr);
  gap: 1.75rem; align-items: start;
}
.sl-feedback-copy p { font-size: 14px; color: #4a5568; line-height: 1.7; margin-top: .75rem; }
.sl-feedback-points { list-style: none; padding: 0; margin: 1.25rem 0 0; display: grid; gap: 9px; }
.sl-feedback-points li { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #4a5568; margin: 0; }
.sl-feedback-points span {
  width: 18px; height: 18px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--rh-yellow-light); color: var(--rh-blue); font-size: 12px; font-weight: 800;
  flex-shrink: 0;
}
.sl-feedback-form {
  background: var(--rh-background); border: 1px solid var(--rh-border); border-radius: 12px;
  padding: 1.15rem; display: grid; gap: 10px;
}
.sl-feedback-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.sl-feedback-form label { display: grid; gap: 6px; font-size: 12px; font-weight: 700; color: var(--rh-text); }
.sl-feedback-form input,
.sl-feedback-form select,
.sl-feedback-form textarea {
  width: 100%; min-height: 42px; margin: 0; padding: 10px 11px;
  border: 1px solid var(--rh-border); border-radius: 8px; background: var(--rh-white);
  color: var(--rh-text); font: inherit; font-size: 14px; resize: vertical;
}
.sl-feedback-form textarea { min-height: 62px; line-height: 1.45; }
.sl-feedback-form input:focus,
.sl-feedback-form select:focus,
.sl-feedback-form textarea:focus {
  border-color: var(--rh-blue); outline: 3px solid rgba(0,50,185,.14);
}
.sl-feedback-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 2px; }
.sl-feedback-status { font-size: 13px; color: #4a5568; line-height: 1.5; }
.sl-feedback-status.ok { color: var(--rh-success); }
.sl-feedback-status.error { color: var(--rh-danger); }

/* ── Final CTA ── */
.sl-cta-section { background: var(--rh-blue); padding: 4.5rem 2rem; text-align: center; }
.sl-cta-inner   { max-width: 520px; margin: 0 auto; }
.sl-cta-section h2 { font-size: 30px; font-weight: 800; color: #fff; margin-bottom: .75rem; line-height: 1.2; }
.sl-cta-section p  { font-size: 16px; color: rgba(255,255,255,.85); margin-bottom: 2rem; line-height: 1.6; }
.sl-btn-white {
  background: var(--rh-yellow); color: var(--rh-text);
  padding: 14px 32px; border-radius: 8px;
  font-size: 15px; font-weight: 700; border: none; cursor: pointer; min-height: unset;
  transition: background .15s;
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit;
}
.sl-btn-white:hover { background: var(--rh-yellow-dark); }

/* ── Respaldo EI ── */
.sl-ei-section { background: var(--rh-blue-dark); padding: 3.5rem 2rem; text-align: center; }
.sl-ei-label { font-size: 12px; color: rgba(255,255,255,.45); text-transform: uppercase; letter-spacing: .12em; margin-bottom: 1.75rem; }
.sl-ei-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem; max-width: 760px; margin: 0 auto;
}
.sl-ei-item {
  padding: 1.25rem 1rem; border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
  background: rgba(255,255,255,.03); transition: background .2s, border-color .2s;
}
.sl-ei-item:hover { background: rgba(255,255,255,.06); border-color: rgba(255,183,0,.42); }
.sl-ei-name  { font-size: clamp(18px, 2.4vw, 24px); font-weight: 800; color: #fff; letter-spacing: -.5px; line-height: 1.15; margin-bottom: 4px; }
.sl-ei-type  { font-size: 12px; color: rgba(255,255,255,.45); letter-spacing: .1em; text-transform: uppercase; }

/* ── Footer ── */
.sl-footer {
  background: var(--rh-blue-dark); padding: 1.5rem 2rem;
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 12px;
  border-top: 1px solid rgba(255,255,255,.06);
}
.sl-footer-note { font-size: 12px; color: rgba(255,255,255,.4); line-height: 1.5; max-width: 70%; }
.sl-footer-link {
  font-size: 13px; color: rgba(255,255,255,.6); background: none; border: none;
  min-height: unset; padding: 0; cursor: pointer; font-family: inherit; font-weight: 500;
  text-decoration: underline; text-underline-offset: 3px; transition: color .15s;
}
.sl-footer-link:hover { background: none; color: #fff; }

@media (max-width: 560px) {
  .sl-hero h1        { font-size: 28px; }
  .sl-score-inner    { grid-template-columns: 1fr; }
  .sl-nav            { padding: .875rem 1.25rem; }
  .sl-logo-img       { width: 155px; height: 78px; }
  .sl-nav-actions    { gap: 4px; }
  .sl-nav-secondary,
  .sl-nav-link       { padding: 8px 10px; }
  .sl-hero           { padding: 3rem 1.25rem; }
  .sl-steps-section,
  .sl-benefits-section,
  .sl-faq-section,
  .sl-feedback-section,
  .sl-cta-section,
  .sl-ei-section,
  .sl-score-section  { padding: 2.5rem 1.25rem; }
  .sl-feedback-inner  { grid-template-columns: 1fr; }
  .sl-feedback-row    { grid-template-columns: 1fr; }
  .sl-footer         { flex-direction: column; align-items: flex-start; }
  .sl-footer-note    { max-width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .sl-benefit, .sl-faq-chevron, .sl-faq-q-btn { transition: none; }
  .sl-benefit:hover { transform: none; }
}
`;

const faqs = [
  {
    q: "¿Qué es un score de precalificación?",
    a: "Es una evaluación orientativa que estima qué tan preparado estás financieramente para solicitar un crédito hipotecario, en base a tus ingresos, deudas, ahorro y situación laboral.",
  },
  {
    q: "¿Guardan mis datos?",
    a: "No. Si no creas una cuenta, tus datos se usan únicamente para calcular tu score en ese momento y no se almacenan permanentemente.",
  },
  {
    q: "¿Reemplaza una evaluación bancaria?",
    a: "No. Es una herramienta orientativa de precalificación temprana. El resultado no equivale a una aprobación bancaria formal.",
  },
  {
    q: "¿Necesito documentos?",
    a: "No. Solo necesitas datos que ya conoces de memoria: tu ingreso aproximado, tus deudas, tu ahorro disponible y tu situación laboral.",
  },
  {
    q: "¿Es gratis?",
    a: "Sí. La pre-evaluación es completamente gratuita y toma solo unos minutos.",
  },
];

const testerTypes = ["Usuario", "Ejecutivo", "Banco", "Inmobiliaria", "Otro"];

const initialFeedback = {
  name: "",
  email: "",
  phone: "",
  tester_type: "Usuario",
  first_impression: "",
  confusing_part: "",
  improvement_suggestion: "",
  clarity_rating: "5",
};

const testerTypeByRole = {
  usuario: "Usuario",
  ejecutivo: "Ejecutivo",
  admin: "Otro",
};

function buildInitialFeedback(profile) {
  return {
    ...initialFeedback,
    name: profile?.full_name || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
    tester_type: profile ? testerTypeByRole[profile.role] || "Otro" : initialFeedback.tester_type,
  };
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sl-faq-item">
      <button type="button" className="sl-faq-q-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {question}
        <svg className={`sl-faq-chevron${open ? " open" : ""}`} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <polyline points="4 7 10 13 16 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <p className="sl-faq-a">{answer}</p>}
    </div>
  );
}

function FeedbackSection({ profile }) {
  const [form, setForm] = useState(() => buildInitialFeedback(profile));
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setForm(buildInitialFeedback(profile));
    setStatus(null);
  }, [profile?.id, profile?.full_name, profile?.email, profile?.phone, profile?.role]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const hasComment =
      form.first_impression.trim() ||
      form.confusing_part.trim() ||
      form.improvement_suggestion.trim();

    if (!hasComment) {
      setStatus({
        type: "error",
        message: "Cuéntanos al menos una impresión, dificultad o sugerencia.",
      });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      await submitFeedback(form);
      setForm(buildInitialFeedback(profile));
      setStatus({
        type: "ok",
        message: "Gracias, recibimos tu feedback.",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: "No pudimos registrar el feedback. Intenta nuevamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="sl-feedback-section">
      <div className="sl-feedback-inner">
        <div className="sl-feedback-copy">
          <div className="sl-section-eyebrow">Feedback de testers</div>
          <h2 className="sl-section-title">Ayúdanos a afinar RutaHogar</h2>
          <p>
            Tus comentarios nos ayudan a detectar si la propuesta se entiende,
            qué parte del flujo genera dudas y qué deberíamos mejorar antes de
            una versión final.
          </p>
          <ul className="sl-feedback-points">
            <li><span>1</span> Claridad de la propuesta</li>
            <li><span>2</span> Fricciones del primer recorrido</li>
            <li><span>3</span> Mejoras para usuarios y equipos comerciales</li>
          </ul>
        </div>

        <form className="sl-feedback-form" onSubmit={handleSubmit}>
          <div className="sl-feedback-row">
            <label>
              Nombre opcional
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                placeholder="No informado"
              />
            </label>
            <label>
              Correo opcional
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                placeholder="No informado"
              />
            </label>
          </div>

          <div className="sl-feedback-row">
            <label>
              Teléfono opcional
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
                placeholder="No informado"
              />
            </label>
            <label>
              Perfil del tester
              <select name="tester_type" value={form.tester_type} onChange={handleChange}>
                {testerTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Nota de claridad
            <select name="clarity_rating" value={form.clarity_rating} onChange={handleChange}>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>{rating}</option>
              ))}
            </select>
          </label>

          <label>
            Primera impresión: ¿qué entendiste que hace RutaHogar?
            <textarea
              name="first_impression"
              value={form.first_impression}
              onChange={handleChange}
            />
          </label>

          <label>
            Parte confusa o difícil
            <textarea
              name="confusing_part"
              value={form.confusing_part}
              onChange={handleChange}
            />
          </label>

          <label>
            Sugerencia de mejora
            <textarea
              name="improvement_suggestion"
              value={form.improvement_suggestion}
              onChange={handleChange}
            />
          </label>

          <div className="sl-feedback-actions">
            <button type="submit" className="sl-btn-primary" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar feedback"}
            </button>
            {status && (
              <span className={`sl-feedback-status ${status.type}`}>
                {status.message}
              </span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

export default function LandingPage({
  profile,
  onStart,
  onLogin,
  onRegister,
  onDashboard,
  onProfile,
  onLogout,
}) {
  const isLoggedIn = Boolean(profile);
  const primaryActionLabel = !isLoggedIn
    ? "Evalúa tu perfil gratis"
    : profile.role === "usuario"
      ? "Continuar con mi perfil"
      : "Ir al dashboard";

  return (
    <>
      <style>{landingStyles}</style>
      <div className="sl">

        {/* Nav */}
        <nav className="sl-nav">
          <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" className="sl-logo-img" />
          <div className="sl-nav-actions">
            {isLoggedIn ? (
              <>
                {onProfile && (
                  <button type="button" className="sl-nav-secondary" onClick={onProfile}>Perfil</button>
                )}
                <button type="button" className="sl-nav-link" onClick={onLogout}>Cerrar sesión</button>
              </>
            ) : (
              <>
                <button type="button" className="sl-nav-secondary" onClick={onRegister}>Registrarse</button>
                <button type="button" className="sl-nav-cta" onClick={onLogin}>Iniciar sesión</button>
              </>
            )}
          </div>
        </nav>

        {/* 1. Hero */}
        <section className="sl-hero">
          <div className="sl-hero-inner">
            <span className="sl-hero-pill">Precalificación inmobiliaria</span>
            <h1>
              Descubre si estás listo para <span>comprar tu primera vivienda</span>
            </h1>
            <p className="sl-hero-sub">
              Responde unas preguntas y obtén tu score financiero en segundos.
              Sin documentos, sin claves bancarias.
            </p>
            <div className="sl-hero-btns">
              <button type="button" className="sl-btn-primary" onClick={onStart}>
                {primaryActionLabel}
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="sl-btn-ghost" onClick={isLoggedIn ? onDashboard : onLogin}>
                {isLoggedIn ? "Ir al dashboard" : "Ya tengo cuenta"}
              </button>
            </div>
            <div className="sl-hero-trust">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 2l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              Orientativo · No consultamos
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="sl-stats">
          <div className="sl-stats-grid">
            <div className="sl-stat">
              <div className="sl-stat-num">En Segundos</div>
              <div className="sl-stat-label">Tenemos tu resultado</div>
            </div>
            <div className="sl-stat">
              <div className="sl-stat-num">0</div>
              <div className="sl-stat-label">Documentos requeridos</div>
            </div>
            <div className="sl-stat">
              <div className="sl-stat-num">0–100</div>
              <div className="sl-stat-label">Score orientativo</div>
            </div>
            <div className="sl-stat">
              <div className="sl-stat-num">Gratis</div>
              <div className="sl-stat-label">Sin costo, siempre</div>
            </div>
          </div>
        </section>

        {/* 2. Para quién es + score preview */}
        <section className="sl-score-section">
          <div className="sl-score-inner">
            <div className="sl-score-copy">
              <div className="sl-section-eyebrow">Para quién es</div>
              <h2>Diseñado para el comprador de primera vivienda</h2>
              <p>
                Si estás dando los primeros pasos hacia tu hogar, RutaHogar te ayuda a
                entender tu posición financiera antes de hablar con el banco.
              </p>
              <ul className="sl-score-list">
                {[
                  "Quieres saber si puedes comprar ahora",
                  "Estás ahorrando para el pie de tu primera propiedad",
                  "Quieres entender tu situación antes de ir al banco",
                ].map((text) => (
                  <li key={text}>
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <polyline points="4 10 8 14 16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="sl-score-card">
              <div className="sl-score-preview-label">Tu score orientativo</div>
              <div className="sl-score-top">
                <div className="sl-score-ring">
                  <span className="sl-score-ring-num">74</span>
                  <span className="sl-score-ring-den">/100</span>
                </div>
                <div>
                  <span className="sl-score-badge-alto">Alto</span>
                  <p className="sl-score-msg">Tu perfil está bien posicionado para iniciar el proceso de compra.</p>
                </div>
              </div>
              <div className="sl-score-bar-wrap">
                <div className="sl-score-bar-track">
                  <span className="sl-score-bar-fill" style={{ width: "74%" }} />
                </div>
                <div className="sl-score-bar-labels">
                  <span>Bajo</span>
                  <span>Medio</span>
                  <span>Alto</span>
                </div>
              </div>
              <div className="sl-score-factors">
                <div className="sl-factor">
                  <span className="sl-factor-dot ok" />
                  <span className="sl-factor-label">Relación ingreso / dividendo saludable</span>
                </div>
                <div className="sl-factor">
                  <span className="sl-factor-dot ok" />
                  <span className="sl-factor-label">Ahorro suficiente para el pie</span>
                </div>
                <div className="sl-factor">
                  <span className="sl-factor-dot warn" />
                  <span className="sl-factor-label">Continuidad laboral por consolidar</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Cómo funciona */}
        <section className="sl-steps-section">
          <div className="sl-steps-inner">
            <div className="sl-section-eyebrow">Cómo funciona</div>
            <h2 className="sl-section-title">Tres pasos, resultado inmediato</h2>
            <p className="sl-section-sub">Sin trámites ni esperas. Completa el flujo en pocos minutos.</p>
            <div className="sl-steps-grid">
              <div className="sl-step-card">
                <div className="sl-step-num">1</div>
                <h3 className="sl-step-title">Cuéntanos tu objetivo</h3>
                <p className="sl-step-desc">Qué tipo de propiedad buscas, en qué comuna y en qué plazo planeas comprar.</p>
              </div>
              <div className="sl-step-card">
                <div className="sl-step-num">2</div>
                <h3 className="sl-step-title">Ingresa tus datos financieros</h3>
                <p className="sl-step-desc">Ingresos, deudas, ahorro y situación laboral. Datos aproximados, sin documentos.</p>
              </div>
              <div className="sl-step-card">
                <div className="sl-step-num">3</div>
                <h3 className="sl-step-title">Recibe tu score</h3>
                <p className="sl-step-desc">Score de 0 a 100, clasificación y recomendaciones personalizadas.</p>
                <div className="sl-step-time">~30 segundos</div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Por qué RutaHogar */}
        <section className="sl-benefits-section">
          <div className="sl-benefits-inner">
            <div className="sl-section-eyebrow">Ventajas</div>
            <h2 className="sl-benefits-title">¿Por qué usar RutaHogar?</h2>
            <p className="sl-benefits-sub">Una forma simple y transparente de conocer tu posición financiera.</p>
            <div className="sl-benefits-grid">
              <div className="sl-benefit">
                <div className="sl-benefit-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                    <polyline points="12 7 12 12 16 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="sl-benefit-title">Resultado en segundos</h3>
                <p className="sl-benefit-desc">Sin esperas, sin trámites, sin turnos. Tu score cuando lo necesitas.</p>
              </div>
              <div className="sl-benefit">
                <div className="sl-benefit-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <polyline points="14 3 14 8 19 8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="sl-benefit-title">Sin documentos</h3>
                <p className="sl-benefit-desc">Solo datos que ya conoces de memoria. Sin liquidaciones ni claves bancarias.</p>
              </div>
              <div className="sl-benefit">
                <div className="sl-benefit-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3l7 2.5V11c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V5.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="sl-benefit-title">Orientativo, no vinculante</h3>
                <p className="sl-benefit-desc">No reemplaza una evaluación bancaria. Es una guía para entender tu posición.</p>
              </div>
              <div className="sl-benefit">
                <div className="sl-benefit-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <polyline points="9 21 9 13 15 13 15 21" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="sl-benefit-title">Respaldado por EI</h3>
                <p className="sl-benefit-desc">Desarrollado para el sector inmobiliario chileno.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. FAQs */}
        <section className="sl-faq-section">
          <div className="sl-faq-inner">
            <div className="sl-section-eyebrow">Preguntas frecuentes</div>
            <h2 className="sl-section-title">¿Tienes dudas?</h2>
            <div className="sl-faq-list">
              {faqs.map((faq) => (
                <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        </section>

        <FeedbackSection profile={profile} />

        {/* Final CTA */}
        <section className="sl-cta-section">
          <div className="sl-cta-inner">
            <h2>¿Listo para conocer tu score?</h2>
            <p>
              {isLoggedIn
                ? "Tu sesión está activa y puedes continuar con tu precalificación."
                : "Es gratis, toma unos minutos y no necesitas crear una cuenta para empezar."}
            </p>
            <button type="button" className="sl-btn-white" onClick={onStart}>
              {primaryActionLabel}
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </section>

        {/* 6. Respaldo EI */}
        <section className="sl-ei-section">
          <div className="sl-ei-label">Afiliados con</div>
          <div className="sl-ei-grid">
            {[
              { name: "Echeverría Izquierdo", type: "Inmobiliaria" },
              { name: "Yoyín", type: "Inmobiliaria" },
              { name: "Yoyín", type: "Inmobiliaria" },
              { name: "Yoyín", type: "Inmobiliaria" },
              { name: "Yoyín", type: "Inmobiliaria" },
              { name: "Yoyín", type: "Inmobiliaria" },
            ].map((affiliate, index) => (
              <div className="sl-ei-item" key={`${affiliate.name}-${index}`}>
                <div className="sl-ei-name">{affiliate.name}</div>
                <div className="sl-ei-type">{affiliate.type}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 7. Footer */}
        <footer className="sl-footer">
          <p className="sl-footer-note">
            © 2025 RutaHogar · Herramienta orientativa, no constituye evaluación crediticia formal.
          </p>
          <button type="button" className="sl-footer-link" onClick={isLoggedIn ? onDashboard : onLogin}>
            {isLoggedIn ? "Ir al dashboard" : "Iniciar sesión"}
          </button>
        </footer>

      </div>
    </>
  );
}
