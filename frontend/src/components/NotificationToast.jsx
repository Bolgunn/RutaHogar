import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./notification-toast.css";

export function notificationLayout(items, heights = {}) {
  const ordered = [...items].sort((a, b) => Number(!a.className.includes("high-score")) - Number(!b.className.includes("high-score")));
  let bottom = 0;
  return ordered.map((item) => {
    const entry = { ...item, bottom };
    bottom += (heights[item.id] || 120) + 12;
    return entry;
  });
}

function ToastCard({ item, onMeasure }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !onMeasure) return;
    const measure = () => onMeasure(item.id, node.getBoundingClientRect().height);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [item.id, onMeasure]);
  const opportunity = item.className.includes("opportunities");
  return <div ref={ref} className={`notification-toast ${item.className}`} style={{ bottom: item.bottom || 0 }} role="status">
    <button type="button" className="notification-content" onClick={item.onClick}>
      <span className="notification-icon" aria-hidden="true">{item.icon || <i className={`ti ${opportunity ? "ti-trending-up" : "ti-user-check"}`} />}</span>
      <span className="notification-text"><strong>{item.title || `${item.count} lead${item.count > 1 ? "s" : ""} con score alto`}</strong><span>{item.message || "Nuevos prospectos calificados para revisar."}</span><span className="notification-link">{opportunity ? "Revisar oportunidades" : "Ver leads"}<i className="ti ti-arrow-right" aria-hidden="true" /></span></span>
    </button>
    <button type="button" className="notification-close" onClick={item.onClose} aria-label={`Cerrar notificación: ${item.title || "leads con score alto"}`}><i className="ti ti-x" aria-hidden="true" /></button>
  </div>;
}

export default function NotificationToast({ items, count, onClick, onClose, title, message, icon, className = "" }) {
  const [heights, setHeights] = useState({});
  const measure = useCallback((id, height) => setHeights((current) => current[id] === height ? current : { ...current, [id]: height }), []);
  const activeItems = (items || [{ id: "single", count, onClick, onClose, title, message, icon, className }])
    .filter((item) => item.count > 0);
  if (!activeItems.length) return null;
  const layout = notificationLayout(activeItems, heights);
  const stack = <div className="notification-stack" aria-label="Notificaciones">{layout.map((item) => <ToastCard key={item.id} item={item} onMeasure={measure} />)}</div>;
  return typeof document !== "undefined" ? createPortal(stack, document.body) : stack;
}
