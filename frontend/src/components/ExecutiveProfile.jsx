import React, { useEffect, useMemo, useState } from "react";
import { getProjects } from "../services/projectService";
import "./executive-profile.css";

export default function ExecutiveProfile({ profile, inmobiliariaId, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const executive = useMemo(
    () => ({ id: profile?.id ?? null, email: profile?.email ?? null }),
    [profile?.id, profile?.email],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setProjects([]);
    getProjects({ inmobiliariaId, ejecutivo: executive })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inmobiliariaId, executive, refresh]);

  const initials = (profile?.full_name || profile?.email || "Ejecutivo")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const inmobiliaria = projects.find((project) => project.inmobiliaria_nombre)?.inmobiliaria_nombre || "Sin información en la cartera";
  const available = projects.filter((project) => project.estado === "disponible").length;
  const projectCount = loading || error ? "—" : projects.length;

  return (
    <section className="section-block admin-account-page executive-account-page">
      <div className="section-heading"><span className="eyebrow">Cuenta comercial</span><h1>Mi perfil</h1><p>Tu información de contacto y la cartera vinculada a tu cuenta.</p></div>
      <section className="admin-account-overview">
        <div className="admin-account-overview__identity"><div className="profile-avatar">{initials}</div><div><span className="admin-tag">Ejecutivo comercial</span><h2>{profile?.full_name || "Ejecutivo"}</h2><p>{profile?.email || "Sin correo registrado"}</p></div></div>
        <dl className="admin-account-overview__meta"><div><dt>Proyectos asignados</dt><dd>{projectCount}</dd></div><div><dt>Disponibles</dt><dd>{loading || error ? "—" : available}</dd></div></dl>
      </section>
      <div className="admin-account-grid">
        <section className="admin-surface executive-profile-contact"><div className="admin-surface__header"><i className="ti ti-user-circle" aria-hidden="true" /><div className="admin-surface__title"><h2>Datos de cuenta</h2></div></div><dl className="admin-definition-list admin-account-details"><div className="admin-definition-row"><dt>Nombre</dt><dd>{profile?.full_name || "Sin nombre registrado"}</dd></div><div className="admin-definition-row"><dt>Correo</dt><dd>{profile?.email || "Sin correo registrado"}</dd></div><div className="admin-definition-row"><dt>Teléfono</dt><dd>{profile?.phone || "Sin teléfono registrado"}</dd></div></dl></section>
        <section className="admin-surface executive-profile-organization" aria-busy={loading}>
          <div className="admin-surface__header"><i className="ti ti-building-estate" aria-hidden="true" /><div className="admin-surface__title"><h2>Organización y cartera</h2></div></div>
          {loading ? <p className="executive-profile-state" role="status">Cargando la cartera vinculada…</p> : error ? <div className="executive-profile-state" role="status"><p>No pudimos cargar los datos de tu cartera.</p><button type="button" className="secondary-button compact-button" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div> : <dl className="admin-definition-list admin-account-details"><div className="admin-definition-row"><dt>Inmobiliaria</dt><dd>{inmobiliaria}</dd></div><div className="admin-definition-row"><dt>Proyectos asignados</dt><dd>{projectCount}</dd></div><div className="admin-definition-row"><dt>Disponibilidad</dt><dd>{projects.length ? `${available} de ${projects.length} disponibles` : "Sin proyectos asignados"}</dd></div></dl>}
          <div className="executive-profile-actions"><button type="button" className="secondary-button compact-button" onClick={() => onNavigate("projects")}>Ver mis proyectos <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
        </section>
      </div>
    </section>
  );
}
