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
import { plazoLabels } from "./constants";

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
  } catch {}
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
  if (profile.role === roles.sales) return "leads";
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
  if (page === "tracking" || page === "monthly-plan" || page === "objective-review") return "/plan-mejora";
  if (page === "profile") return "/perfil";
  if (page === "leads") return "/dashboard";
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
    "/perfil",
    "/historial",
    "/dashboard",
    "/ejecutivo/leads",
    "/admin",
    "/admin/proyectos",
    "/admin/perfil",
    "/definir-password",
  ].includes(path);

  // Enlace de recuperación / invitación: vale con o sin sesión previa.
  if (path === "/definir-password") return { page: "set-password" };

  if (!profile) {
    if (unknownRoute) return { page: "auth", path: "/login" };
    if (path === "/login" || path === "/registro") return { page: "auth" };
    if (path === "/precalificacion" || path === "/pre-evaluacion") {
      return { page: hasAnonOnboarding ? "anon-evaluate" : "anon-onboarding", path: "/precalificacion" };
    }
    if (["/recomendaciones", "/subsidios", "/comparar-proyectos", "/academia", "/plan-mejora", "/perfil", "/historial", "/dashboard", "/admin", "/admin/proyectos", "/ejecutivo/leads"].includes(path)) {
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
    if (path === "/plan-mejora") return { page: "tracking" };
    if (path === "/perfil" || path === "/historial") return { page: "profile", path: path === "/historial" ? "/perfil" : undefined };
    if (path === "/dashboard" || path === "/admin" || path === "/ejecutivo/leads" || path === "/login" || path === "/registro") {
      return { page: "home", path: "/inicio" };
    }
    return { page: "home", path: "/inicio" };
  }

  if (profile.role === roles.sales) {
    if (path === "/") return { page: "leads", path: "/dashboard" };
    if (path === "/dashboard" || path === "/ejecutivo/leads" || path === "/inicio") {
      return { page: "leads", path: path === "/dashboard" ? undefined : "/dashboard" };
    }
    return { page: "leads", path: "/dashboard" };
  }

  if (profile.role === roles.admin) {
    if (path === "/") return { page: "admin", path: "/admin" };
    if (path === "/admin") return { page: "admin" };
    if (path === "/admin/proyectos") return { page: "admin-projects" };
    if (path === "/admin/perfil") return { page: "admin-profile" };
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
  const [dataError, setDataError] = useState("");
  const [dismissedError, setDismissedError] = useState("");
  const [milestoneSuccess, setMilestoneSuccess] = useState("");
  const [trackingGoals, setTrackingGoals] = useState([]);
  const [academyArticleId, setAcademyArticleId] = useState(null);
  const [activeGoal, setActiveGoal] = useState(null);
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
    setPage(nextPage);
    updateBrowserPath(getRouteForPage(nextPage, nextProfile, options), options);
  };

  const navigateToPage = (nextPage, options = {}) => {
    if (options.articleId) setAcademyArticleId(options.articleId);
    else if (nextPage !== "academia") setAcademyArticleId(null);
    navigateToPageForProfile(nextPage, profile, options);
  };

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
            "No pudimos cargar tu historial. Revisa que las tablas de Supabase esten creadas y vuelve a intentar.",
          );
      }
    }

    loadEvaluations();

    return () => {
      active = false;
    };
  }, [userId]);

  // Regenera la explicación IA de una preevaluación vía /score/explain.
  // Devuelve true si se generó y persistió una explicación utilizable.
  async function handleRetryAiExplanation(evaluationToRetry = currentEvaluation) {
    const evaluation = evaluationToRetry;
    if (!evaluation?.id || !evaluation?.input) return false;

    try {
      const response = await axios.post(
        `${resolveApiBase()}/score/explain`,
        { ...evaluation.input, scope: "user" },
        { timeout: 45000 },
      );

      const explanation = sanitizeAiText(response.data?.ai_explanation);
      if (!explanation) return false;

      const updated = await updateEvaluationAiContent(evaluation.id, {
        ai_explanation: explanation,
      });

      // `result` es estado propio del panel de resultado y no deriva de
      // `evaluations`: sin esto el reintento persiste la explicación pero la
      // vista sigue mostrando la anterior. Solo se refresca si el snapshot
      // visible es el de la evaluación reintentada.
      setResult((prev) =>
        prev && prev.evaluation_id === evaluation.id
          ? { ...prev, ai_explanation: explanation }
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
              ? { ...item, result: { ...item.result, ai_explanation: explanation } }
              : item,
          ),
        );
      }
      return true;
    } catch (error) {
      console.error("ScoreLeads /score/explain error", error);
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
        setSignupOfferError("Cuenta creada, pero no pudimos guardar tu evaluación. Por favor intenta de nuevo.");
        setAuth(nextAuth);
      } else {
        setSignupOfferError(err?.message || "No se pudo crear la cuenta. Intenta nuevamente.");
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
          "Iniciaste sesion, pero no pudimos migrar la preevaluación previa. Tus datos temporales se conservaron para reintentar.",
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
      // Corrección: se usaban variables 'rt' y 't' no definidas.
      if (isSupabaseDataConfigured && !auth.session) {
        throw new Error(
          "No hay una sesión activa. Por favor, inicia sesión nuevamente.",
        );
      }

      // Solo enviamos el userId si es un UUID válido, de lo contrario pasamos null para que el servicio use el usuario autenticado
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
        "El score se calculó, pero no pudimos guardar la preevaluación. Revisa que tu sesión siga activa y que Supabase permita insertar evaluaciones.",
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
      setDataError("No se pudo eliminar la evaluación seleccionada.");
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

  const handleAcceptPlan = async (housingPieType) => {
    if (!currentEvaluation) return;

    try {
      setDataError("");
      const input = currentEvaluation.input || {};
      const price = getHousingPropertyPrice(currentEvaluation);
      const housingInfo = price > 0 ? calculateHousingSavings(input, price) : null;

      let snapshot;
      if (housingInfo && !housingInfo.error && housingInfo.isViable) {
        snapshot = buildHousingPlanSnapshot(housingInfo, housingPieType || "minimo");
      } else {
        snapshot = {
          pie_type: housingPieType || "minimo",
          property_price: price || 0,
          pie_required: 0,
          monthly_target: 0,
          months: 0,
          gap: 0,
          current_savings: Number(input.ahorro_disponible) || 0,
          progress: null,
        };
      }

      const updatedEvaluation = await acceptEvaluationPlan(
        currentEvaluation.id,
        userId || profile?.email || "local-user",
        snapshot,
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
            pie_type: snapshot.pie_type,
            monthly_target: snapshot.monthly_target,
            months: snapshot.months,
            pie_required: snapshot.pie_required,
            gap: snapshot.gap,
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
        housingPlan,
      );
      if (updatedEvaluation) {
        setEvaluations((prev) =>
          prev.map((item) =>
            item.id === updatedEvaluation.id ? updatedEvaluation : item,
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

      const newFinancialInput = buildFinancialInput({
        ...currentEvaluation.input,
        ...milestoneData,
      });

      const res = await fetch(scoreUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFinancialInput),
      });

      if (!res.ok) {
        throw new Error(`Error en el scoring: ${res.status}`);
      }

      const scoreResult = await res.json();
      const resultSnapshot = buildResultSnapshot(scoreResult);

      const savedEvaluation = await createEvaluation(isUUID(userId) ? userId : null, {
        email: profile?.email || "sin-email",
        onboarding: userOnboarding ? { ...userOnboarding } : null,
        input: newFinancialInput,
        result: resultSnapshot,
        channel: getChannel(),
      });

      setEvaluations((prev) => {
        const entry = { ...savedEvaluation, created_at: savedEvaluation.created_at || new Date().toISOString() };
        return [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 25);
      });
      prependEvaluation(savedEvaluation);

      setMilestoneSuccess("¡Hito registrado exitosamente! Tu score y plan han sido recalculados.");
      setPage("tracking"); 
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setMilestoneSuccess(""), 5000);
    } catch (err) {
      console.error("Error registrando hito", err);
      setDataError("Hubo un problema registrando el hito. Por favor intenta de nuevo.");
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
          <section className="evaluation-panel">
            <div className="section-heading compact">
              <span className="eyebrow">Disponible</span>
              <h1>Pre-evaluación financiera</h1>
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
          <section className="evaluation-panel">
            <button className="secondary-button" type="button" onClick={() => navigateToPage("anon-onboarding")}>
              Volver
            </button>
            <div className="section-heading compact">
              <span className="eyebrow">Disponible</span>
              <h1>Pre-evaluación financiera</h1>
              <p>
                Completa todos los campos para calcular un score orientativo. El
                resultado no equivale a aprobación bancaria.
              </p>
            </div>
            {anonOnboarding && (
              <div className="context-summary">
                <strong>Contexto inicial</strong>
                <span>
                  {anonOnboarding.comuna_interes} ·{" "}
                  {plazoLabels[anonOnboarding.plazo_compra] || anonOnboarding.plazo_compra}
                </span>
                <button
                  className="secondary-button compact-button"
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
              onConsentAccept={() => {}}
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
          <section className="evaluation-panel">
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
        <section className="evaluation-panel">
          <div className="section-heading compact">
            <span className="eyebrow">Disponible</span>
            <h1>Pre-evaluación financiera</h1>
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
      ) : page === "admin-profile" && profile.role === roles.admin ? (
        <AdminProfile profile={profile} onNavigate={navigateToPage} />
      ) : page === "home" ? (
        <section className="evaluation-panel">
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

          <div className="dashboard-status-grid">
            <div className="dashboard-card">
              <span className="dashboard-card-label">Score financiero orientativo</span>
              {currentScore ? (
                <div className={`dashboard-score score-${currentScore.classification?.toLowerCase()}`}>
                  <strong>{currentScore.score}</strong>
                  <span>{currentScore.classification}</span>
                </div>
              ) : (
                <p className="dashboard-empty">Sin evaluación aún</p>
              )}
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card-label">Objetivo de compra</span>
              {userOnboarding?.comuna_interes ? (
                <div className="dashboard-card-value">
                  <strong>
                    {userOnboarding.tipo_propiedad === "departamento" ? "Departamento" :
                     userOnboarding.tipo_propiedad === "casa" ? "Casa" :
                     userOnboarding.tipo_propiedad === "indiferente" ? "Indiferente" :
                     "Sin definir"}{" "}
                    en {userOnboarding.comuna_interes}
                  </strong>
                  <span>
                    {plazoLabels[userOnboarding.plazo_compra] || userOnboarding.plazo_compra || "Plazo sin definir"}
                  </span>
                </div>
              ) : (
                <p className="dashboard-empty">Completa el cuestionario para definir tu objetivo</p>
              )}
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card-label">Estado actual</span>
              {currentScore ? (
                <div className={`dashboard-status-badge status-${currentScore.classification?.toLowerCase()}`}>
                  {currentScore.classification === "Alto" && "Compatible"}
                  {currentScore.classification === "Medio" && "Cercano"}
                  {currentScore.classification === "Bajo" && "Requiere ajuste"}
                </div>
              ) : onboardingCompleted ? (
                <div className="dashboard-status-badge status-pendiente">Pendiente de evaluación</div>
              ) : (
                <div className="dashboard-status-badge status-pendiente">Sin datos suficientes</div>
              )}
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card-label">Principal brecha</span>
              {currentEvaluation?.result?.improvement_plan?.length > 0 ? (
                <div className="dashboard-card-value">
                  <strong>{currentEvaluation.result.improvement_plan[0].title || "Revisa tu plan de mejora"}</strong>
                </div>
              ) : currentScore ? (
                <p className="dashboard-empty">Sin brechas detectadas</p>
              ) : (
                <p className="dashboard-empty">Realiza tu pre-evaluación para ver brechas</p>
              )}
            </div>
          </div>

          <div className="dashboard-next-action">
            <span className="dashboard-card-label">Tu siguiente mejor acción</span>
            {!onboardingCompleted ? (
              <div className="dashboard-action-card" onClick={() => navigateToPage("onboarding")}>
                <div>
                  <strong>Completa tu perfil financiero</strong>
                  <p>Responde el cuestionario para obtener tu score orientativo.</p>
                </div>
                <span className="dashboard-action-arrow">→</span>
              </div>
            ) : !currentScore ? (
              <div className="dashboard-action-card" onClick={startEvaluation}>
                <div>
                  <strong>Realiza tu pre-evaluación</strong>
                  <p>Calcula tu score financiero orientativo en unos minutos.</p>
                </div>
                <span className="dashboard-action-arrow">→</span>
              </div>
            ) : currentScore?.classification === "Bajo" ? (
              <div className="dashboard-action-card" onClick={() => navigateToPage("tracking")}>
                <div>
                  <strong>Revisa tu plan de mejora</strong>
                  <p>Tu score indica áreas de mejora. Conoce los pasos para avanzar.</p>
                </div>
                <span className="dashboard-action-arrow">→</span>
              </div>
            ) : (
              <div className="dashboard-action-card" onClick={() => navigateToPage("simulation")}>
                <div>
                  <strong>Simula proyectos compatibles</strong>
                  <p>Compara propuestas referenciales o ingresa un valor manual.</p>
                </div>
                <span className="dashboard-action-arrow">→</span>
              </div>
            )}
          </div>

          <div className="dashboard-quick-access">
            <div className="dashboard-access-card" onClick={() => navigateToPage("simulation")}>
              <span className="dashboard-access-icon">📊</span>
              <div>
                <strong>Simulación</strong>
                <p>Compara proyectos referenciales o ingresa un valor manual.</p>
              </div>
            </div>

            <div className="dashboard-access-card" onClick={() => navigateToPage("tracking")}>
              <span className="dashboard-access-icon">📋</span>
              <div>
                <strong>Plan de mejora</strong>
                <p>Revisa metas de ahorro, deuda y próximos pasos.</p>
              </div>
            </div>

            <div className="dashboard-access-card" onClick={() => navigateToPage("academia")}>
              <span className="dashboard-access-icon">📚</span>
              <div>
                <strong>Academia</strong>
                <p>Aprende conceptos como pie, dividendo, deuda y crédito hipotecario.</p>
              </div>
            </div>

            <div className="dashboard-access-card" onClick={() => navigateToPage("recommendations")}>
              <span className="dashboard-access-icon">💡</span>
              <div>
                <strong>Recomendaciones</strong>
                <p>Consulta acciones sugeridas según tu perfil.</p>
              </div>
            </div>
          </div>

          <p className="hero-note">
            RutaHogar no aprueba créditos hipotecarios. Los resultados son referenciales y no reemplazan una evaluación bancaria formal.
          </p>
        </section>
      ) : page === "evaluate" ? (
        <section className="evaluation-panel">
          <div className="section-heading compact">
            <span className="eyebrow">Disponible</span>
            <h1>Pre-evaluación financiera</h1>
            <p>
              Completa todos los campos para calcular un score orientativo. El
              resultado no equivale a aprobación bancaria.
            </p>
          </div>
          {userOnboarding && (
            <div className="context-summary">
              <strong>Contexto inicial</strong>
              <span>
                {userOnboarding.comuna_interes} ·{" "}
                {plazoLabels[userOnboarding.plazo_compra] ||
                  userOnboarding.plazo_compra}
              </span>
              <button
                className="secondary-button compact-button"
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
            onResult={handleResult}
          />
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
          onOpenMilestoneRegistration={() => setPage("register-milestone")}
          successMessage={milestoneSuccess}
        />
      ) : page === "housing-plan" && profile.role === roles.user ? (
        <HousingSavingsPlan
          evaluation={currentEvaluation}
          initialPieType={housingInitialPieType}
          onBack={() => setPage("tracking")}
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
      ) : page === "leads" && (profile.role === roles.sales || profile.role === roles.admin) ? (
        <DashboardLeads
          evaluations={evaluations}
          inmobiliariaId={inmobiliariaId}
          ejecutivo={profile?.role === roles.sales ? { id: profile.id, email: profile.email } : null}
        />
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
