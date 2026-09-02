import React from "react";
import { roleLabels, roles } from "../services/auth";

const navByRole = {
  [roles.user]: [
    { group: "Principal", items: [
      { id: "home", label: "Inicio", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
      { id: "evaluate", label: "Preevaluación", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg> },
      { id: "recommendations", label: "Recomendaciones", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg> },
      { id: "subsidios", label: "Subsidios", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="M5 10.5V16c0 2.2 3.13 4 7 4s7-1.8 7-4v-5.5"/><path d="M21 7.5V14"/></svg> },
      { id: "tracking", label: "Plan de mejora", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l6 6"/><path d="M18 18l-6-6"/></svg> },
      { id: "academia", label: "Academia", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg> },
      { id: "simulation", label: "Simulación", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="14" r="3"/></svg> },
      { id: "projects", label: "Proyectos", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-5h4v5"/></svg> },
    ]},
  ],
  [roles.sales]: [
    { group: "Gestión", items: [
      { id: "home", label: "Inicio", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
      { id: "leads", label: "Leads", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { id: "projects", label: "Proyectos", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-5h4v5"/></svg> },
    ]},
  ],
  [roles.admin]: [
    { group: "Administración", items: [
      //{ id: "home", label: "Inicio", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
      { id: "admin", label: "Inicio", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
      { id: "admin-projects", label: "Proyectos", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-5h4v5"/></svg> },
      { id: "leads", label: "Leads", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    ]},
  ],
};

const sidebarSupportByRole = {
  [roles.user]: {
    title: "Acompanamiento",
    description: "Revisa la Academia o contacta a tu ejecutivo para resolver dudas del proceso.",
    actionLabel: "Ir a Academia",
    actionTarget: "academia",
  },
  [roles.sales]: {
    title: "Gestión comercial",
    description: "Entra a leads para revisar prioridad, contexto y próximos seguimientos.",
    actionLabel: "Abrir leads",
    actionTarget: "leads",
  },
  [roles.admin]: {
    title: "Operación interna",
    description: "Coordina catálogo, cuentas y seguimiento desde una navegación más clara y consistente.",
    actionLabel: "Abrir panel",
    actionTarget: "admin",
  },
};

export default function Navbar({ profile, page, currentScore, onNavigate, onLogout }) {
  const role = profile?.role || roles.user;
  const groups = navByRole[role] || navByRole[roles.user];
  const supportCard = sidebarSupportByRole[role] || sidebarSupportByRole[roles.user];
  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "Usuario";
  const initials = displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const email = profile?.email || "";
  const accountTarget = role === roles.user ? "profile" : role === roles.admin ? "admin-profile" : "sales-profile";

  const handleNavigate = (id) => {
    onNavigate(id);
  };

  return (
    <aside className={`sidebar ${role === roles.admin ? "sidebar--admin" : ""}`} role="navigation" aria-label="Navegación principal">
      <a className="sidebar-brand" href="/" onClick={(e) => { e.preventDefault(); handleNavigate("landing"); }}>
        <span className="sidebar-brand__pill">
          <img className="sidebar-brand__logo" src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
        </span>
      </a>

      {groups.map((group) => (
        <nav className="nav-group" key={group.group} aria-label={group.group}>
          <span className="nav-group__label">{group.group}</span>
          {group.items.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "is-active" : ""}`}
              type="button"
              onClick={() => handleNavigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              {item.icon}
              <span className="sidebar__label">{item.label}</span>
            </button>
          ))}
        </nav>
      ))}

      <div className="sidebar-spacer"></div>

      {role === roles.user && <div className="sidebar-help">
        <strong><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> {supportCard.title}</strong>
        <p>{supportCard.description}</p>
        <button type="button" className="sidebar-link-button" onClick={() => handleNavigate(supportCard.actionTarget)}>
          {supportCard.actionLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>}

      <button className="sidebar-user" type="button" onClick={() => handleNavigate(accountTarget)}>
        <span className="avatar">{initials}</span>
        <span className="sidebar-user__meta">
          <span className="sidebar-user__role">{roleLabels[role] || "Cuenta"}</span>
          <strong>{displayName}</strong>
          <span>{email}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <button className="nav-item sidebar-logout" type="button" onClick={onLogout}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span className="sidebar__label">Salir</span>
      </button>
    </aside>
  );
}
