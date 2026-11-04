import React from "react";
import "./access-feedback.css";

export default function AccessFeedback({ message, error = false, children }) {
  return <main className="access-feedback">
    <section className="access-feedback-window" aria-labelledby="access-feedback-title" aria-busy={!error}>
      <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" className="access-feedback-logo" />
      {!error && <span className="access-feedback-spinner" aria-hidden="true" />}
      <h1 id="access-feedback-title">{error ? "Revisemos tu acceso" : "Estamos preparando tu acceso"}</h1>
      <p role={error ? "alert" : "status"}>{message}</p>
      {children && <div className="access-feedback-actions">{children}</div>}
    </section>
  </main>;
}
