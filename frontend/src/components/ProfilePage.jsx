import React, { useEffect, useMemo, useState } from "react";
import { comunasMvp } from "../constants/comunas";
import { plazoLabels, propertyLabels } from "../constants";
import { updateStoredProfile } from "../services/auth";
import { upsertProfile } from "../services/profileService";
import AiExplanationBlock from "./AiExplanationBlock";
import {
  formatScore,
  getClassificationAdjustment,
  getClassificationClass,
  shouldShowClassificationReason,
} from "../utils/helpers";
import { formatPhone, normalizePhone, onlyPhoneDigits, PHONE_ERROR_MESSAGE } from "../utils/phone";
import { normalizeDisplayText } from "../utils/text";

const objetivoLabels = {
  comprar_ahora: "Comprar ahora",
  prepararme: "Prepararme para comprar más adelante",
  evaluar_capacidad: "Evaluar mi capacidad de compra",
  conocer_propiedad: "Conocer que tipo de propiedad podría buscar",
};

const contractLabels = {
  indefinido: "Indefinido",
  independiente: "Independiente",
  plazo_fijo: "Plazo fijo",
  honorarios_variable: "Honorarios / variable",
};

const continuityLabels = {
  menos_6_meses: "Menos de 6 meses",
  entre_6_y_12_meses: "Entre 6 y 12 meses",
  entre_1_y_3_anios: "Entre 1 y 3 años",
  mas_3_anios: "Más de 3 años",
};

const morosityLabels = {
  no: "No",
  si: "Sí",
};

const relationLabels = {
  conyuge: "Cónyuge",
  pareja_conviviente: "Pareja conviviente",
  pareja_hijos_comun: "Pareja con hijos en común",
  padre_madre: "Padre/Madre",
  hijo_hija: "Hijo/a",
  hermano_hermana: "Hermano/a",
  otro_familiar: "Otro familiar",
  amigo: "Amigo/a",
  otro: "Otro",
};

const componentScoreLabels = {
  capacidad_pago: "Capacidad de pago",
  endeudamiento: "Endeudamiento",
  pie_ahorro: "Pie / ahorro",
  estabilidad_laboral: "Estabilidad laboral",
  historial_pago: "Historial de pago",
  complemento_renta: "Complemento de renta",
  calidad_datos: "Calidad de datos",
};

const normalizeOnboarding = (data) => ({
  objetivo_principal: data?.objetivo_principal || "",
  tipo_propiedad: data?.tipo_propiedad === "indiferente" || data?.tipo_propiedad === "aun_no_lo_se" ? "" : data?.tipo_propiedad || "",
  comuna_interes: data?.comuna_interes || "",
  plazo_compra: data?.plazo_compra || "",
  comuna_alternativa: data?.comuna_alternativa || "",
  tiene_propiedad_vista: data?.tiene_propiedad_vista === true,
});

const emptyValue = "No registrado";

function money(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return emptyValue;
  return `$${Math.round(numericValue).toLocaleString("es-CL")}`;
}

function percent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return emptyValue;
  return `${(numericValue * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

function numberValue(value, suffix = "") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return emptyValue;
  return `${numericValue.toLocaleString("es-CL", { maximumFractionDigits: 1 })}${suffix}`;
}

function booleanText(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return emptyValue;
}

function uf(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return emptyValue;
  return `${numericValue.toLocaleString("es-CL")} UF`;
}

function text(value, labels) {
  if (value === undefined || value === null || value === "") return emptyValue;
  return labels?.[value] || value;
}

function dividendOrigin(input = {}) {
  if (input.dividendo_estimado_origen === "manual" || input.dividendo_estimado_manual != null) {
    return "Editado manualmente";
  }
  if (input.dividendo_estimado_origen === "calculado_referencial" || input.dividendo_estimado_calculado != null) {
    return "Calculado automáticamente";
  }
  return emptyValue;
}

function formatPhoneDisplay(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  const local = digits.startsWith("56") ? digits.slice(2) : digits;
  if (local.length === 9) {
    return `+56 ${local[0]} ${local.slice(1, 5)} ${local.slice(5)}`;
  }
  return phone;
}

function hasObjectData(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function displayText(value) {
  return normalizeDisplayText(value || emptyValue);
}

function getResult(item) {
  return item?.result || {};
}

function getMainBlocker(result) {
  return hasObjectData(result?.main_blocker) ? result.main_blocker : null;
}

function getProjectFit(result) {
  return hasObjectData(result?.project_fit) ? result.project_fit : null;
}

function getCommercialPriority(result) {
  return hasObjectData(result?.commercial_priority_detail) ? result.commercial_priority_detail : null;
}

function getComponentScores(result) {
  return hasObjectData(result?.component_scores) ? result.component_scores : null;
}

function getFinancialIndicators(result) {
  return hasObjectData(result?.financial_indicators) ? result.financial_indicators : null;
}

function isAdjustedClassification(result) {
  return result?.original_classification && result.original_classification !== result.classification;
}

function ScoreAdjustmentNote({ result }) {
  const adjustment = getClassificationAdjustment(result);
  if (!adjustment) return null;

  return (
    <div className="score-adjustment-note">
      <strong>{adjustment.message}</strong>
      {adjustment.detail ? <p>{adjustment.detail}</p> : null}
    </div>
  );
}

function ProfessionalHistorySummary({ result }) {
  const mainBlocker = getMainBlocker(result);
  const projectFit = getProjectFit(result);
  const commercialPriority = getCommercialPriority(result);
  const hasProfessionalData = result?.algorithm_version || isAdjustedClassification(result) || mainBlocker || projectFit || commercialPriority;

  if (!hasProfessionalData) return null;

  return (
    <dl>
      {result?.algorithm_version ? (
        <div>
          <dt>Versión algoritmo</dt>
          <dd>{result.algorithm_version}</dd>
        </div>
      ) : null}
      {isAdjustedClassification(result) ? (
        <div>
          <dt>Clasificación ajustada</dt>
          <dd>
            Original {result.original_classification} → final {result.classification}
          </dd>
        </div>
      ) : null}
      {isAdjustedClassification(result) ? (
        <div>
          <dt>Clasificación ajustada por</dt>
          <dd>{getClassificationAdjustment(result)?.blockerName}</dd>
        </div>
      ) : null}
      {mainBlocker ? (
        <div>
          <dt>Bloqueador principal</dt>
          <dd>{displayText(mainBlocker.title || mainBlocker.code)}</dd>
        </div>
      ) : null}
      {projectFit ? (
        <div>
          <dt>Compatibilidad objetivo</dt>
          <dd>{displayText(projectFit.classification || projectFit.status)}</dd>
        </div>
      ) : null}
      {commercialPriority ? (
        <div>
          <dt>Prioridad comercial</dt>
          <dd>{displayText(commercialPriority.action || commercialPriority.level)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function ProfessionalEvaluationDetails({ result }) {
  const mainBlocker = getMainBlocker(result);
  const projectFit = getProjectFit(result);
  const commercialPriority = getCommercialPriority(result);
  const componentScores = getComponentScores(result);
  const financialIndicators = getFinancialIndicators(result);
  const hasProfessionalData =
    result?.algorithm_version ||
    isAdjustedClassification(result) ||
    mainBlocker ||
    projectFit ||
    commercialPriority ||
    componentScores ||
    financialIndicators;

  if (!hasProfessionalData) return null;

  return (
    <div className="evaluation-detail-section">
      <h4>Scoring profesional y trazabilidad</h4>
      <dl className="detail-grid">
        <div>
          <dt>Versión algoritmo</dt>
          <dd>{result?.algorithm_version || "Versión no registrada"}</dd>
        </div>
        {isAdjustedClassification(result) ? (
          <div>
            <dt>Clasificación ajustada</dt>
            <dd>
              Original {result.original_classification} → final {result.classification}
            </dd>
          </div>
        ) : null}
        {isAdjustedClassification(result) ? (
          <div>
            <dt>Ajuste por bloqueador</dt>
            <dd>{getClassificationAdjustment(result)?.blockerName}</dd>
          </div>
        ) : null}
        {shouldShowClassificationReason(result?.classification_reason, result) ? (
          <div>
            <dt>Razón clasificación</dt>
            <dd>{displayText(result.classification_reason)}</dd>
          </div>
        ) : null}
        {mainBlocker ? (
          <>
            <div>
              <dt>Bloqueador principal</dt>
              <dd>{displayText(mainBlocker.title || mainBlocker.code)}</dd>
            </div>
            <div>
              <dt>Severidad</dt>
              <dd>{displayText(mainBlocker.severity)}</dd>
            </div>
            {mainBlocker.description ? (
              <div>
                <dt>Descripción bloqueador</dt>
                <dd>{displayText(mainBlocker.description)}</dd>
              </div>
            ) : null}
          </>
        ) : null}
      </dl>

      {projectFit ? (
        <>
          <h4 className="evaluation-detail-heading">Compatibilidad con objetivo</h4>
          <dl className="detail-grid">
            <div>
              <dt>Clasificación</dt>
              <dd>{displayText(projectFit.classification || projectFit.status)}</dd>
            </div>
            <div>
              <dt>Score compatibilidad</dt>
              <dd>{numberValue(projectFit.score)}</dd>
            </div>
            <div>
              <dt>Compatible</dt>
              <dd>{booleanText(projectFit.compatible)}</dd>
            </div>
            <div>
              <dt>Brecha ingreso</dt>
              <dd>{money(projectFit.income_gap)}</dd>
            </div>
            <div>
              <dt>Brecha pie</dt>
              <dd>{money(projectFit.down_payment_gap)}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {commercialPriority ? (
        <>
          <h4 className="evaluation-detail-heading">Prioridad comercial</h4>
          <dl className="detail-grid">
            <div>
              <dt>Acción sugerida</dt>
              <dd>{displayText(commercialPriority.action || commercialPriority.level)}</dd>
            </div>
            <div>
              <dt>Derivación sugerida</dt>
              <dd>{booleanText(commercialPriority.send_to_crm)}</dd>
            </div>
            {commercialPriority.reason ? (
              <div>
                <dt>Motivo</dt>
                <dd>{displayText(commercialPriority.reason)} No implica envío automático a CRM.</dd>
              </div>
            ) : null}
          </dl>
        </>
      ) : null}

      {componentScores ? (
        <>
          <h4 className="evaluation-detail-heading">Desglose de componentes</h4>
          <dl className="detail-grid">
            {Object.entries(componentScoreLabels).map(([key, label]) =>
              componentScores[key] !== undefined ? (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{numberValue(componentScores[key])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </>
      ) : null}

      {financialIndicators ? (
        <>
          <h4 className="evaluation-detail-heading">Indicadores financieros</h4>
          <dl className="detail-grid">
            <div>
              <dt>Dividendo / ingreso</dt>
              <dd>{percent(financialIndicators.ratio_dividendo_ingreso)}</dd>
            </div>
            <div>
              <dt>Deuda / ingreso</dt>
              <dd>{percent(financialIndicators.ratio_deuda_ingreso)}</dd>
            </div>
            <div>
              <dt>Carga total</dt>
              <dd>{percent(financialIndicators.ratio_carga_total)}</dd>
            </div>
            <div>
              <dt>Brecha pie mínimo</dt>
              <dd>{money(financialIndicators.brecha_pie_minimo)}</dd>
            </div>
            <div>
              <dt>Edad fin crédito</dt>
              <dd>{financialIndicators.edad_fin_credito != null ? numberValue(financialIndicators.edad_fin_credito, " años") : emptyValue}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </div>
  );
}

export default function ProfilePage({ profile, onboarding, evaluations, onSaveOnboarding, onDeleteEvaluation, onProfileUpdate, onRetryExplanation }) {
  const savedOnboarding = useMemo(() => normalizeOnboarding(onboarding), [onboarding]);
  const canSeeTechnicalScoring = profile?.role === "ejecutivo" || profile?.role === "admin";
  const [form, setForm] = useState(savedOnboarding);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [onboardingEditing, setOnboardingEditing] = useState(false);

  // Estado para edición de contacto
  const [contactEditing, setContactEditing] = useState(false);
  const [contactForm, setContactForm] = useState({ phone: "", email: "" });
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");
  const [contactLoading, setContactLoading] = useState(false);

  const alternativeCommunes = form.comuna_interes
    ? comunasMvp.filter((comuna) => comuna !== form.comuna_interes)
    : [];
  const hasChanges = useMemo(
    () => Object.keys(savedOnboarding).some((key) => form[key] !== savedOnboarding[key]),
    [form, savedOnboarding],
  );

  const userInitials = useMemo(() => {
    const name = profile?.full_name || "";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [profile?.full_name]);

  useEffect(() => {
    setForm(savedOnboarding);
  }, [savedOnboarding]);

  useEffect(() => {
    if (!selectedEvaluation) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedEvaluation(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEvaluation]);

  useEffect(() => {
    if (!selectedEvaluation) return;
    const updatedEvaluation = evaluations.find((item) => item.id === selectedEvaluation.id);
    if (updatedEvaluation) setSelectedEvaluation(updatedEvaluation);
  }, [evaluations, selectedEvaluation?.id]);

  // Al abrir el formulario de contacto, cargar los valores actuales del perfil
  const openContactEdit = () => {
    setContactForm({
      phone: profile?.phone ? formatPhone(profile.phone).replace(/\s/g, "") : "",
      email: profile?.email || "",
    });
    setContactError("");
    setContactSuccess("");
    setContactEditing(true);
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "comuna_interes" && value === prev.comuna_alternativa) {
        next.comuna_alternativa = "";
      }
      return next;
    });
  };

  const handleContactChange = (event) => {
    const { name, value } = event.target;
    setContactForm((prev) => ({ ...prev, [name]: name === "phone" ? onlyPhoneDigits(value, 8) : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!hasChanges) return;

    const required = [
      ["objetivo_principal", "Objetivo principal"],
      ["tipo_propiedad", "Tipo de propiedad"],
      ["comuna_interes", "Comuna objetivo"],
      ["plazo_compra", "Plazo estimado"],
    ];
    const missing = required.filter(([key]) => !form[key]).map(([, label]) => label);

    if (missing.length) {
      setError(`Completa estos campos: ${missing.join(", ")}`);
      return;
    }

    if (!comunasMvp.includes(form.comuna_interes)) {
      setError("Selecciona una comuna objetivo desde la lista.");
      return;
    }

    if (form.comuna_alternativa && !comunasMvp.includes(form.comuna_alternativa)) {
      setError("Selecciona una comuna alternativa desde la lista o dejala vacía.");
      return;
    }

    if (form.comuna_alternativa && form.comuna_alternativa === form.comuna_interes) {
      setError("La comuna alternativa debe ser distinta a la comuna principal.");
      return;
    }

    try {
      await onSaveOnboarding(form);
      setSuccess("Respuestas preliminares guardadas.");
      setOnboardingEditing(false);
    } catch {
      setError("No se pudieron guardar las respuestas preliminares.");
    }
  };

  const cancelOnboardingEdit = () => {
    setForm(savedOnboarding);
    setError("");
    setSuccess("");
    setOnboardingEditing(false);
  };

  const submitContact = async (event) => {
    event.preventDefault();
    setContactError("");
    setContactSuccess("");

    const trimmedPhone = contactForm.phone.trim();
    const trimmedEmail = contactForm.email.trim();

    if (!trimmedEmail) {
      setContactError("El correo no puede estar vacío.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setContactError("Ingresa un correo electrónico válido.");
      return;
    }

    const normalizedPhone = normalizePhone(trimmedPhone);
    if (!normalizedPhone) {
      setContactError(PHONE_ERROR_MESSAGE);
      return;
    }

    setContactLoading(true);
    try {
      const updatedProfile = await upsertProfile(
        profile.id,
        profile.full_name,
        profile.role,
        onboarding,
        { phone: normalizedPhone, birth_date: profile.birth_date },
      );

      // Actualizar el perfil en auth/localStorage con los nuevos datos de contacto
      if (onProfileUpdate) {
        onProfileUpdate({
          ...profile,
          phone: updatedProfile?.phone || normalizedPhone,
          email: trimmedEmail,
        });
      }

      setContactSuccess("Datos de contacto actualizados.");
      setContactEditing(false);
    } catch {
      setContactError("No se pudieron guardar los datos de contacto. Intenta nuevamente.");
    } finally {
      setContactLoading(false);
    }
  };

  return (
    <section className="section-block profile-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Mi perfil</span>
          <h1>Datos y actividad</h1>
          <p>Información de contacto, preferencias de búsqueda e historial de evaluaciones.</p>
        </div>
      </div>

      <section className="profile-overview">
        <div className="profile-overview__identity">
          <div className="profile-avatar">{userInitials}</div>
          <div>
            <span className="profile-overview__label">Cuenta</span>
            <h2>{profile?.full_name || "Usuario"}</h2>
            <p>{profile?.email || "Sin correo"}</p>
          </div>
        </div>
        <div className="profile-stats">
          <div className="profile-stat">
            <div className="profile-stat__num">{evaluations.length}</div>
            <div className="profile-stat__label">Evaluaciones</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat__num">
              {evaluations.length > 0 ? formatScore(evaluations[evaluations.length - 1]?.result?.score, "—") : "—"}
            </div>
            <div className="profile-stat__label">Último score</div>
          </div>
        </div>
      </section>

      <div className="profile-grid">
        <section className="profile-card profile-card--contact">
          <div className="profile-card-header-row">
            <div>
              <strong>Contacto</strong>
              <p>Datos usados para comunicarnos contigo.</p>
            </div>
            {!contactEditing && (
              <button type="button" className="secondary-button compact-button" onClick={openContactEdit}>
                Editar contacto
              </button>
            )}
          </div>

          {contactEditing ? (
            <form className="score-form profile-form" onSubmit={submitContact}>
              <div className="form-grid">
                <label>
                  Teléfono
                  <div className="phone-input">
                    <span>+56 9</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      name="phone"
                      value={formatPhone(contactForm.phone)}
                      onChange={handleContactChange}
                      maxLength="9"
                      placeholder="1234 5678"
                      autoComplete="tel"
                      aria-label="8 dígitos restantes del teléfono"
                    />
                  </div>
                </label>
                <label>
                  Correo electrónico
                  <input
                    type="email"
                    name="email"
                    value={contactForm.email}
                    onChange={handleContactChange}
                    placeholder="tu@correo.cl"
                    autoComplete="email"
                  />
                </label>
              </div>
              {contactError && <div className="error-message">{contactError}</div>}
              <div className="form-actions">
                <button type="submit" disabled={contactLoading}>
                  {contactLoading ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setContactEditing(false)}
                  disabled={contactLoading}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <dl className="profile-details">
              <div>
                <dt>Nombre</dt>
                <dd>{profile?.full_name || "Sin nombre"}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{profile?.email || "Sin correo"}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{profile?.phone ? `+56 9 ${formatPhone(profile.phone)}` : "Sin teléfono"}</dd>
              </div>
              <div>
                <dt>Fecha nacimiento</dt>
                <dd>{profile?.birth_date ? new Date(`${profile.birth_date}T00:00:00`).toLocaleDateString("es-CL") : "No declarada"}</dd>
              </div>
            </dl>
          )}
          {contactSuccess && <div className="success-message" style={{ marginTop: 12 }}>{contactSuccess}</div>}
        </section>

        <section className="profile-card profile-card--preferences">
          <div className="profile-card-header-row">
            <div>
              <strong>Preferencias de búsqueda</strong>
              <p>Información declarada para tus evaluaciones.</p>
            </div>
            {!onboardingEditing ? (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setOnboardingEditing(true);
                }}
              >
                Editar
              </button>
            ) : null}
          </div>

          {onboardingEditing ? (
            <form className="score-form profile-form" onSubmit={submit}>
              <div className="form-grid">
                <label>
                  Objetivo inmobiliario
                  <select name="objetivo_principal" value={form.objetivo_principal} onChange={handleChange}>
                    <option value="">Selecciona una opción</option>
                    <option value="comprar_ahora">Comprar ahora</option>
                    <option value="prepararme">Prepararme para comprar más adelante</option>
                    <option value="evaluar_capacidad">Evaluar mi capacidad de compra</option>
                    <option value="conocer_propiedad">Conocer que tipo de propiedad podría buscar</option>
                  </select>
                </label>

                <label>
                  Tipo de propiedad
                  <select name="tipo_propiedad" value={form.tipo_propiedad} onChange={handleChange}>
                    <option value="">Selecciona una opción</option>
                    <option value="casa">Casa</option>
                    <option value="departamento">Departamento</option>
                  </select>
                </label>

                <label>
                  Comuna objetivo
                  <select name="comuna_interes" value={form.comuna_interes} onChange={handleChange}>
                    <option value="">Selecciona una comuna</option>
                    {comunasMvp.map((comuna) => (
                      <option key={comuna} value={comuna}>{comuna}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Plazo estimado de compra
                  <select name="plazo_compra" value={form.plazo_compra} onChange={handleChange}>
                    <option value="">Selecciona una opción</option>
                    <option value="0_3_meses">0 a 3 meses</option>
                    <option value="3_6_meses">3 a 6 meses</option>
                    <option value="6_12_meses">6 a 12 meses</option>
                    <option value="mas_12_meses">Más de 12 meses</option>
                  </select>
                </label>

                <label>
                  Comuna alternativa
                  <select name="comuna_alternativa" value={form.comuna_alternativa} onChange={handleChange} disabled={!form.comuna_interes}>
                    <option value="">{form.comuna_interes ? "Sin comuna alternativa" : "Elige primero una comuna principal"}</option>
                    {alternativeCommunes.map((comuna) => (
                      <option key={comuna} value={comuna}>{comuna}</option>
                    ))}
                  </select>
                </label>

                <label className="check-row">
                  <input
                    type="checkbox"
                    name="tiene_propiedad_vista"
                    checked={form.tiene_propiedad_vista}
                    onChange={handleChange}
                  />
                  <span>Ya tengo una propiedad o proyecto visto</span>
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" disabled={!hasChanges}>Guardar</button>
                <button type="button" className="secondary-button" onClick={cancelOnboardingEdit}>
                  Cancelar
                </button>
              </div>
              {success && <div className="success-message">{success}</div>}
              {error && <div className="error-message">{error}</div>}
            </form>
          ) : (
            <>
              <dl className="profile-details">
                <div>
                  <dt>Objetivo inmobiliario</dt>
                  <dd>{objetivoLabels[savedOnboarding.objetivo_principal] || "No declarado"}</dd>
                </div>
                <div>
                  <dt>Tipo de propiedad</dt>
                  <dd>{propertyLabels[savedOnboarding.tipo_propiedad] || "No declarado"}</dd>
                </div>
                <div>
                  <dt>Comuna objetivo</dt>
                  <dd>{savedOnboarding.comuna_interes || "No declarada"}</dd>
                </div>
                <div>
                  <dt>Comuna alternativa</dt>
                  <dd>{savedOnboarding.comuna_alternativa || "No declarada"}</dd>
                </div>
                <div>
                  <dt>Plazo estimado</dt>
                  <dd>{plazoLabels[savedOnboarding.plazo_compra] || "No declarado"}</dd>
                </div>
                <div>
                  <dt>Propiedad o proyecto visto</dt>
                  <dd>{booleanText(savedOnboarding.tiene_propiedad_vista)}</dd>
                </div>
              </dl>
              {success && <div className="success-message" style={{ marginTop: 12 }}>{success}</div>}
            </>
          )}
        </section>
      </div>

      <section className="profile-card profile-card--history">
        <div className="profile-card-header-row">
          <div>
            <strong>Historial de evaluaciones</strong>
            <p>{evaluations.length} registro{evaluations.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        {evaluations.length > 0 ? (
          <div className="history-list profile-history">
            {evaluations.map((item) => {
              const result = getResult(item);

              return (
                <article className={`history-card profile-history-card ${getClassificationClass(result.classification)}`} key={item.id}>
                  <div className="history-card-header">
                    <div>
                      <span className="eyebrow">{new Date(item.created_at).toLocaleDateString("es-CL")}</span>
                      <h3>Score financiero: {formatScore(result.score, "Sin score")}</h3>
                    </div>
                    {/* <button className="secondary-button compact-button" type="button" onClick={() => onDeleteEvaluation(item.id)}>
                    Eliminar
                  </button> */}
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => setSelectedEvaluation(item)}
                    >
                      Detalles
                    </button>
                  </div>
                  <span className={`status-pill ${getClassificationClass(result.classification)}`}>
                    {result.classification || emptyValue}
                  </span>
                  <dl>
                    <div>
                      <dt>Comuna objetivo</dt>
                      <dd>{item.input?.comuna_objetivo || item.onboarding?.comuna_interes || "No declarada"}</dd>
                    </div>
                    <div>
                      <dt>Objetivo inmobiliario</dt>
                      <dd>{objetivoLabels[item.onboarding?.objetivo_principal] || "No declarado"}</dd>
                    </div>
                  </dl>
                  {canSeeTechnicalScoring ? <ProfessionalHistorySummary result={result} /> : null}
                  <ScoreAdjustmentNote result={result} />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Aun no tienes precalificaciones guardadas.</strong>
            <p>Cuando completes una evaluación, aparecerá aqui como registro independiente.</p>
          </div>
        )}
      </section>

      {selectedEvaluation && (
        <div
          className="profile-detail-modal-overlay"
          role="presentation"
          onClick={() => setSelectedEvaluation(null)}
        >
          <section
            className="profile-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-evaluation-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="profile-detail-modal-header">
              <div>
                <span className="eyebrow">
                  {new Date(selectedEvaluation.created_at).toLocaleString("es-CL")}
                </span>
                <h2 id="profile-evaluation-detail-title">
                  {canSeeTechnicalScoring ? "Detalle de scoring" : "Detalle de preevaluación"}
                </h2>
              </div>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setSelectedEvaluation(null)}
              >
                Cerrar
              </button>
            </header>

            <div className={`profile-score-highlight ${getClassificationClass(selectedEvaluation.result?.classification)}`}>
              <div>
                <span>Score financiero</span>
                <strong>{formatScore(selectedEvaluation.result?.score) ?? emptyValue}</strong>
              </div>
              <div>
                <span>Clasificación final</span>
                <strong>{text(selectedEvaluation.result?.classification)}</strong>
              </div>
              <div className="profile-score-date">
                <span>Fecha evaluación</span>
                <strong>{new Date(selectedEvaluation.created_at).toLocaleDateString("es-CL")}</strong>
              </div>
            </div>
            <ScoreAdjustmentNote result={selectedEvaluation.result} />

            <div className="evaluation-detail-panel">
              <div className="evaluation-detail-section profile-evaluation-explanation">
                <h4>Explicación de la evaluación</h4>
                <AiExplanationBlock
                  text={selectedEvaluation.result?.ai_explanation}
                  onRetry={onRetryExplanation ? () => onRetryExplanation(selectedEvaluation) : undefined}
                  actionLabel="Generar explicación"
                  renderText={(aiText) => <p>{displayText(aiText)}</p>}
                />
              </div>

              {canSeeTechnicalScoring ? (
                <ProfessionalEvaluationDetails result={getResult(selectedEvaluation)} />
              ) : null}

              <div className="evaluation-detail-section">
                <h4>Preguntas preliminares</h4>
                <dl className="detail-grid">
                  <div>
                    <dt>Objetivo</dt>
                    <dd>{text(selectedEvaluation.onboarding?.objetivo_principal, objetivoLabels)}</dd>
                  </div>
                  <div>
                    <dt>Comuna principal</dt>
                    <dd>{text(selectedEvaluation.onboarding?.comuna_interes || selectedEvaluation.input?.comuna_objetivo)}</dd>
                  </div>
                  <div>
                    <dt>Comuna alternativa</dt>
                    <dd>{text(selectedEvaluation.onboarding?.comuna_alternativa)}</dd>
                  </div>
                  <div>
                    <dt>Tipo vivienda</dt>
                    <dd>{text(selectedEvaluation.onboarding?.tipo_propiedad, propertyLabels)}</dd>
                  </div>
                  <div>
                    <dt>Plazo compra</dt>
                    <dd>{text(selectedEvaluation.onboarding?.plazo_compra, plazoLabels)}</dd>
                  </div>
                  <div>
                    <dt>Monto vivienda</dt>
                    <dd>{selectedEvaluation.input?.property_value_uf ? uf(selectedEvaluation.input.property_value_uf) : money(selectedEvaluation.input?.property_value_clp)}</dd>
                  </div>
                </dl>
              </div>

              <div className="evaluation-detail-section">
                <h4>Datos financieros</h4>
                <dl className="detail-grid">
                  <div>
                    <dt>Ingreso mensual</dt>
                    <dd>{money(selectedEvaluation.input?.ingreso_mensual)}</dd>
                  </div>
                  <div>
                    <dt>Deuda mensual</dt>
                    <dd>{money(selectedEvaluation.input?.deuda_mensual)}</dd>
                  </div>
                  <div>
                    <dt>Deuda total</dt>
                    <dd>{money(selectedEvaluation.input?.deuda_total)}</dd>
                  </div>
                  <div>
                    <dt>Ahorro</dt>
                    <dd>{money(selectedEvaluation.input?.ahorro_disponible)}</dd>
                  </div>
                  <div>
                    <dt>Dividendo estimado</dt>
                    <dd>{money(selectedEvaluation.input?.dividendo_estimado)}</dd>
                  </div>
                  <div>
                    <dt>Origen dividendo</dt>
                    <dd>{dividendOrigin(selectedEvaluation.input)}</dd>
                  </div>
                  <div>
                    <dt>Plazo crédito</dt>
                    <dd>{selectedEvaluation.input?.plazo_credito_hipotecario ? `${selectedEvaluation.input.plazo_credito_hipotecario} años` : emptyValue}</dd>
                  </div>
                  <div>
                    <dt>Tipo contrato</dt>
                    <dd>{text(selectedEvaluation.input?.tipo_contrato, contractLabels)}</dd>
                  </div>
                  <div>
                    <dt>Continuidad laboral</dt>
                    <dd>{text(selectedEvaluation.input?.continuidad_laboral, continuityLabels)}</dd>
                  </div>
                  <div>
                    <dt>Morosidad</dt>
                    <dd>{text(selectedEvaluation.input?.morosidad_actual, morosityLabels)}</dd>
                  </div>
                </dl>
              </div>

              {selectedEvaluation.input?.declara_patrimonio && (
                <div className="evaluation-detail-section">
                  <h4>Patrimonio</h4>
                  <dl className="detail-grid">
                    <div>
                      <dt>Vehículos</dt>
                      <dd>{money(selectedEvaluation.input?.valor_vehiculos)}</dd>
                    </div>
                    <div>
                      <dt>Inmuebles / otros</dt>
                      <dd>{money(selectedEvaluation.input?.valor_inmuebles)}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {selectedEvaluation.input?.complemento_renta && (
                <div className="evaluation-detail-section">
                  <h4>Complemento de renta</h4>
                  <dl className="detail-grid">
                    <div>
                      <dt>Ingreso complementario</dt>
                      <dd>{money(selectedEvaluation.input?.ingreso_mensual_complementario)}</dd>
                    </div>
                    <div>
                      <dt>Deuda complementaria</dt>
                      <dd>{money(selectedEvaluation.input?.deuda_mensual_complementario)}</dd>
                    </div>
                    <div>
                      <dt>Contrato complementario</dt>
                      <dd>{text(selectedEvaluation.input?.tipo_contrato_complementario, contractLabels)}</dd>
                    </div>
                    <div>
                      <dt>Continuidad complementaria</dt>
                      <dd>{text(selectedEvaluation.input?.continuidad_laboral_complementario, continuityLabels)}</dd>
                    </div>
                    <div>
                      <dt>Morosidad complementaria</dt>
                      <dd>{text(selectedEvaluation.input?.morosidad_complementario, morosityLabels)}</dd>
                    </div>
                    <div>
                      <dt>Relación</dt>
                      <dd>{text(selectedEvaluation.input?.relacion_complementario, relationLabels)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

    </section>
  );
}
