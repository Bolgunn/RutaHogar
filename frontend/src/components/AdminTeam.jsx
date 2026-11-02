import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useModalFocus from "./useModalFocus";
import "./admin-management.css";
import "./admin-team.css";
import { createExecutive, resendExecutiveInvitation } from "../services/executiveService";
import { assignExecutive, getInmobiliarias, unassignExecutive } from "../services/projectService";
import { emailPattern } from "../services/projectValidation";
import {
  getTeam,
  getTeamHistory,
  setTeamMemberAccess,
  setTeamMemberRole,
  updateTeamMember,
} from "../services/teamService";
import { isGlobalAdmin } from "../lib/roles";
import {
  filterMembers,
  formatDate,
  formatDateTime,
  historyIcon,
  initials,
  inviteToast,
  LOCK_MESSAGES,
  projectsLeftUncovered,
  ROLE_LABELS,
  STATUS_LABELS,
  statusCounts,
  statusLine,
} from "../lib/teamView";

function ModalHeader({ title, text, onClose }) {
  return (
    <div className="admin-modal-header">
      <div className="admin-modal-heading">
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </div>
      <button type="button" className="secondary-button compact-button" onClick={onClose}>Cerrar</button>
    </div>
  );
}

function MemberName({ member }) {
  return <>{member.nombre || member.email}{member.es_propio ? <span className="eq-you">Tú</span> : null}</>;
}

function StatusBadge({ estado }) {
  return <span className={`eq-state eq-state--${estado}`}>{STATUS_LABELS[estado]}</span>;
}

function MembersTable({ members, onOpen }) {
  if (!members.length) {
    return (
      <div className="eq-empty">
        <i className="ti ti-user-search" aria-hidden="true" />
        <strong>Sin resultados</strong>
        <p>Prueba con otro nombre o limpia el filtro.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="eq-table">
        <thead>
          <tr>
            <th>Persona</th><th>Función</th><th>Estado</th><th>Proyectos</th><th>Último ingreso</th>
            <th><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className={member.estado === "desactivado" ? "is-off" : ""}>
              <td className="eq-td-person">
                <div className="eq-person">
                  <span className="eq-avatar" aria-hidden="true">{initials(member.nombre || member.email)}</span>
                  <div>
                    <strong><MemberName member={member} /></strong>
                    <small>{member.email}</small>
                  </div>
                </div>
              </td>
              <td data-label="Función">{ROLE_LABELS[member.rol]}</td>
              <td data-label="Estado">
                <div>
                  <StatusBadge estado={member.estado} />
                  {member.estado === "invitado" && member.correo_fallido ? (
                    <span className="eq-state-note"><i className="ti ti-mail-off" aria-hidden="true" />Correo no enviado</span>
                  ) : null}
                </div>
              </td>
              <td data-label="Proyectos" className="eq-projects">
                {member.proyectos.length ? (
                  <><strong>{member.proyectos.length}</strong> · {member.proyectos.map((project) => project.nombre).join(", ")}</>
                ) : "Sin proyectos"}
              </td>
              <td data-label="Último ingreso" className="eq-projects">
                {member.ultimo_ingreso ? formatDate(member.ultimo_ingreso) : "Nunca"}
              </td>
              <td className="eq-actions">
                <button type="button" className="secondary-button compact-button" onClick={() => onOpen(member.id)}>Gestionar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryPanel({ members, memberFilter, onFilter, entries, nextCursor, loading, error, onMore }) {
  return (
    <section className="admin-surface">
      <div className="eq-history-filter">
        <label htmlFor="history-member">Ver cambios de</label>
        <select id="history-member" value={memberFilter} onChange={(event) => onFilter(event.target.value)}>
          <option value="">Todo el equipo</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.nombre || member.email}</option>)}
        </select>
      </div>
      {error ? <div className="error-message" role="alert">{error}</div> : null}
      {entries.length ? (
        <ol className="eq-history">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="eq-history__icon"><i className={`ti ti-${historyIcon(entry)}`} aria-hidden="true" /></span>
              <div>
                <p>
                  <strong>{entry.actor_nombre}</strong>{" "}
                  {entry.segmentos.map((part, index) => (part.destacado
                    ? <strong key={index}>{part.texto}</strong>
                    : <React.Fragment key={index}>{part.texto}</React.Fragment>))}
                </p>
                {entry.origen ? <small>{entry.origen}</small> : null}
              </div>
              <time dateTime={entry.ocurrido_en}>{formatDateTime(entry.ocurrido_en)}</time>
            </li>
          ))}
        </ol>
      ) : !loading && !error ? (
        <div className="eq-empty">
          <i className="ti ti-history" aria-hidden="true" />
          <strong>Sin cambios registrados</strong>
        </div>
      ) : null}
      {nextCursor !== null ? (
        <button type="button" className="eq-link" onClick={onMore} disabled={loading}>Ver más</button>
      ) : null}
    </section>
  );
}

function MemberModal({ member, projects, error, busy, onClose, onSave, onResend, onRole, onAssign, onUnassign, onDeactivate, onReactivate, onRetryAccess, onHistory }) {
  const [nombre, setNombre] = useState(member.nombre || "");
  const [telefono, setTelefono] = useState(member.telefono || "");
  const assigned = new Set(member.proyectos.map((project) => project.id));
  const free = projects.filter((project) => !assigned.has(project.id));
  const [project, setProject] = useState("");
  const selected = free.some((item) => item.id === project) ? project : free[0]?.id || "";
  const reason = LOCK_MESSAGES[member.bloqueo] || "";
  const off = member.estado === "desactivado";
  const failed = member.estado === "invitado" && member.correo_fallido;

  const roleCard = (rol, text) => {
    const active = rol === "admin_inmobiliario" ? member.rol !== "ejecutivo" : member.rol === rol;
    return (
      <button type="button" className={`eq-role ${active ? "is-active" : ""}`} aria-pressed={active} disabled={Boolean(reason) || off || busy} onClick={() => onRole(rol)}>
        <strong>{ROLE_LABELS[rol]}</strong>
        <span>{text}</span>
      </button>
    );
  };

  return (
    <>
      <ModalHeader title={<MemberName member={member} />} text={<><StatusBadge estado={member.estado} /> {statusLine(member)}</>} onClose={onClose} />
      <div className="admin-modal-body">
        <div className="eq-modal-sections">
          {error ? <div className="error-message" role="alert">{error}</div> : null}
          <section className="eq-block">
            <h3>Datos</h3>
            <div className="eq-fields">
              <label className="eq-field">Nombre completo<input value={nombre} maxLength={160} onChange={(event) => setNombre(event.target.value)} /></label>
              <label className="eq-field">Teléfono<input value={telefono} maxLength={20} placeholder="+56 9 ..." onChange={(event) => setTelefono(event.target.value)} /></label>
              <label className="eq-field eq-field--wide">Correo<input value={member.email} readOnly /></label>
            </div>
            <div className="eq-row-end">
              <span />
              <button type="button" className="secondary-button compact-button" disabled={busy} onClick={() => onSave(nombre, telefono)}>Guardar datos</button>
            </div>
          </section>

          {member.estado === "invitado" ? (
            <section className="eq-block">
              <h3>Invitación</h3>
              {failed ? (
                <div className="eq-alert eq-alert--danger eq-alert--modal">
                  <i className="ti ti-mail-off" aria-hidden="true" />
                  <span>No pudimos enviar el correo. Revisa la dirección y reenvía la invitación.</span>
                </div>
              ) : null}
              <div className="eq-row-end">
                <span>{failed ? "La cuenta ya está creada, pero aún no recibe el enlace." : "Si el enlace venció, reenvía la invitación para enviar uno nuevo."}</span>
                <button type="button" className="secondary-button compact-button" disabled={busy} onClick={onResend}>Reenviar invitación</button>
              </div>
            </section>
          ) : null}

          <section className="eq-block">
            <h3>Función</h3>
            {reason ? null : <p>Define qué puede hacer en RutaHogar.</p>}
            <div className="eq-roles">
              {roleCard("ejecutivo", "Gestiona leads de sus proyectos asignados.")}
              {roleCard("admin_inmobiliario", "Además administra el equipo, los proyectos y la priorización.")}
            </div>
          </section>

          <section className="eq-block">
            <h3>Proyectos</h3>
            {member.proyectos.length ? (
              <ul className="eq-assigned">
                {member.proyectos.map((item) => (
                  <li key={item.id}>
                    {item.nombre}
                    <button type="button" className="eq-link eq-link--danger" aria-label={`Quitar ${item.nombre}`} disabled={busy} onClick={() => onUnassign(item.id)}>Quitar</button>
                  </li>
                ))}
              </ul>
            ) : <p>Sin proyectos asignados.</p>}
            {off ? <p>Reactiva a esta persona para asignarle proyectos.</p> : free.length ? (
              <div className="eq-assign-row">
                <select aria-label="Proyecto para asignar" value={selected} onChange={(event) => setProject(event.target.value)}>
                  {free.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
                <button type="button" className="secondary-button compact-button" disabled={busy} onClick={() => onAssign(selected)}>Asignar</button>
              </div>
            ) : null}
          </section>

          <section className="eq-block">
            <h3>Acceso</h3>
            {member.acceso_pendiente && !member.es_propio ? (
              <div className="eq-alert eq-alert--danger eq-alert--modal">
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                <span>El último cambio de acceso quedó incompleto.</span>
                <button type="button" className="secondary-button compact-button" disabled={busy} onClick={onRetryAccess}>Reintentar</button>
              </div>
            ) : null}
            {reason ? (
              <div className="eq-alert eq-alert--info eq-alert--modal">
                <i className="ti ti-lock" aria-hidden="true" />
                <span>{reason}</span>
              </div>
            ) : off ? (
              <div className="eq-row-end">
                <span>Volverá a entrar con su contraseña. Sus proyectos anteriores no se recuperan.</span>
                <button type="button" disabled={busy} onClick={onReactivate}>Reactivar acceso</button>
              </div>
            ) : (
              <div className="eq-row-end">
                <span>Pierde el acceso de inmediato y se retira de sus proyectos.</span>
                <button type="button" className="danger-button" disabled={busy} onClick={onDeactivate}>Desactivar acceso</button>
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="admin-modal-footer">
        <button type="button" className="eq-link" onClick={onHistory}>Ver historial de esta persona</button>
      </div>
    </>
  );
}

function DeactivateModal({ member, members, error, busy, onClose, onBack, onConfirm }) {
  const orphaned = projectsLeftUncovered(member, members).map((project) => project.nombre);
  const names = member.proyectos.map((project) => project.nombre).join(", ");
  return (
    <>
      <ModalHeader title={`¿Desactivar a ${member.nombre || member.email}?`} onClose={onClose} />
      <div className="admin-modal-body">
        <div className="eq-modal-sections">
          {error ? <div className="error-message" role="alert">{error}</div> : null}
          <ul className="eq-effects">
            <li><i className="ti ti-lock" aria-hidden="true" /><span>Pierde el acceso a RutaHogar de inmediato.</span></li>
            {member.proyectos.length ? (
              <li>
                <i className="ti ti-building" aria-hidden="true" />
                <span>Se retira de {member.proyectos.length === 1 ? "este proyecto" : `estos ${member.proyectos.length} proyectos`}: <strong>{names}</strong>.</span>
              </li>
            ) : null}
            <li><i className="ti ti-history" aria-hidden="true" /><span>Su historial se conserva. Si reactivas este acceso, deberás asignarle los proyectos de nuevo.</span></li>
          </ul>
          {orphaned.length ? (
            <div className="eq-alert eq-alert--danger eq-alert--modal">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              <span><strong>{orphaned.join(", ")}</strong> {orphaned.length === 1 ? "quedará" : "quedarán"} sin ejecutivo activo.</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="admin-modal-footer">
        <button type="button" className="secondary-button" onClick={onBack}>Cancelar</button>
        <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>Desactivar acceso</button>
      </div>
    </>
  );
}

function InviteModal({ projects, error, busy, onClose, onSend }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  return (
    <>
      <ModalHeader title="Invitar ejecutivo" text="Recibirá un correo para definir su contraseña. Entra como Ejecutivo y luego puedes cambiar su función." onClose={onClose} />
      <div className="admin-modal-body">
        <div className="eq-modal-sections">
          {error ? <div className="error-message" role="alert">{error}</div> : null}
          <div className="eq-fields">
            <label className="eq-field">Nombre completo<input value={nombre} maxLength={160} placeholder="Ej: Ana Soto" onChange={(event) => setNombre(event.target.value)} /></label>
            <label className="eq-field">Teléfono (opcional)<input value={telefono} maxLength={20} placeholder="+56 9 ..." onChange={(event) => setTelefono(event.target.value)} /></label>
            <label className="eq-field eq-field--wide">Correo<input type="email" value={email} placeholder="nombre@empresa.cl" onChange={(event) => setEmail(event.target.value)} /></label>
          </div>
          {projects.length ? (
            <section className="eq-block">
              <h3>Proyectos (opcional)</h3>
              {projects.map((project) => (
                <label className="eq-check" key={project.id}>
                  <input type="checkbox" checked={selected.includes(project.id)} onChange={() => toggle(project.id)} />
                  {project.nombre}
                </label>
              ))}
            </section>
          ) : null}
        </div>
      </div>
      <div className="admin-modal-footer">
        <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
        <button type="button" disabled={busy} onClick={() => onSend({ nombre, telefono, email, proyectos: selected })}>Enviar invitación</button>
      </div>
    </>
  );
}

export default function AdminTeam({ profile, inmobiliariaId }) {
  const globalAdmin = isGlobalAdmin(profile?.role, inmobiliariaId);
  const [inmobiliarias, setInmobiliarias] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [team, setTeam] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("miembros");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [historyMember, setHistoryMember] = useState("");
  const [history, setHistory] = useState({ items: [], next_cursor: null, loading: false, error: "" });
  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const cardRef = useRef(null);
  // Sólo la última petición pinta: una respuesta lenta no reemplaza a la inmobiliaria elegida después.
  const teamRequest = useRef(0);
  const historyRequest = useRef(0);

  // Solo el admin global declara la inmobiliaria: a los demás se la resuelve el backend.
  const tenantParam = globalAdmin ? selectedTenant : undefined;
  const tenantId = globalAdmin ? selectedTenant : inmobiliariaId;
  const ready = !globalAdmin || Boolean(selectedTenant);

  const closeModal = useCallback(() => { setModal(null); setModalError(""); }, []);
  useModalFocus(Boolean(modal), closeModal);
  useEffect(() => { if (modal) cardRef.current?.focus({ preventScroll: true }); }, [modal?.kind]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const loadTeam = useCallback(async () => {
    const request = ++teamRequest.current;
    if (!ready) { setTeam(null); return; }
    setLoadError("");
    try {
      const data = await getTeam(tenantParam);
      if (request === teamRequest.current) setTeam(data);
    } catch (error) {
      if (request === teamRequest.current) setLoadError(error.message || "No se pudo cargar el equipo.");
    }
  }, [ready, tenantParam]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  useEffect(() => {
    if (!globalAdmin) return;
    getInmobiliarias().then(setInmobiliarias).catch((error) => setLoadError(error.message || "No se pudieron cargar las inmobiliarias."));
  }, [globalAdmin]);

  const loadHistory = useCallback(async (cursor = 0) => {
    const request = ++historyRequest.current;
    setHistory((current) => ({ ...current, loading: true, error: "" }));
    try {
      const page = await getTeamHistory(tenantParam, { miembroId: historyMember, cursor });
      if (request !== historyRequest.current) return;
      setHistory((current) => ({
        items: cursor ? [...current.items, ...page.items] : page.items,
        next_cursor: page.next_cursor,
        loading: false,
        error: "",
      }));
    } catch (error) {
      if (request !== historyRequest.current) return;
      setHistory((current) => ({ ...current, loading: false, error: error.message || "No se pudo cargar el historial." }));
    }
  }, [tenantParam, historyMember]);

  useEffect(() => { if (ready && tab === "historial") loadHistory(); }, [ready, tab, loadHistory]);

  const members = team?.miembros || [];
  const projects = team?.proyectos || [];
  const gaps = (team?.proyectos_sin_ejecutivo || []).map((project) => project.nombre);
  const openMember = modal?.id ? members.find((member) => member.id === modal.id) : null;
  const counts = statusCounts(members);

  // Mantiene el pop-up abierto y muestra el rechazo dentro de él.
  const run = async (action, { success, after } = {}) => {
    setBusy(true);
    setModalError("");
    try {
      const result = await action();
      await loadTeam();
      if (after) after(result);
      if (success) showToast(typeof success === "function" ? success(result) : success);
    } catch (error) {
      await loadTeam();
      setModalError(error.message || "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async ({ nombre, telefono, email, proyectos }) => {
    const name = nombre.trim();
    const correo = email.trim().toLowerCase();
    if (!name) { setModalError("Ingresa el nombre."); return; }
    if (!emailPattern.test(correo)) { setModalError("Ingresa un correo válido."); return; }
    await run(async () => {
      const data = await createExecutive({ email: correo, full_name: name, phone: telefono, inmobiliaria_id: tenantId });
      const failed = [];
      for (const id of proyectos) {
        try {
          await assignExecutive(id, correo, "equipo");
        } catch {
          failed.push(projects.find((project) => project.id === id)?.nombre || id);
        }
      }
      return { data, failed };
    }, {
      after: closeModal,
      success: ({ data, failed }) => {
        const message = inviteToast({ nombre: data?.ejecutivo?.full_name || name, email: correo, data });
        return failed.length ? `${message} No pudimos asignar: ${failed.join(", ")}.` : message;
      },
    });
  };

  const saveMember = (nombre, telefono) => {
    if (!nombre.trim()) { setModalError("Ingresa el nombre."); return; }
    run(() => updateTeamMember(openMember.id, { nombre: nombre.trim(), telefono: telefono.trim() }, tenantParam), { success: "Datos guardados." });
  };

  const resend = () => run(() => resendExecutiveInvitation(openMember.id, tenantId), {
    success: (data) => (data?.email_enviado
      ? `Invitación reenviada a ${openMember.email}.`
      : `No pudimos enviar el correo a ${openMember.email}.`),
  });

  const changeRole = (rol) => {
    const current = openMember.rol === "ejecutivo" ? "ejecutivo" : "admin_inmobiliario";
    if (current === rol) return;
    run(() => setTeamMemberRole(openMember.id, rol, tenantParam), { success: "Función actualizada." });
  };

  const assign = (projectId) => run(() => assignExecutive(projectId, openMember.email, "equipo"));
  const unassign = (projectId) => run(() => unassignExecutive(projectId, openMember.email, "equipo"));

  const confirmDeactivate = () => {
    const name = openMember.nombre || openMember.email;
    run(() => setTeamMemberAccess(openMember.id, "desactivado", tenantParam), {
      after: closeModal,
      success: `${name} ya no tiene acceso.`,
    });
  };

  const reactivate = () => {
    const name = openMember.nombre || openMember.email;
    run(() => setTeamMemberAccess(openMember.id, "activo", tenantParam), { success: `${name} puede volver a entrar.` });
  };

  const retryAccess = () => run(() => setTeamMemberAccess(openMember.id, openMember.estado_acceso, tenantParam), {
    success: "Acceso actualizado.",
  });

  const showMemberHistory = () => {
    setHistoryMember(openMember.id);
    setTab("historial");
    closeModal();
  };

  const changeTenant = (value) => {
    setSelectedTenant(value);
    setTeam(null);
    setTab("miembros");
    setFilter("todos");
    setHistoryMember("");
    setQuery("");
    setHistory({ items: [], next_cursor: null, loading: false, error: "" });
  };

  const selector = globalAdmin ? (
    <div className="eq-tenant">
      <label>
        Inmobiliaria
        <select value={selectedTenant} onChange={(event) => changeTenant(event.target.value)}>
          <option value="">Selecciona una inmobiliaria</option>
          {inmobiliarias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      </label>
    </div>
  ) : null;

  const statCards = [
    ["todos", counts.todos, "Miembros"],
    ["activo", counts.activo, "Activos"],
    ["invitado", counts.invitado, "Invitados"],
    ["desactivado", counts.desactivado, "Desactivados"],
  ];

  const modalBody = modal?.kind === "invite" ? (
    <InviteModal projects={projects} error={modalError} busy={busy} onClose={closeModal} onSend={sendInvite} />
  ) : modal?.kind === "deactivate" && openMember ? (
    <DeactivateModal
      member={openMember}
      members={members}
      error={modalError}
      busy={busy}
      onClose={closeModal}
      onBack={() => { setModalError(""); setModal({ kind: "member", id: openMember.id }); }}
      onConfirm={confirmDeactivate}
    />
  ) : modal?.kind === "member" && openMember ? (
    <MemberModal
      key={openMember.id}
      member={openMember}
      projects={projects}
      error={modalError}
      busy={busy}
      onClose={closeModal}
      onSave={saveMember}
      onResend={resend}
      onRole={changeRole}
      onAssign={assign}
      onUnassign={unassign}
      onDeactivate={() => { setModalError(""); setModal({ kind: "deactivate", id: openMember.id }); }}
      onReactivate={reactivate}
      onRetryAccess={retryAccess}
      onHistory={showMemberHistory}
    />
  ) : null;

  const modalLabel = modal?.kind === "invite" ? "Invitar ejecutivo"
    : modal?.kind === "deactivate" ? `Desactivar a ${openMember?.nombre || openMember?.email || ""}`
      : `Gestionar a ${openMember?.nombre || openMember?.email || ""}`;
  const modalSize = modal?.kind === "deactivate" ? "sm" : "md";

  return (
    <section className="section-block admin-catalog admin-catalog-page eq-page">
      <div className="section-heading">
        <span className="eyebrow">Administración</span>
        <h1>Equipo</h1>
        <p>{globalAdmin ? "Elige una inmobiliaria para administrar su equipo." : "Invita a tu equipo, define su función y sus proyectos, y controla su acceso."}</p>
      </div>

      {selector}
      {loadError ? <div className="error-message" role="alert">{loadError}</div> : null}

      {!ready ? (
        <section className="admin-surface">
          <div className="eq-empty">
            <i className="ti ti-building-community" aria-hidden="true" />
            <strong>Elige una inmobiliaria</strong>
            <p>Verás su equipo, su historial y las mismas acciones que tiene su administrador.</p>
          </div>
        </section>
      ) : !team ? (
        loadError ? null : <p>Cargando equipo…</p>
      ) : (
        <>
          <div className="eq-stats">
            {statCards.map(([key, count, label]) => (
              <button type="button" key={key} className={`eq-stat ${filter === key ? "is-active" : ""}`} aria-pressed={filter === key} onClick={() => { setFilter(key); setTab("miembros"); }}>
                <strong>{count}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {gaps.length ? (
            <div className="eq-alert" role="status">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              <span>
                <strong>{gaps.length === 1 ? "1 proyecto sin ejecutivo activo:" : `${gaps.length} proyectos sin ejecutivo activo:`}</strong>{" "}
                {gaps.join(", ")}. Sus leads no tienen a nadie asignado para hacerles seguimiento.
              </span>
            </div>
          ) : null}

          <div className="eq-tabs" role="tablist" aria-label="Secciones de equipo">
            {[["miembros", "Miembros"], ["historial", "Historial"]].map(([key, label]) => (
              <button type="button" key={key} className={`eq-tab ${tab === key ? "is-active" : ""}`} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === "miembros" ? (
            <section className="admin-surface">
              <div className="eq-toolbar">
                <div className="eq-search">
                  <i className="ti ti-search" aria-hidden="true" />
                  <input type="search" aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <button type="button" onClick={() => setModal({ kind: "invite" })}>Invitar ejecutivo</button>
              </div>
              <MembersTable members={filterMembers(members, filter, query)} onOpen={(id) => setModal({ kind: "member", id })} />
            </section>
          ) : (
            <HistoryPanel
              members={members}
              memberFilter={historyMember}
              onFilter={setHistoryMember}
              entries={history.items}
              nextCursor={history.next_cursor}
              loading={history.loading}
              error={history.error}
              onMore={() => loadHistory(history.next_cursor)}
            />
          )}
        </>
      )}

      {createPortal(
        <div className="eq-modal-root">
          {modalBody ? (
            <div className="admin-modal" onClick={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
              <div ref={cardRef} className={`admin-modal-card admin-modal-card--${modalSize}`} role="dialog" aria-modal="true" aria-label={modalLabel} tabIndex={-1}>
                {modalBody}
              </div>
            </div>
          ) : null}
          {toast ? <div className="eq-toast" role="status">{toast}</div> : null}
        </div>,
        document.body,
      )}
    </section>
  );
}
