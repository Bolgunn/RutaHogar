import React, { useEffect, useMemo, useState } from "react";
import { getProjects, getTenantContext } from "../services/projectService";

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

export default function AdminProfile({ profile }) {
  const [tenant, setTenant] = useState(null);
  const [projectCount, setProjectCount] = useState(null);
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
    getTenantContext()
      .then(async (context) => {
        if (!active) return;
        setTenant(context);
        const projects = await getProjects({ inmobiliariaId: context.isGlobalAdmin ? "all" : context.inmobiliaria_id });
        if (active) setProjectCount(projects.length);
      })
      .catch(() => { if (active) { setTenant(null); setProjectCount(null); } });
    return () => { active = false; };
  }, []);

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

        <section className="admin-surface admin-account-organization">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Organización</h2>
              <p>Contexto operativo asociado a esta cuenta.</p>
            </div>
          </div>
          <dl className="admin-definition-list admin-account-details">
            <div className="admin-definition-row">
              <dt>Inmobiliaria</dt>
              <dd>{tenant?.isGlobalAdmin ? "Cobertura global" : tenant?.inmobiliaria_nombre || "Sin inmobiliaria asociada"}</dd>
            </div>
            <div className="admin-definition-row">
              <dt>Proyectos</dt>
              <dd>{projectCount == null ? "Cargando proyectos" : projectCount}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
