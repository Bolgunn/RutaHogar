import React, { useEffect, useRef, useState } from "react";

import { formatFormValue } from "../constants";
import { createCoDebtorInvitation, getLeadCoDebtorInvitation, runExclusive } from "../services/coDebtorService";
import { updateScoreWithConfirmedCoDebtor } from "../services/trackingService";
import { formatClp } from "../utils/helpers";
import { formatChileanRutInput } from "../utils/chileanRut";

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
    delivery_failed: "Invitación no enviada",
    confirmed: "Co-deudor confirmado",
    revoked: "Consentimiento revocado",
    declined: "Participación rechazada",
  }[status] || "Sin invitación";
}

function dateLabel(value) {
  if (!value) return "Sin fecha disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha disponible"
    : date.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

export function InvitationForm({ email, rut, onEmailChange, onRutChange, onSubmit, onCancel, busy, status }) {
  const replacement = ["pending", "expired", "revoked", "declined", "delivery_failed"].includes(status);
  return <form className="co-debtor-section__form" onSubmit={onSubmit} noValidate>
    <label htmlFor="co-debtor-recipient-rut">RUT del co-deudor</label>
    <input id="co-debtor-recipient-rut" name="co-debtor-recipient-rut" type="text" autoComplete="off" value={formatChileanRutInput(rut)} onChange={(event) => onRutChange(formatChileanRutInput(event.target.value))} placeholder="Ej: 12.345.678-5" disabled={busy} />
    <label htmlFor="co-debtor-recipient-email">Correo del co-deudor</label>
    <div className="co-debtor-section__form-row">
      <input id="co-debtor-recipient-email" name="co-debtor-recipient-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} disabled={busy} />
      <button className="secondary-button compact-button" type="submit" disabled={busy}>{busy ? "Enviando..." : replacement ? "Enviar nueva invitación" : "Enviar invitación"}</button>
    </div>
    {onCancel && <button className="text-button" type="button" onClick={onCancel} disabled={busy}>Cerrar</button>}
  </form>;
}

function ResendControls({ invitation, invitationBusy, onResend, onEditInvitation, onCancelEditInvitation, editingInvitation, formProps }) {
  if (!invitation?.recipientRut) return <InvitationForm {...formProps} />;
  return <>
    <button type="button" className="secondary-button compact-button" onClick={onResend} disabled={invitationBusy}>{invitationBusy ? "Enviando..." : "Reenviar invitación"}</button>
    {!editingInvitation && <button type="button" className="text-button" onClick={onEditInvitation}>Corregir datos</button>}
    {editingInvitation && <InvitationForm {...formProps} onCancel={onCancelEditInvitation} />}
  </>;
}

export function CoDebtorPanel({ invitation, declaredComplement, declaredRelation, email, rut, onEmailChange, onRutChange, onInvite, onResend, onEditInvitation, onCancelEditInvitation, editingInvitation = false, invitationBusy = false, onUpdateScore, updatingScore = false, scoreUpdateRequired = false, message = "", error = "" }) {
  if (!invitation) return null;
  const status = invitation?.status || "none";
  if (status === "none") return null;
  const isConfirmed = status === "confirmed" && confirmedFields.every(([field]) => invitation?.confirmation?.[field] !== undefined && invitation.confirmation[field] !== null && invitation.confirmation[field] !== "");
  const formProps = { email, rut, onEmailChange, onRutChange, onSubmit: onInvite, busy: invitationBusy, status };

  return <section className="co-debtor-section" aria-labelledby="co-debtor-section-title">
    <header className="co-debtor-section__header"><div><span className="eyebrow">Complemento de renta</span><h2 id="co-debtor-section-title">Co-deudor</h2></div><span className={`co-debtor-section__status co-debtor-section__status--${status}`}>{invitationStatusLabel(status)}</span></header>

    {status === "pending" && <><p>Invitación enviada a <strong>{invitation.recipientEmail}</strong>. Expira el {dateLabel(invitation.expiresAt)}.</p><p className="co-debtor-section__note">Tu score actual sigue usando los datos que declaraste. Este complemento está <strong>No confirmado</strong>.</p>{!editingInvitation && <button type="button" className="text-button" onClick={onEditInvitation}>Reemplazar invitación</button>}{editingInvitation && <InvitationForm {...formProps} onCancel={onCancelEditInvitation} />}</>}
    {status === "expired" && <><p>La invitación para <strong>{invitation.recipientEmail}</strong> expiró. Tu evaluación continúa usando el complemento declarado como <strong>No confirmado</strong>.</p><ResendControls invitation={invitation} invitationBusy={invitationBusy} onResend={onResend} onEditInvitation={onEditInvitation} onCancelEditInvitation={onCancelEditInvitation} editingInvitation={editingInvitation} formProps={formProps} /></>}
    {status === "delivery_failed" && <><p>Tu precalificación se realizó, pero no pudimos enviar la invitación a <strong>{invitation.recipientEmail}</strong>.</p><p className="co-debtor-section__note">Puedes reintentarlo sin volver a completar tu precalificación.</p><ResendControls invitation={invitation} invitationBusy={invitationBusy} onResend={onResend} onEditInvitation={onEditInvitation} onCancelEditInvitation={onCancelEditInvitation} editingInvitation={editingInvitation} formProps={formProps} /></>}
    {isConfirmed && <><p>Los antecedentes aportados por el co-deudor prevalecerán sobre los que declaraste al actualizar tu score.</p><dl className="co-debtor-section__details">{confirmedFields.map(([field, label, formatter]) => <div key={field}><dt>{label}</dt><dd>{formatter(invitation.confirmation[field])}</dd></div>)}<div><dt>Relación</dt><dd>{formatFormValue(declaredRelation)}</dd></div></dl><p className="co-debtor-section__note">La relación es información declarada por ti.</p>{scoreUpdateRequired && <button type="button" className="primary-button co-debtor-section__update" onClick={onUpdateScore} disabled={updatingScore}>{updatingScore ? "Actualizando score..." : "Actualizar score con datos confirmados"}</button>}</>}
    {status === "confirmed" && !isConfirmed && <p>No pudimos verificar los antecedentes confirmados. Actualiza la página antes de continuar.</p>}
    {status === "revoked" && <><p>El co-deudor revocó su consentimiento. Sus antecedentes dejarán de utilizarse en futuras evaluaciones.</p><p className="co-debtor-section__note">Tus evaluaciones históricas siguen disponibles y no se modifican.</p><ResendControls invitation={invitation} invitationBusy={invitationBusy} onResend={onResend} onEditInvitation={onEditInvitation} onCancelEditInvitation={onCancelEditInvitation} editingInvitation={editingInvitation} formProps={formProps} /></>}
    {status === "declined" && <><p>El co-deudor no autorizó el uso de sus datos. Este complemento de renta no se utilizará.</p><InvitationForm {...formProps} /></>}
    {message && <p className="success-message co-debtor-section__feedback" role="status">{message}</p>}
    {error && <p className="error-message co-debtor-section__feedback" role="alert">{error}</p>}
  </section>;
}

export default function CoDebtorSection({ evaluation, trackingState, onScoreUpdated }) {
  const evaluationId = evaluation?.id || null;
  const declaredComplement = Boolean(evaluation?.input?.complemento_renta);
  const declaredComplementValues = {
    ingreso_mensual_complementario: evaluation?.input?.ingreso_mensual_complementario,
    deuda_mensual_complementario: evaluation?.input?.deuda_mensual_complementario,
    tipo_contrato_complementario: evaluation?.input?.tipo_contrato_complementario,
    continuidad_laboral_complementario: evaluation?.input?.continuidad_laboral_complementario,
    morosidad_complementario: evaluation?.input?.morosidad_complementario,
  };
  const declaredRelation = evaluation?.input?.relacion_complementario;
  const [invitation, setInvitation] = useState(null);
  const [email, setEmail] = useState("");
  const [rut, setRut] = useState("");
  const [editingInvitation, setEditingInvitation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedEvaluationId, setLoadedEvaluationId] = useState(null);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [updatingScore, setUpdatingScore] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const updateLock = useRef(null);
  const scoreUpdateRequired = trackingState?.co_debtor?.score_update_required === true;

  const rememberInvitation = (next) => {
    setInvitation(next);
    setEmail(next?.recipientEmail || "");
    setRut(next?.recipientRut || "");
    return next;
  };
  const refreshInvitation = async () => rememberInvitation(await getLeadCoDebtorInvitation());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    getLeadCoDebtorInvitation().then((next) => { if (active) { rememberInvitation(next); setLoadedEvaluationId(evaluationId); } }).catch(() => { if (active) setError("No pudimos cargar el estado del co-deudor. Intenta nuevamente."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [evaluationId]);

  const sendInvitation = async (recipientEmail, recipientRut) => {
    const declaredValues = invitation?.declaredComplement || declaredComplementValues;
    const sent = await createCoDebtorInvitation(recipientEmail, recipientRut, declaredValues);
    rememberInvitation(pendingInvitationFromSend(recipientEmail, recipientRut, sent, declaredValues));
    setEditingInvitation(false);
    setMessage("Enviamos la invitación por correo. Quedará pendiente hasta que el co-deudor complete sus antecedentes.");
  };
  const withInvitationRequest = async (task) => {
    if (invitationBusy) return;
    setInvitationBusy(true); setMessage(""); setError("");
    try { await task(); } catch (failure) { setError(failure.message || "No se pudo enviar la invitación. Intenta nuevamente."); } finally { setInvitationBusy(false); }
  };
  const handleInvite = (event) => { event.preventDefault(); return withInvitationRequest(() => sendInvitation(email, rut)); };
  const handleResend = () => withInvitationRequest(() => sendInvitation(invitation.recipientEmail, invitation.recipientRut));
  const handleEditInvitation = () => { setEmail(invitation?.recipientEmail || ""); setRut(invitation?.recipientRut || ""); setEditingInvitation(true); };
  const handleCancelEditInvitation = () => { setEmail(invitation?.recipientEmail || ""); setRut(invitation?.recipientRut || ""); setEditingInvitation(false); };

  const handleUpdateScore = () => {
    if (updateLock.current) return;
    setUpdatingScore(true); setMessage(""); setError("");
    return runExclusive(updateLock, async () => {
      try {
        await updateScoreWithConfirmedCoDebtor();
        try { await onScoreUpdated?.(); await refreshInvitation(); setMessage("Actualizamos tu score con los antecedentes confirmados."); } catch { setMessage("Se creó una nueva evaluación con los antecedentes confirmados. Recarga la página para actualizar tu vista."); }
      } catch (failure) {
        if (failure?.code === "co_debtor_consent_revoked") { setInvitation((current) => current && { ...current, status: "revoked", confirmation: null }); try { await refreshInvitation(); } catch { /* Safe local state hides confirmed values. */ } }
        setError(failure.message || "No se pudo actualizar tu score. Intenta nuevamente.");
      } finally { setUpdatingScore(false); }
    });
  };

  if (loading || loadedEvaluationId !== evaluationId) return declaredComplement ? <section className="co-debtor-section" aria-live="polite"><p>Cargando el estado del co-deudor...</p></section> : null;
  return <CoDebtorPanel invitation={invitation} declaredComplement={declaredComplement} declaredRelation={declaredRelation} email={email} rut={rut} onEmailChange={setEmail} onRutChange={setRut} onInvite={handleInvite} onResend={handleResend} onEditInvitation={handleEditInvitation} onCancelEditInvitation={handleCancelEditInvitation} editingInvitation={editingInvitation} invitationBusy={invitationBusy} onUpdateScore={handleUpdateScore} updatingScore={updatingScore} scoreUpdateRequired={scoreUpdateRequired} message={message} error={error} />;
}

export function pendingInvitationFromSend(recipientEmail, recipientRut, sent, declaredComplement) {
  return {
    recipientEmail: recipientEmail.trim().toLowerCase(), recipientRut, status: "pending",
    expiresAt: sent.expires_at, declaredComplement, confirmation: null,
  };
}
