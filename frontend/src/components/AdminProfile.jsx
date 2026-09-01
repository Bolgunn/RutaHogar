import React, { useMemo } from "react";

function formatDate(value) {
  if (!value) return "Sin fecha registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha registrada";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminProfile({ profile, onNavigate }) {
  const initials = useMemo(() => {
    const name = profile?.full_name || profile?.email || "Administrador";
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profile?.email, profile?.full_name]);

  return (
    <section className="section-block admin-account-page">
      <div className="section-heading">
        <span className="eyebrow">Cuenta</span>
        <h1>Perfil administrativo</h1>
      </div>

      <section className="admin-account-overview">
        <div className="admin-account-overview__identity">
          <div className="profile-avatar">{initials}</div>
          <div>
            <span className="admin-tag">Administrador</span>
            <h2>{profile?.full_name || "Administrador"}</h2>
            <p>{profile?.email || "Sin correo registrado"}</p>
          </div>
        </div>

        <dl className="admin-account-overview__meta">
          <div>
            <dt>Rol</dt>
            <dd>Administrador</dd>
          </div>
          <div>
            <dt>Cuenta creada</dt>
            <dd>{formatDate(profile?.created_at)}</dd>
          </div>
        </dl>
      </section>

      <div className="admin-account-grid">
        <section className="admin-surface">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Datos de cuenta</h2>
            </div>
          </div>
          <dl className="admin-definition-list admin-account-details">
            <div className="admin-definition-row">
              <dt>Nombre</dt>
              <dd>{profile?.full_name || "Sin nombre registrado"}</dd>
            </div>
            <div className="admin-definition-row">
              <dt>Correo</dt>
              <dd>{profile?.email || "Sin correo registrado"}</dd>
            </div>
            <div className="admin-definition-row">
              <dt>Teléfono</dt>
              <dd>{profile?.phone || "Sin teléfono registrado"}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-surface admin-surface--soft">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Accesos</h2>
            </div>
          </div>
          <div className="admin-account-actions">
            <button type="button" className="secondary-button" onClick={() => onNavigate("admin")}>
              Inicio administrativo
            </button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("admin-projects")}>
              Proyectos
            </button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("leads")}>
              Leads
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
