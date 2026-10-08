import React, { useEffect, useRef, useState } from "react";

import {
  inspectCoDebtorInvitation,
  inspectCoDebtorManagement,
  declineCoDebtorInvitation,
  readPublicCoDebtorToken,
  revokeCoDebtorManagement,
  runExclusive,
  submitCoDebtorConfirmation,
} from "../services/coDebtorService";
import { formatMoneyInput, stripMoneyInput } from "../services/moneyFormat";
import FieldTooltip from "./FieldTooltip";

const emptyConfirmation = {
  ingreso_mensual_complementario: "",
  deuda_mensual_complementario: "",
  tipo_contrato_complementario: "",
  continuidad_laboral_complementario: "",
  morosidad_complementario: "",
  treatment_consent: false,
};

const declaredFinancialFields = [
  "ingreso_mensual_complementario",
  "deuda_mensual_complementario",
  "tipo_contrato_complementario",
  "continuidad_laboral_complementario",
  "morosidad_complementario",
];

export function confirmationFromInvitation(context) {
  const canPrefill = context?.status === "pending" && context?.can_submit === true
    && declaredFinancialFields.every((field) => context[field] !== undefined && context[field] !== null && context[field] !== "");
  if (!canPrefill) return { ...emptyConfirmation };
  return {
    ...emptyConfirmation,
    ...Object.fromEntries(declaredFinancialFields.map((field) => [field, String(context[field])])),
  };
}

const contractOptions = [
  ["indefinido", "Indefinido"],
  ["independiente", "Independiente"],
  ["plazo_fijo", "Plazo fijo"],
  ["honorarios_variable", "Honorarios / variable"],
];

const continuityOptions = [
  ["menos_6_meses", "Menos de 6 meses"],
  ["entre_6_y_12_meses", "Entre 6 y 12 meses"],
  ["entre_1_y_3_anios", "Entre 1 y 3 años"],
  ["mas_3_anios", "Más de 3 años"],
];

function PublicShell({ children }) {
  return <div className="co-debtor-public-page">
    <header className="co-debtor-public-page__brand">
      <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
    </header>
    <main className="co-debtor-public-page__main">{children}</main>
  </div>;
}

function StatusCard({ eyebrow, title, children, tone = "neutral" }) {
  return <section className={`co-debtor-public-card co-debtor-public-card--${tone}`} aria-live="polite">
    <span className="eyebrow">{eyebrow}</span>
    <h1>{title}</h1>
    {children}
  </section>;
}

function validationMessage(values) {
  if (!/^\d+$/.test(values.ingreso_mensual_complementario)) return "Ingresa tu ingreso mensual en pesos.";
  if (!/^\d+$/.test(values.deuda_mensual_complementario)) return "Ingresa tu deuda mensual en pesos. Si no tienes deuda, escribe 0.";
  if (!values.tipo_contrato_complementario) return "Selecciona tu tipo de contrato.";
  if (!values.continuidad_laboral_complementario) return "Selecciona tu continuidad laboral.";
  if (!values.morosidad_complementario) return "Indica si tienes morosidad actual.";
  if (!values.treatment_consent) return "Debes aceptar el tratamiento de datos para continuar.";
  return "";
}

export function CoDebtorInvitationView({ context, loading, confirmation, onChange, onSubmit, onDecline, busy, error, submitted }) {
  if (loading) return <PublicShell><StatusCard eyebrow="RutaHogar" title="Verificando tu invitación"><p>Espera un momento mientras verificamos el enlace.</p></StatusCard></PublicShell>;

  if (submitted) return <PublicShell><StatusCard eyebrow="Antecedentes registrados" title="Gracias por completar tus antecedentes" tone="success">
    <p>Registramos correctamente tu información y tu consentimiento de tratamiento de datos.</p>
    <p>Recibirás, o ya recibiste, un correo para gestionar o revocar tu consentimiento cuando lo necesites.</p>
    <p className="co-debtor-public-card__note">Esto no implica una aprobación hipotecaria ni recalcula un score desde esta página.</p>
  </StatusCard></PublicShell>;

  if (context?.status === "expired") return <PublicShell><StatusCard eyebrow="Invitación expirada" title="Este enlace ya expiró" tone="warning">
    <p>Para continuar, el lead deberá enviarte una nueva invitación desde RutaHogar.</p>
  </StatusCard></PublicShell>;

  if (context?.status === "confirmed") return <PublicShell><StatusCard eyebrow="Antecedentes confirmados" title="Ya registraste tus antecedentes" tone="success">
    <p>No necesitas enviar esta información nuevamente. Revisa el correo que recibiste para gestionar o revocar tu consentimiento.</p>
  </StatusCard></PublicShell>;

  if (context?.status === "declined") return <PublicShell><StatusCard eyebrow="Participación rechazada" title="No autorizaste el uso de tus datos" tone="warning">
    <p>No usaremos tus antecedentes como co-deudor para esta evaluación.</p>
  </StatusCard></PublicShell>;

  if (context?.status !== "pending" || context?.can_submit !== true) return <PublicShell><StatusCard eyebrow="Enlace no disponible" title="No podemos usar este enlace" tone="warning">
    <p>Puede haber expirado o haber sido reemplazado. Solicita una nueva invitación a la persona que te la envió.</p>
  </StatusCard></PublicShell>;

  return <PublicShell><StatusCard eyebrow="Aporte de antecedentes" title="Completa tus propios antecedentes">
    <p>RutaHogar entrega orientación referencial para compra de vivienda. Estás aportando tus propios datos, no los de otra persona.</p>
    <p className="co-debtor-public-card__note">Estos antecedentes fueron declarados por la persona que te invitó. Revísalos y corrígelos si es necesario.</p>
    <form className="co-debtor-public-form" onSubmit={onSubmit} noValidate>
      <div className="co-debtor-public-form__grid">
        <div className="co-debtor-public-form__field">
          <div className="pre-wizard-field-label-row"><label className="pre-wizard-field-label" htmlFor="co-debtor-income">Ingreso mensual</label><FieldTooltip text="Indica tu ingreso líquido mensual o el promedio que recibes regularmente." /></div>
          <input id="co-debtor-income" name="ingreso_mensual_complementario" inputMode="numeric" value={formatMoneyInput(confirmation.ingreso_mensual_complementario)} onChange={(event) => onChange("ingreso_mensual_complementario", stripMoneyInput(event.target.value))} placeholder="Ej: 900.000" disabled={busy} />
        </div>
        <div className="co-debtor-public-form__field">
          <div className="pre-wizard-field-label-row"><label className="pre-wizard-field-label" htmlFor="co-debtor-debt">Deuda mensual</label><FieldTooltip text="Incluye tus cuotas y compromisos financieros mensuales vigentes. Si no tienes deuda, ingresa 0." /></div>
          <input id="co-debtor-debt" name="deuda_mensual_complementario" inputMode="numeric" value={formatMoneyInput(confirmation.deuda_mensual_complementario)} onChange={(event) => onChange("deuda_mensual_complementario", stripMoneyInput(event.target.value))} disabled={busy} />
        </div>
        <div className="co-debtor-public-form__field">
          <div className="pre-wizard-field-label-row"><label className="pre-wizard-field-label" htmlFor="co-debtor-contract">Tipo de contrato</label><FieldTooltip text="Selecciona la modalidad bajo la cual recibes tus ingresos actualmente." /></div>
          <select id="co-debtor-contract" name="tipo_contrato_complementario" value={confirmation.tipo_contrato_complementario} onChange={(event) => onChange("tipo_contrato_complementario", event.target.value)} disabled={busy}>
            <option value="">Selecciona una opción</option>
            {contractOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="co-debtor-public-form__field">
          <div className="pre-wizard-field-label-row"><label className="pre-wizard-field-label" htmlFor="co-debtor-continuity">Continuidad laboral</label><FieldTooltip text="Indica cuánto tiempo llevas trabajando de forma continua en tu empleo o actividad actual." /></div>
          <select id="co-debtor-continuity" name="continuidad_laboral_complementario" value={confirmation.continuidad_laboral_complementario} onChange={(event) => onChange("continuidad_laboral_complementario", event.target.value)} disabled={busy}>
            <option value="">Selecciona una opción</option>
            {continuityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="co-debtor-public-form__field">
          <div className="pre-wizard-field-label-row"><label className="pre-wizard-field-label" htmlFor="co-debtor-delinquency">Morosidad actual</label><FieldTooltip text="Indica si tienes cuotas o pagos vencidos en este momento." /></div>
          <select id="co-debtor-delinquency" name="morosidad_complementario" value={confirmation.morosidad_complementario} onChange={(event) => onChange("morosidad_complementario", event.target.value)} disabled={busy}>
            <option value="">Selecciona una opción</option>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </div>
      </div>
      <label className="co-debtor-public-form__consent" htmlFor="co-debtor-treatment-consent">
        <input id="co-debtor-treatment-consent" name="treatment_consent" type="checkbox" checked={confirmation.treatment_consent} onChange={(event) => onChange("treatment_consent", event.target.checked)} disabled={busy} />
        <span>Autorizo el tratamiento de estos antecedentes para la evaluación relacionada en RutaHogar.</span>
      </label>
      <div className="co-debtor-public-form__actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Registrando antecedentes..." : "Confirmar mis antecedentes"}</button>
        <button className="secondary-button" type="button" onClick={onDecline} disabled={busy}>No autorizo el uso de mis datos</button>
      </div>
      <p className="co-debtor-public-card__note">Completar esta información no implica una aprobación hipotecaria. Recibirás un enlace por correo para revocar tu consentimiento posteriormente.</p>
      {error && <p className="error-message co-debtor-public-form__feedback" role="alert">{error}</p>}
    </form>
  </StatusCard></PublicShell>;
}

export function CoDebtorManagementView({ context, loading, confirmRevoke, onStartRevoke, onCancelRevoke, onConfirmRevoke, busy, error }) {
  if (loading) return <PublicShell><StatusCard eyebrow="RutaHogar" title="Verificando tu consentimiento"><p>Espera un momento mientras verificamos el enlace.</p></StatusCard></PublicShell>;

  if (context?.status === "revoked") return <PublicShell><StatusCard eyebrow="Consentimiento revocado" title="Tu participación ya no está activa" tone="warning">
    <p>Tus antecedentes no se utilizarán en evaluaciones futuras. Las evaluaciones históricas ya realizadas no se eliminan ni modifican.</p>
  </StatusCard></PublicShell>;

  if (context?.status !== "confirmed" || context?.can_revoke !== true) return <PublicShell><StatusCard eyebrow="Enlace no disponible" title="No podemos usar este enlace" tone="warning">
    <p>El enlace no es válido o ya no está disponible.</p>
  </StatusCard></PublicShell>;

  return <PublicShell><StatusCard eyebrow="Consentimiento vigente" title="Tu participación está activa" tone="success">
    <p>RutaHogar puede utilizar tus antecedentes únicamente para la evaluación relacionada. Puedes retirar esta autorización cuando lo necesites.</p>
    {!confirmRevoke ? <button className="secondary-button" type="button" onClick={onStartRevoke}>Revocar mi consentimiento</button> : (
      <div className="co-debtor-public-revoke-confirm" role="alert">
        <strong>¿Quieres revocar tu consentimiento?</strong>
        <p>Tus antecedentes dejarán de utilizarse en evaluaciones futuras. Las evaluaciones históricas ya realizadas no se eliminan ni modifican.</p>
        <div>
          <button className="secondary-button" type="button" onClick={onCancelRevoke} disabled={busy}>Cancelar</button>
          <button className="primary-button" type="button" onClick={onConfirmRevoke} disabled={busy}>{busy ? "Revocando..." : "Confirmar revocación"}</button>
        </div>
      </div>
    )}
    {error && <p className="error-message co-debtor-public-form__feedback" role="alert">{error}</p>}
  </StatusCard></PublicShell>;
}

export function CoDebtorInvitationPage({ token = readPublicCoDebtorToken() }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState(emptyConfirmation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitLock = useRef(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setContext({ status: "invalid", can_submit: false });
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    inspectCoDebtorInvitation(token)
      .then((next) => {
        if (!active) return;
        setContext(next);
        setConfirmation(confirmationFromInvitation(next));
      })
      .catch(() => { if (active) setContext({ status: "invalid", can_submit: false }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const changeConfirmation = (field, value) => setConfirmation((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (submitLock.current) return;
    const validationError = validationMessage(confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    return runExclusive(submitLock, async () => {
      try {
        await submitCoDebtorConfirmation(token, confirmation);
        setSubmitted(true);
      } catch (failure) {
        try {
          const next = await inspectCoDebtorInvitation(token);
          setContext(next);
        } catch { /* Keep the current safe public state and show a generic error. */ }
        setError(failure.message || "No se pudieron registrar tus antecedentes. Intenta nuevamente.");
      } finally {
        setBusy(false);
      }
    });
  };
  const decline = () => {
    if (submitLock.current) return;
    setBusy(true);
    setError("");
    return runExclusive(submitLock, async () => {
      try {
        await declineCoDebtorInvitation(token);
        setContext({ status: "declined", can_submit: false });
        setConfirmation(emptyConfirmation);
      } catch (failure) {
        setError(failure.message || "No se pudo registrar tu decisión. Intenta nuevamente.");
      } finally {
        setBusy(false);
      }
    });
  };

  return <CoDebtorInvitationView
    context={context}
    loading={loading}
    confirmation={confirmation}
    onChange={changeConfirmation}
    onSubmit={submit}
    onDecline={decline}
    busy={busy}
    error={error}
    submitted={submitted}
  />;
}

export function CoDebtorManagementPage({ token = readPublicCoDebtorToken() }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revokeLock = useRef(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setContext({ status: "invalid", can_revoke: false });
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    inspectCoDebtorManagement(token)
      .then((next) => { if (active) setContext(next); })
      .catch(() => { if (active) setContext({ status: "invalid", can_revoke: false }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const revoke = () => {
    if (revokeLock.current) return;
    setBusy(true);
    setError("");
    return runExclusive(revokeLock, async () => {
      try {
        const result = await revokeCoDebtorManagement(token);
        setContext({ status: result.status === "revoked" ? "revoked" : "invalid", can_revoke: false });
        setConfirmRevoke(false);
      } catch (failure) {
        if (failure.status === 404) setContext({ status: "invalid", can_revoke: false });
        setError(failure.message || "No se pudo revocar el consentimiento. Intenta nuevamente.");
      } finally {
        setBusy(false);
      }
    });
  };

  return <CoDebtorManagementView
    context={context}
    loading={loading}
    confirmRevoke={confirmRevoke}
    onStartRevoke={() => { setError(""); setConfirmRevoke(true); }}
    onCancelRevoke={() => setConfirmRevoke(false)}
    onConfirmRevoke={revoke}
    busy={busy}
    error={error}
  />;
}
