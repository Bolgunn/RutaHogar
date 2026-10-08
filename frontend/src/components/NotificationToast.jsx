import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./notification-toast.css";

const ToastContext = createContext(null);

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

export function NotificationToastProvider({ children }) {
  const [items, setItems] = useState({});
  const [heights, setHeights] = useState({});
  const register = useCallback((id, item) => setItems((current) => ({ ...current, [id]: { ...item, id } })), []);
  const remove = useCallback((id) => setItems((current) => { if (!current[id]) return current; const next = { ...current }; delete next[id]; return next; }), []);
  const measure = useCallback((id, height) => setHeights((current) => current[id] === height ? current : { ...current, [id]: height }), []);
  const context = useMemo(() => ({ register, remove }), [register, remove]);
  const layout = notificationLayout(Object.values(items), heights);
  return <ToastContext.Provider value={context}>{children}{typeof document !== "undefined" && createPortal(
    <div className="notification-stack" aria-label="Notificaciones">{layout.map((item) => <ToastCard key={item.id} item={item} onMeasure={measure} />)}</div>, document.body,
  )}</ToastContext.Provider>;
}

export default function NotificationToast({ count, onClick, onClose, title, message, icon, className = "" }) {
  const context = useContext(ToastContext);
  const id = useId();
  useEffect(() => {
    if (!context) return;
    if (count > 0) context.register(id, { count, onClick, onClose, title, message, icon, className });
    else context.remove(id);
  }, [context, id, count, onClick, onClose, title, message, icon, className]);
  useEffect(() => () => context?.remove(id), [context, id]);
  if (context || count <= 0) return null;
  return <div className="notification-stack"><ToastCard item={{ id, count, onClick, onClose, title, message, icon, className }} /></div>;
}
