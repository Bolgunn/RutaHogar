import { describe, it, expect } from "vitest";
import {
  isEscalationSignal,
  normalizeText,
  shouldOfferEscalation,
} from "../escalation";

describe("escalation.js (HU24 - E3)", () => {
  it("normalizes text by trimming, lowercasing, and removing accents", () => {
    expect(normalizeText("  ¿PÉSIMA RESPUESTA?  ")).toBe("¿pesima respuesta?");
    expect(normalizeText("Atención Humana")).toBe("atencion humana");
  });

  it("detects dissatisfaction keyphrases accurately", () => {
    expect(isEscalationSignal("La verdad no me sirvió tu ayuda")).toBe(true);
    expect(isEscalationSignal("sigo con dudas sobre el paso 2")).toBe(true);
    expect(isEscalationSignal("no entiendo nada")).toBe(true);
    expect(isEscalationSignal("no entendí nada de los dividendos")).toBe(true);
    expect(isEscalationSignal("esta respuesta es muy confusa")).toBe(true);
    expect(isEscalationSignal("sigo pegado en la misma pantalla")).toBe(true);
  });

  it("detects requests for human attention / ticket generation", () => {
    expect(isEscalationSignal("quiero hablar con una persona")).toBe(true);
    expect(isEscalationSignal("necesito atención humana")).toBe(true);
    expect(isEscalationSignal("quiero contactar a soporte")).toBe(true);
    expect(isEscalationSignal("por favor generar ticket")).toBe(true);
    expect(isEscalationSignal("abrir ticket de soporte")).toBe(true);
  });

  it("does not flag regular informational queries", () => {
    expect(isEscalationSignal("¿Cuáles son los pasos de la pre-evaluación?")).toBe(false);
    expect(isEscalationSignal("¿Qué significa ingreso líquido?")).toBe(false);
    expect(isEscalationSignal("Muchas gracias, me quedó súper claro")).toBe(false);
    expect(isEscalationSignal("¿Dónde ingreso los datos de mi cónyuge?")).toBe(false);
  });

  it("shouldOfferEscalation returns true when user feedback is negative", () => {
    expect(
      shouldOfferEscalation({
        userFeedbackNegative: true,
        suggestEscalation: false,
        messageText: "Hola",
      })
    ).toBe(true);
  });

  it("shouldOfferEscalation returns true when backend suggested escalation", () => {
    expect(
      shouldOfferEscalation({
        userFeedbackNegative: false,
        suggestEscalation: true,
        messageText: "Hola",
      })
    ).toBe(true);
  });

  it("shouldOfferEscalation returns true when user expresses escalation signals", () => {
    expect(
      shouldOfferEscalation({
        userFeedbackNegative: false,
        suggestEscalation: false,
        messageText: "no me sirvió para nada",
      })
    ).toBe(true);
  });

  it("shouldOfferEscalation returns false when all signals are neutral or positive", () => {
    expect(
      shouldOfferEscalation({
        userFeedbackNegative: false,
        suggestEscalation: false,
        messageText: "Gracias por la información",
      })
    ).toBe(false);
  });
});
