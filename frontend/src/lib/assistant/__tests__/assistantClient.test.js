import { describe, it, expect, vi } from "vitest";
import { sendAssistantMessage } from "../assistantClient";

describe("sendAssistantMessage", () => {
  it("returns a prompt without calling fetch if query is empty", async () => {
    const mockFetch = vi.fn();
    const result = await sendAssistantMessage({
      message: "   ",
      customFetch: mockFetch,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.answer).toContain("escribe tu consulta");
    expect(result.tier).toBe("tier0_kb");
  });

  it("sends request with body and headers, returning parsed response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Para ingresar tu sueldo líquido, ve al Paso 2 de la pre-evaluación.",
        tier: "tier0_kb",
        sources: ["Ingreso mensual líquido"],
        links: [],
        action: {
          type: "focus_field",
          field_id: "ingreso_mensual",
          step: 2,
          label: "Ir al campo Ingreso Mensual (Paso 2)",
        },
        suggest_escalation: false,
      }),
    });

    const result = await sendAssistantMessage({
      message: "¿Dónde ingreso mi sueldo?",
      screenId: "evaluate",
      fieldId: "ingreso_mensual",
      token: "test-token-123",
      customFetch: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain("/api/assistant/chat");
    expect(calledOptions.method).toBe("POST");
    expect(calledOptions.headers["Authorization"]).toBe("Bearer test-token-123");

    const sentBody = JSON.parse(calledOptions.body);
    expect(sentBody.message).toBe("¿Dónde ingreso mi sueldo?");
    expect(sentBody.screen_id).toBe("evaluate");
    expect(sentBody.field_id).toBe("ingreso_mensual");

    expect(result.answer).toContain("Paso 2");
    expect(result.tier).toBe("tier0_kb");
    expect(result.action?.field_id).toBe("ingreso_mensual");
    expect(result.suggest_escalation).toBe(false);
  });

  it("handles network failure gracefully with fallback answer", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const result = await sendAssistantMessage({
      message: "Hola",
      customFetch: mockFetch,
    });

    expect(result.error).toBe(true);
    expect(result.suggest_escalation).toBe(true);
    expect(result.answer).toContain("inconveniente al conectar");
    expect(result.links.length).toBeGreaterThan(0);
  });
});
