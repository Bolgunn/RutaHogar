export const GA_MEASUREMENT_ID = "G-63DF940J4K";

const EVENT_PARAM_ALLOWLIST = {
  page_view: ["page_path", "page_location", "page_title"],
  cta_click: ["cta_location", "cta_name", "destination", "auth_state"],
  prequalification_started: ["flow_type", "entry_point", "form_step"],
  prequalification_completed: ["flow_type", "entry_point", "has_complementary_income"],
  sign_up: ["method"],
  generate_lead: ["lead_source", "project_id", "project_region", "source_page"],
  project_compatibility_viewed: ["project_id", "project_type", "project_region", "source_page"],
  financing_scenario_saved: ["project_id", "has_benefit", "scenario_source"],
};

const UTM_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

function browserWindow() {
  return typeof window === "undefined" ? null : window;
}

function isSafeParameterValue(value) {
  return (
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.trim().length > 0)
  );
}

function pickAllowedParameters(eventName, parameters = {}) {
  const allowedKeys = EVENT_PARAM_ALLOWLIST[eventName] || [];

  return allowedKeys.reduce((safeParameters, key) => {
    const value = parameters[key];
    if (!isSafeParameterValue(value)) return safeParameters;

    safeParameters[key] = typeof value === "string" ? value.trim().slice(0, 500) : value;
    return safeParameters;
  }, {});
}

function normalizePagePath(value) {
  const path = String(value || "/").trim().split("?")[0].split("#")[0];
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

// Conserva los UTMs para atribución, pero evita que un query string accidental
// (por ejemplo, con email o tokens) llegue a GA4 mediante page_location.
function safePageLocation(value) {
  const currentWindow = browserWindow();
  const fallback = currentWindow?.location?.href;
  if (!value && !fallback) return undefined;

  try {
    const url = new URL(value || fallback, currentWindow?.location?.origin);
    const safeSearch = new URLSearchParams();
    url.searchParams.forEach((parameterValue, parameterName) => {
      if (UTM_PARAMETERS.has(parameterName.toLowerCase())) {
        safeSearch.append(parameterName, parameterValue);
      }
    });
    const query = safeSearch.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return undefined;
  }
}

/**
 * Envía un evento permitido a GA4. Es seguro usarlo en tests, SSR o antes de
 * que cargue gtag: en esos casos no produce errores ni almacena datos.
 */
export function trackEvent(eventName, parameters = {}) {
  const currentWindow = browserWindow();
  if (typeof currentWindow?.gtag !== "function") return false;

  currentWindow.gtag("event", eventName, pickAllowedParameters(eventName, parameters));
  return true;
}

export function trackPageView({ pagePath, pageLocation, pageTitle } = {}) {
  return trackEvent("page_view", {
    page_path: normalizePagePath(pagePath),
    page_location: safePageLocation(pageLocation),
    page_title: pageTitle || browserWindow()?.document?.title,
  });
}

export function createPageViewDeduper(sendPageView = trackPageView) {
  let lastPagePath = null;

  return (pageView) => {
    const pagePath = normalizePagePath(pageView?.pagePath);
    if (pagePath === lastPagePath) return false;

    lastPagePath = pagePath;
    return sendPageView({ ...pageView, pagePath });
  };
}

export function createOnceTracker(track) {
  let tracked = false;

  return (...args) => {
    if (tracked) return false;
    tracked = true;
    return track(...args);
  };
}

export const trackCtaClick = ({ ctaLocation, ctaName, destination, authState }) =>
  trackEvent("cta_click", {
    cta_location: ctaLocation,
    cta_name: ctaName,
    destination,
    auth_state: authState,
  });

export const trackPrequalificationStarted = ({ flowType, entryPoint, formStep }) =>
  trackEvent("prequalification_started", {
    flow_type: flowType,
    entry_point: entryPoint,
    form_step: formStep,
  });

export const trackPrequalificationCompleted = ({ flowType, entryPoint, hasComplementaryIncome }) =>
  trackEvent("prequalification_completed", {
    flow_type: flowType,
    entry_point: entryPoint,
    has_complementary_income: hasComplementaryIncome,
  });

export const trackSignUp = ({ method }) => trackEvent("sign_up", { method });

export const trackGeneratedLead = ({ leadSource, projectId, projectRegion, sourcePage }) =>
  trackEvent("generate_lead", {
    lead_source: leadSource,
    project_id: projectId,
    project_region: projectRegion,
    source_page: sourcePage,
  });

export const trackProjectCompatibilityViewed = ({ projectId, projectType, projectRegion, sourcePage }) =>
  trackEvent("project_compatibility_viewed", {
    project_id: projectId,
    project_type: projectType,
    project_region: projectRegion,
    source_page: sourcePage,
  });

export const trackFinancingScenarioSaved = ({ projectId, hasBenefit, scenarioSource }) =>
  trackEvent("financing_scenario_saved", {
    project_id: projectId,
    has_benefit: hasBenefit,
    scenario_source: scenarioSource,
  });
