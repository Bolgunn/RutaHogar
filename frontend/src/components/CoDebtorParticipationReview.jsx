import React, { useEffect, useRef, useState } from "react";
import { reviewCoDebtorParticipation, confirmCoDebtorParticipation, decideCoDebtorParticipation, listCoDebtorParticipations, runExclusive } from "../services/coDebtorService";
import { reviewForm, reviewCommand, REVIEW_FIELDS, CONTRACTS, CONTINUITIES, RELATION_LABELS, participationPath } from "../services/coDebtorReview";
import FormattedAmountInput from "./FormattedAmountInput";
import { formatFormValue } from "../constants";
import PublicShell from "./CoDebtorPageShell";

export function ParticipationFinancialForm({ review, form, onChange, acceptRelation, onAcceptRelation, consent, onConsent, busy, error, onSubmit, onDecline, onPersonal }) {
  const labels = ["Ingreso mensual (CLP)", "Deuda mensual (CLP)", "Tipo de contrato", "Continuidad laboral", "Morosidad actual"];
  const options = [null, null, CONTRACTS, CONTINUITIES, ["si", "no"]];
  return <form className="co-debtor-public-form" onSubmit={onSubmit} noValidate aria-busy={busy}>
    <h1>Revisa tus antecedentes</h1><p>Revisión vigente: {review.revision_number || "Aún sin confirmación"}.</p>
    <p>Confirmarás una copia para esta participación. Esto no modifica tu evaluación personal ni recalcula la evaluación del titular.</p>
    <p>{review.prefill_source === "participation" ? "Se muestran los antecedentes confirmados en esta participación." : review.prefill_source === "declared" ? "Se muestran los antecedentes declarados en esta invitación." : "Se usan tus datos propios disponibles y, en los campos restantes, lo declarado en esta invitación. Revisa todos los campos."}</p>
    {Object.keys(review.personal_prefill || {}).length > 0 && <button className="secondary-button compact-button" type="button" onClick={onPersonal} disabled={busy}>Usar mis datos propios disponibles</button>}
    <fieldset className="co-debtor-public-form__section"><legend>Antecedentes financieros</legend>
    <div className="co-debtor-public-form__grid">{REVIEW_FIELDS.map((field, i) => <div className="co-debtor-public-form__field pre-wizard-field" key={field}>
      <label className="pre-wizard-field-label" htmlFor={`hu30-${field}`}>{labels[i]}</label>
      {options[i] ? <select id={`hu30-${field}`} name={field} value={form[field]} onChange={event => onChange(field, event.target.value)} disabled={busy}>
        <option value="">Selecciona una opción</option>{options[i].map(value => <option key={value} value={value}>{formatFormValue(value)}</option>)}
      </select> : <><FormattedAmountInput id={`hu30-${field}`} name={field} value={form[field]} allowEmpty maxDigits={16}
        aria-describedby={`hu30-${field}-hint`} onChange={value => onChange(field, String(value))} disabled={busy} />
        <span className="pre-wizard-field-hint" id={`hu30-${field}-hint`}>{i === 0 ? "Ingreso líquido mensual en pesos chilenos." : "Suma de tus cuotas mensuales. Si no tienes deuda, ingresa 0."}</span></>}
    </div>)}</div></fieldset>
    <fieldset className="co-debtor-public-form__section"><legend>Relación con el titular</legend>
    <p>Relación declarada por el titular: <strong>{RELATION_LABELS[review.relation?.value] || "No disponible"}</strong>.</p>
    {review.relation?.initial_accepted_event_id && <p>Relación aceptada inicialmente: {RELATION_LABELS[review.relation.initial_accepted_value]}.
      {review.relation.initial_accepted_event_id !== review.relation.event_id && " El titular modificó posteriormente su declaración; se conserva tu aceptación original."}</p>}
    {!review.relation?.event_id && <p className="error-message" role="alert">El titular debe corregir o reemplazar la invitación para declarar la relación.</p>}
    {review.requires_relation_acceptance && <label className="co-debtor-public-form__consent"><input name="accept_relation" type="checkbox" checked={acceptRelation} onChange={event => onAcceptRelation(event.target.checked)} disabled={busy} /><span>Acepto la relación declarada por el titular</span></label>}
    </fieldset>
    <fieldset className="co-debtor-public-form__section"><legend>Consentimiento de participación</legend>
    <label className="co-debtor-public-form__consent"><input name="participation_consent" type="checkbox" checked={consent} onChange={event => onConsent(event.target.checked)} disabled={busy} /><span>Autorizo mi participación y el tratamiento de estos cinco antecedentes para esta participación en RutaHogar</span></label></fieldset>
    <div className="co-debtor-public-form__actions"><button className="primary-button" type="submit" disabled={busy || !review.relation?.event_id}>{busy ? "Confirmando…" : "Confirmar mis antecedentes"}</button>
    {review.status === "pending" && <button className="secondary-button" type="button" onClick={onDecline} disabled={busy}>No acepto la relación: rechazar participación</button>}</div>
    {error && <p className="error-message co-debtor-public-form__feedback" role="alert">{error}</p>}
    <p>Los resultados de RutaHogar son referenciales y no constituyen aprobación de crédito.</p>
  </form>;
}

export default function CoDebtorParticipationReview({ participationId, onAccessError, onConfirmed }) {
  const [review, setReview] = useState(null);
  const [form, setForm] = useState(() => reviewForm());
  const [acceptRelation, setAcceptRelation] = useState(false);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const lock = useRef(null), pending = useRef(null);
  // Editing a confirmed participation is a user intent, never inferred from a read.
  const editing = useRef(false), operation = useRef(0), backgroundRead = useRef(0);
  const scope = useRef(null);
  const isCurrent = requestScope => requestScope?.active && scope.current === requestScope;
  const busy = phase === "sending";
  const applyReview = data => {
    setReview(data); setAcceptRelation(false); setConsent(false); setRevisionConflict(false); setError("");
    if (data.status === "confirmed" && !editing.current) {
      if (!Number.isInteger(data.revision_number) || data.revision_number < 1) throw new Error("Invalid confirmed revision");
      setForm(reviewForm());
      setResult({ revision_number: data.revision_number, matches_evaluated: data.matches_evaluated });
      setPhase("success");
    } else {
      setResult(null); setForm(reviewForm(data.values)); setPhase("ready");
    }
  };
  const fail = failure => {
    if (failure.status === 401 || failure.status === 403) { setReview(null); setForm(reviewForm()); onAccessError(failure.status); return; }
    if (failure.payload?.code === "invitation_unavailable") { setReview(null); setForm(reviewForm()); setPhase("closed"); return; }
    if (failure.status === 409) setRevisionConflict(true);
    setError(failure.status === 409 ? "Los antecedentes o la relación cambiaron. Vuelve a cargar y revisa antes de confirmar." : "No pudimos completar la operación. Puedes reintentar el mismo envío sin duplicarlo.");
  };
  const load = async () => {
    const requestScope = scope.current;
    if (!isCurrent(requestScope)) return;
    const revision = ++operation.current;
    setPhase("loading"); setResult(null); setError(""); setRevisionConflict(false); pending.current = null;
    try {
      const data = await reviewCoDebtorParticipation(participationId);
      if (!isCurrent(requestScope) || revision !== operation.current) return;
      applyReview(data);
    } catch (failure) { if (isCurrent(requestScope) && revision === operation.current) { setPhase("error"); fail(failure); } }
  };
  useEffect(() => { let active = true;
    const requestScope = { active: true }; scope.current = requestScope;
    reviewCoDebtorParticipation(participationId).then(data => {
      if (!active) return;
      applyReview(data);
    }).catch(failure => { if (active) { setPhase("error"); fail(failure); } });
    return () => { active = false; requestScope.active = false; };
  }, [participationId]);
  useEffect(() => {
    if (!["ready", "success"].includes(phase)) return;
    let active = true;
    const check = async () => {
      const revision = operation.current;
      const request = ++backgroundRead.current;
      try {
        const current = await reviewCoDebtorParticipation(participationId);
        if (!active || revision !== operation.current || request !== backgroundRead.current) return;
        // Never replace an edited draft during background revalidation.
        if (phase === "ready" && current.status === "confirmed" && !editing.current) applyReview(current);
        else if (phase === "ready" && (current.revision_number !== review?.revision_number || current.relation?.event_id !== review?.relation?.event_id)) setRevisionConflict(true);
        if (phase === "success") {
          setReview(current);
          setResult(previous => ({ ...(previous?.revision_number === current.revision_number ? previous : {}), revision_number: current.revision_number, matches_evaluated: current.matches_evaluated }));
        }
      } catch (failure) { if (active && revision === operation.current && request === backgroundRead.current) fail(failure); }
    };
    window.addEventListener("focus", check);
    const remaining = new Date(review?.expires_at).getTime() - Date.now();
    const timer = window.setInterval(check, Number.isFinite(remaining) && remaining > 0 ? Math.min(30000, remaining) : 30000);
    return () => { active = false; window.removeEventListener("focus", check); window.clearInterval(timer); };
  }, [phase, participationId, review]);
  const submit = event => {
    event.preventDefault(); if (lock.current || revisionConflict) return;
    let command;
    try { command = reviewCommand(review, form, acceptRelation, consent); }
    catch (failure) { setError(failure.message); return; }
    operation.current++;
    const fingerprint = JSON.stringify(command);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, command: { ...command, request_id: crypto.randomUUID() } };
    setPhase("sending"); setError("");
    const requestScope = scope.current;
    return runExclusive(lock, async () => {
      if (!isCurrent(requestScope)) return;
      try { const saved = await confirmCoDebtorParticipation(participationId, pending.current.command);
        if (!isCurrent(requestScope)) return;
        editing.current = false;
        setResult(saved); setPhase("success"); setConsent(false); onConfirmed(participationId);
      } catch (failure) { if (isCurrent(requestScope)) { setPhase("ready"); fail(failure); } }
    });
  };
  const decision = decision => {
    if (lock.current) return;
    operation.current++;
    setPhase("sending"); setError("");
    const requestScope = scope.current;
    return runExclusive(lock, async () => {
      if (!isCurrent(requestScope)) return;
      try { await decideCoDebtorParticipation(participationId, decision); if (!isCurrent(requestScope)) return; setReview(null); setForm(reviewForm()); setPhase("closed"); }
      catch (failure) { if (isCurrent(requestScope)) { setPhase(result ? "success" : "ready"); fail(failure); } }
    });
  };
  return <PublicShell><section className="co-debtor-public-card">
    {phase === "loading" && <><h1>Tu participación como co-deudor</h1><p role="status">Cargando antecedentes autorizados…</p></>}
    {phase === "closed" && <><h1>Participación cerrada</h1><p role="status">La participación está cerrada. Si rechazaste la relación, el titular debe corregir o reemplazar la invitación.</p></>}
    {phase === "error" && <><p className="error-message" role="alert">{error}</p><button className="secondary-button" onClick={load}>Reintentar lectura</button></>}
    {phase === "success" && <><h1>Antecedentes confirmados</h1><p role="status">Registramos la revisión {result.revision_number}. No recalculamos la evaluación del titular.</p>
      {result.matches_evaluated === true ? <p>Antecedentes coincidentes confirmados posteriormente. No hay cambios financieros que incorporar.</p> : <p>El titular podrá incorporar estos antecedentes mediante su actualización explícita.</p>}
      {result.matches_previous === true && <p>Los cinco datos coinciden con la revisión anterior; se conserva la nueva confirmación y su consentimiento.</p>}
      <div className="co-debtor-public-form__actions"><button className="primary-button" onClick={() => { editing.current = true; load(); }}>Revisar para una nueva confirmación</button></div></>}
    {review && !result && ["ready", "sending"].includes(phase) && <ParticipationFinancialForm review={review} form={form} onChange={(key, value) => setForm(old => ({ ...old, [key]: value }))}
      acceptRelation={acceptRelation} onAcceptRelation={setAcceptRelation} consent={consent} onConsent={setConsent} busy={busy || revisionConflict} error={error}
      onSubmit={submit} onDecline={() => decision("decline")} onPersonal={() => setForm(old => ({ ...old, ...reviewForm({ ...old, ...review.personal_prefill }) }))} />}
    {revisionConflict && <p role="alert">Cambió la revisión o la relación. <button className="secondary-button compact-button" onClick={load}>Volver a cargar y revisar</button></p>}
    {(review?.status === "confirmed" || phase === "success") && <div>
      {!confirmRevoke ? <button className="danger-button" onClick={() => setConfirmRevoke(true)} disabled={busy}>Revocar mi participación</button> : <div className="co-debtor-public-revoke-confirm" role="alert">
        <strong>¿Quieres revocar tu participación?</strong><p>Tus antecedentes dejarán de utilizarse en evaluaciones futuras. Las evaluaciones históricas se conservan.</p>
        <div><button className="secondary-button" onClick={() => setConfirmRevoke(false)} disabled={busy}>Cancelar</button>
        <button className="danger-button" onClick={() => decision("revoke")} disabled={busy} aria-busy={busy}>{busy ? "Revocando…" : "Confirmar revocación"}</button></div></div>}
    </div>}
    <a href="/co-deudor/invitacion?participaciones=1">Mis participaciones</a>
  </section></PublicShell>;
}

export function CoDebtorParticipationList() {
  const [rows, setRows] = useState(null), [error, setError] = useState("");
  const load = () => listCoDebtorParticipations().then(data => setRows(data.items || [])).catch(() => setError("No pudimos cargar tus participaciones."));
  useEffect(() => { load(); }, []);
  const labels = { pending: "Pendiente de confirmación", confirmed: "Confirmada", replaced: "Reemplazada", revoked: "Revocada", declined: "Rechazada", expired: "Expirada" };
  return <PublicShell><section className="co-debtor-public-card"><a href="/">← Volver</a><h1>Mis participaciones</h1><p>Revisa el estado de tus participaciones y administra tu consentimiento.</p>{error && <p className="error-message" role="alert">{error}</p>}
    {rows === null ? <p role="status">Cargando…</p> : rows.length === 0 ? <p>No tienes participaciones vinculadas.</p> : rows.map((row, i) => <section className="hu30-participation" key={row.participation_id}>
      <h2><a href={participationPath(row.participation_id)}>Participación {i + 1}</a></h2><p className="status-pill">{labels[row.status] || "Estado no disponible"}</p>
      {row.created_at && Number.isFinite(Date.parse(row.created_at)) && <p>Creada el <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString("es-CL")}</time></p>}
      {["confirmed", "replaced"].includes(row.status) && <button onClick={async () => {
        try { await decideCoDebtorParticipation(row.participation_id, "revoke"); await load(); } catch { setError("No pudimos revocar la participación."); }
      }} className="danger-button compact-button">Revocar esta participación</button>}
    </section>)}
  </section></PublicShell>;
}
