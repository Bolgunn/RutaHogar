import React from "react";

export default function AnonHeader({ onLogin, onHome }) {
  return (
    <header className="anon-header">
      <img
        src="/brand/rutahogar/logo-rutahogar.svg"
        alt="RutaHogar"
        className="anon-header-logo"
        onClick={onHome}
        style={onHome ? { cursor: "pointer" } : undefined}
      />
      <button type="button" className="anon-header-login" onClick={onLogin}>
        Iniciar sesión
      </button>
    </header>
  );
}
