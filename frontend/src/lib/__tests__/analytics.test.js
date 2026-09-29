import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOnceTracker,
  createPageViewDeduper,
  trackCtaClick,
  trackEvent,
  trackFinancingScenarioSaved,
  trackGeneratedLead,
  trackPageView,
  trackPrequalificationCompleted,
  trackPrequalificationStarted,
  trackProjectCompatibilityViewed,
  trackSignUp,
} from "../analytics";

const originalWindow = globalThis.window;

function installAnalyticsWindow() {
  const gtag = vi.fn();
  globalThis.window = {
    gtag,
    location: {
      href: "https://ruta-hogar-one.vercel.app/precalificacion?email=no-enviar&utm_source=test",
      origin: "https://ruta-hogar-one.vercel.app",
    },
    document: { title: "RutaHogar" },
  };
  return gtag;
}

beforeEach(() => installAnalyticsWindow());

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

describe("analytics helper", () => {
  it("does not break when gtag is not available", () => {
    delete globalThis.window.gtag;

    expect(trackEvent("cta_click", { cta_location: "hero" })).toBe(false);
  });

  it("sends one page view per distinct SPA path", () => {
    const gtag = installAnalyticsWindow();
    const trackDistinctPageView = createPageViewDeduper(trackPageView);

    trackDistinctPageView({ pagePath: "/precalificacion" });
    trackDistinctPageView({ pagePath: "/precalificacion" });
    trackDistinctPageView({ pagePath: "/proyectos" });

    expect(gtag).toHaveBeenCalledTimes(2);
    expect(gtag.mock.calls.map(([, , parameters]) => parameters.page_path)).toEqual([
      "/precalificacion",
      "/proyectos",
    ]);
    expect(gtag.mock.calls[0][2].page_location).toBe(
      "https://ruta-hogar-one.vercel.app/precalificacion?utm_source=test",
    );
    expect(gtag.mock.calls[0][2]).not.toHaveProperty("email");
  });

  it("uses the required landing CTA categorisation", () => {
    const gtag = installAnalyticsWindow();

    trackCtaClick({
      ctaLocation: "score_card",
      ctaName: "calculate_my_score",
      destination: "/precalificacion",
      authState: "anonymous",
    });

    expect(gtag).toHaveBeenCalledWith("event", "cta_click", {
      cta_location: "score_card",
      cta_name: "calculate_my_score",
      destination: "/precalificacion",
      auth_state: "anonymous",
    });
  });

  it("tracks a prequalification start only once per attempt", () => {
    const gtag = installAnalyticsWindow();
    const trackStartOnce = createOnceTracker((formStep) =>
      trackPrequalificationStarted({
        flowType: "anonymous",
        entryPoint: "landing",
        formStep,
      }),
    );

    trackStartOnce("step_1");
    trackStartOnce("step_2");

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "prequalification_started", {
      flow_type: "anonymous",
      entry_point: "landing",
      form_step: "step_1",
    });
  });

  it("keeps success event schemas free from PII and financial values", () => {
    const gtag = installAnalyticsWindow();

    // Estos helpers se invocan solamente desde los callbacks de éxito de cada flujo.
    trackPrequalificationCompleted({
      flowType: "authenticated",
      entryPoint: "prequalification",
      hasComplementaryIncome: true,
    });
    trackSignUp({ method: "auth_panel" });
    trackGeneratedLead({
      leadSource: "project_interest",
      projectId: "project-1",
      projectRegion: "metropolitana",
      sourcePage: "projects",
    });
    trackProjectCompatibilityViewed({
      projectId: "project-1",
      projectType: "department",
      projectRegion: "metropolitana",
      sourcePage: "projects",
    });
    trackFinancingScenarioSaved({
      projectId: "project-1",
      hasBenefit: false,
      scenarioSource: "current_configuration",
    });

    const prohibitedParameterKeys = new Set([
      "email", "phone", "telefono", "rut", "name", "nombre", "full_name", "user_id",
      "income", "income_mensual", "ingreso", "ingreso_mensual",
      "debt", "deuda", "deuda_mensual", "savings", "ahorro", "ahorro_disponible",
      "down_payment", "pie", "credit", "credito", "dividend", "dividendo",
      "rate", "tasa", "uf", "uf_value", "uf_value_clp", "property_value_uf",
      "score", "financial_classification",
    ]);
    const sentParameterKeys = gtag.mock.calls.flatMap(([, , parameters]) => Object.keys(parameters));

    expect(sentParameterKeys.filter((key) => prohibitedParameterKeys.has(key))).toEqual([]);
    expect(gtag.mock.calls[0][2]).toMatchObject({ has_complementary_income: true });
  });

  it("drops parameters outside the event privacy allowlist", () => {
    const gtag = installAnalyticsWindow();

    trackEvent("prequalification_completed", {
      flow_type: "anonymous",
      entry_point: "landing",
      has_complementary_income: false,
      email: "no-enviar@example.com",
      ingreso_mensual: 1200000,
      score: 90,
    });

    expect(gtag).toHaveBeenCalledWith("event", "prequalification_completed", {
      flow_type: "anonymous",
      entry_point: "landing",
      has_complementary_income: false,
    });
  });
});
