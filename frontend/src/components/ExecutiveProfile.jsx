import React, { useEffect, useMemo, useState } from "react";
import { getProjects } from "../services/projectService";

export default function ExecutiveProfile({ profile, inmobiliariaId, onNavigate }) {
  const [projects, setProjects] = useState([]);

  const executive = useMemo(
    () => ({ id: profile?.id ?? null, email: profile?.email ?? null }),
    [profile?.id, profile?.email],
  );

  useEffect(() => {
    let active = true;
    getProjects({ inmobiliariaId, ejecutivo: executive })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, [inmobiliariaId, executive]);

  const initials = (profile?.full_name || profile?.email || "Ejecutivo")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const inmobiliaria = projects[0]?.inmobiliaria_nombre || "Sin inmobiliaria asociada";

  return (
    <section className="section-block admin-account-page executive-account-page">
      <div className="section-heading"><span className="eyebrow">Cuenta comercial</span><h1>Mi perfil</h1></div>
      <section className="admin-account-overview">
        <div className="admin-account-overview__identity"><div className="profile-avatar">{initials}</div><div><span className="admin-tag">Ejecutivo comercial</span><h2>{profile?.full_name || "Ejecutivo"}</h2><p>{profile?.email || "Sin correo registrado"}</p></div></div>
        <dl className="admin-account-overview__meta"><div><dt>Rol</dt><dd>Ejecutivo comercial</dd></div><div><dt>Proyectos asignados</dt><dd>{projects.length}</dd></div></dl>
      </section>
      <div className="admin-account-grid">
        <section className="admin-surface"><div className="admin-surface__header"><div className="admin-surface__title"><h2>Datos de cuenta</h2></div></div><dl className="admin-definition-list admin-account-details"><div className="admin-definition-row"><dt>Nombre</dt><dd>{profile?.full_name || "Sin nombre registrado"}</dd></div><div className="admin-definition-row"><dt>Correo</dt><dd>{profile?.email || "Sin correo registrado"}</dd></div><div className="admin-definition-row"><dt>Teléfono</dt><dd>{profile?.phone || "Sin teléfono registrado"}</dd></div></dl></section>
        <section className="admin-surface admin-surface--soft"><div className="admin-surface__header"><div className="admin-surface__title"><h2>Organización</h2><p>Contexto comercial asociado a tu cuenta.</p></div></div><dl className="admin-definition-list admin-account-details"><div className="admin-definition-row"><dt>Inmobiliaria</dt><dd>{inmobiliaria}</dd></div><div className="admin-definition-row"><dt>Proyectos asignados</dt><dd>{projects.length}</dd></div></dl><button type="button" className="secondary-button" onClick={() => onNavigate("projects")}>Ver mis proyectos</button></section>
      </div>
    </section>
  );
}
