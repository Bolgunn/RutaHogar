import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import AcademiaFinanciera from "./components/AcademiaFinanciera";
import AdminHome from "./components/AdminHome";
import AdminPanel from "./components/AdminPanel";
import AdminProjectCatalog from "./components/AdminProjectCatalog";
import AnonHeader from "./components/AnonHeader";
import AuthPanel from "./components/AuthPanel";
import DashboardLeads from "./components/DashboardLeads";
import DataConsent from "./components/DataConsent";
import FinancialTracking from "./components/FinancialTracking";
import HousingSavingsPlan from "./components/HousingSavingsPlan";
import LandingPage from "./components/LandingPage";
import MonthlyPlan from "./components/MonthlyPlan";
import Navbar from "./components/Navbar";
import NotificationToast from "./components/NotificationToast";
import ObjectiveReview from "./components/ObjectiveReview";
import Onboarding from "./components/Onboarding";
import ProfilePage from "./components/ProfilePage";
import ProjectsWorkspace from "./components/ProjectsWorkspace";
import ExecutiveProfile from "./components/ExecutiveProfile";
import ExecutiveHome from "./components/ExecutiveHome";
import AdminProfile from "./components/AdminProfile";
import Recommendations from "./components/Recommendations";
import Subsidios from "./components/Subsidios";
import Result from "./components/Result";
import ScoreForm from "./components/ScoreForm";
import SetPassword from "./components/SetPassword";
import SimulationPage from "./components/SimulationPage";
import SignupOffer from "./components/SignupOffer";
import RegisterMilestone from "./components/RegisterMilestone";
import { acceptEvaluationPlan, createEvaluation, deleteEvaluation as deleteStoredEvaluation, getEvaluations, saveHousingPlanProgress, updateEvaluationAiContent } from "./services/evaluationService";
import ProjectsCatalog from "./components/ProjectsCatalog";
import { buildProjectGoalInput } from "./lib/projectGoalInput";
import { useLeads } from "./hooks/useLeads";
import { normalizeDisplayList, normalizeDisplayText, normalizeImprovementPlan, sanitizeAiText } from "./utils/text";
import { createGoal, getGoals, updateGoalProgress, updateGoalStatus } from "./services/goalsService";
import { getStoredAuth, roles, signOut, signUp, updateStoredProfile } from "./services/auth";
import { buildHousingPlanSnapshot, calculateHousingSavings, getHousingPropertyPrice } from "./services/housingSavingsPlanService";
import { appendScoringEvent } from "./services/getScoringHistory";
import { getTenantContext } from "./services/projectService";
import {
  getConsent,
  saveConsent,
  upsertProfile,
  updateProfileOnboarding,
  isSupabaseDataConfigured,
  isUUID,
} from "./services/profileService";
import { formatScore } from "./utils/helpers";
import { formatFormValue, plazoLabels } from "./constants";

const ONBOARDING_KEY = "RutaHogar_onboarding";
const ANON_ONBOARDING_KEY = "RutaHogar_anon_onboarding";
const ANON_RESULT_KEY = "RutaHogar_anon_result";
const ANON_INPUT_KEY = "RutaHogar_anon_input";

function resolveApiBase() {
  const configuredUrl =
    import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const fallbackUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
  return String(configuredUrl || fallbackUrl).replace(/\/$/, "");
}

function readSessionJson(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

const evaluationMatchFields = [
  "ingreso_mensual",
  "deuda_mensual",
  "edad",
  "ahorro_disponible",
  "property_value_uf",
  "property_value_clp",
  "plazo_credito_hipotecario",
  "dividendo_estimado",
  "comuna_objetivo",
  "tipo_contrato",
  "continuidad_laboral",
  "morosidad_actual",
  "complemento_renta",
  "ingreso_mensual_complementario",
  "deuda_mensual_complementario",
];

function getChannel() {
  try {
    const params = new URLSearchParams(window.location.search);
    const validChannels = ['web', 'chatbot', 'whatsapp', 'vendedor'];
    const channel = params.get('channel');
    if (channel && validChannels.includes(channel)) return channel;
  } catch { }
  return 'web';
}

const isUuidValue = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const getStoredOnboardingForProfile = (profile) => {
  if (!profile) return null;

  try {
    const stored = JSON.parse(localStorage.getItem(ONBOARDING_KEY)) || {};
    return stored[profile.id] || stored[profile.user_id] || stored[profile.email] || null;
  } catch {
    return null;
  }
};

const isRemoteProfile = (profile) =>
  isSupabaseDataConfigured && (isUuidValue(profile?.id) || isUuidValue(profile?.user_id));

const getOnboardingData = (profile) => {
  if (!profile) return null;
  if (isRemoteProfile(profile)) return profile.onboarding_data || null;
  return profile.onboarding_data || getStoredOnboardingForProfile(profile) || null;
};

const hasCompletedOnboarding = (data) => {
  if (!data || typeof data !== "object") return false;

  return Boolean(
    data.objetivo_principal &&
    data.tipo_propiedad &&
    data.comuna_interes &&
    data.plazo_compra,
  );
};

const buildResultSnapshot = (scoreResult = {}) => ({
  ...scoreResult,
  risks: normalizeDisplayList(scoreResult.risks),
  recommendations: normalizeDisplayList(scoreResult.recommendations),
  ai_explanation: normalizeDisplayText(scoreResult.ai_explanation),
  improvement_plan: normalizeImprovementPlan(scoreResult.improvement_plan),
  positive_indicators: normalizeDisplayList(scoreResult.positive_indicators),
  executive_summary: normalizeDisplayText(scoreResult.executive_summary),
  commercial_guidance: normalizeDisplayText(scoreResult.commercial_guidance),
});

const buildFinancialInput = (input = {}) => ({
  birth_date: input.birth_date,
  ingreso_mensual: input.ingreso_mensual,
  deuda_mensual: input.deuda_mensual,
  edad: input.edad,
  ahorro_disponible: input.ahorro_disponible,
  property_value: input.property_value,
  property_value_unit: input.property_value_unit,
  property_value_uf: input.property_value_uf,
  property_value_clp: input.property_value_clp,
  property_value_source: input.property_value_source,
  plazo_credito_hipotecario: input.plazo_credito_hipotecario,
  dividendo_estimado: input.dividendo_estimado,
  dividendo_esperado: input.dividendo_esperado,
  dividendo_estimado_origen: input.dividendo_estimado_origen,
  dividendo_estimado_calculado: input.dividendo_estimado_calculado,
  dividendo_estimado_manual: input.dividendo_estimado_manual,
  dividendo_tasa_anual_referencial: input.dividendo_tasa_anual_referencial,
  dividendo_monto_credito_estimado_clp: input.dividendo_monto_credito_estimado_clp,
  dividendo_monto_credito_estimado_uf: input.dividendo_monto_credito_estimado_uf,
  dividendo_uf_referencial_clp: input.dividendo_uf_referencial_clp,
  anonymous_flow_id: input.anonymous_flow_id,
  comuna_objetivo: input.comuna_objetivo,
  tipo_contrato: input.tipo_contrato,
  continuidad_laboral: input.continuidad_laboral,
  morosidad_actual: input.morosidad_actual,
  monto_morosidad: input.monto_morosidad,
  antiguedad_morosidad: input.antiguedad_morosidad,
  complemento_renta: input.complemento_renta,
  ingreso_mensual_complementario: input.ingreso_mensual_complementario,
  deuda_mensual_complementario: input.deuda_mensual_complementario,
  tipo_contrato_complementario: input.tipo_contrato_complementario,
  continuidad_laboral_complementario:
    input.continuidad_laboral_complementario,
  morosidad_complementario: input.morosidad_complementario,
  relacion_complementario: input.relacion_complementario,
  declara_patrimonio: input.declara_patrimonio,
  valor_vehiculos: input.valor_vehiculos,
  valor_inmuebles: input.valor_inmuebles,
  patrimonio_unit: input.patrimonio_unit,
  plazo_compra: input.plazo_compra,
  tiene_propiedad_vista: input.tiene_propiedad_vista,
  vivienda_nueva: input.vivienda_nueva,
  pie_en_cuotas_interes: input.pie_en_cuotas_interes,
  consentimiento: input.consentimiento,
  uf_value_clp: input.uf_value_clp,
});

const formatEvaluationAmount = (value) => Number.isFinite(Number(value))
  ? `$${Number(value).toLocaleString("es-CL")}`
  : "No declarado";

const normalizeMatchValue = (value) => {
  if (value === "" || value == null) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
};

const findMatchingEvaluation = (evaluations = [], pendingInput, pendingResult) => {
  if (!pendingInput || !pendingResult) return null;
  const anonymousFlowId = pendingInput.anonymous_flow_id;
  if (anonymousFlowId) {
    return evaluations.find((item) => item?.input?.anonymous_flow_id === anonymousFlowId) || null;
  }

  return evaluations.find((item) => {
    if (!item?.input || !item?.result) return false;
    const sameResult =
      normalizeMatchValue(item.result.score) === normalizeMatchValue(pendingResult.score) &&
      item.result.classification === pendingResult.classification;
    if (!sameResult) return false;

    return evaluationMatchFields.every(
      (field) =>
        normalizeMatchValue(item.input[field]) === normalizeMatchValue(pendingInput[field]),
    );
  }) || null;
};

const mergeOnboardingData = (currentData, pendingData) => {
  if (!pendingData) return currentData || null;
  return {
    ...(currentData || {}),
    ...pendingData,
    migrated_from_anonymous_flow: true,
    updated_at: new Date().toISOString(),
  };
};

const getInitialPageForProfile = (profile) => {
  if (!profile) return "auth";
  if (profile.role === roles.sales) return "home";
  if (profile.role === roles.admin) return "admin";
  if (profile.role !== roles.user) return "home";
  return hasCompletedOnboarding(getOnboardingData(profile)) ? "home" : "onboarding";
};

const normalizePathname = (pathname = "/") => {
  const normalized = String(pathname || "/")
    .replace(/\/$/, "")
    .toLowerCase();
  return normalized || "/";
};

const getPrivatePathForPage = (page) => {
  if (page === "home") return "/inicio";
  if (page === "evaluate" || page === "onboarding" || page === "dataconsent") return "/precalificacion";
  if (page === "recommendations") return "/recomendaciones";
  if (page === "subsidios") return "/subsidios";
  if (page === "simulation") return "/comparar-proyectos";
  if (page === "academia") return "/academia";
  if (page === "projects") return "/proyectos";
  if (page === "tracking" || page === "monthly-plan" || page === "objective-review") return "/plan-mejora";
  if (page === "register-milestone") return "/plan-mejora/hito";
  if (page === "profile") return "/perfil";
  if (page === "sales-profile") return "/perfil";
  if (page === "leads") return "/dashboard";
  if (page === "projects") return "/proyectos";
  if (page === "admin") return "/admin";
  if (page === "admin-projects") return "/admin/proyectos";
  if (page === "admin-profile") return "/admin/perfil";
  return "/inicio";
};

const resolveRouteForPath = (pathname, profile, hasAnonOnboarding) => {
  // La sección de beneficios habitacionales antes vivía en /simulacion; hoy
  // es /subsidios. Redirigir para no romper bookmarks/URLs previas.
  if (pathname && normalizePathname(pathname) === "/simulacion") {
    return { page: "subsidios", path: "/subsidios" };
  }
  const path = normalizePathname(pathname);
  const unknownRoute = ![
    "/",
    "/inicio",
    "/login",
    "/registro",
    "/precalificacion",
    "/pre-evaluacion",
    "/recomendaciones",
    "/subsidios",
    "/comparar-proyectos",
    "/academia",
    "/plan-mejora",
    "/plan-mejora/hito",
    "/perfil",
    "/historial",
    "/dashboard",
    "/ejecutivo/leads",
    "/proyectos",
    "/admin",
    "/admin/proyectos",
    "/admin/perfil",
    "/definir-password",
    "/proyectos",
  ].includes(path);

  // Enlace de recuperación / invitación: vale con o sin sesión previa.
  if (path === "/definir-password") return { page: "set-password" };

  if (!profile) {
    if (unknownRoute) return { page: "auth", path: "/login" };
    if (path === "/login" || path === "/registro") return { page: "auth" };
    if (path === "/precalificacion" || path === "/pre-evaluacion") {
      return { page: hasAnonOnboarding ? "anon-evaluate" : "anon-onboarding", path: "/precalificacion" };
    }
    if (["/recomendaciones", "/subsidios", "/comparar-proyectos", "/academia", "/plan-mejora", "/perfil", "/historial", "/dashboard", "/admin", "/admin/proyectos", "/ejecutivo/leads", "/proyectos"].includes(path)) {
      return { page: "auth", path: "/login" };
    }
    return { page: "auth", path: path === "/" ? "/login" : undefined };
  }

  if (profile.role === roles.user) {
    if (unknownRoute) return { page: "home", path: "/inicio" };
    if (path === "/") return { page: "home", path: "/inicio" };
    if (path === "/inicio") return { page: "home" };
    if (path === "/precalificacion" || path === "/pre-evaluacion") {
      return {
        page: hasCompletedOnboarding(getOnboardingData(profile)) ? "evaluate" : "onboarding",
        path: path === "/pre-evaluacion" ? "/precalificacion" : undefined,
      };
    }
    if (path === "/recomendaciones") return { page: "recommendations" };
    if (path === "/subsidios") return { page: "subsidios" };
    if (path === "/comparar-proyectos") return { page: "simulation" };
    if (path === "/academia") return { page: "academia" };
    if (path === "/proyectos") return { page: "projects" };
    if (path === "/plan-mejora") return { page: "tracking" };
    if (path === "/plan-mejora/hito") return { page: "register-milestone" };
    if (path === "/perfil" || path === "/historial") return { page: "profile", path: path === "/historial" ? "/perfil" : undefined };
    if (path === "/dashboard" || path === "/admin" || path === "/ejecutivo/leads" || path === "/login" || path === "/registro") {
      return { page: "home", path: "/inicio" };
    }
    return { page: "home", path: "/inicio" };
  }

  if (profile.role === roles.sales) {
    if (path === "/") return { page: "home", path: "/inicio" };
    if (path === "/inicio") return { page: "home" };
    if (path === "/proyectos") return { page: "projects" };
    if (path === "/perfil") return { page: "sales-profile" };
    if (path === "/dashboard" || path === "/ejecutivo/leads") {
      return { page: "leads", path: path === "/dashboard" ? undefined : "/dashboard" };
    }
    return { page: "home", path: "/inicio" };
  }

  if (profile.role === roles.admin) {
    if (path === "/") return { page: "admin", path: "/admin" };
    if (path === "/admin") return { page: "admin" };
    if (path === "/admin/proyectos") return { page: "admin-projects" };
    if (path === "/admin/perfil") return { page: "admin-profile" };
    if (path === "/proyectos") return { page: "admin-projects", path: "/admin/proyectos" };
    if (path === "/dashboard" || path === "/ejecutivo/leads") return { page: "leads", path: "/dashboard" };
    if (path === "/inicio") return { page: "admin", path: "/admin" };
    return { page: "admin", path: "/admin" };
  }

  return { page: getInitialPageForProfile(profile), path: getPrivatePathForPage(getInitialPageForProfile(profile)) };
};

const getRouteForPage = (page, profile, options = {}) => {
  if (page === "landing") return "/landing.html";
  if (page === "set-password") return "/definir-password";
  if (page === "auth") return options.authMode === "signup" ? "/registro" : "/login";
  if (page === "anon-onboarding" || page === "anon-evaluate") return "/precalificacion";
  if (!profile) return "/login";
  return getPrivatePathForPage(page);
};

const pagesWithoutBackButton = new Set([
  "auth",
  "home",
  "admin",
  "onboarding",
  "anon-onboarding",
  "anon-evaluate",
  "dataconsent",
  "signup-offer",
  "set-password",
]);

function AppBackButton({ onBack }) {
  return (
    <button className="app-back-button" type="button" onClick={onBack} aria-label="Volver">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Volver</span>
    </button>
  );
}

export default function App() {
  const storedAuth = useMemo(() => getStoredAuth(), []);
  const initialAnonOnboarding = useMemo(() => readSessionJson(ANON_ONBOARDING_KEY), []);
  const initialAnonResult = useMemo(() => readSessionJson(ANON_RESULT_KEY), []);
  const initialAnonInput = useMemo(() => readSessionJson(ANON_INPUT_KEY), []);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [auth, setAuth] = useState(storedAuth);
  const [page, setPage] = useState(
    () =>
      resolveRouteForPath(
        window.location.pathname,
        storedAuth.profile,
        Boolean(initialAnonOnboarding),
      ).page,
  );
  const [result, setResult] = useState(null);
  const [resultSaved, setResultSaved] = useState(null);
  // Permite saber, al resolverse un guardado lento, si el resultado visible
  // sigue siendo el que originó ese guardado.
  const resultRef = useRef(null);
  const navigationHistoryRef = useRef([]);
  const [dataError, setDataError] = useState("");
  const [dismissedError, setDismissedError] = useState("");
  const [milestoneSuccess, setMilestoneSuccess] = useState("");
  const [trackingGoals, setTrackingGoals] = useState([]);
  const [academyArticleId, setAcademyArticleId] = useState(null);
  const [activeGoal, setActiveGoal] = useState(null);
  const [startingNewEvaluation, setStartingNewEvaluation] = useState(false);
  const [scoreFormDraft, setScoreFormDraft] = useState(null);
  const [housingInitialPieType, setHousingInitialPieType] = useState("minimo");
  const [onboarding, setOnboarding] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(ONBOARDING_KEY)) || {};
    } catch {
      return {};
    }
  });
  const [consentGranted, setConsentGranted] = useState(false);
  const [anonOnboarding, setAnonOnboarding] = useState(initialAnonOnboarding);
  const [anonResult, setAnonResult] = useState(initialAnonResult);
  const [anonInput, setAnonInput] = useState(initialAnonInput);
  const [signupOfferLoading, setSignupOfferLoading] = useState(false);
  const [signupOfferError, setSignupOfferError] = useState("");
  const [inmobiliariaId, setInmobiliariaId] = useState(null);

  const profile = auth.profile;
  const userId = isUUID(profile?.id)
    ? profile.id
    : isUUID(profile?.user_id)
      ? profile.user_id
      : null;
  const {
    evaluations,
    setEvaluations,
    newHighLeadsCount,
    counts,
    error: leadsError,
    markLeadsSeen,
    dismissToastLocally,
    removeEvaluation,
    prependEvaluation,
  } = useLeads({ userId, profile });
  const currentError = dataError || leadsError;
  const visibleError = currentError && currentError !== dismissedError ? currentError : "";

  const userEvaluations = profile ? evaluations : [];
  const currentEvaluation = userEvaluations[0] || null;
  const userOnboarding = isRemoteProfile(profile)
    ? profile?.onboarding_data || null
    : profile
      ? profile.onboarding_data ||
      onboarding[userId] ||
      onboarding[profile?.id] ||
      onboarding[profile?.email] ||
      null
      : null;
  const onboardingCompleted = hasCompletedOnboarding(userOnboarding);
  const currentScoreNumber = currentEvaluation
    ? formatScore(currentEvaluation.result?.score)
    : null;
  const currentScore =
    currentEvaluation && currentScoreNumber !== null
      ? {
        score: currentScoreNumber,
        classification: currentEvaluation.result.classification,
      }
      : null;

  useEffect(() => {
    document.body.classList.toggle("simulation-layout-mode", page === "simulation");
    return () => document.body.classList.remove("simulation-layout-mode");
  }, [page]);

  const updateBrowserPath = (nextPath, options = {}) => {
    const currentPath = window.location.href.includes("#")
      ? window.location.href.slice(window.location.origin.length)
      : window.location.pathname;
    if (!nextPath || (nextPath === currentPath && nextPath === pathname)) return;
    const method = options.replace ? "replaceState" : "pushState";
    window.history[method](null, "", nextPath);
    setPathname(nextPath);
  };

  const navigateToPageForProfile = (nextPage, nextProfile = profile, options = {}) => {
    if (pagesWithoutBackButton.has(nextPage)) {
      navigationHistoryRef.current = [];
    } else if (!options.replace && page && page !== nextPage && !pagesWithoutBackButton.has(page)) {
      navigationHistoryRef.current = [...navigationHistoryRef.current, page].slice(-12);
    }
    setPage(nextPage);
    updateBrowserPath(getRouteForPage(nextPage, nextProfile, options), options);
  };

  const navigateToPage = (nextPage, options = {}) => {
    if (options.articleId) setAcademyArticleId(options.articleId);
    else if (nextPage !== "academia") setAcademyArticleId(null);
    navigateToPageForProfile(nextPage, profile, options);
  };

  const handleInternalBack = () => {
    const fallbackPage = getInitialPageForProfile(profile);
    let previousPage = navigationHistoryRef.current.pop();

    if (!previousPage || previousPage === page || previousPage === "landing" || previousPage === "auth") {
      previousPage = fallbackPage;
    }

    navigateToPageForProfile(previousPage, profile, { replace: true });
  };

  const showInternalBack = Boolean(profile) && !pagesWithoutBackButton.has(page);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const route = resolveRouteForPath(pathname, profile, Boolean(anonOnboarding));
    setPage(route.page);
    // En /definir-password el hash trae los tokens de Supabase: limpiarlo aquí
    // dejaría al usuario sin sesión de recuperación.
    if (route.page === "set-password") return;
    if ((route.path && route.path !== pathname) || window.location.href.includes("#")) {
      updateBrowserPath(route.path || pathname, { replace: true });
    }
  }, [pathname, profile?.role, anonOnboarding]);

  useEffect(() => {
    setDismissedError("");
  }, [currentError]);

  useEffect(() => {
    let active = true;

    async function loadEvaluations() {
      if (!userId) {
        setEvaluations([]);
        return;
      }

      try {
        setDataError("");
        const storedEvaluations = await getEvaluations(userId, profile?.role);
        if (active) setEvaluations(storedEvaluations);
      } catch (err) {
        console.error(err);
        if (active)
          setDataError(
            "No pudimos cargar tu historial en este momento. Por favor, recarga la página o intenta más tarde.",
          );
      }
    }

    loadEvaluations();

    return () => {
      active = false;
    };
  }, [userId]);

  // Regenera los textos de IA de una precalificación vía /score/explain.
  // El resumen y la guía comercial quedan disponibles para la mesa de leads.
  async function handleRetryAiExplanation(evaluationToRetry = currentEvaluation) {
    const evaluation = evaluationToRetry;
    if (!evaluation?.id || !evaluation?.input) return false;

    try {
      const response = await axios.post(
        `${resolveApiBase()}/score/explain`,
        { ...evaluation.input, scope: "all" },
        { timeout: 45000 },
      );

      const explanation = sanitizeAiText(response.data?.ai_explanation);
      const executiveSummary = sanitizeAiText(response.data?.executive_summary);
      const commercialGuidance = sanitizeAiText(response.data?.commercial_guidance);
      if (!explanation && !executiveSummary && !commercialGuidance) return false;

      const updated = await updateEvaluationAiContent(evaluation.id, {
        ...(explanation ? { ai_explanation: explanation } : {}),
        ...(executiveSummary ? { executive_summary: executiveSummary } : {}),
        ...(commercialGuidance ? { commercial_guidance: commercialGuidance } : {}),
      });

      // `result` es estado propio del panel de resultado y no deriva de
      // `evaluations`: sin esto el reintento persiste la explicación pero la
      // vista sigue mostrando la anterior. Solo se refresca si el snapshot
      // visible es el de la evaluación reintentada.
      setResult((prev) =>
        prev && prev.evaluation_id === evaluation.id
          ? { ...prev, ...(explanation ? { ai_explanation: explanation } : {}) }
          : prev,
      );

      if (updated?.id) {
        setEvaluations((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        setEvaluations((prev) =>
          prev.map((item) =>
            item.id === evaluation.id
              ? {
                ...item,
                result: {
                  ...item.result,
                  ...(explanation ? { ai_explanation: explanation } : {}),
                  ...(executiveSummary ? { executive_summary: executiveSummary } : {}),
                  ...(commercialGuidance ? { commercial_guidance: commercialGuidance } : {}),
                },
              }
              : item,
          ),
        );
      }
      return true;
    } catch (error) {
      console.error("RutaHogar /score/explain error", error);
      return false;
    }
  }

  useEffect(() => {
    let active = true;

    async function loadGoals() {
      if (!userId || !currentEvaluation || page !== "tracking") {
        setTrackingGoals([]);
        return;
      }

      try {
        const storedGoals = await getGoals(userId, currentEvaluation.id);
        if (active) setTrackingGoals(storedGoals);
      } catch (err) {
        console.warn("No se pudieron cargar metas de seguimiento; se usará el plan sugerido local.", err);
        if (active) setTrackingGoals([]);
      }
    }

    loadGoals();
    return () => {
      active = false;
    };
  }, [userId, currentEvaluation?.id, page]);

  useEffect(() => {
    if (page === "leads" && (profile?.role === roles.sales || profile?.role === roles.admin)) markLeadsSeen();
  }, [page]);

  useEffect(() => {
    if (page !== "tracking") return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [page]);

  // El catálogo de proyectos es por inmobiliaria (HU 7); el feed de leads no.
  // El id llega desde el perfil del propio ejecutivo, no desde la URL.
  useEffect(() => {
    if (profile?.role !== roles.sales && profile?.role !== roles.admin) {
      setInmobiliariaId(null);
      return;
    }
    let active = true;
    getTenantContext()
      .then((context) => { if (active) setInmobiliariaId(context.inmobiliaria_id); })
      .catch(() => { if (active) setInmobiliariaId(null); });
    return () => { active = false; };
  }, [profile?.role, profile?.id]);

  useEffect(() => {
    if (page === "signup-offer" && anonResult) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [page, anonResult]);

  useEffect(() => {
    let active = true;

    async function loadConsent() {
      if (!userId) {
        if (active) setConsentGranted(false);
        return;
      }

      try {
        const consent = await getConsent(userId);
        if (active) setConsentGranted(consent?.granted === true);
      } catch {
        if (active) setConsentGranted(false);
      }
    }

    loadConsent();

    return () => {
      active = false;
    };
  }, [userId]);

  const clearAnonSession = () => {
    sessionStorage.removeItem(ANON_ONBOARDING_KEY);
    sessionStorage.removeItem(ANON_RESULT_KEY);
    sessionStorage.removeItem(ANON_INPUT_KEY);
    setAnonOnboarding(null);
    setAnonResult(null);
    setAnonInput(null);
    setScoreFormDraft(null);
  };

  const storeOnboardingForProfile = (nextProfile, answers) => {
    const profileKey = isUUID(nextProfile?.id)
      ? nextProfile.id
      : isUUID(nextProfile?.user_id)
        ? nextProfile.user_id
        : nextProfile?.email || nextProfile?.id || "local-user";
    const next = {
      ...onboarding,
      [profileKey]: answers,
    };
    setOnboarding(next);
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  };

  const migrateAnonymousSession = async (nextAuth) => {
    const pendingOnboarding = anonOnboarding;
    const pendingResult = anonResult;
    const pendingInput = anonInput;
    const nextProfile = nextAuth?.profile;

    if (
      !nextProfile ||
      nextProfile.role !== roles.user ||
      (!pendingOnboarding && !pendingResult && !pendingInput)
    ) {
      return { auth: nextAuth, savedEvaluation: null, targetPage: getInitialPageForProfile(nextProfile) };
    }

    const nextUserId = isUUID(nextProfile?.id)
      ? nextProfile.id
      : isUUID(nextProfile?.user_id)
        ? nextProfile.user_id
        : nextProfile?.id || nextProfile?.email || null;
    const onboardingToSave = mergeOnboardingData(nextProfile.onboarding_data, pendingOnboarding);
    const anonymousBirthDate = pendingOnboarding?.birth_date || pendingInput?.birth_date || "";
    let migratedAuth = nextAuth;
    let migratedProfile = nextProfile;

    if (nextUserId && onboardingToSave) {
      const savedProfile = await updateProfileOnboarding(nextUserId, onboardingToSave);
      migratedProfile = updateStoredProfile({
        ...nextProfile,
        ...savedProfile,
        email: nextProfile.email,
        full_name: savedProfile?.full_name || nextProfile.full_name,
        phone: savedProfile?.phone || nextProfile.phone,
        role: savedProfile?.role || nextProfile.role,
        onboarding_data: onboardingToSave,
      });
      migratedAuth = { ...nextAuth, profile: migratedProfile };
      storeOnboardingForProfile(migratedProfile, onboardingToSave);
    }

    if (nextUserId && !migratedProfile.birth_date && anonymousBirthDate) {
      const savedProfile = await upsertProfile(
        nextUserId,
        migratedProfile.full_name,
        migratedProfile.role,
        onboardingToSave,
        { phone: migratedProfile.phone, birth_date: anonymousBirthDate },
      );
      migratedProfile = updateStoredProfile({ ...migratedProfile, ...savedProfile, email: migratedProfile.email });
      migratedAuth = { ...migratedAuth, profile: migratedProfile };
    }

    let savedEvaluation = null;
    if (pendingResult && pendingInput) {
      const financialInput = buildFinancialInput(pendingInput);
      const existingEvaluations = nextUserId
        ? await getEvaluations(nextUserId, migratedProfile?.role)
        : [];
      const existingEvaluation = findMatchingEvaluation(existingEvaluations, financialInput, pendingResult);
      if (existingEvaluation) {
        savedEvaluation = existingEvaluation;
      } else {
        savedEvaluation = await createEvaluation(nextUserId, {
          email: migratedProfile?.email || "sin-email",
          onboarding: onboardingToSave || null,
          input: financialInput,
          result: pendingResult,
          channel: getChannel(),
        });
      }
    }

    clearAnonSession();
    return {
      auth: migratedAuth,
      savedEvaluation,
      targetPage: pendingResult && pendingInput ? "recommendations" : getInitialPageForProfile(migratedProfile),
    };
  };

  const handleAnonOnboardingComplete = (answers) => {
    const data = { ...answers, updated_at: new Date().toISOString() };
    if (answers.birth_day && answers.birth_month && answers.birth_year) {
      data.birth_date = `${answers.birth_year}-${answers.birth_month.padStart(2, "0")}-${answers.birth_day.padStart(2, "0")}`;
    }
    sessionStorage.setItem(ANON_ONBOARDING_KEY, JSON.stringify(data));
    setAnonOnboarding(data);
    navigateToPage("anon-evaluate");
  };

  const handleAnonResult = (scoreResult, input) => {
    setScoreFormDraft(null);
    const resultSnapshot = buildResultSnapshot(scoreResult);
    const anonymousFlowId =
      input.anonymous_flow_id ||
      (window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()));
    const financialInput = buildFinancialInput({
      ...input,
      anonymous_flow_id: anonymousFlowId,
    });
    sessionStorage.setItem(ANON_RESULT_KEY, JSON.stringify(resultSnapshot));
    sessionStorage.setItem(ANON_INPUT_KEY, JSON.stringify(financialInput));
    setAnonResult(resultSnapshot);
    setAnonInput(financialInput);
    setPage("signup-offer");
  };

  const handleSignupFromOffer = async ({ full_name, email, phone, password, birth_date, consentData }) => {
    setSignupOfferLoading(true);
    setSignupOfferError("");
    let nextAuth = null;
    try {
      nextAuth = await signUp({
        email,
        password,
        full_name,
        phone,
        birth_date,
        role: roles.user,
      });

      const newProfile = nextAuth.profile;
      const newUserId = isUUID(newProfile?.id) ? newProfile.id
        : isUUID(newProfile?.user_id) ? newProfile.user_id : null;

      if (newUserId) {
        await saveConsent(newUserId, consentData);
      }

      const migration = await migrateAnonymousSession(nextAuth);
      nextAuth = migration.auth;

      // Batch all state updates together after all async work is done
      setConsentGranted(true);
      if (migration.savedEvaluation) {
        prependEvaluation(migration.savedEvaluation);
      }
      setAuth(nextAuth);
      navigateToPageForProfile(migration.targetPage, nextAuth.profile, { replace: true });
    } catch (err) {
      console.error(err);
      if (nextAuth?.profile) {
        setSignupOfferError("Cuenta creada, pero no pudimos guardar tu precalificación. Por favor intenta de nuevo.");
        setAuth(nextAuth);
      } else {
        console.log("Error de Auth en registro:", err);
        setSignupOfferError("No pudimos crear tu cuenta en este momento. Verifica que tus datos sean correctos o que el correo no esté ya registrado.");
      }
    } finally {
      setSignupOfferLoading(false);
    }
  };

  const handleContinueWithout = () => {
    clearAnonSession();
    navigateToPage("auth");
  };

  const startEvaluation = () => {
    setResult(null);
    setResultSaved(null);
    setScoreFormDraft(null);
    setStartingNewEvaluation(false);
    navigateToPage(onboardingCompleted ? "evaluate" : "onboarding");
  };

  const handleAuth = (nextAuth) => {
    setResult(null);
    setResultSaved(null);
    setDataError("");
    setTrackingGoals([]);
    setConsentGranted(false);
    migrateAnonymousSession(nextAuth)
      .then((migration) => {
        if (migration.savedEvaluation) {
          prependEvaluation(migration.savedEvaluation);
        }
        setAuth(migration.auth);
        navigateToPageForProfile(migration.targetPage, migration.auth.profile, { replace: true });
      })
      .catch((err) => {
        console.error(err);
        setAuth(nextAuth);
        setDataError(
          "Iniciaste sesión con éxito, pero tuvimos un problema guardando tu precalificación anterior. Puedes volver a intentarlo desde tu perfil.",
        );
        const fallbackPage = getInitialPageForProfile(nextAuth.profile);
        navigateToPageForProfile(fallbackPage, nextAuth.profile, { replace: true });
      });
  };

  const saveOnboardingAnswers = async (answers) => {
    const onboardingUserId = userId || profile?.email || "local-user";
    const next = {
      ...onboarding,
      [onboardingUserId]: {
        ...answers,
        updated_at: new Date().toISOString(),
      },
    };
    setOnboarding(next);
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));

    if (userId) {
      const savedProfile = await updateProfileOnboarding(userId, answers);
      const nextProfile = updateStoredProfile({
        ...profile,
        ...savedProfile,
        email: profile?.email,
        full_name: savedProfile?.full_name || profile?.full_name,
        role: savedProfile?.role || profile?.role,
        onboarding_data: answers,
      });
      setAuth((prev) => ({ ...prev, profile: nextProfile }));
    }
  };

  const handleOnboardingComplete = async (answers) => {
    try {
      setDataError("");
      await saveOnboardingAnswers(answers);
    } catch (err) {
      console.error(err);
      setDataError(
        "No se pudieron guardar tus respuestas preliminares. Puedes intentarlo nuevamente desde Perfil.",
      );
    }
    setResult(null);
    navigateToPage("evaluate");
  };

  const handleProfileOnboardingSave = async (answers) => {
    setDataError("");
    await saveOnboardingAnswers(answers);
  };

  const handleProfileUpdate = (updatedProfile) => {
    const nextProfile = updateStoredProfile(updatedProfile);
    setAuth((prev) => ({ ...prev, profile: nextProfile }));
  };

  const handleBirthDateSave = async (birthDate) => {
    if (!profile || !birthDate) return;

    const currentBirthDate = profile.birth_date || profile.fecha_nacimiento || "";
    if (currentBirthDate === birthDate) return;

    const optimisticProfile = updateStoredProfile({
      ...profile,
      birth_date: birthDate,
      fecha_nacimiento: birthDate,
    });
    setAuth((prev) => ({ ...prev, profile: optimisticProfile }));

    if (!userId) return;

    const savedProfile = await upsertProfile(
      userId,
      profile.full_name || profile.email || "",
      profile.role || roles.user,
      userOnboarding || profile.onboarding_data || null,
      {
        phone: profile.phone || "",
        birth_date: birthDate,
      },
    );

    const nextProfile = updateStoredProfile({
      ...optimisticProfile,
      ...savedProfile,
      email: profile.email,
      phone: savedProfile?.phone || profile.phone || "",
      birth_date: savedProfile?.birth_date || birthDate,
      fecha_nacimiento: savedProfile?.birth_date || birthDate,
      onboarding_data: savedProfile?.onboarding_data || userOnboarding || profile.onboarding_data || null,
    });
    setAuth((prev) => ({ ...prev, profile: nextProfile }));
  };

  const handleDataConsent = async (consentData) => {
    if (userId) {
      await saveConsent(userId, consentData);
    }
    setConsentGranted(true);
    navigateToPage("evaluate");
  };

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const handleResult = async (scoreResult, input) => {
    setScoreFormDraft(null);
    const resultSnapshot = buildResultSnapshot(scoreResult);
    const financialInput = buildFinancialInput(input);

    try {
      // Se siembra la ref en el mismo tick: el efecto corre después del
      // render y un fallo síncrono (sesión ausente) llegaría antes, con la
      // ref todavía apuntando al resultado anterior.
      resultRef.current = resultSnapshot;
      setResult(resultSnapshot);
      setResultSaved(null);

      navigateToPage("recommendations");

      setDataError("");
      if (isSupabaseDataConfigured && !auth.session) {
        throw new Error(
          "No hay una sesión activa. Por favor, inicia sesión nuevamente.",
        );
      }

      const savedEvaluation = await createEvaluation(isUUID(userId) ? userId : null, {
        email: profile?.email || "sin-email",
        onboarding: userOnboarding ? { ...userOnboarding } : null,
        input: financialInput,
        result: resultSnapshot,
        channel: getChannel(),
      });

      // Si el usuario ya evaluó de nuevo, este guardado quedó obsoleto y no
      // debe tocar el resultado visible, que pertenece a otra evaluación.
      if (resultRef.current === resultSnapshot) {
        setResultSaved(true);
        // El snapshot visible queda ligado a la evaluación guardada: sin esto
        // no hay forma de saber si `result` y `currentEvaluation` son lo mismo.
        setResult((prev) =>
          prev === resultSnapshot ? { ...prev, evaluation_id: savedEvaluation.id } : prev,
        );
      }

      setEvaluations((prev) => {
        const entry = { ...savedEvaluation, created_at: savedEvaluation.created_at || new Date().toISOString() };
        return [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 25);
      });
      prependEvaluation(savedEvaluation);
    } catch (err) {
      console.error(err);
      if (resultRef.current !== resultSnapshot) return;
      setResultSaved(false);
      setDataError(
        "Tu precalificación finalizó, pero hubo un problema al guardarla en tu historial. Si el problema persiste, vuelve a iniciar sesión.",
      );
    }
  };

  const deleteEvaluation = async (evaluationId) => {
    try {
      setDataError("");
      await deleteStoredEvaluation(
        evaluationId,
        userId || profile?.email || "local-user",
      );
      removeEvaluation(evaluationId);
      setTrackingGoals([]);
    } catch (err) {
      console.error(err);
      setDataError("No se pudo eliminar la precalificación seleccionada.");
    }
  };

  const handleGoalStatusChange = async (goalId, status) => {
    try {
      setDataError("");
      const updatedGoal = await updateGoalStatus(
        goalId,
        userId || profile?.email || "local-user",
        status,
      );
      if (updatedGoal) {
        setTrackingGoals((prev) =>
          prev.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal)),
        );
      }
    } catch (err) {
      console.error(err);
      setDataError("No se pudo actualizar el estado de la meta.");
    }
  };

  const handleAcceptPlan = async (planType) => {
    if (!currentEvaluation) return;

    try {
      setDataError("");

      const updatedEvaluation = await acceptEvaluationPlan(
        currentEvaluation.id,
        userId || profile?.email || "local-user",
        { plan_type: planType }
      );

      if (updatedEvaluation) {
        setEvaluations((prev) =>
          prev.map((item) =>
            item.id === updatedEvaluation.id ? updatedEvaluation : item,
          ),
        );
        handleLogScoringEvent({
          type: "accept_plan",
          details: {
            plan_type: planType,
          },
        });
      }
    } catch (err) {
      console.error(err);
      setDataError("No pudimos activar el plan. Inténtalo nuevamente.");
    }
  };

  const handleLogScoringEvent = (event) => {
    if (!currentEvaluation) return;
    appendScoringEvent(
      currentEvaluation.id,
      userId || profile?.email || "local-user",
      event,
    ).catch((err) => {
      console.error("No se pudo registrar el evento de seguimiento:", err);
    });
  };

  const handleSaveHousingProgress = async (progressData) => {
    if (!currentEvaluation) return;

    try {
      setDataError("");
      const housingPlan = {
        ...(currentEvaluation.housing_plan || {}),
        status: "en_curso",
        progress: progressData,
      };
      const updatedEvaluation = await saveHousingPlanProgress(
        currentEvaluation.id,
        userId || profile?.email || "local-user",
        housingPlan
      );
      if (updatedEvaluation) {
        setEvaluations(
          evaluations.map((item) =>
            item.id === currentEvaluation.id ? updatedEvaluation : item,
          ),
        );
      }
    } catch (err) {
      console.error(err);
      setDataError("No se pudo guardar el progreso del plan de ahorro.");
    }
  };

  const handleOpenGoalPlan = (goal) => {
    setActiveGoal(goal);
    navigateToPage(
      goal.title === "Revisar objetivo inmobiliario"
        ? "objective-review"
        : "monthly-plan",
    );
  };

  const handleOpenHousingPlan = (pieType) => {
    setHousingInitialPieType(pieType || "minimo");
    setPage("housing-plan");
  };

  const handleSaveGoalProgress = async (goalId, progressData) => {
    try {
      setDataError("");
      const updatedGoal = await updateGoalProgress(
        goalId,
        userId || profile?.email || "local-user",
        progressData,
      );
      if (updatedGoal) {
        setTrackingGoals((prev) =>
          prev.map((goal) =>
            goal.id === updatedGoal.id ? { ...goal, ...updatedGoal } : goal,
          ),
        );
        setActiveGoal((prev) =>
          prev?.id === updatedGoal.id ? { ...prev, ...updatedGoal } : prev,
        );
      }
    } catch (err) {
      console.error(err);
      setDataError("No pudimos guardar el avance mensual.");
    }
  };
  const handleRegisterMilestone = async (milestoneData) => {
    if (!currentEvaluation) return;
    try {
      setDataError("");
      setMilestoneSuccess("");

      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
      const scoreUrl = `${apiBase.replace(/\/$/, "")}/score`;

      // 1. SANITIZAR DATOS: Mapear "renta_mensual" a "ingreso_mensual" si es necesario
      // y forzar que los valores financieros sean números para evitar que la API crashee.
      const parsedMilestoneData = { ...milestoneData };

      if (parsedMilestoneData.renta_mensual !== undefined) {
        parsedMilestoneData.ingreso_mensual = Number(parsedMilestoneData.renta_mensual);
        delete parsedMilestoneData.renta_mensual;
      } else if (parsedMilestoneData.ingreso_mensual !== undefined) {
        parsedMilestoneData.ingreso_mensual = Number(parsedMilestoneData.ingreso_mensual);
      }

      if (parsedMilestoneData.ahorro_disponible !== undefined) {
        parsedMilestoneData.ahorro_disponible = Number(parsedMilestoneData.ahorro_disponible);
      }

      // 2. Construir el input mezclando la evaluación anterior con los datos sanitizados
      const newFinancialInput = buildFinancialInput({
        ...currentEvaluation.input,
        ...parsedMilestoneData,
      });

      let res;
      try {
        res = await fetch(scoreUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newFinancialInput),
        });
      } catch (fetchErr) {
        console.error('Network error al contactar API de scoring (¿Está encendido el servidor en el puerto 8000?)', fetchErr);
        throw new Error(`Error de conexión con el motor de precalificación.`);
      }

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error interno en API de scoring', { status: res.status, body: errorText });
        throw new Error(`El motor rechazó los datos (Código ${res.status}). Revisa la consola del backend.`);
      }

      const scoreResult = await res.json();
      const resultSnapshot = buildResultSnapshot(scoreResult);

      const savedEvaluation = await createEvaluation(isUUID(userId) ? userId : null, {
        email: profile?.email || "sin-email",
        onboarding: userOnboarding ? { ...userOnboarding } : null,
        input: newFinancialInput, // Guardamos el nuevo input en Supabase
        result: resultSnapshot,
        channel: getChannel(),
      });

      prependEvaluation(savedEvaluation);

      setMilestoneSuccess("¡Hito registrado exitosamente! Tu score y plan han sido recalculados.");
      setPage("tracking");

      // Auto-hide success message after 5 seconds
      setTimeout(() => setMilestoneSuccess(""), 5000);
    } catch (err) {
      console.error("Error registrando hito", err);
      setDataError("Hubo un problema al registrar tu nuevo hito. Por favor, verifica tus datos e intenta nuevamente.");
    }
  };

  // "Fijar como mi Meta" del catálogo (HU 9). La llamada a /score vive aquí y
  // no en el modal: antes el modal evaluaba al abrirse y esta función persistía
  // ese resultado, así que la evaluación guardada podía no corresponder al
  // proyecto fijado. Ahora se calcula en el momento de fijar la meta.
  //
  // A diferencia del "proyecto objetivo" de HU 6 —que es solo localStorage—
  // esto escribe una evaluación real: alimenta el seguimiento y el plan.
  const handleSetProjectGoal = async (project) => {
    if (!currentEvaluation) return;

    try {
      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
      const payload = buildFinancialInput(
        buildProjectGoalInput(
          currentEvaluation.input,
          project,
          currentEvaluation.input?.uf_value_clp,
        ),
      );

      const res = await fetch(`${apiBase.replace(/\/$/, "")}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`El motor de precalificación rechazó los datos (${res.status}).`);

      const newEval = await createEvaluation(profile.id, {
        email: profile.email || "sin-email",
        onboarding: userOnboarding || null,
        input: payload,
        result: buildResultSnapshot(await res.json()),
        channel: "project_selection",
      });

      setEvaluations([newEval, ...evaluations.filter((item) => item.id !== newEval.id)]);
      sessionStorage.removeItem("scoreleads_selected_plan_type");
      navigateToPage("tracking");
      alert("¡Meta financiera actualizada al nuevo proyecto! Revisa cómo se ajustaron tus proyecciones.");
    } catch (err) {
      console.error(err);
      alert("Error al fijar el proyecto como meta.");
    }
  };

  const handleLogout = async () => {
    await signOut();
    setAuth({ session: null, profile: null });
    setEvaluations([]);
    setTrackingGoals([]);
    setConsentGranted(false);
    setResult(null);
    setResultSaved(null);
    setOnboarding(null);
    setAnonOnboarding(null);
    sessionStorage.removeItem(ANON_ONBOARDING_KEY);
    navigateToPage("auth", { replace: true });
  };

  const handleNotificationClick = () => navigateToPage("leads");

  const handleDismissNotification = () => markLeadsSeen();

  if (page === "set-password") {
    return (
      <div className="app-shell auth-shell">
        <SetPassword onGoToLogin={() => navigateToPage("auth")} />
      </div>
    );
  }

  if (page === "landing") {
    const openDashboard = () => navigateToPage(getInitialPageForProfile(profile));

    return (
      <LandingPage
        profile={profile}
        onStart={
          !profile
            ? () => navigateToPage("anon-onboarding")
            : profile.role === roles.user
              ? startEvaluation
              : openDashboard
        }
        onLogin={() => navigateToPage("auth")}
        onRegister={() => navigateToPage("auth", { authMode: "signup" })}
        onDashboard={openDashboard}
        onProfile={profile?.role === roles.user ? () => navigateToPage("profile") : null}
        onLogout={handleLogout}
      />
    );
  }

  if (!profile) {
    if (page === "auth") {
      const authMode = pathname === "/registro" ? "signup" : "signin";
      return (
        <div className="app-shell auth-shell">
          <AuthPanel
            initialMode={authMode}
            onModeChange={(mode) =>
              navigateToPage("auth", {
                authMode: mode,
                replace: true,
              })
            }
            onAuth={handleAuth}
            onEvalAnon={() => navigateToPage("anon-onboarding")}
          />
        </div>
      );
    }

    if (page === "anon-onboarding") {
      return (
        <div className="anon-shell">
          <AnonHeader onLogin={() => navigateToPage("auth")} onHome={() => navigateToPage("auth")} />
          <section className="evaluation-panel prequalification-panel">
            <div className="section-heading compact">
              <span className="eyebrow">Disponible</span>
              <h1>Precalificación financiera</h1>
              <p>
                Completa todos los campos para calcular un score orientativo. El
                resultado no equivale a aprobación bancaria.
              </p>
            </div>
            <Onboarding
              isAnon
              onComplete={handleAnonOnboardingComplete}
              onBirthDateSave={handleBirthDateSave}
            />
          </section>
        </div>
      );
    }

    if (page === "anon-evaluate") {
      return (
        <div className="anon-shell">
          <AnonHeader onLogin={() => navigateToPage("auth")} onHome={() => navigateToPage("auth")} />
          <section className="evaluation-panel prequalification-panel">
            <button className="secondary-button" type="button" onClick={() => navigateToPage("anon-onboarding")}>
              Volver
            </button>
            <div className="section-heading compact">
              <span className="eyebrow">Disponible</span>
              <h1>Precalificación financiera</h1>
              <p>
                Completa todos los campos para calcular un score orientativo. El
                resultado no equivale a aprobación bancaria.
              </p>
            </div>
            {anonOnboarding && (
              <div className="context-summary context-summary--prequalification">
                <strong>Contexto inicial</strong>
                <span>
                  {anonOnboarding.comuna_interes} ·{" "}
                  {plazoLabels[anonOnboarding.plazo_compra] || anonOnboarding.plazo_compra}
                </span>
                <button
                  className="primary-button compact-button"
                  type="button"
                  onClick={() => navigateToPage("anon-onboarding")}
                >
                  Editar contexto
                </button>
              </div>
            )}
            <ScoreForm
              targetCommune={anonOnboarding?.comuna_interes}
              objective={anonOnboarding?.objetivo_principal}
              onboardingData={anonOnboarding}
              birthDate={anonOnboarding?.birth_date || null}
              profile={null}
              consentGranted={true}
              isAnon
              onConsentAccept={() => { }}
              initialDraft={scoreFormDraft}
              onDraftChange={setScoreFormDraft}
              onResult={handleAnonResult}
            />
          </section>

        </div>
      );
    }

    if (page === "signup-offer") {
      return (
        <div className="anon-shell">
          <AnonHeader onLogin={() => navigateToPage("auth")} onHome={() => navigateToPage("auth")} />
          <section className="evaluation-panel prequalification-panel">
            <SignupOffer
              result={anonResult}
              anonBirthDate={anonInput?.birth_date}
              onSignup={handleSignupFromOffer}
              onContinueWithout={handleContinueWithout}
              loading={signupOfferLoading}
              error={signupOfferError}
            />
          </section>
        </div>
      );
    }

    return (
      <div className="app-shell auth-shell">
        <AuthPanel
          onAuth={handleAuth}
        />
      </div>
    );
  }

  return (
    <div className={`app-shell ${page === "simulation" ? "simulation-shell" : ""}`}>
      <Navbar
        profile={profile}
        page={page}
        currentScore={currentScore}
        onNavigate={(nextPage) =>
          nextPage === "evaluate" ? startEvaluation() : navigateToPage(nextPage)
        }
        onLogout={handleLogout}
      />
      <main className="content"><div className="content-inner">
        {showInternalBack && <AppBackButton onBack={handleInternalBack} />}

        {visibleError && (
          <div className="error-message dismissible-message">
            <span>{visibleError}</span>
            <button
              type="button"
              aria-label="Cerrar mensaje"
            onClick={() => setDismissedError(visibleError)}
            >
              x
            </button>
          </div>
        )}

        {/* Notificación para ejecutivos */}
        <NotificationToast
          count={newHighLeadsCount}
          onClick={handleNotificationClick}
          onClose={handleDismissNotification}
        />

        {page === "onboarding" && profile.role === roles.user ? (
          <section className="evaluation-panel home-panel">
            <div className="section-heading compact">
              <span className="eyebrow">Disponible</span>
              <h1>Precalificación financiera</h1>
              <p>
                Completa todos los campos para calcular un score orientativo. El
                resultado no equivale a aprobación bancaria.
              </p>
            </div>
            <Onboarding
              initialData={userOnboarding}
              onComplete={handleOnboardingComplete}
              isEditing
              onBirthDateSave={handleBirthDateSave}
            />
          </section>
        ) : page === "dataconsent" && profile.role === roles.user ? (
          <DataConsent
            profile={profile}
            readonly={consentGranted}
            onAccept={handleDataConsent}
            onBack={() => navigateToPage(consentGranted ? "evaluate" : "onboarding")}
          />
        ) : page === "home" && profile.role === roles.admin ? (
          <AdminHome evaluations={evaluations} onNavigate={navigateToPage} />
        ) : page === "home" && profile.role === roles.sales ? (
          <ExecutiveHome
            profile={profile}
            evaluations={evaluations}
            inmobiliariaId={inmobiliariaId}
            onNavigate={navigateToPage}
          />
        ) : page === "admin-profile" && profile.role === roles.admin ? (
          <AdminProfile profile={profile} />
        ) : page === "home" ? (
          <section className="evaluation-panel home-panel">
            <div className="section-heading">
              <span className="eyebrow">Mi preparación financiera</span>
              <h1>
                Hola{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
              </h1>
              <p>Este es tu resumen de preparación para comprar vivienda.</p>
            </div>

            {result && (
              <div
                className={
                  resultSaved === false ? "error-message" : "success-message"
                }
              >
                {resultSaved === false
                  ? `Score calculado: ${formatScore(result.score)} / ${result.classification}. No se pudo guardar en historial.`
                  : resultSaved === true
                    ? `Precalificación guardada: ${formatScore(result.score)} / ${result.classification}. Puedes revisar el detalle en Perfil.`
                    : `Score calculado: ${formatScore(result.score)} / ${result.classification}. Guardando historial...`}
              </div>
            )}

            <section className="home-profile-brief" aria-labelledby="home-profile-title">
              <div className="home-profile-brief__status">
                <span className="eyebrow">Tu perfil hoy</span>
                <strong id="home-profile-title">{currentScore ? formatScore(currentScore.score, "Sin score") : "Pendiente"}</strong>
                <span>{currentScore ? `Score orientativo · ${currentScore.classification || "Sin clasificación"}` : "Aún no has calculado tu score"}</span>
              </div>
              <dl className="home-profile-brief__details">
                <div><dt>Objetivo de vivienda</dt><dd>{userOnboarding?.comuna_interes ? `${userOnboarding.tipo_propiedad === "departamento" ? "Departamento" : userOnboarding.tipo_propiedad === "casa" ? "Casa" : "Vivienda"} en ${userOnboarding.comuna_interes}` : "Sin objetivo definido"}</dd></div>
                <div><dt>Horizonte de compra</dt><dd>{userOnboarding?.plazo_compra ? (plazoLabels[userOnboarding.plazo_compra] || userOnboarding.plazo_compra) : "Sin plazo definido"}</dd></div>
                <div><dt>Foco actual</dt><dd>{currentEvaluation?.result?.improvement_plan?.[0]?.title || (currentScore ? "Mantener tu preparación financiera" : "Completar tu información")}</dd></div>
              </dl>
              {!onboardingCompleted ? <button type="button" className="primary-button" onClick={() => navigateToPage("onboarding")}>Completar perfil</button> : !currentScore ? <button type="button" className="primary-button" onClick={startEvaluation}>Calcular score</button> : null}
            </section>

            <section className="home-purpose" aria-labelledby="home-purpose-title">
              <div className="home-purpose__intro">
                <h2 id="home-purpose-title">Prepara tu compra con información clara</h2>
                <p>RutaHogar ordena tu situación financiera para ayudarte a entender qué preparar antes de conversar con una institución financiera.</p>
              </div>
              <ol className="home-purpose__steps">
                <li><span>01</span><div><strong>Conoce tu punto de partida</strong><p>Revisa un score y los factores que influyen en tu preparación.</p></div></li>
                <li><span>02</span><div><strong>Identifica qué puedes mejorar</strong><p>Prioriza ahorro, deudas y antecedentes según tu perfil.</p></div></li>
                <li><span>03</span><div><strong>Toma decisiones con contexto</strong><p>Explora alternativas de vivienda y beneficios habitacionales de forma referencial.</p></div></li>
              </ol>
            </section>

            <p className="hero-note">
              RutaHogar no aprueba créditos hipotecarios. Los resultados son referenciales y no reemplazan una evaluación bancaria formal.
            </p>
          </section>
        ) : page === "evaluate" ? (
          <section className="evaluation-panel prequalification-panel">
            <div className="section-heading compact">
              <span className="eyebrow">Disponible</span>
              <h1>Precalificación financiera</h1>
              <p>
                Completa todos los campos para calcular un score orientativo. El
                resultado no equivale a aprobación bancaria.
              </p>
            </div>
            {currentEvaluation && !startingNewEvaluation ? (
              <section className="evaluation-review-gate">
                <div className="evaluation-review-gate__details">
                  <h2>¿Ha cambiado algo desde tu última precalificación?</h2>
                  <p>Revisa tus respuestas antes de calcular nuevamente. Una nueva precalificación conservará tu historial anterior.</p>
                  <div className="evaluation-review-gate__answers">
                    <details open>
                      <summary>Situación financiera</summary>
                      <div className="evaluation-review-gate__answer-content"><dl>
                        <div><dt>Ingreso mensual</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.ingreso_mensual)}</dd></div>
                        <div><dt>Deuda mensual</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.deuda_mensual)}</dd></div>
                        <div><dt>Ahorro disponible</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.ahorro_disponible)}</dd></div>
                        <div><dt>Dividendo estimado</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.dividendo_estimado)}</dd></div>
                      </dl></div>
                    </details>
                    <details>
                      <summary>Vivienda y objetivo</summary>
                      <div className="evaluation-review-gate__answer-content"><dl>
                        <div><dt>Comuna objetivo</dt><dd>{currentEvaluation.input?.comuna_objetivo || currentEvaluation.onboarding?.comuna_interes || "No declarada"}</dd></div>
                        <div><dt>Tipo de vivienda</dt><dd>{formatFormValue(currentEvaluation.onboarding?.tipo_propiedad)}</dd></div>
                        <div><dt>Valor estimado</dt><dd>{currentEvaluation.input?.property_value_uf ? `${currentEvaluation.input.property_value_uf} UF` : formatEvaluationAmount(currentEvaluation.input?.property_value_clp || currentEvaluation.input?.property_value)}</dd></div>
                        <div><dt>Plazo de crédito</dt><dd>{currentEvaluation.input?.plazo_credito_hipotecario ? `${currentEvaluation.input.plazo_credito_hipotecario} años` : "No declarado"}</dd></div>
                      </dl></div>
                    </details>
                    <details>
                      <summary>Trabajo y deudas</summary>
                      <div className="evaluation-review-gate__answer-content"><dl>
                        <div><dt>Tipo de contrato</dt><dd>{formatFormValue(currentEvaluation.input?.tipo_contrato)}</dd></div>
                        <div><dt>Continuidad laboral</dt><dd>{formatFormValue(currentEvaluation.input?.continuidad_laboral)}</dd></div>
                        <div><dt>Morosidad actual</dt><dd>{formatFormValue(currentEvaluation.input?.morosidad_actual)}</dd></div>
                        {currentEvaluation.input?.morosidad_actual === "si" && <><div><dt>Monto en morosidad</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.monto_morosidad)}</dd></div><div><dt>Antigüedad de morosidad</dt><dd>{formatFormValue(currentEvaluation.input?.antiguedad_morosidad)}</dd></div></>}
                      </dl></div>
                    </details>
                    {currentEvaluation.input?.complemento_renta && <details>
                      <summary>Complemento de renta</summary>
                      <div className="evaluation-review-gate__answer-content"><dl>
                        <div><dt>Ingreso complementario</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.ingreso_mensual_complementario)}</dd></div>
                        <div><dt>Deuda complementaria</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.deuda_mensual_complementario)}</dd></div>
                        <div><dt>Relación</dt><dd>{formatFormValue(currentEvaluation.input?.relacion_complementario)}</dd></div>
                        <div><dt>Contrato complementario</dt><dd>{formatFormValue(currentEvaluation.input?.tipo_contrato_complementario)}</dd></div>
                      </dl></div>
                    </details>}
                    {currentEvaluation.input?.declara_patrimonio && <details>
                      <summary>Patrimonio declarado</summary>
                      <div className="evaluation-review-gate__answer-content"><dl>
                        <div><dt>Vehículos</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.valor_vehiculos)}</dd></div>
                        <div><dt>Inmuebles u otros</dt><dd>{formatEvaluationAmount(currentEvaluation.input?.valor_inmuebles)}</dd></div>
                      </dl></div>
                    </details>}
                  </div>
                  <div className="evaluation-review-gate__actions">
                    <button type="button" className="secondary-button" onClick={() => navigateToPage("recommendations")}>Ver mi precalificación actual</button>
                    <button type="button" className="primary-button" onClick={() => { setScoreFormDraft(null); setStartingNewEvaluation(true); }}>Sí, quiero hacer una nueva precalificación</button>
                  </div>
                </div>
              </section>
            ) : <>
            {userOnboarding && (
              <div className="context-summary context-summary--prequalification">
                <strong>Contexto inicial</strong>
                <span>
                  {userOnboarding.comuna_interes} ·{" "}
                  {plazoLabels[userOnboarding.plazo_compra] ||
                    userOnboarding.plazo_compra}
                </span>
                <button
                  className="primary-button compact-button"
                  type="button"
                  onClick={() => navigateToPage("onboarding")}
                >
                  Editar contexto
                </button>
              </div>
            )}
            <ScoreForm
              targetCommune={userOnboarding?.comuna_interes}
              objective={userOnboarding?.objetivo_principal}
              onboardingData={userOnboarding}
              birthDate={profile?.birth_date || profile?.fecha_nacimiento}
              profile={profile}
              consentGranted={consentGranted}
              onConsentAccept={handleDataConsent}
              onBirthDateSave={handleBirthDateSave}
              onBack={currentEvaluation ? () => setStartingNewEvaluation(false) : undefined}
              initialDraft={scoreFormDraft}
              onDraftChange={setScoreFormDraft}
              onResult={handleResult}
            />
            </>}
          </section>
        ) : page === "profile" && profile.role === roles.user ? (
          <ProfilePage
            profile={profile}
            onboarding={userOnboarding}
            evaluations={userEvaluations}
          onSaveOnboarding={handleProfileOnboardingSave}
          onDeleteEvaluation={deleteEvaluation}
          onProfileUpdate={handleProfileUpdate}
          onRetryExplanation={handleRetryAiExplanation}
          />
        ) : page === "tracking" && profile.role === roles.user ? (
        <FinancialTracking
          evaluation={currentEvaluation}
          goals={trackingGoals}
          onAcceptPlan={handleAcceptPlan}
          onGoalStatusChange={handleGoalStatusChange}
          onOpenGoalPlan={handleOpenGoalPlan}
          onStartEvaluation={startEvaluation}
          onOpenHousingPlan={handleOpenHousingPlan}
          onLogScoringEvent={handleLogScoringEvent}
          onOpenMilestoneRegistration={() => {
            setActiveGoal(null);
            navigateToPage("register-milestone");
          }}
          successMessage={milestoneSuccess}
          onNavigate={navigateToPage}
        />
      ) : page === "housing-plan" && profile.role === roles.user ? (
        <HousingSavingsPlan
          evaluation={currentEvaluation}
          initialPieType={housingInitialPieType}
          onBack={() => navigateToPage("tracking")}
          onSaveHousingProgress={handleSaveHousingProgress}
          onLogScoringEvent={handleLogScoringEvent}
        />
      ) : page === "register-milestone" && profile.role === roles.user ? (
        <RegisterMilestone
          evaluation={currentEvaluation}
          onBack={() => setPage("tracking")}
          onRegister={handleRegisterMilestone}
        />
      ) : page === "monthly-plan" && profile.role === roles.user ? (
        <MonthlyPlan
          evaluation={currentEvaluation}
          goal={activeGoal}
          onBack={() => navigateToPage("tracking")}
          onSaveProgress={handleSaveGoalProgress}
        />
      ) : page === "objective-review" && profile.role === roles.user ? (
        <ObjectiveReview
          evaluation={currentEvaluation}
          onBack={() => navigateToPage("tracking")}
        />
      ) : page === "recommendations" && profile.role === roles.user ? (
        <Recommendations
          evaluation={result && resultSaved !== true ? { result, input: null, onboarding: userOnboarding } : currentEvaluation}
          onStartEvaluation={startEvaluation}
          onNavigate={navigateToPage}
          onRetryExplanation={handleRetryAiExplanation}
        />
      ) : page === "subsidios" && profile.role === roles.user ? (
        <Subsidios
          evaluation={result && resultSaved !== true ? { result, input: null, onboarding: userOnboarding } : currentEvaluation}
          onNavigate={navigateToPage}
        />
      ) : page === "simulation" && profile.role === roles.user ? (
        <SimulationPage
          evaluation={currentEvaluation}
          onboarding={userOnboarding}
          onStartEvaluation={startEvaluation}
          onNavigate={navigateToPage}
          onRetryExplanation={handleRetryAiExplanation}
        />
        ) : page === "academia" && profile.role === roles.user ? (
          <AcademiaFinanciera evaluation={currentEvaluation} onStartEvaluation={startEvaluation} onNavigate={navigateToPage} initialArticleId={academyArticleId} onRetryExplanation={handleRetryAiExplanation} />
        ) : page === "projects" && profile.role === roles.user ? (
          <ProjectsCatalog
            evaluationBase={currentEvaluation}
            onboarding={userOnboarding}
            userId={profile.id}
            contactEmail={profile.email}
            onBack={() => navigateToPage("tracking")}
            onStartEvaluation={startEvaluation}
            onSetGoal={handleSetProjectGoal}
          />
      ) : page === "leads" && (profile.role === roles.sales || profile.role === roles.admin) ? (
        <DashboardLeads
          evaluations={evaluations}
          inmobiliariaId={inmobiliariaId}
          ejecutivo={profile?.role === roles.sales ? { id: profile.id, email: profile.email } : null}
        />
      ) : page === "projects" && profile.role === roles.sales ? (
        <ProjectsWorkspace
          inmobiliariaId={inmobiliariaId}
          ejecutivo={profile.role === roles.sales ? { id: profile.id, email: profile.email } : null}
          isAdmin={false}
        />
      ) : page === "sales-profile" && profile.role === roles.sales ? (
        <ExecutiveProfile profile={profile} inmobiliariaId={inmobiliariaId} onNavigate={navigateToPage} />
      ) : page === "admin" && profile.role === roles.admin ? (
        <AdminPanel evaluations={evaluations} profile={profile} />
      ) : page === "admin-projects" && profile.role === roles.admin ? (
        <AdminProjectCatalog />
      ) : (
        <section className="section-block">
          <div className="section-heading">
            <span className="eyebrow">Vista no disponible</span>
            <h1>Revisa tu navegacion</h1>
            <p>Tu rol actual no tiene acceso a esta vista.</p>
          </div>
        </section>
      )}
      </div></main>
    </div>
  );
}
