import React, { useEffect, useState, useMemo } from "react";
import {
  getSupportTickets,
  updateSupportTicketStatus,
} from "../../services/supportTicketsService";
import "./AdminSupportTickets.css";

const STATUS_LABELS = {
  todos: "Todos",
  abierto: "Abierto",
  en_proceso: "En Proceso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

function formatFecha(val) {
  if (!val) return "Sin fecha";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("todos");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const loadTickets = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSupportTickets();
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Error al cargar tickets de soporte.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const counts = useMemo(() => {
    return tickets.reduce(
      (acc, t) => {
        acc.total += 1;
        if (t.status === "abierto") acc.abiertos += 1;
        if (t.status === "en_proceso" || t.status === "en_curso") acc.enProceso += 1;
        if (t.status === "resuelto") acc.resueltos += 1;
        if (t.status === "cerrado") acc.cerrados += 1;
        return acc;
      },
      { total: 0, abiertos: 0, enProceso: 0, resueltos: 0, cerrados: 0 }
    );
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (activeTab === "todos") return tickets;
    if (activeTab === "en_proceso") {
      return tickets.filter((t) => t.status === "en_proceso" || t.status === "en_curso");
    }
    return tickets.filter((t) => t.status === activeTab);
  }, [tickets, activeTab]);

  const handleOpenModal = (ticket) => {
    setSelectedTicket(ticket);
    setReplyText("");
    setFeedbackMsg("");
    setError("");
  };

  const handleSendReply = async ({ resolve = false }) => {
    if (!selectedTicket || !replyText.trim() || actionLoading) return;
    const trimmedReply = replyText.trim();
    const targetStatus = resolve ? "resuelto" : "en_proceso";
    setActionLoading(true);
    setFeedbackMsg("");
    setError("");
    try {
      await updateSupportTicketStatus({
        ticketId: selectedTicket.id,
        status: targetStatus,
        reply: trimmedReply,
      });

      const updatedRepliedAt = new Date().toISOString();
      const updatedThread = [
        ...(selectedTicket.thread && selectedTicket.thread.length > 0
          ? selectedTicket.thread
          : [
              {
                role: "user",
                content: selectedTicket.message,
                created_at: selectedTicket.created_at,
              },
            ]),
        {
          role: "admin",
          content: trimmedReply,
          created_at: updatedRepliedAt,
        },
      ];

      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? {
                ...t,
                status: targetStatus,
                admin_reply: trimmedReply,
                replied_at: updatedRepliedAt,
                thread: updatedThread,
              }
            : t
        )
      );
      setSelectedTicket((prev) =>
        prev
          ? {
              ...prev,
              status: targetStatus,
              admin_reply: trimmedReply,
              replied_at: updatedRepliedAt,
              thread: updatedThread,
            }
          : null
      );
      setReplyText("");
      const successMsg = resolve
        ? "✓ Respuesta enviada al usuario y ticket marcado como Resuelto."
        : "✓ Respuesta enviada con éxito. El ticket pasó automáticamente a 'En Proceso'.";
      setFeedbackMsg(successMsg);
      setTimeout(() => setFeedbackMsg(""), 4500);
    } catch (err) {
      setError(err.message || "Error al enviar la respuesta.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDirectStatusChange = async (newStatus) => {
    if (!selectedTicket || actionLoading) return;
    setActionLoading(true);
    setFeedbackMsg("");
    setError("");
    try {
      await updateSupportTicketStatus({
        ticketId: selectedTicket.id,
        status: newStatus,
      });

      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: newStatus } : t))
      );
      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
      setFeedbackMsg(`Estado actualizado a "${STATUS_LABELS[newStatus] || newStatus}".`);
      setTimeout(() => setFeedbackMsg(""), 3500);
    } catch (err) {
      setError(err.message || "Error al actualizar estado del ticket.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="admin-tickets-container">
      <div className="admin-tickets-header">
        <div>
          <h2 className="admin-tickets-title">Bandeja de Tickets de Soporte</h2>
          <p className="admin-tickets-subtitle">
            Consultas derivadas desde el Asistente Virtual para atención humana (HU24).
          </p>
        </div>
        <button
          type="button"
          className="admin-tickets-refresh-btn"
          onClick={loadTickets}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "↻ Actualizar"}
        </button>
      </div>

      {/* Metrics Row */}
      <div className="admin-tickets-metrics">
        <div className="admin-ticket-metric-card">
          <span className="metric-label">Total Recibidos</span>
          <strong className="metric-value">{counts.total}</strong>
        </div>
        <div className="admin-ticket-metric-card metric-warning">
          <span className="metric-label">Abiertos</span>
          <strong className="metric-value">{counts.abiertos}</strong>
        </div>
        <div className="admin-ticket-metric-card metric-info">
          <span className="metric-label">En Proceso</span>
          <strong className="metric-value">{counts.enProceso}</strong>
        </div>
        <div className="admin-ticket-metric-card metric-success">
          <span className="metric-label">Resueltos</span>
          <strong className="metric-value">{counts.resueltos}</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tickets-tabs" role="tablist">
        {["todos", "abierto", "en_proceso", "resuelto", "cerrado"].map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`admin-tickets-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {STATUS_LABELS[tab]}
          </button>
        ))}
      </div>

      {error && <div className="admin-tickets-alert error">{error}</div>}

      {/* Tickets List */}
      {loading ? (
        <div className="admin-tickets-empty">
          <div className="admin-tickets-spinner" />
          <p>Cargando tickets...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="admin-tickets-empty">
          <p>No hay tickets en la categoría "{STATUS_LABELS[activeTab]}".</p>
        </div>
      ) : (
        <div className="admin-tickets-table-wrapper">
          <table className="admin-tickets-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Asunto</th>
                <th>Solicitante</th>
                <th>Pantalla</th>
                <th>Fecha</th>
                <th>Aviso Email</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((t) => {
                const code = t.code || t.id.slice(0, 8).toUpperCase();
                const normalizedStatus = t.status === "en_curso" ? "en_proceso" : (t.status || "abierto");
                return (
                  <tr key={t.id} className={selectedTicket?.id === t.id ? "row-selected" : ""}>
                    <td>
                      <span className="ticket-code-badge">#{code}</span>
                    </td>
                    <td className="ticket-subject-cell">
                      <div className="ticket-subject-title-row">
                        <strong>{t.subject || "Consulta general"}</strong>
                        {t.user_feedback === "helpful" && (
                          <span
                            className="ticket-feedback-pill success"
                            title="El usuario confirmó que la respuesta resolvió su consulta"
                          >
                            ✓ Solución confirmada
                          </span>
                        )}
                        {t.user_feedback === "unhelpful" && (
                          <span
                            className="ticket-feedback-pill warning"
                            title="El usuario indicó que tiene dudas y envió una réplica"
                          >
                            🔔 Nueva réplica
                          </span>
                        )}
                      </div>
                      <span className="ticket-preview-snippet">
                        {(t.message || "").slice(0, 70)}...
                      </span>
                    </td>
                    <td>
                      <div className="ticket-author-cell">
                        <strong className="ticket-author-name">
                          {t.user_name || "Usuario"}
                        </strong>
                        <span className="ticket-author-sub">
                          {t.user_email || (t.user_id ? t.user_id.slice(0, 8) + "..." : "Cliente")}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="ticket-screen-pill">{t.screen_id || "General"}</span>
                    </td>
                    <td>
                      <span className="ticket-date">{formatFecha(t.created_at)}</span>
                    </td>
                    <td>
                      {t.notified_at ? (
                        <span className="email-status-pill success" title={`Enviado: ${formatFecha(t.notified_at)}`}>
                          ✓ Enviado
                        </span>
                      ) : t.notification_error ? (
                        <span
                          className="email-status-pill error"
                          title={
                            t.notification_error === "email_not_configured"
                              ? "Aviso email no configurado (RESEND_API_KEY no definida). El ticket está guardado."
                              : `Aviso email: ${t.notification_error}`
                          }
                        >
                          ⚠ Pendiente
                        </span>
                      ) : (
                        <span className="email-status-pill muted">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`ticket-status-pill status-${normalizedStatus}`}>
                        {STATUS_LABELS[normalizedStatus] || normalizedStatus}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-ticket-view-btn"
                        onClick={() => handleOpenModal(t)}
                      >
                        Atender
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer / Modal */}
      {selectedTicket && (
        <div className="admin-ticket-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="admin-ticket-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-ticket-modal-header">
              <div>
                <span className="ticket-code-tag">
                  Ticket #{selectedTicket.code || selectedTicket.id.slice(0, 8).toUpperCase()}
                </span>
                <h3 className="modal-title">{selectedTicket.subject || "Sin Asunto"}</h3>
                <span className="modal-meta">
                  Creado el {formatFecha(selectedTicket.created_at)} · Solicitante:{" "}
                  <strong>{selectedTicket.user_name || "Usuario"}</strong>
                  {selectedTicket.user_email ? ` (${selectedTicket.user_email})` : ""} · Pantalla:{" "}
                  {selectedTicket.screen_id || "General"}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedTicket(null)}
              >
                ✕
              </button>
            </div>

            <div className="admin-ticket-modal-body">
              {feedbackMsg && (
                <div className="admin-tickets-alert success">{feedbackMsg}</div>
              )}
              {error && (
                <div className="admin-tickets-alert error">{error}</div>
              )}

              {/* User Resolution Feedback Banner */}
              {selectedTicket.user_feedback === "helpful" && (
                <div className="ticket-feedback-banner success">
                  <span className="banner-icon">✓</span>
                  <div>
                    <strong>Solución confirmada por el usuario</strong>
                    <p>
                      El solicitante confirmó que la respuesta resolvió su consulta
                      {selectedTicket.user_feedback_at ? ` el ${formatFecha(selectedTicket.user_feedback_at)}` : ""}.
                    </p>
                  </div>
                </div>
              )}
              {selectedTicket.user_feedback === "unhelpful" && (
                <div className="ticket-feedback-banner warning">
                  <span className="banner-icon">💬</span>
                  <div>
                    <strong>Nueva réplica del usuario pendiente de atención</strong>
                    <p>
                      El usuario indicó que aún tiene dudas y envió un mensaje de seguimiento
                      {selectedTicket.user_feedback_at ? ` el ${formatFecha(selectedTicket.user_feedback_at)}` : ""}.
                      Por favor revisa la conversación y responde abajo.
                    </p>
                  </div>
                </div>
              )}

              {/* Conversation Thread (All turns between User and Admin) */}
              <div className="ticket-detail-section">
                <h4 className="section-title">
                  Hilo de Conversación del Ticket
                  {selectedTicket.thread && selectedTicket.thread.length > 0
                    ? ` (${selectedTicket.thread.length} mensajes)`
                    : ""}
                </h4>
                {selectedTicket.thread && selectedTicket.thread.length > 0 ? (
                  <div className="ticket-thread-container">
                    {selectedTicket.thread.map((turn, idx) => (
                      <div
                        key={idx}
                        className={`thread-turn ${turn.role === "admin" ? "admin-turn" : "user-turn"}`}
                      >
                        <div className="thread-turn-header">
                          <span className="thread-role-badge">
                            {turn.role === "admin"
                              ? "🛡️ Soporte RutaHogar (Admin)"
                              : `👤 ${selectedTicket.user_name || "Usuario"}`}
                          </span>
                          {turn.created_at && (
                            <span className="thread-turn-date">
                              {formatFecha(turn.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="thread-turn-body">{turn.content}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ticket-user-message-box">
                    <p style={{ margin: 0 }}>
                      <strong>Mensaje inicial:</strong> {selectedTicket.message}
                    </p>
                    {selectedTicket.admin_reply && (
                      <div style={{ marginTop: "10px", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                        <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#065f46" }}>
                          ✓ Soporte RutaHogar:
                        </span>
                        <p style={{ margin: "4px 0 0" }}>{selectedTicket.admin_reply}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Orderly Lifecycle & Admin Reply Box */}
              <div className="ticket-detail-section">
                <div className="section-header-flex">
                  <h4 className="section-title">Gestión y Respuesta del Administrador</h4>
                  <span className={`ticket-status-pill status-${selectedTicket.status}`}>
                    {STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
                  </span>
                </div>

                {/* State: ABIERTO */}
                {selectedTicket.status === "abierto" && (
                  <div className="ticket-reply-composer-card">
                    <p className="composer-hint">
                      Escribe la respuesta para el usuario. Al enviar, el ticket cambiará automáticamente a <strong>"En Proceso"</strong> y se le notificará.
                    </p>
                    <textarea
                      className="ticket-reply-textarea"
                      placeholder="Escribe tu respuesta clara y profesional para resolver la duda del usuario..."
                      rows={4}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={actionLoading}
                    />
                    <div className="ticket-actions-row">
                      <button
                        type="button"
                        className="reply-btn primary"
                        onClick={() => handleSendReply({ resolve: false })}
                        disabled={actionLoading || !replyText.trim()}
                      >
                        ✉ Enviar Respuesta (Pasa a En Proceso)
                      </button>
                      <button
                        type="button"
                        className="reply-btn success"
                        onClick={() => handleSendReply({ resolve: true })}
                        disabled={actionLoading || !replyText.trim()}
                        title="Envía la respuesta y finaliza el ticket de inmediato"
                      >
                        ✓ Enviar y Marcar Resuelto
                      </button>
                      <button
                        type="button"
                        className="reply-btn secondary"
                        onClick={() => handleDirectStatusChange("cerrado")}
                        disabled={actionLoading}
                        title="Descartar solicitud o spam sin responder"
                      >
                        ✕ Descartar / Cerrar
                      </button>
                    </div>
                  </div>
                )}

                {/* State: EN PROCESO */}
                {(selectedTicket.status === "en_proceso" || selectedTicket.status === "en_curso") && (
                  <div className="ticket-reply-composer-card">
                    <p className="composer-hint">
                      El ticket está <strong>En Proceso</strong>. Puedes redactar una nueva respuesta o marcarlo como Resuelto.
                    </p>
                    <textarea
                      className="ticket-reply-textarea"
                      placeholder="Escribe una respuesta adicional o instrucciones de seguimiento (opcional si ya respondiste)..."
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={actionLoading}
                    />
                    <div className="ticket-actions-row">
                      {replyText.trim() && (
                        <button
                          type="button"
                          className="reply-btn primary"
                          onClick={() => handleSendReply({ resolve: false })}
                          disabled={actionLoading}
                        >
                          ✉ Enviar Respuesta Adicional
                        </button>
                      )}
                      <button
                        type="button"
                        className="reply-btn success"
                        onClick={() => {
                          if (replyText.trim()) {
                            handleSendReply({ resolve: true });
                          } else {
                            handleDirectStatusChange("resuelto");
                          }
                        }}
                        disabled={actionLoading}
                      >
                        ✓ {replyText.trim() ? "Enviar Respuesta y Marcar Resuelto" : "Marcar como Resuelto"}
                      </button>
                      <button
                        type="button"
                        className="reply-btn secondary"
                        onClick={() => handleDirectStatusChange("cerrado")}
                        disabled={actionLoading}
                      >
                        ✕ Cerrar Ticket
                      </button>
                    </div>
                  </div>
                )}

                {/* State: RESUELTO */}
                {selectedTicket.status === "resuelto" && (
                  <div className="ticket-resolved-box">
                    <div className="resolved-status-banner">
                      <span className="banner-icon">✓</span>
                      <div>
                        <strong>Ticket Resuelto</strong>
                        <p>Esta consulta fue atendida y marcada como resuelta.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="reply-btn outline"
                      onClick={() => handleDirectStatusChange("en_proceso")}
                      disabled={actionLoading}
                    >
                      ↻ Reabrir Ticket (En Proceso)
                    </button>
                  </div>
                )}

                {/* State: CERRADO */}
                {selectedTicket.status === "cerrado" && (
                  <div className="ticket-closed-box">
                    <div className="closed-status-banner">
                      <span className="banner-icon">✕</span>
                      <div>
                        <strong>Ticket Cerrado</strong>
                        <p>Este ticket fue cerrado o descartado sin resolución activa.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="reply-btn outline"
                      onClick={() => handleDirectStatusChange("en_proceso")}
                      disabled={actionLoading}
                    >
                      ↻ Reabrir Ticket (En Proceso)
                    </button>
                  </div>
                )}
              </div>

              {/* Attached Conversation Transcript */}
              <div className="ticket-detail-section">
                <h4 className="section-title">
                  Historial de Conversación Adjunto ({selectedTicket.transcript?.length || 0} mensajes)
                </h4>
                <div className="ticket-privacy-disclaimer">
                  🔒 Cumplimiento Ley 21.719: Datos sensibles (RUT, contactos bancarios) anonimizados.
                </div>

                {!selectedTicket.transcript || selectedTicket.transcript.length === 0 ? (
                  <p className="no-transcript-hint">
                    No se adjuntó historial previo para este ticket.
                  </p>
                ) : (
                  <div className="ticket-transcript-stream">
                    {selectedTicket.transcript.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`transcript-bubble-row ${
                          msg.role === "user" ? "user-row" : "bot-row"
                        }`}
                      >
                        <span className="transcript-role-label">
                          {msg.role === "user" ? "Usuario" : "Asistente RH"}:
                        </span>
                        <div className="transcript-bubble">
                          <p>{msg.content}</p>
                          {msg.ts && (
                            <span className="transcript-ts">
                              {new Date(msg.ts).toLocaleTimeString("es-CL", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-ticket-modal-footer">
              <button
                type="button"
                className="modal-footer-close-btn"
                onClick={() => setSelectedTicket(null)}
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}