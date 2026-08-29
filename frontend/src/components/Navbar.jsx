import React, { useState } from "react";
import { roleLabels, roles } from "../services/auth";

const navByRole = {
  [roles.user]: [
    { id: "evaluate", label: "Precalificación" },
    { id: "recommendations", label: "Recomendaciones" },
    { id: "simulation", label: "Simulación" },
    { id: "tracking", label: "Plan de Mejora" },
    { id: "academia", label: "Academia" },
  ],
  [roles.sales]: [
    { id: "leads", label: "Dashboard Leads" },
  ],
  [roles.admin]: [
    { id: "admin", label: "Panel Admin" },
    { id: "admin-projects", label: "Proyectos" },
    { id: "leads", label: "Dashboard Leads" },
  ],
};

export default function Navbar({ profile, page, currentScore, onNavigate, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const role = profile?.role || roles.user;
  const items = navByRole[role] || navByRole[roles.user];
  const displayName = profile?.full_name || profile?.email || "Usuario";

  const handleNavigate = (id) => {
    onNavigate(id);
    setMenuOpen(false);
  };

  return (
    <nav className="navbar">
      {/* Fila superior: logo + usuario + hamburguesa */}
      <div className="navbar-top">
        <button
          className="brand-button"
          type="button"
          onClick={() => handleNavigate("landing")}
          aria-label="Ir al inicio"
        >
          <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
        </button>

        <div className="navbar-right">
          <div className="nav-user">
            {role === roles.user && currentScore && (
              <strong className="current-score">
                {currentScore.score} / {currentScore.classification}
              </strong>
            )}
            <span>{displayName}</span>
            <small>{roleLabels[role]}</small>
          </div>

          <button
            className="navbar-hamburger"
            type="button"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Menú: siempre visible en desktop, desplegable en móvil */}
      <div className={`navbar-menu ${menuOpen ? "is-open" : ""}`}>
        <div className="nav-links">
          {items.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${page === item.id ? "is-active" : ""}`}
              type="button"
              onClick={() => handleNavigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="nav-actions">
          {role === roles.user && (
            <button
              className={`nav-link ${page === "profile" ? "is-active" : ""}`}
              type="button"
              onClick={() => handleNavigate("profile")}
              aria-current={page === "profile" ? "page" : undefined}
            >
              Perfil
            </button>
          )}
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={onLogout}
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
