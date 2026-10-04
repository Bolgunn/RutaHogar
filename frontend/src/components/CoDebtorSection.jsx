import React, { useEffect, useRef, useState } from "react";

import { formatFormValue } from "../constants";
import {
  createCoDebtorInvitation,
  getLeadCoDebtorInvitation,
  runExclusive,
} from "../services/coDebtorService";
import { updateScoreWithConfirmedCoDebtor } from "../services/trackingService";
import { formatClp } from "../utils/helpers";

const confirmedFields = [
  ["ingreso_mensual_complementario", "Ingreso mensual", formatClp],
  ["deuda_mensual_complementario", "Deuda mensual", formatClp],
  ["tipo_contrato_complementario", "Tipo de contrato", formatFormValue],
  ["continuidad_laboral_complementario", "Continuidad laboral", formatFormValue],
  ["morosidad_complementario", "Morosidad", formatFormValue],
];

function invitationStatusLabel(status) {
  return {
    pending: "Pendiente de confirmación",
    expired: "Invitación expirada",
    confirmed: "Co-deudor confirmado",
    revoked: "Consentimiento revocado",
  }[status] || "Sin invitación";
}

function dateLabel(value) {
  if (!value) return "Sin fecha disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha disponible"
    : date.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

function InvitationForm({ email, onChange, onSubmit, busy, status }) {
  const replacement = status === "pending" || status === "expired" || status === "revoked";
  return <form className="co-debtor-section__form" onSubmit={onSubmit} noValidate>
    <label htmlFor="co-debtor-recipient-email">Correo del co-deudor</label>
    <div className="co-debtor-section__form-row">
      <input
        id="co-debtor-recipient-email"
        name="co-debtor-recipient-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(event) => onChange(event.target.value)}
        placeholder="nombre@correo.cl"
        disabled={busy}
      />
      <button className="secondary-button compact-button" type="submit" disabled={busy}>
        {busy ? "Enviando..." : replacement ? "Enviar nueva invitación" : "Enviar invitación"}
      </button>
    </div>
  </form>;
}

export function CoDebtorPanel({
  invitation,
  declaredComplement,
  declaredRelation,
  email,
  onEmailChange,
  onInvite,
  invitationBusy = false,
  onUpdateScore,
  updatingScore = false,
  message = "",
  error = "",
}) {
  if (!declaredComplement && !invitation) return null;

  const status = invitation?.status || "none";
  const isConfirmed = status === "confirmed" && confirmedFields.every(([field]) => (
    invitation?.confirmation?.[field] !== undefined && invitation.confirmation[field] !== null && invitation.confirmation[field] !== ""
  ));
  const canUpdate = isConfirmed && !updatingScore;

  return <section className="co-debtor-section" aria-labelledby="co-debtor-section-title">
    <header className="co-debtor-section__header">
      <div>
        <span className="eyebrow">Complemento de renta</span>
        <h2 id="co-debtor-section-title">Co-deudor</h2>
      </div>
      <span className={`co-debtor-section__status co-debtor-section__status--${status}`}>
        {invitationStatusLabel(status)}
      </span>
    </header>

    {status === "none" && <>
      <p>Invita a esta persona por correo. Recibirá un enlace para completar y autorizar sus propios antecedentes.</p>
      <InvitationForm email={email} onChange={onEmailChange} onSubmit={onInvite} busy={invitationBusy} status={status} />
    </>}

    {status === "pending" && <>
      <p>Invitación enviada a <strong>{invitation.recipientEmail}</strong>. Expira el {dateLabel(invitation.expiresAt)}.</p>
      <p className="co-debtor-section__note">Tu score actual sigue usando los datos que declaraste. Este complemento está <strong>No confirmado</strong>.</p>
      <InvitationForm email={email} onChange={onEmailChange} onSubmit={onInvite} busy={invitationBusy} status={status} />
    </>}

    {status === "expired" && <>
      <p>La invitación para <strong>{invitation.recipientEmail}</strong> expiró. Tu evaluación continúa usando el complemento declarado como <strong>No confirmado</strong>.</p>
      <InvitationForm email={email} onChange={onEmailChange} onSubmit={onInvite} busy={invitationBusy} status={status} />
    </>}

    {isConfirmed && <>
      <p>Los antecedentes aportados por el co-deudor prevalecerán sobre los que declaraste al actualizar tu score.</p>
      <dl className="co-debtor-section__details">
        {confirmedFields.map(([field, label, formatter]) => <div key={field}>
          <dt>{label}</dt><dd>{formatter(invitation.confirmation[field])}</dd>
        </div>)}
        <div><dt>Relación</dt><dd>{formatFormValue(declaredRelation)}</dd></div>
      </dl>
      <p className="co-debtor-section__note">La relación es información declarada por ti.</p>
      <button type="button" className="primary-button co-debtor-section__update" onClick={onUpdateScore} disabled={!canUpdate}>
        {updatingScore ? "Actualizando score..." : "Actualizar score con datos confirmados"}
      </button>
    </>}

    {status === "confirmed" && !isConfirmed && (
      <p>No pudimos verificar los antecedentes confirmados. Actualiza la página antes de continuar.</p>
    )}

    {status === "revoked" && <>
      <p>El co-deudor revocó su consentimiento. Sus antecedentes dejarán de utilizarse en futuras evaluaciones.</p>
      <p className="co-debtor-section__note">Tus evaluaciones históricas siguen disponibles y no se modifican.</p>
      <InvitationForm email={email} onChange={onEmailChange} onSubmit={onInvite} busy={invitationBusy} status={status} />
    </>}

    {message && <p className="success-message co-debtor-section__feedback" role="status">{message}</p>}
    {error && <p className="error-message co-debtor-section__feedback" role="alert">{error}</p>}
  </section>;
}

export default function CoDebtorSection({ evaluation, onScoreUpdated }) {
  const declaredComplement = Boolean(evaluation?.input?.complemento_renta);
  const declaredRelation = evaluation?.input?.relacion_complementario;
  const [invitation, setInvitation] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [updatingScore, setUpdatingScore] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const updateLock = useRef(null);

  const refreshInvitation = async () => {
    const next = await getLeadCoDebtorInvitation();
    setInvitation(next);
    return next;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getLeadCoDebtorInvitation()
      .then((next) => { if (active) setInvitation(next); })
      .catch(() => { if (active) setError("No pudimos cargar el estado del co-deudor. Intenta nuevamente."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [evaluation?.id]);

  const handleInvite = async (event) => {
    event.preventDefault();
    if (invitationBusy) return;
    setInvitationBusy(true);
    setMessage("");
    setError("");
    try {
      const sent = await createCoDebtorInvitation(email);
      setInvitation({ recipientEmail: email.trim().toLowerCase(), status: "pending", expiresAt: sent.expires_at, confirmation: null });
      setEmail("");
      setMessage("Enviamos la invitación por correo. Quedará pendiente hasta que el co-deudor complete sus antecedentes.");
    } catch (failure) {
      setError(failure.message || "No se pudo enviar la invitación. Intenta nuevamente.");
    } finally {
      setInvitationBusy(false);
    }
  };

  const handleUpdateScore = () => {
    if (updateLock.current) return;
    setUpdatingScore(true);
    setMessage("");
    setError("");
    return runExclusive(updateLock, async () => {
      try {
        await updateScoreWithConfirmedCoDebtor();
        try {
          await onScoreUpdated?.();
          await refreshInvitation();
          setMessage("Actualizamos tu score con los antecedentes confirmados. Se creó una nueva evaluación en tu historial.");
        } catch {
          setMessage("Se creó una nueva evaluación con los antecedentes confirmados. Recarga la página para actualizar tu vista.");
        }
      } catch (failure) {
        if (failure?.code === "co_debtor_consent_revoked") {
          setInvitation((current) => current && { ...current, status: "revoked", confirmation: null });
          try { await refreshInvitation(); } catch { /* The safe local state already hides confirmed values. */ }
        }
        setError(failure.message || "No se pudo actualizar tu score. Intenta nuevamente.");
      } finally {
        setUpdatingScore(false);
      }
    });
  };

  if (loading) {
    if (!declaredComplement) return null;
    return <section className="co-debtor-section" aria-live="polite">
      <p>Cargando el estado de tu co-deudor...</p>
    </section>;
  }
  return <CoDebtorPanel
    invitation={invitation}
    declaredComplement={declaredComplement}
    declaredRelation={declaredRelation}
    email={email}
    onEmailChange={setEmail}
    onInvite={handleInvite}
    invitationBusy={invitationBusy}
    onUpdateScore={handleUpdateScore}
    updatingScore={updatingScore}
    message={message}
    error={error}
  />;
}
