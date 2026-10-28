import React, { useState, useEffect, useRef } from "react";
import { sendAssistantMessage } from "../../lib/assistant/assistantClient";
import {
  isEscalationSignal,
  shouldOfferEscalation,
} from "../../lib/assistant/escalation";
import { buildTranscriptForTicket } from "../../lib/assistant/transcript";
import {
  createSupportTicket,
  getActiveAuthToken,
} from "../../services/supportTicketsService";
import "./AssistantWidget.css";

const QUICK_PROMPTS = [
  "¿Cuáles son los pasos de la pre-evaluación?",
  "¿Qué deudas debo ingresar?",
  "¿Qué es el ingreso mensual líquido?",
  "¿Cómo funciona complementar renta?",
];

export default function AssistantWidget({
  screenId = null,
  role = "anon",
  token = null,
  profile = null,
  onNavigate = null,
  onOpenArticle = null,
}) {
  const isUserAuthenticated = Boolean(
    (profile && profile.role && profile.role !== "anon") ||
    (role && role !== "anon") ||
    token
  );
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content:
        "¡Hola! Soy tu asistente virtual de RutaHogar. Puedo orientarte sobre los 4 pasos de la pre-evaluación, el significado de cada campo y conceptos financieros. ¿En qué te puedo ayudar hoy?",
      action: null,
      links: [],
      sources: [],
      feedback: null,
      suggestEscalation: false,
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);

  // E3 & E4: Support ticket states
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(null);
  const [ticketError, setTicketError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, ticketModalOpen, authModalOpen]);

  const handleSend = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    const historyPayload = messages.slice(-5).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await sendAssistantMessage({
      message: text,
      history: historyPayload,
      screenId,
      token,
    });

    const isUserFrustrated = isEscalationSignal(text);
    const offerEscalation = shouldOfferEscalation({
      suggestEscalation: response.suggest_escalation,
      userFeedbackNegative: false,
      messageText: text,
    });

    const assistantMsg = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: response.answer,
      tier: response.tier,
      sources: response.sources,
      links: response.links,
      action: response.action,
      suggestEscalation: offerEscalation || isUserFrustrated,
      feedback: null,
      createdAt: new Date().toISOString(),
    };

    setIsTyping(false);
    setMessages((prev) => [...prev, assistantMsg]);
  };

  const handleFeedback = (msgId, value) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const isNegative = value === "unhelpful";
        return {
          ...m,
          feedback: value,
          suggestEscalation: isNegative ? true : m.suggestEscalation,
        };
      })
    );
  };

  const handleOpenTicket = async (refMsg = null) => {
    const activeToken = await getActiveAuthToken(token);
    const isLoggedIn = isUserAuthenticated || Boolean(activeToken);

    if (!isLoggedIn) {
      setAuthModalOpen(true);
      return;
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const defaultSubject = lastUserMsg
      ? `Consulta: ${lastUserMsg.content.slice(0, 50)}...`
      : screenId
      ? `Duda en pantalla ${screenId}`
      : "Consulta sobre la plataforma";

    setTicketSubject(defaultSubject);
    setTicketMessage(refMsg ? `Tengo dudas con respecto a la respuesta: "${refMsg.content.slice(0, 100)}..."` : "");
    setTicketError(null);
    setTicketSuccess(null);
    setTicketModalOpen(true);
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!ticketMessage.trim() || ticketSubmitting) return;

    setTicketSubmitting(true);
    setTicketError(null);

    try {
      const activeToken = token || (await getActiveAuthToken());
      const transcriptHistory = buildTranscriptForTicket(messages, 10);
      const res = await createSupportTicket({
        subject: ticketSubject,
        message: ticketMessage,
        history: transcriptHistory,
        screenId,
        token: activeToken || "local-authenticated-session",
      });

      setTicketSuccess(res);

      // Append confirmation message in chat stream
      setMessages((prev) => [
        ...prev,
        {
          id: `ticket-confirm-${Date.now()}`,
          role: "assistant",
          content: `✅ Se ha creado exitosamente tu ticket de soporte #${res.code} con el asunto "${ticketSubject}". Nuestro equipo revisará la conversación previa y te responderá por correo electrónico.`,
          action: null,
          links: [],
          sources: [],
          feedback: "helpful",
          suggestEscalation: false,
        },
      ]);
    } catch (err) {
      if (err.message === "unauthenticated" && !isUserAuthenticated) {
        setTicketModalOpen(false);
        setAuthModalOpen(true);
      } else {
        setTicketError(
          err.message || "Ocurrió un error al enviar el ticket. Por favor inténtalo de nuevo."
        );
      }
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          "Conversación reiniciada. ¿En qué puedo orientarte hoy sobre tu precalificación?",
        action: null,
        links: [],
        sources: [],
        feedback: null,
        suggestEscalation: false,
      },
    ]);
  };

  const handleActionClick = (action) => {
    if (!action) return;

    if (action.type === "focus_field" && action.field_id) {
      const el = document.getElementById(action.field_id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
        el.classList.add("assistant-field-pulse");
        setTimeout(() => el.classList.remove("assistant-field-pulse"), 2500);
      } else {
        const stepName = action.step ? `Paso ${action.step}` : "el formulario";
        setMessages((prev) => [
          ...prev,
          {
            id: `system-hint-${Date.now()}`,
            role: "assistant",
            content: `📍 El campo "${action.label || action.field_id}" se encuentra en el ${stepName}. Avanza al paso indicado en la pantalla para completarlo.`,
          },
        ]);
      }
    } else if (action.type === "navigate" && action.target && onNavigate) {
      onNavigate(action.target);
    }
  };

  const handleLinkClick = (link) => {
    if (!link) return;

    if (link.type === "academy" && link.articleId) {
      if (onOpenArticle) {
        onOpenArticle(link.articleId);
      } else if (onNavigate) {
        onNavigate("academia", { articleId: link.articleId });
      }
    } else if (link.url) {
      window.open(link.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="assistant-widget-root" aria-label="Asistente Virtual">
      {!isOpen && (
        <button
          type="button"
          className="assistant-launcher-btn"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir asistente virtual"
        >
          <div className="assistant-launcher-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="assistant-launcher-text">¿Dudas?</span>
          {hasUnread && <span className="assistant-unread-dot" />}
        </button>
      )}

      {isOpen && (
        <div className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-header-title">
          {/* Header */}
          <div className="assistant-header">
            <div className="assistant-header-identity">
              <div className="assistant-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2M7.5 13A2.5 2.5 0 005 15.5 2.5 2.5 0 007.5 18a2.5 2.5 0 002.5-2.5A2.5 2.5 0 007.5 13m9 0a2.5 2.5 0 00-2.5 2.5 2.5 2.5 0 002.5 2.5 2.5 2.5 0 002.5-2.5 2.5 2.5 0 00-2.5-2.5z" />
                </svg>
                <span className="assistant-status-dot" title="En línea" />
              </div>
              <div>
                <h3 id="assistant-header-title" className="assistant-header-title">
                  Asistente RutaHogar
                </h3>
                <span className="assistant-header-subtitle">
                  Orientación pre-evaluación y finanzas
                </span>
              </div>
            </div>

            <div className="assistant-header-actions">
              <button
                type="button"
                className="assistant-btn-icon"
                onClick={handleClear}
                title="Reiniciar chat"
                aria-label="Reiniciar chat"
              >
                ↺
              </button>
              <button
                type="button"
                className="assistant-btn-icon"
                onClick={() => setIsOpen(false)}
                title="Minimizar asistente"
                aria-label="Minimizar asistente"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Privacy Disclaimer Banner */}
          <div className="assistant-banner">
            <span>🔒 Tus datos están protegidos. No compartas claves ni contraseñas.</span>
          </div>

          {/* Messages Stream */}
          <div className="assistant-messages-body">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`assistant-msg-row ${
                  msg.role === "user" ? "assistant-msg-user" : "assistant-msg-bot"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="assistant-msg-avatar">RH</div>
                )}
                <div className="assistant-bubble-container">
                  <div className="assistant-bubble">
                    <p className="assistant-bubble-text">{msg.content}</p>

                    {/* Sources Badge */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="assistant-sources-tag">
                        <span>Guía:</span> {msg.sources.slice(0, 2).join(" · ")}
                      </div>
                    )}

                    {/* Action Button (e.g. Focus field) */}
                    {msg.action && (
                      <button
                        type="button"
                        className="assistant-action-chip"
                        onClick={() => handleActionClick(msg.action)}
                      >
                        <span className="assistant-action-icon">📍</span>
                        <span>{msg.action.label || "Ir al campo en pantalla"}</span>
                      </button>
                    )}

                    {/* Links Buttons (e.g. Open Academy article) */}
                    {msg.links && msg.links.length > 0 && (
                      <div className="assistant-links-container">
                        {msg.links.map((lnk, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="assistant-link-chip"
                            onClick={() => handleLinkClick(lnk)}
                          >
                            <span>📖</span>
                            <span>{lnk.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* E3: Answer Feedback Thumbs */}
                    {msg.role === "assistant" && msg.id !== "welcome" && !msg.id.startsWith("ticket-confirm") && (
                      <div className="assistant-feedback-row">
                        {!msg.feedback ? (
                          <>
                            <span className="assistant-feedback-label">¿Te sirvió esta respuesta?</span>
                            <div className="assistant-feedback-buttons">
                              <button
                                type="button"
                                className="assistant-feedback-btn"
                                onClick={() => handleFeedback(msg.id, "helpful")}
                                title="Sí, me sirvió"
                              >
                                👍 Sí
                              </button>
                              <button
                                type="button"
                                className="assistant-feedback-btn"
                                onClick={() => handleFeedback(msg.id, "unhelpful")}
                                title="No me sirvió"
                              >
                                👎 No
                              </button>
                            </div>
                          </>
                        ) : msg.feedback === "helpful" ? (
                          <span className="assistant-feedback-thanks">¡Gracias por tu valoración! 😊</span>
                        ) : (
                          <span className="assistant-feedback-thanks">Lamentamos que no te haya servido.</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* E3: Escalation Offer Card */}
                  {msg.role === "assistant" && msg.suggestEscalation && (
                    <div className="assistant-escalation-card">
                      <div className="assistant-escalation-card-content">
                        <span className="assistant-escalation-icon">🛎️</span>
                        <div className="assistant-escalation-text">
                          <strong>¿Necesitas atención personalizada?</strong>
                          <p>Podemos canalizar tu consulta con nuestro equipo de soporte.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="assistant-escalation-action-btn"
                        onClick={() => handleOpenTicket(msg)}
                      >
                        ✉️ Contactar a Soporte
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="assistant-msg-row assistant-msg-bot">
                <div className="assistant-msg-avatar">RH</div>
                <div className="assistant-bubble assistant-typing-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          {messages.length <= 3 && !isTyping && (
            <div className="assistant-quick-prompts">
              <span className="assistant-quick-prompts-title">Preguntas frecuentes:</span>
              <div className="assistant-quick-prompts-list">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="assistant-prompt-pill"
                    onClick={() => handleSend(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer Input */}
          <form
            className="assistant-footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="assistant-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pregunta sobre la pre-evaluación..."
              maxLength={400}
              disabled={isTyping}
            />
            <button
              type="submit"
              className="assistant-send-btn"
              disabled={!inputText.trim() || isTyping}
              aria-label="Enviar mensaje"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>

          {/* Legal Note */}
          <div className="assistant-legal-note">
            Orientación referencial. No constituye aprobación crediticia bancaria.
          </div>

          {/* E4: Ticket Creation Modal Overlay */}
          {ticketModalOpen && (
            <div className="assistant-modal-backdrop" role="dialog" aria-modal="true">
              <div className="assistant-modal-panel">
                <div className="assistant-modal-header">
                  <div>
                    <h4 className="assistant-modal-title">
                      {ticketSuccess ? "¡Ticket Enviado!" : "Contactar a Soporte"}
                    </h4>
                    <span className="assistant-modal-subtitle">
                      {ticketSuccess ? "Te responderemos a la brevedad" : "Resolución asistida por nuestro equipo"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="assistant-btn-icon"
                    onClick={() => {
                      setTicketModalOpen(false);
                      setTicketSuccess(null);
                    }}
                    title="Cerrar ventana"
                  >
                    ✕
                  </button>
                </div>

                {ticketSuccess ? (
                  <div className="assistant-ticket-success-view">
                    <div className="assistant-ticket-success-badge">✓</div>
                    <div className="assistant-ticket-code-card">
                      <span className="code-label">Código de seguimiento</span>
                      <strong className="code-value">#{ticketSuccess.code}</strong>
                    </div>
                    <p className="assistant-ticket-success-text">
                      Hemos recibido tu ticket y una copia fue notificada al equipo de soporte de RutaHogar.
                      Responderemos directamente a tu correo electrónico.
                    </p>
                    <button
                      type="button"
                      className="assistant-btn-primary"
                      onClick={() => {
                        setTicketModalOpen(false);
                        setTicketSuccess(null);
                      }}
                    >
                      Volver al Chat
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitTicket} className="assistant-ticket-form">
                    <div className="assistant-form-group">
                      <label htmlFor="ticket-subject" className="assistant-form-label">
                        Asunto
                      </label>
                      <input
                        id="ticket-subject"
                        type="text"
                        className="assistant-form-input"
                        value={ticketSubject}
                        onChange={(e) => setTicketSubject(e.target.value)}
                        placeholder="Ej: Duda sobre ingreso líquido"
                        maxLength={120}
                        required
                      />
                    </div>

                    <div className="assistant-form-group">
                      <label htmlFor="ticket-message" className="assistant-form-label">
                        Mensaje o Detalle
                      </label>
                      <textarea
                        id="ticket-message"
                        className="assistant-form-textarea"
                        value={ticketMessage}
                        onChange={(e) => setTicketMessage(e.target.value)}
                        placeholder="Explica qué problema tuviste o en qué paso necesitas ayuda..."
                        maxLength={2000}
                        rows={4}
                        required
                      />
                    </div>

                    <div className="assistant-ticket-privacy-notice">
                      <span>🔒</span>
                      <p>
                        Adjuntaremos los últimos mensajes de este chat para darte una solución rápida.
                        Cualquier dato sensible (RUT, números de cuenta) se elimina de forma automática.
                      </p>
                    </div>

                    {ticketError && (
                      <div className="assistant-ticket-error-alert">{ticketError}</div>
                    )}

                    <div className="assistant-modal-actions">
                      <button
                        type="button"
                        className="assistant-btn-secondary"
                        onClick={() => setTicketModalOpen(false)}
                        disabled={ticketSubmitting}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="assistant-btn-primary"
                        disabled={ticketSubmitting || !ticketMessage.trim()}
                      >
                        {ticketSubmitting ? "Enviando..." : "Enviar Ticket"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* E4: Unauthenticated Modal Overlay */}
          {authModalOpen && (
            <div className="assistant-modal-backdrop" role="dialog" aria-modal="true">
              <div className="assistant-modal-panel">
                <div className="assistant-modal-header">
                  <div>
                    <h4 className="assistant-modal-title">Identificación requerida</h4>
                    <span className="assistant-modal-subtitle">Para seguimiento de soporte</span>
                  </div>
                  <button
                    type="button"
                    className="assistant-btn-icon"
                    onClick={() => setAuthModalOpen(false)}
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>

                <div className="assistant-auth-req-body">
                  <div className="assistant-auth-icon">👤</div>
                  <p className="assistant-auth-req-text">
                    Para registrar un ticket de soporte y recibir una respuesta por correo electrónico,
                    es necesario que inicies sesión en RutaHogar.
                  </p>
                  <div className="assistant-modal-actions">
                    <button
                      type="button"
                      className="assistant-btn-secondary"
                      onClick={() => setAuthModalOpen(false)}
                    >
                      Continuar en el chat
                    </button>
                    <button
                      type="button"
                      className="assistant-btn-primary"
                      onClick={() => {
                        setAuthModalOpen(false);
                        if (onNavigate) {
                          onNavigate("login");
                        }
                      }}
                    >
                      Iniciar Sesión
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
