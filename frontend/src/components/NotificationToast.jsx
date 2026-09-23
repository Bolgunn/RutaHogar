import React from "react";

export default function NotificationToast({
  count,
  onClick,
  onClose,
  title,
  message,
  icon = "🚀",
  className = "",
}) {
  if (count <= 0) return null;

  return (
    <div className={`notification-toast ${className}`.trim()}>
      <div className="notification-content" onClick={onClick}>
        <div className="notification-icon">{icon}</div>
        <div className="notification-text">
          <strong>{title || `${count} Lead${count > 1 ? "s" : ""} con Score Alto`}</strong>
          <p>{message || "Hay nuevos prospectos calificados esperando revisión."}</p>
        </div>
      </div>
      <button className="notification-close" onClick={onClose} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}
