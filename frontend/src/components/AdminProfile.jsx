import React, { useEffect, useMemo, useState } from "react";
import { getProjects, getTenantContext } from "../services/projectService";
import "./admin-profile.css";

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
  const [tenant, setTenant] = useState(null);
  const [projectCount, setProjectCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setTenant(null);
    setProjectCount(null);
    getTenantContext()
      .then(async (context) => {
        if (!active) return;
        setTenant(context);
        const projects = await getProjects({ inmobiliariaId: context.isGlobalAdmin ? "all" : context.inmobiliaria_id });
        if (active) setProjectCount(projects.length);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile?.id, refresh]);

  const organization = tenant?.isGlobalAdmin ? "Cobertura global" : tenant?.inmobiliaria_nombre || "Sin inmobiliaria asociada";

  return (
    <section className="section-block admin-account-page admin-profile-page">
      <div className="section-heading">
        <span className="eyebrow">Cuenta</span>
        <h1>Perfil administrativo</h1>
        <p>Tu cuenta, datos de contacto y ámbito de gestión.</p>
      </div>

      <section className="admin-account-overview">
        <div className="admin-account-overview__identity">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div>
            <span className="admin-tag"><i className="ti ti-shield-check" aria-hidden="true" />Administrador</span>
            <h2>{profile?.full_name || "Administrador"}</h2>
            <p>{profile?.email || "Sin correo registrado"}</p>
          </div>
        </div>

        <dl className="admin-account-overview__meta">
          <div>
            <dt>Proyectos en tu ámbito</dt>
            <dd className="admin-profile-project-count">{loading || error ? "—" : projectCount}</dd>
          </div>
          <div>
            <dt>Cuenta creada</dt>
            <dd>{formatDate(profile?.created_at)}</dd>
          </div>
        </dl>
      </section>

      <div className="admin-account-grid">
        <section className="admin-surface admin-profile-contact">
          <div className="admin-surface__header">
            <i className="ti ti-user-circle" aria-hidden="true" />
            <div className="admin-surface__title">
              <h2>Datos de contacto</h2>
            </div>
          </div>
          <dl className="admin-definition-list admin-account-details">
            <div className="admin-definition-row">
              <dt>Nombre</dt>
              <dd>{profile?.full_name || "Sin nombre registrado"}</dd>
            </div>
            <div className="admin-definition-row">
              <dt>Correo</dt>
              <dd>{profile?.email ? <a href={`mailto:${profile.email}`}>{profile.email}</a> : "Sin correo registrado"}</dd>
            </div>
            <div className="admin-definition-row">
              <dt>Teléfono</dt>
              <dd>{profile?.phone || "Sin teléfono registrado"}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-surface admin-account-organization" aria-busy={loading}>
          <div className="admin-surface__header">
            <i className="ti ti-building-estate" aria-hidden="true" />
            <div className="admin-surface__title">
              <h2>Organización y gestión</h2>
            </div>
          </div>
          {loading ? <p className="admin-profile-state" role="status">Cargando tu ámbito de gestión…</p> : <>
          {tenant && <dl className="admin-definition-list admin-account-details">
            <div className="admin-definition-row">
              <dt>Inmobiliaria</dt>
              <dd>{organization}</dd>
            </div>
            <div className="admin-definition-row">
              <dt>Ámbito</dt>
              <dd>{tenant.isGlobalAdmin ? "Todas las inmobiliarias" : "Proyectos de tu inmobiliaria"}</dd>
            </div>
          </dl>}
          {error && <div className="admin-profile-state" role="alert"><p>No pudimos cargar toda la información de tu organización.</p><button type="button" className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div>}
          </>}
          {onNavigate && <div className="admin-profile-actions"><button type="button" onClick={() => onNavigate("admin-projects")}>Gestionar proyectos <i className="ti ti-arrow-right" aria-hidden="true" /></button><button type="button" className="secondary-button" onClick={() => onNavigate("admin-reports")}>Ver reportes</button></div>}
        </section>
      </div>
    </section>
  );
}
