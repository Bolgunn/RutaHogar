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
  getUserSupportTickets,
  submitTicketUserFeedback,
} from "../../services/supportTicketsService";
import "./AssistantWidget.css";

const QUICK_PROMPTS = [
  "¿Cuáles son los pasos de la pre-evaluación?",
  "¿Qué deudas debo ingresar?",
  "¿Qué es el ingreso mensual líquido?",
  "¿Cómo funciona complementar renta?",
];

const DEFAULT_WELCOME = {
  id: "welcome",
  role: "assistant",
  content:
    "¡Hola! Soy tu asistente virtual de RutaHogar. Puedo orientarte sobre los 4 pasos de la pre-evaluación, el significado de cada campo y conceptos financieros. ¿En qué te puedo ayudar hoy?",
  action: null,
  links: [],
  sources: [],
  feedback: null,
  suggestEscalation: false,
};

function formatFecha(val) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStorageKey(prof) {
  if (prof?.id) return `rutahogar_assistant_msgs_${prof.id}`;
  if (prof?.email) return `rutahogar_assistant_msgs_${prof.email}`;
  return "rutahogar_assistant_msgs_guest";
}

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

  // Persistent messages state
  const [messages, setMessages] = useState(() => {
    try {
      const key = getStorageKey(profile);
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [DEFAULT_WELCOME];
  });

  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);

  // E3 & E4: Support ticket states
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(null);
  const [ticketError, setTicketError] = useState(null);

  // Feedback & follow-up states on admin responses
  const [submittingFeedback, setSubmittingFeedback] = useState({});
  const [followUpOpen, setFollowUpOpen] = useState({});
  const [followUpReplies, setFollowUpReplies] = useState({});

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Persist messages whenever they change
  useEffect(() => {
    try {
      const key = getStorageKey(profile);
      localStorage.setItem(key, JSON.stringify(messages));
    } catch (err) {
      console.warn("[AssistantWidget] Could not persist messages:", err);
    }
  }, [messages, profile?.id, profile?.email]);

  // Reload messages when profile switches
  useEffect(() => {
    try {
      const key = getStorageKey(profile);
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {}
  }, [profile?.id, profile?.email]);

  // Sync tickets and admin responses
  const syncTicketsAndReplies = async () => {
    try {
      const userTickets = await getUserSupportTickets({
        userId: profile?.id || null,
        token,
      });

      if (!userTickets || !Array.isArray(userTickets) || userTickets.length === 0) {
        return;
      }

      // Sort by created_at desc
      const sorted = [...userTickets].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

      const active = sorted.find(
        (t) => t.status === "abierto" || t.status === "en_proceso" || t.status === "en_curso"
      );
      const latest = active || sorted[0];
      setActiveTicket(latest || null);

      setMessages((prev) => {
        let updated = [...prev];
        const isFresh = updated.length === 1 && updated[0].id === "welcome";

        // Restore context if conversation was clean but active ticket exists
        if (isFresh && latest && latest.message) {
          updated.push({
            id: `user-ticket-inquiry-${latest.id}`,
            role: "user",
            content: latest.message,
            createdAt: latest.created_at,
          });
          updated.push({
            id: `ticket-confirm-${latest.id}`,
            role: "assistant",
            content: `✅ Ticket de soporte #${latest.code || latest.id.slice(0, 8).toUpperCase()} registrado sobre "${latest.subject || 'Consulta'}".`,
            ticketCode: latest.code,
            ticketStatus: latest.status,
            feedback: "helpful",
          });
        }

        let hasNewAdminReply = false;
        for (const t of sorted) {
          const ticketCode = t.code || t.id.slice(0, 8).toUpperCase();
          const normalizedStatus = t.status === "en_curso" ? "en_proceso" : t.status;

          if (t.thread && Array.isArray(t.thread) && t.thread.length > 0) {
            let lastAdminIdx = -1;
            for (let i = 0; i < t.thread.length; i++) {
              if (t.thread[i].role === "admin") {
                lastAdminIdx = i;
              }
            }

            t.thread.forEach((turn, idx) => {
              if (idx === 0 && turn.role === "user") {
                return;
              }

              if (turn.role === "admin") {
                const replyId = `admin-reply-${t.id}-${idx}`;
                const isLatest = idx === lastAdminIdx;
                const adminMsg = {
                  id: replyId,
                  role: "admin",
                  authorName: "Soporte RutaHogar",
                  content: turn.content,
                  ticketId: t.id,
                  ticketCode,
                  ticketSubject: t.subject,
                  ticketStatus: normalizedStatus,
                  userFeedback: t.user_feedback,
                  isLatestAdminTurn: isLatest,
                  repliedAt: turn.created_at || t.replied_at || new Date().toISOString(),
                  createdAt: turn.created_at || t.replied_at || new Date().toISOString(),
                };

                const existingIndex = updated.findIndex(
                  (m) =>
                    m.id === replyId ||
                    (m.role === "admin" && m.ticketId === t.id && m.content === turn.content)
                );

                if (existingIndex >= 0) {
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...adminMsg,
                  };
                } else {
                  updated.push(adminMsg);
                  hasNewAdminReply = true;
                }
              } else if (turn.role === "user") {
                const userReplyId = `user-reply-${t.id}-${idx}`;
                const userMsg = {
                  id: userReplyId,
                  role: "user",
                  content: turn.content,
                  ticketId: t.id,
                  ticketCode,
                  isTicketFollowUp: true,
                  createdAt: turn.created_at || new Date().toISOString(),
                };

                const existingIndex = updated.findIndex(
                  (m) =>
                    m.id === userReplyId ||
                    (m.role === "user" && m.ticketId === t.id && m.content === turn.content)
                );

                if (existingIndex >= 0) {
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...userMsg,
                  };
                } else {
                  updated.push(userMsg);
                }
              }
            });
          } else if (t.admin_reply && String(t.admin_reply).trim()) {
            const replyId = `admin-reply-${t.id}`;
            const existingIndex = updated.findIndex(
              (m) =>
                m.id === replyId ||
                (m.role === "admin" && (m.ticketId === t.id || m.content === t.admin_reply))
            );

            const adminMsg = {
              id: replyId,
              role: "admin",
              authorName: "Soporte RutaHogar",
              content: t.admin_reply,
              ticketId: t.id,
              ticketCode,
              ticketSubject: t.subject,
              ticketStatus: normalizedStatus,
              userFeedback: t.user_feedback,
              isLatestAdminTurn: true,
              repliedAt: t.replied_at || t.status_updated_at || new Date().toISOString(),
              createdAt: t.replied_at || new Date().toISOString(),
            };

            if (existingIndex >= 0) {
              if (
                updated[existingIndex].content !== adminMsg.content ||
                updated[existingIndex].ticketStatus !== adminMsg.ticketStatus ||
                updated[existingIndex].userFeedback !== adminMsg.userFeedback
              ) {
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  ...adminMsg,
                };
              }
            } else {
              updated.push(adminMsg);
              hasNewAdminReply = true;
            }
          }
        }

        if (hasNewAdminReply && !isOpen) {
          setHasUnread(true);
        }

        return updated;
      });
    } catch (err) {
      console.warn("[AssistantWidget] syncTicketsAndReplies error:", err);
    }
  };

  // Cross-tab storage synchronization
  useEffect(() => {
    syncTicketsAndReplies();

    const onStorageChange = (e) => {
      if (
        e.key === "rutahogar_support_tickets" ||
        (e.key && e.key.startsWith("rutahogar_assistant_msgs"))
      ) {
        syncTicketsAndReplies();
      }
    };
    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, [profile?.id, token]);

  // Periodic polling while open (every 3.5 seconds)
  useEffect(() => {
    if (!isOpen) return;
    syncTicketsAndReplies();
    const interval = setInterval(syncTicketsAndReplies, 3500);
    return () => clearInterval(interval);
  }, [isOpen, profile?.id, token]);

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
      role: m.role === "admin" ? "assistant" : m.role,
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

  const handleConfirmResolution = async (ticketId, ticketCode) => {
    if (!ticketId || submittingFeedback[ticketId]) return;
    setSubmittingFeedback((prev) => ({ ...prev, [ticketId]: true }));
    try {
      const activeToken = token || (await getActiveAuthToken());
      await submitTicketUserFeedback({
        ticketId,
        feedback: "helpful",
        token: activeToken,
      });

      setActiveTicket((prev) =>
        prev && prev.id === ticketId
          ? { ...prev, status: "resuelto", user_feedback: "helpful" }
          : prev
      );

      setMessages((prev) => [
        ...prev.map((m) =>
          m.ticketId === ticketId && m.role === "admin"
            ? { ...m, ticketStatus: "resuelto", userFeedback: "helpful" }
            : m
        ),
        {
          id: `ticket-resolved-confirm-${Date.now()}`,
          role: "assistant",
          content: `✅ ¡Excelente! Nos alegra haberte ayudado. El ticket #${ticketCode} ha sido marcado como resuelto.`,
          action: null,
          links: [],
          sources: [],
          feedback: "helpful",
        },
      ]);
    } catch (err) {
      console.warn("[AssistantWidget] Error confirming ticket resolution:", err);
    } finally {
      setSubmittingFeedback((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleToggleFollowUp = (ticketId) => {
    setFollowUpOpen((prev) => ({ ...prev, [ticketId]: !prev[ticketId] }));
  };

  const handleSendFollowUp = async (ticketId, ticketCode) => {
    const replyText = (followUpReplies[ticketId] || "").trim();
    if (!replyText || submittingFeedback[ticketId]) return;

    setSubmittingFeedback((prev) => ({ ...prev, [ticketId]: true }));
    try {
      const activeToken = token || (await getActiveAuthToken());
      const nowIso = new Date().toISOString();
      await submitTicketUserFeedback({
        ticketId,
        feedback: "unhelpful",
        userReply: replyText,
        token: activeToken,
      });

      setActiveTicket((prev) =>
        prev && prev.id === ticketId
          ? { ...prev, status: "en_proceso", user_feedback: "unhelpful" }
          : prev
      );

      setMessages((prev) => [
        ...prev.map((m) =>
          m.ticketId === ticketId && m.role === "admin"
            ? { ...m, userFeedback: "unhelpful" }
            : m
        ),
        {
          id: `user-reply-${ticketId}-${Date.now()}`,
          role: "user",
          content: replyText,
          ticketId,
          ticketCode,
          isTicketFollowUp: true,
          createdAt: nowIso,
        },
        {
          id: `followup-ack-${Date.now()}`,
          role: "assistant",
          content: `📨 Tu mensaje fue enviado al equipo de soporte sobre el Ticket #${ticketCode}. Te responderemos aquí mismo y a tu correo en cuanto el administrador revise tu réplica.`,
          action: null,
          links: [],
          sources: [],
          feedback: "helpful",
        },
      ]);

      setFollowUpReplies((prev) => ({ ...prev, [ticketId]: "" }));
      setFollowUpOpen((prev) => ({ ...prev, [ticketId]: false }));
    } catch (err) {
      console.warn("[AssistantWidget] Error sending follow-up reply:", err);
    } finally {
      setSubmittingFeedback((prev) => ({ ...prev, [ticketId]: false }));
    }
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
    setTicketMessage(
      refMsg
        ? `Tengo dudas con respecto a la respuesta: "${refMsg.content.slice(0, 100)}..."`
        : ""
    );
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
      setActiveTicket(res);

      // Append confirmation message in chat stream
      setMessages((prev) => [
        ...prev,
        {
          id: `ticket-confirm-${Date.now()}`,
          role: "assistant",
          content: `✅ Se ha creado exitosamente tu ticket de soporte #${res.code} con el asunto "${ticketSubject}". Nuestro equipo revisará tu consulta y te responderá directamente en este chat y a tu correo electrónico.`,
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
    try {
      const key = getStorageKey(profile);
      localStorage.removeItem(key);
    } catch {}
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
    } else if ((link.type === "navigate" || link.target || link.route) && onNavigate) {
      onNavigate(link.target || link.route);
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
            <span>🔒 Tus datos están protegidos. No compartas claves bancarias.</span>
          </div>

          {/* Active Ticket Banner if exists */}
          {activeTicket && (
            <div className="assistant-active-ticket-banner">
              <div className="active-ticket-info">
                <span className="active-ticket-icon">🎫</span>
                <div className="active-ticket-text">
                  <span className="active-ticket-title">
                    Ticket #{activeTicket.code || activeTicket.id?.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="active-ticket-subject">
                    {activeTicket.subject || "Consulta de soporte"}
                  </span>
                </div>
              </div>
              <span className={`active-ticket-status-pill status-${activeTicket.status || "abierto"}`}>
                {activeTicket.status === "abierto"
                  ? "⏳ En espera"
                  : activeTicket.status === "en_proceso" || activeTicket.status === "en_curso"
                  ? "💬 En atención"
                  : activeTicket.status === "resuelto"
                  ? "✓ Resuelto"
                  : "Cerrado"}
              </span>
            </div>
          )}

          {/* Messages Stream */}
          <div className="assistant-messages-body">
            {messages.map((msg) => {
              // Role: ADMIN (Human Support Staff Response)
              if (msg.role === "admin") {
                const isTicketResolved =
                  msg.ticketStatus === "resuelto" ||
                  activeTicket?.status === "resuelto" ||
                  msg.userFeedback === "helpful";

                return (
                  <div key={msg.id} className="assistant-msg-row assistant-msg-admin">
                    <div className="assistant-admin-avatar" title="Administrador de RutaHogar">
                      🛡️
                    </div>
                    <div className="assistant-bubble-container">
                      <div className="assistant-bubble assistant-admin-bubble">
                        <div className="assistant-admin-bubble-header">
                          <div className="admin-header-title-row">
                            <span className="admin-sender-name">Soporte RutaHogar</span>
                            <span className="admin-role-badge">ADMINISTRADOR</span>
                          </div>
                          {msg.ticketCode && (
                            <span className="admin-ticket-tag">#{msg.ticketCode}</span>
                          )}
                        </div>

                        <p className="assistant-bubble-text assistant-admin-text">
                          {msg.content}
                        </p>

                        <div className="assistant-admin-bubble-footer">
                          <span className="admin-time-label">
                            {formatFecha(msg.repliedAt || msg.createdAt)}
                          </span>
                          <span className={`admin-status-pill status-${isTicketResolved ? "resuelto" : "en_proceso"}`}>
                            {isTicketResolved ? "✓ Resuelto" : "En Proceso"}
                          </span>
                        </div>

                        {/* User Feedback & Follow-up Prompt for Latest Admin Response */}
                        {msg.isLatestAdminTurn && (
                          <div className="assistant-admin-feedback-container">
                            {isTicketResolved ? (
                              <div className="assistant-admin-resolved-chip">
                                <span className="resolved-check-icon">✓</span>
                                <span>Duda resuelta. ¡Gracias por confirmar!</span>
                              </div>
                            ) : (
                              <>
                                <div className="assistant-admin-feedback-box">
                                  <span className="admin-feedback-prompt">
                                    ¿Esta respuesta resolvió tu duda?
                                  </span>
                                  <div className="admin-feedback-buttons">
                                    <button
                                      type="button"
                                      className="admin-feedback-btn yes"
                                      onClick={() => handleConfirmResolution(msg.ticketId, msg.ticketCode)}
                                      disabled={submittingFeedback[msg.ticketId]}
                                      title="Sí, la respuesta resolvió mi consulta"
                                    >
                                      👍 Sí, resolvió mi duda
                                    </button>
                                    <button
                                      type="button"
                                      className={`admin-feedback-btn no ${followUpOpen[msg.ticketId] ? "active" : ""}`}
                                      onClick={() => handleToggleFollowUp(msg.ticketId)}
                                      disabled={submittingFeedback[msg.ticketId]}
                                      title="No me sirvió, deseo consultar de nuevo"
                                    >
                                      👎 No, sigo con dudas
                                    </button>
                                  </div>
                                </div>

                                {followUpOpen[msg.ticketId] && (
                                  <div className="assistant-admin-followup-box">
                                    <label className="admin-followup-label">
                                      Escribe tu duda adicional para el administrador:
                                    </label>
                                    <textarea
                                      className="admin-followup-textarea"
                                      rows={3}
                                      placeholder="Explica qué punto no quedó claro o qué más necesitas saber..."
                                      value={followUpReplies[msg.ticketId] || ""}
                                      onChange={(e) =>
                                        setFollowUpReplies((prev) => ({
                                          ...prev,
                                          [msg.ticketId]: e.target.value,
                                        }))
                                      }
                                      disabled={submittingFeedback[msg.ticketId]}
                                    />
                                    <div className="admin-followup-actions">
                                      <button
                                        type="button"
                                        className="admin-followup-cancel-btn"
                                        onClick={() => handleToggleFollowUp(msg.ticketId)}
                                        disabled={submittingFeedback[msg.ticketId]}
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        className="admin-followup-send-btn"
                                        onClick={() => handleSendFollowUp(msg.ticketId, msg.ticketCode)}
                                        disabled={
                                          submittingFeedback[msg.ticketId] ||
                                          !(followUpReplies[msg.ticketId] || "").trim()
                                        }
                                      >
                                        {submittingFeedback[msg.ticketId] ? "Enviando..." : "✉️ Enviar al Administrador"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Standard User or Virtual Assistant messages
              return (
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
                      {msg.isTicketFollowUp && (
                        <div className="user-ticket-followup-tag">
                          <span>🎫 Réplica sobre Ticket #{msg.ticketCode}</span>
                        </div>
                      )}
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

                      {/* Links Buttons (e.g. Open Academy article or navigate to section) */}
                      {msg.links && msg.links.length > 0 && (
                        <div className="assistant-links-container">
                          {msg.links.map((lnk, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="assistant-link-chip"
                              onClick={() => handleLinkClick(lnk)}
                            >
                              <span>{lnk.type === "academy" ? "📖" : "🧭"}</span>
                              <span>{lnk.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* E3: Answer Feedback Thumbs */}
                      {msg.role === "assistant" &&
                        msg.id !== "welcome" &&
                        !msg.id.startsWith("ticket-confirm") && (
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
              );
            })}

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
              placeholder="Escribe tu mensaje o consulta..."
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

          {/* Live Indicator Note */}
          <div className="assistant-legal-note">
            ● Conversación activa · Respuestas de soporte y asistente en vivo
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
                      {ticketSuccess
                        ? "Te responderemos aquí mismo y a tu correo"
                        : "Resolución asistida por nuestro equipo"}
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
                      Hemos recibido tu ticket y el equipo de soporte fue notificado.
                      Podrás ver la respuesta directamente en este chat y también la recibirás en tu correo.
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
                        Cualquier dato sensible (RUT, números de cuenta) se anonimiza automáticamente.
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
