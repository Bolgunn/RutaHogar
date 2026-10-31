import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase before imports so Node environment doesn't fail
vi.mock("../utils/supabase", () => ({
  supabase: null,
}));

vi.mock("../services/profileService", () => ({
  isSupabaseDataConfigured: false,
  logSupabaseError: vi.fn(),
}));

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

import {
  createSupportTicket,
  getActiveAuthToken,
  getSupportTickets,
  getUserSupportTickets,
  updateSupportTicketStatus,
  submitTicketUserFeedback,
  readLocalSupportTickets,
  writeLocalSupportTickets,
} from "../supportTicketsService";

describe("supportTicketsService.js (HU24 - E4)", () => {
  beforeEach(() => {
    installLocalStorage();
    vi.restoreAllMocks();
  });

  it("throws unauthenticated error when token and profile are missing", async () => {
    await expect(
      createSupportTicket({
        subject: "Test",
        message: "Mensaje",
        token: null,
      })
    ).rejects.toThrow("unauthenticated");
  });

  it("resolves active token automatically from stored profile if token is omitted", async () => {
    globalThis.localStorage.setItem(
      "RutaHogar_profile",
      JSON.stringify({ id: "user-123", email: "claudio@correo.cl", role: "usuario" })
    );

    const token = await getActiveAuthToken();
    expect(token).toBe("local-user-user-123");

    // Creating a ticket should succeed by auto-detecting the session
    const mockFetch = vi.fn().mockRejectedValue(new Error("Offline"));
    const res = await createSupportTicket({
      subject: "Duda con mi sesion",
      message: "Ya estoy autenticado",
      token: null,
      customFetch: mockFetch,
    });
    expect(res.id).toBeTruthy();
    expect(res.status).toBe("abierto");
  });

  it("throws when message is empty", async () => {
    await expect(
      createSupportTicket({
        subject: "Test",
        message: "   ",
        token: "mock-token",
      })
    ).rejects.toThrow("El mensaje del ticket no puede estar vacío.");
  });

  it("creates a ticket via backend API when call succeeds", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "ticket-uuid-1234",
        code: "TICK1234",
        status: "abierto",
        created_at: "2026-10-27T12:00:00Z",
        notified_at: "2026-10-27T12:00:01Z",
      }),
    });

    const res = await createSupportTicket({
      subject: "Duda de dividendo",
      message: "No me cuadra el cálculo",
      token: "valid-token-xyz",
      customFetch: mockFetch,
    });

    expect(res.id).toBe("ticket-uuid-1234");
    expect(res.code).toBe("TICK1234");
    expect(res.status).toBe("abierto");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should also be cached in localStorage
    const local = readLocalSupportTickets();
    expect(local).toHaveLength(1);
    expect(local[0].code).toBe("TICK1234");
  });

  it("falls back to local storage ticket if backend is unreachable", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const res = await createSupportTicket({
      subject: "Fallo de conexión",
      message: "Consulta guardada offline",
      token: "valid-token-xyz",
      customFetch: mockFetch,
    });

    expect(res.id).toBeTruthy();
    expect(res.code).toHaveLength(8);
    expect(res.status).toBe("abierto");

    const local = readLocalSupportTickets();
    expect(local).toHaveLength(1);
    expect(local[0].message).toBe("Consulta guardada offline");
  });

  it("falls back to local storage ticket if backend returns 401 for local/demo user", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const res = await createSupportTicket({
      subject: "Usuario demo local",
      message: "El ticket no debe perderse si el backend rechaza el token demo",
      token: "local-user-demo",
      customFetch: mockFetch,
    });

    expect(res.id).toBeTruthy();
    expect(res.code).toHaveLength(8);
    expect(res.status).toBe("abierto");

    const local = readLocalSupportTickets();
    expect(local).toHaveLength(1);
    expect(local[0].subject).toBe("Usuario demo local");
  });

  it("filters tickets by status in local storage", () => {
    writeLocalSupportTickets([
      { id: "1", status: "abierto" },
      { id: "2", status: "en_proceso" },
      { id: "3", status: "resuelto" },
    ]);

    expect(readLocalSupportTickets("todos")).toHaveLength(3);
    expect(readLocalSupportTickets("abierto")).toHaveLength(1);
    expect(readLocalSupportTickets("resuelto")).toHaveLength(1);
  });

  it("updates ticket status locally when RPC is unavailable", async () => {
    writeLocalSupportTickets([
      { id: "t1", status: "abierto" },
      { id: "t2", status: "abierto" },
    ]);

    await updateSupportTicketStatus({ ticketId: "t1", status: "en_proceso" });
    const local = readLocalSupportTickets();
    expect(local.find((t) => t.id === "t1").status).toBe("en_proceso");
    expect(local.find((t) => t.id === "t2").status).toBe("abierto");
  });

  it("updates ticket status and records admin reply in local storage", async () => {
    writeLocalSupportTickets([
      { id: "t-reply", status: "abierto", admin_reply: null },
    ]);

    const res = await updateSupportTicketStatus({
      ticketId: "t-reply",
      status: "en_proceso",
      reply: "Hola, revisamos tu caso y ya fue corregido el dividendo.",
    });

    expect(res.status).toBe("en_proceso");
    expect(res.admin_reply).toBe("Hola, revisamos tu caso y ya fue corregido el dividendo.");

    const local = readLocalSupportTickets();
    const updated = local.find((t) => t.id === "t-reply");
    expect(updated.status).toBe("en_proceso");
    expect(updated.admin_reply).toBe("Hola, revisamos tu caso y ya fue corregido el dividendo.");
    expect(updated.replied_at).toBeTruthy();
  });

  it("calls backend PATCH endpoint to update status and send reply", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "t-patch",
        status: "resuelto",
        admin_reply: "Caso resuelto",
        replied_at: "2026-10-27T15:00:00Z",
      }),
    });

    writeLocalSupportTickets([
      { id: "t-patch", status: "en_proceso" },
    ]);

    const res = await updateSupportTicketStatus({
      ticketId: "t-patch",
      status: "resuelto",
      reply: "Caso resuelto",
      token: "valid-admin-token",
      customFetch: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("resuelto");
    expect(res.admin_reply).toBe("Caso resuelto");

    const local = readLocalSupportTickets();
    expect(local.find((t) => t.id === "t-patch").status).toBe("resuelto");
  });

  it("retrieves user tickets including admin reply via getUserSupportTickets", async () => {
    writeLocalSupportTickets([
      {
        id: "t-user-1",
        user_id: "user-abc",
        status: "en_proceso",
        admin_reply: "Estimado, tu consulta fue revisada.",
        replied_at: "2026-10-28T03:00:00Z",
      },
      {
        id: "t-user-2",
        user_id: "user-other",
        status: "abierto",
      },
    ]);

    const tickets = await getUserSupportTickets({ userId: "user-abc" });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe("t-user-1");
    expect(tickets[0].admin_reply).toBe("Estimado, tu consulta fue revisada.");
  });

  it("submits helpful feedback resolving ticket in local storage", async () => {
    writeLocalSupportTickets([
      {
        id: "t-fb-1",
        status: "en_proceso",
        admin_reply: "El valor UF considerado es de hoy.",
        thread: [{ role: "admin", content: "El valor UF considerado es de hoy." }],
      },
    ]);

    const res = await submitTicketUserFeedback({
      ticketId: "t-fb-1",
      feedback: "helpful",
    });

    expect(res.status).toBe("resuelto");
    expect(res.user_feedback).toBe("helpful");

    const local = readLocalSupportTickets();
    const updated = local.find((t) => t.id === "t-fb-1");
    expect(updated.status).toBe("resuelto");
    expect(updated.user_feedback).toBe("helpful");
    expect(updated.user_feedback_at).toBeTruthy();
  });

  it("submits unhelpful feedback with user follow-up reply in local storage", async () => {
    writeLocalSupportTickets([
      {
        id: "t-fb-2",
        status: "en_proceso",
        admin_reply: "Debes adjuntar tu liquidación.",
        thread: [
          { role: "user", content: "No sé qué documento subir" },
          { role: "admin", content: "Debes adjuntar tu liquidación." },
        ],
      },
    ]);

    const res = await submitTicketUserFeedback({
      ticketId: "t-fb-2",
      feedback: "unhelpful",
      userReply: "Soy independiente, ¿sirve la carpeta tributaria?",
    });

    expect(res.status).toBe("en_proceso");
    expect(res.user_feedback).toBe("unhelpful");

    const local = readLocalSupportTickets();
    const updated = local.find((t) => t.id === "t-fb-2");
    expect(updated.status).toBe("en_proceso");
    expect(updated.user_feedback).toBe("unhelpful");
    expect(updated.thread).toHaveLength(3);
    expect(updated.thread[2].role).toBe("user");
    expect(updated.thread[2].content).toBe("Soy independiente, ¿sirve la carpeta tributaria?");
  });

  it("submits feedback via backend POST endpoint when available", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "t-fb-3",
        status: "resuelto",
        user_feedback: "helpful",
        user_feedback_at: "2026-10-28T03:30:00Z",
      }),
    });

    writeLocalSupportTickets([
      { id: "t-fb-3", status: "en_proceso" },
    ]);

    const res = await submitTicketUserFeedback({
      ticketId: "t-fb-3",
      feedback: "helpful",
      token: "valid-user-token",
      customFetch: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("resuelto");
    expect(res.user_feedback).toBe("helpful");

    const local = readLocalSupportTickets();
    expect(local.find((t) => t.id === "t-fb-3").status).toBe("resuelto");
  });
});
