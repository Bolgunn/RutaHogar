/**
 * Service for Support Tickets (HU24 - E4).
 * Handles ticket creation, listing, status updates with Supabase integration and local-mode fallback.
 */

import { supabase } from "../utils/supabase";
import { getAssistantApiBaseUrl } from "../lib/assistant/assistantClient";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

const SUPPORT_TICKETS_KEY = "rutahogar_support_tickets";

/**
 * Dynamically resolves the active user token, prioritizing the freshest Supabase session token
 * so that background token refreshes (TOKEN_REFRESHED) are always respected.
 *
 * @param {string|null} [explicitToken]
 * @returns {Promise<string|null>}
 */
export async function getActiveAuthToken(explicitToken = null) {
  // 1. Always prefer the live Supabase session first when configured (avoids stale prop tokens)
  if (isSupabaseDataConfigured && supabase?.auth) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        return data.session.access_token;
      }
    } catch (err) {
      console.warn("[supportTicketsService] Failed reading supabase session:", err);
    }
  }

  // 2. Use explicit token if provided
  if (explicitToken && typeof explicitToken === "string" && explicitToken.trim()) {
    return explicitToken.trim();
  }

  // 3. Try reading from localStorage RutaHogar_session
  try {
    const rawSession = localStorage.getItem("RutaHogar_session");
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed?.access_token) return parsed.access_token;
      if (parsed?.token) return parsed.token;
    }
  } catch {}

  // 4. Fallback ONLY when Supabase is not configured (local/demo mode)
  if (!isSupabaseDataConfigured) {
    try {
      const rawProfile = localStorage.getItem("RutaHogar_profile");
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile);
        if (parsed && (parsed.id || parsed.user_id || parsed.email)) {
          return `local-user-${parsed.id || parsed.user_id || parsed.email}`;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Reads local cached support tickets from localStorage.
 * @param {string} [filterStatus]
 * @returns {Array<any>}
 */
export function readLocalSupportTickets(filterStatus = "todos") {
  try {
    const list = JSON.parse(localStorage.getItem(SUPPORT_TICKETS_KEY)) || [];
    if (!filterStatus || filterStatus === "todos") return list;
    return list.filter((t) => t.status === filterStatus);
  } catch {
    return [];
  }
}

/**
 * Writes support tickets to localStorage.
 * @param {Array<any>} tickets
 */
export function writeLocalSupportTickets(tickets) {
  try {
    localStorage.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(tickets));
  } catch (err) {
    console.warn("[supportTicketsService] Failed to write localStorage:", err);
  }
}

/**
 * Creates a support ticket attached to the authenticated user.
 *
 * @param {Object} params
 * @param {string} params.subject
 * @param {string} params.message
 * @param {Array<{role: string, content: string, ts?: string}>} [params.history]
 * @param {string} [params.screenId]
 * @param {string} [params.token]
 * @param {string} [params.userId]
 * @param {string} [params.clientRequestId]
 * @param {typeof fetch} [params.customFetch]
 * @returns {Promise<{
 *   id: string,
 *   code: string,
 *   status: string,
 *   created_at: string,
 *   notified_at?: string|null,
 *   notification_error?: string|null
 * }>}
 */
export async function createSupportTicket({
  subject,
  message,
  history = [],
  screenId = null,
  token = null,
  userId = null,
  clientRequestId = null,
  customFetch = fetch,
}) {
  const activeToken = await getActiveAuthToken(token);
  if (!activeToken) {
    throw new Error("unauthenticated");
  }

  let effectiveUserId = userId;
  if (!effectiveUserId) {
    try {
      const rawProfile = localStorage.getItem("RutaHogar_profile");
      if (rawProfile) {
        const p = JSON.parse(rawProfile);
        effectiveUserId = p.id || p.user_id || null;
      }
    } catch {}
  }

  const cleanSubject = (subject || "Consulta de soporte").trim().slice(0, 120);
  const cleanMessage = (message || "").trim().slice(0, 2000);
  if (!cleanMessage) {
    throw new Error("El mensaje del ticket no puede estar vacío.");
  }

  const reqId =
    clientRequestId ||
    (typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const baseUrl = getAssistantApiBaseUrl();
  const url = `${baseUrl}/api/support/tickets`;

  const payload = {
    subject: cleanSubject,
    message: cleanMessage,
    history: history.slice(-10).map((h) => ({
      role: h.role,
      content: String(h.content || "").slice(0, 1000),
      ts: h.ts || new Date().toISOString(),
    })),
    screen_id: screenId || null,
    client_request_id: reqId,
  };

  let res;
  try {
    res = await customFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    // When Supabase is configured in production, never fake ticket creation on network failure
    if (isSupabaseDataConfigured) {
      throw new Error(
        "No se pudo conectar con el servidor de soporte. Verifica tu conexión e inténtalo nuevamente."
      );
    }
    res = null;
  }

  if (res) {
    if (res.ok) {
      const data = await res.json();
      const ticketToStore = {
        ...data,
        user_id: data.user_id || effectiveUserId,
      };
      const existing = readLocalSupportTickets();
      writeLocalSupportTickets([
        ticketToStore,
        ...existing.filter((t) => t.id !== ticketToStore.id),
      ]);
      return ticketToStore;
    }

    let errBody = null;
    try {
      errBody = await res.json();
    } catch {}

    if (res.status === 401) {
      throw new Error("unauthenticated");
    }

    const serverMsg =
      errBody?.detail?.message ||
      (typeof errBody?.detail === "string" ? errBody.detail : null) ||
      errBody?.message ||
      `No se pudo crear el ticket de soporte (error ${res.status}).`;
    throw new Error(serverMsg);
  }

  // Graceful fallback ONLY for local/demo mode (!isSupabaseDataConfigured) when backend is unreachable
  let storedUserName = "Usuario";
  let storedUserEmail = "";
  try {
    const rawProfile = localStorage.getItem("RutaHogar_profile");
    if (rawProfile) {
      const p = JSON.parse(rawProfile);
      storedUserName = p.full_name || p.email || storedUserName;
      storedUserEmail = p.email || "";
      if (!effectiveUserId) effectiveUserId = p.id || p.user_id || null;
    }
  } catch {}

  const localId =
    typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `local-${Date.now()}`;
  const code = localId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const localTicket = {
    id: localId,
    code,
    user_id: effectiveUserId,
    user_name: storedUserName,
    user_email: storedUserEmail,
    subject: cleanSubject,
    message: cleanMessage,
    status: "abierto",
    created_at: new Date().toISOString(),
    screen_id: screenId,
    transcript: payload.history,
    notified_at: null,
    notification_error: "offline_fallback",
    admin_reply: null,
    replied_at: null,
    user_feedback: null,
    user_feedback_at: null,
    thread: [
      {
        role: "user",
        content: cleanMessage,
        created_at: new Date().toISOString(),
      },
    ],
  };

  const existing = readLocalSupportTickets();
  writeLocalSupportTickets([localTicket, ...existing.filter((t) => t.id !== localId)]);
  return localTicket;
}

/**
 * Retrieves support tickets for admin inbox.
 *
 * @param {Object} [params]
 * @param {string} [params.status="todos"]
 * @returns {Promise<Array<any>>}
 */
export async function getSupportTickets({ status = "todos" } = {}) {
  if (isSupabaseDataConfigured) {
    try {
      let query = supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (status && status !== "todos") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data;
      }
      if (error) {
        logSupabaseError(error);
      }
    } catch (err) {
      console.warn("[supportTicketsService] Supabase fetch error:", err);
    }
  }

  return readLocalSupportTickets(status);
}

/**
 * Retrieves support tickets for the current authenticated user (including admin responses).
 *
 * @param {Object} [params]
 * @param {string|null} [params.userId]
 * @param {string|null} [params.token]
 * @returns {Promise<Array<any>>}
 */
export async function getUserSupportTickets({ userId = null, token = null } = {}) {
  // Security guard: unauthenticated or guest users NEVER have support tickets
  const cleanUserId = typeof userId === "string" ? userId.trim() : null;
  if (!cleanUserId) {
    return [];
  }

  const localTickets = readLocalSupportTickets();
  const matchingLocal = localTickets.filter(
    (lt) => lt.user_id && lt.user_id === cleanUserId
  );

  if (isSupabaseDataConfigured) {
    try {
      const activeToken = await getActiveAuthToken(token);
      if (activeToken) {
        // ALWAYS filter strictly by user_id so admins/staff only see tickets they submitted
        const { data, error } = await supabase
          .from("support_tickets")
          .select("*")
          .eq("user_id", cleanUserId)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.warn("[supportTicketsService] Supabase user fetch error:", err);
    }
    return [];
  }

  // Filter local tickets strictly by this user's ID in local/demo mode
  return matchingLocal;
}

/**
 * Updates a support ticket status and/or records an admin reply.
 *
 * @param {Object} params
 * @param {string} params.ticketId
 * @param {"abierto"|"en_proceso"|"resuelto"|"cerrado"} params.status
 * @param {string|null} [params.reply]
 * @param {string|null} [params.token]
 * @param {typeof fetch} [params.customFetch]
 * @returns {Promise<any>}
 */
export async function updateSupportTicketStatus({
  ticketId,
  status,
  reply = null,
  token = null,
  customFetch = fetch,
}) {
  if (!ticketId || !status) {
    throw new Error("ticketId and status are required");
  }

  const cleanReply =
    reply && typeof reply === "string" && reply.trim() ? reply.trim() : null;
  const nowIso = new Date().toISOString();

  // 1. Try FastAPI backend PATCH endpoint if available
  const activeToken = await getActiveAuthToken(token);
  if (activeToken) {
    let res = null;
    try {
      const baseUrl = getAssistantApiBaseUrl();
      res = await customFetch(`${baseUrl}/api/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          status,
          reply: cleanReply,
        }),
      });
    } catch (err) {
      console.warn("[supportTicketsService] Backend patch unreachable:", err);
    }

    if (res) {
      if (res.ok) {
        const data = await res.json();
        const tickets = readLocalSupportTickets();
        const updated = tickets.map((t) => {
          if (t.id !== ticketId) return t;
          const currentThread = t.thread || [];
          const nextThread = cleanReply
            ? [...currentThread, { role: "admin", content: cleanReply, created_at: nowIso }]
            : currentThread;
          return {
            ...t,
            status: data.status || status,
            admin_reply: cleanReply || t.admin_reply,
            replied_at: cleanReply ? nowIso : t.replied_at,
            thread: data.thread || nextThread,
            updated_at: nowIso,
          };
        });
        writeLocalSupportTickets(updated);
        return data;
      }

      if (res.status === 401) {
        throw new Error("unauthenticated");
      }
      if (res.status === 403) {
        throw new Error("forbidden");
      }
      if (res.status === 404) {
        throw new Error("Ticket no encontrado.");
      }
      if (!isSupabaseDataConfigured) {
        throw new Error(`No se pudo actualizar el ticket (error ${res.status}).`);
      }
    }
  }

  // 2. Try Supabase RPC (pass all 3 arguments explicitly to match 3-param signature)
  if (isSupabaseDataConfigured) {
    const { data, error } = await supabase.rpc("update_support_ticket_status", {
      p_ticket_id: ticketId,
      p_status: status,
      p_reply: cleanReply,
    });

    if (error) {
      logSupabaseError(error);
      throw new Error(error.message || "No se pudo actualizar el estado del ticket.");
    }
    if (!data) {
      throw new Error("Ticket no encontrado.");
    }

    const tickets = readLocalSupportTickets();
    const updated = tickets.map((t) => {
      if (t.id !== ticketId) return t;
      const currentThread = t.thread || [];
      const nextThread = cleanReply
        ? [...currentThread, { role: "admin", content: cleanReply, created_at: nowIso }]
        : currentThread;
      return {
        ...t,
        status: data.status || status,
        admin_reply: cleanReply || t.admin_reply,
        replied_at: cleanReply ? nowIso : t.replied_at,
        thread: data.thread || nextThread,
        updated_at: nowIso,
      };
    });
    writeLocalSupportTickets(updated);
    return data;
  }

  // 3. Update local storage fallback ONLY when Supabase is not configured
  const tickets = readLocalSupportTickets();
  const targetExists = tickets.some((t) => t.id === ticketId);
  if (!targetExists) {
    throw new Error("Ticket no encontrado.");
  }

  let updatedTicket = null;
  const updated = tickets.map((t) => {
    if (t.id !== ticketId) return t;
    const currentThread = t.thread || [];
    const nextThread = cleanReply
      ? [...currentThread, { role: "admin", content: cleanReply, created_at: nowIso }]
      : currentThread;
    updatedTicket = {
      ...t,
      status,
      admin_reply: cleanReply || t.admin_reply,
      replied_at: cleanReply ? nowIso : t.replied_at,
      thread: nextThread,
      updated_at: nowIso,
    };
    return updatedTicket;
  });
  writeLocalSupportTickets(updated);
  return updatedTicket;
}

/**
 * Submits user resolution feedback for a ticket, with optional user follow-up reply.
 *
 * @param {Object} params
 * @param {string} params.ticketId
 * @param {"helpful"|"unhelpful"} params.feedback
 * @param {string|null} [params.userReply]
 * @param {string|null} [params.token]
 * @param {typeof fetch} [params.customFetch]
 * @returns {Promise<any>}
 */
export async function submitTicketUserFeedback({
  ticketId,
  feedback,
  userReply = null,
  token = null,
  customFetch = fetch,
}) {
  if (!ticketId || !feedback) {
    throw new Error("ticketId and feedback are required");
  }

  const cleanReply =
    userReply && typeof userReply === "string" && userReply.trim()
      ? userReply.trim()
      : null;
  const nowIso = new Date().toISOString();
  const newStatus = feedback === "helpful" ? "resuelto" : "en_proceso";

  // 1. Try FastAPI backend endpoint if available
  const activeToken = await getActiveAuthToken(token);
  if (activeToken) {
    let res = null;
    try {
      const baseUrl = getAssistantApiBaseUrl();
      res = await customFetch(`${baseUrl}/api/support/tickets/${ticketId}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          feedback,
          reply: cleanReply,
        }),
      });
    } catch (err) {
      console.warn("[supportTicketsService] Backend feedback unreachable:", err);
    }

    if (res) {
      if (res.ok) {
        const data = await res.json();
        const tickets = readLocalSupportTickets();
        const updated = tickets.map((t) => {
          if (t.id !== ticketId) return t;
          const currentThread = t.thread || [];
          const nextThread = cleanReply
            ? [...currentThread, { role: "user", content: cleanReply, created_at: nowIso }]
            : currentThread;
          return {
            ...t,
            status: data.status || newStatus,
            user_feedback: feedback,
            user_feedback_at: nowIso,
            thread: data.thread || nextThread,
            updated_at: nowIso,
          };
        });
        writeLocalSupportTickets(updated);
        return data;
      }

      if (res.status === 401) {
        throw new Error("unauthenticated");
      }
      if (res.status === 403) {
        throw new Error("forbidden");
      }
      if (res.status === 404) {
        throw new Error("Ticket no encontrado.");
      }
      if (!isSupabaseDataConfigured) {
        throw new Error(`No se pudo enviar la respuesta (error ${res.status}).`);
      }
    }
  }

  // 2. Try Supabase RPC (pass all 3 arguments explicitly to match 3-param signature)
  if (isSupabaseDataConfigured) {
    const { data, error } = await supabase.rpc("submit_ticket_user_feedback", {
      p_ticket_id: ticketId,
      p_feedback: feedback,
      p_user_reply: cleanReply,
    });
    if (error) {
      logSupabaseError(error);
      throw new Error(error.message || "No se pudo registrar tu confirmación.");
    }
    if (!data) {
      throw new Error("Ticket no encontrado.");
    }

    const tickets = readLocalSupportTickets();
    const updated = tickets.map((t) => {
      if (t.id !== ticketId) return t;
      const currentThread = t.thread || [];
      const nextThread = cleanReply
        ? [...currentThread, { role: "user", content: cleanReply, created_at: nowIso }]
        : currentThread;
      return {
        ...t,
        status: data.status || newStatus,
        user_feedback: feedback,
        user_feedback_at: nowIso,
        thread: data.thread || nextThread,
        updated_at: nowIso,
      };
    });
    writeLocalSupportTickets(updated);
    return data;
  }

  // 3. Local storage fallback ONLY when Supabase is not configured
  const tickets = readLocalSupportTickets();
  const targetExists = tickets.some((t) => t.id === ticketId);
  if (!targetExists) {
    throw new Error("Ticket no encontrado.");
  }

  let updatedTicket = null;
  const updated = tickets.map((t) => {
    if (t.id !== ticketId) return t;
    const currentThread = t.thread || [];
    const nextThread = cleanReply
      ? [...currentThread, { role: "user", content: cleanReply, created_at: nowIso }]
      : currentThread;
    updatedTicket = {
      ...t,
      status: newStatus,
      user_feedback: feedback,
      user_feedback_at: nowIso,
      thread: nextThread,
      updated_at: nowIso,
    };
    return updatedTicket;
  });
  writeLocalSupportTickets(updated);
  return updatedTicket;
}
