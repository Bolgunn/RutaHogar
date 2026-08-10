import React, { useEffect, useMemo, useState } from "react";
import AcademiaFinanciera from "./components/AcademiaFinanciera";
import AdminPanel from "./components/AdminPanel";
import AnonHeader from "./components/AnonHeader";
import AuthPanel from "./components/AuthPanel";
import DashboardLeads from "./components/DashboardLeads";
import DataConsent from "./components/DataConsent";
import FinancialTracking from "./components/FinancialTracking";
import LandingPage from "./components/LandingPage";
import MonthlyPlan from "./components/MonthlyPlan";
import Navbar from "./components/Navbar";
import NotificationToast from "./components/NotificationToast";
import ObjectiveReview from "./components/ObjectiveReview";
import Onboarding from "./components/Onboarding";
import ProfilePage from "./components/ProfilePage";
import Recommendations from "./components/Recommendations";
import Result from "./components/Result";
import ScoreForm from "./components/ScoreForm";
import SignupOffer from "./components/SignupOffer";
import RegisterMilestone from "./components/RegisterMilestone";
import { acceptEvaluationPlan, createEvaluation, deleteEvaluation as deleteStoredEvaluation, getEvaluations } from "./services/evaluationService";
import { useLeads } from "./hooks/useLeads";
import { normalizeDisplayList, normalizeDisplayText, normalizeImprovementPlan } from "./utils/text";
import { createGoal, getGoals, updateGoalProgress, updateGoalStatus } from "./services/goalsService";
import { getStoredAuth, roles, signOut, signUp, updateStoredProfile } from "./services/auth";
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

const ONBOARDING_KEY = "scoreleads_onboarding";
const ANON_ONBOARDING_KEY = "scoreleads_anon_onboarding";
const ANON_RESULT_KEY = "scoreleads_anon_result";
const ANON_INPUT_KEY = "scoreleads_anon_input";

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
  if (!profile) return "landing";
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
  if (page === "academia") return "/academia";
  if (page === "tracking" || page === "monthly-plan" || page === "objective-review") return "/plan-mejora";
  if (page === "profile") return "/perfil";
  if (page === "leads") return "/dashboard";
  if (page === "admin") return "/admin";
  return "/inicio";
};

const resolveRouteForPath = (pathname, profile, hasAnonOnboarding) => {
  const path = normalizePathname(pathname);
  const unknownRoute = ![
    "/",
    "/inicio",
    "/login",
    "/registro",
    "/precalificacion",
    "/pre-evaluacion",
    "/recomendaciones",
    "/academia",
    "/plan-mejora",
    "/perfil",
    "/historial",
    "/dashboard",
    "/ejecutivo/leads",
    "/admin",
  ].includes(path);

  if (!profile) {
    if (unknownRoute) return { page: "landing", path: "/" };
    if (path === "/login" || path === "/registro") return { page: "auth" };
    if (path === "/precalificacion" || path === "/pre-evaluacion") {
      return { page: hasAnonOnboarding ? "anon-evaluate" : "anon-onboarding", path: "/precalificacion" };
    }
    if (["/recomendaciones", "/academia", "/plan-mejora", "/perfil", "/historial", "/dashboard", "/admin", "/ejecutivo/leads"].includes(path)) {
      return { page: "auth", path: "/login" };
    }
    return { page: "landing", path: path === "/inicio" ? "/" : undefined };
  }

  if (profile.role === roles.user) {
    if (unknownRoute) return { page: "home", path: "/inicio" };
    if (path === "/") return { page: "landing" };
    if (path === "/inicio") return { page: "home" };
    if (path === "/precalificacion" || path === "/pre-evaluacion") {
      return {
        page: hasCompletedOnboarding(getOnboardingData(profile)) ? "evaluate" : "onboarding",
        path: path === "/pre-evaluacion" ? "/precalificacion" : undefined,
      };
    }
    if (path === "/recomendaciones") return { page: "recommendations" };
    if (path === "/academia") return { page: "academia" };
    if (path === "/plan-mejora") return { page: "tracking" };
    if (path === "/perfil" || path === "/historial") return { page: "profile", path: path === "/historial" ? "/perfil" : undefined };
    if (path === "/dashboard" || path === "/admin" || path === "/ejecutivo/leads" || path === "/login" || path === "/registro") {
      return { page: "home", path: "/inicio" };
    }
    return { page: "home", path: "/inicio" };
  }

  if (profile.role === roles.sales) {
    if (path === "/") return { page: "landing" };
    if (path === "/dashboard" || path === "/ejecutivo/leads" || path === "/inicio") {
      return { page: "leads", path: path === "/dashboard" ? undefined : "/dashboard" };
    }
    return { page: "leads", path: "/dashboard" };
  }

  if (profile.role === roles.admin) {
    if (path === "/") return { page: "landing" };
    if (path === "/admin") return { page: "admin" };
    if (path === "/dashboard" || path === "/ejecutivo/leads") return { page: "leads", path: "/dashboard" };
    if (path === "/inicio") return { page: "admin", path: "/admin" };
    return { page: "admin", path: "/admin" };
  }

  return { page: getInitialPageForProfile(profile), path: getPrivatePathForPage(getInitialPageForProfile(profile)) };
};

const getRouteForPage = (page, profile, options = {}) => {
  if (page === "landing") return "/";
  if (page === "auth") return options.authMode === "signup" ? "/registro" : "/login";
  if (page === "anon-onboarding" || page === "anon-evaluate") return "/precalificacion";
  if (!profile) return "/";
  return getPrivatePathForPage(page);
};

const futureModules = [
  {
    title: "Objetivo inmobiliario",
    status: "Disponible",
    description:
      "Captura objetivo de compra, comuna deseada, tipo de propiedad y plazo estimado para contextualizar la preevaluación.",
  },
  {
    title: "Pre-evaluación financiera",
    status: "Disponible",
    description:
      "Formulario guiado, score preliminar, clasificación y recomendaciones básicas para el usuario.",
  },
  {
    title: "Recomendaciones inteligentes",
    status: "Disponible",
    description:
      "Entrega recomendaciones orientativas basadas en la última preevaluación, sin reemplazar una evaluación bancaria formal.",
  },
  {
    title: "Priorización comercial",
    status: "Futuro",
    description:
      "Vista para equipos comerciales con leads ordenados por viabilidad y principales factores de riesgo.",
  },
  {
    title: "Seguimiento financiero",
    status: "Futuro",
    description:
      "Plan de preparación para leads aún no aptos, con metas de ahorro, deuda y continuidad laboral.",
  },
  {
    title: "Integraciones",
    status: "Futuro",
    description:
      "Conexiones con CRM, bancos, documentos y fuentes de datos cuando la integración esté disponible.",
  },
];

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
  const [dataError, setDataError] = useState("");
  const [dismissedError, setDismissedError] = useState("");
  const [milestoneSuccess, setMilestoneSuccess] = useState("");
  const [trackingGoals, setTrackingGoals] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
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
    sessionStorage.setItem(ANON_ONBOARDING_KEY, JSON.stringify(data));
    setAnonOnboarding(data);
    setPage("anon-evaluate");
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
        console.log("Error de Auth en registro:", err);
        setSignupOfferError("No pudimos crear tu cuenta en este momento. Verifica que tus datos sean correctos o que el correo no esté ya registrado.");
      }
    } finally {
      setSignupOfferLoading(false);
    }
  };

  const handleContinueWithout = () => {
    clearAnonSession();
    navigateToPage("landing");
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
          "Iniciaste sesión con éxito, pero tuvimos un problema guardando tu evaluación anterior. Puedes volver a intentarlo desde tu perfil.",
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
    navigateToPage("home");
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

  const handleResult = async (scoreResult, input) => {
    const resultSnapshot = buildResultSnapshot(scoreResult);
    const financialInput = buildFinancialInput(input);

    try {
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

      setResultSaved(true);
      setEvaluations((prev) => {
        const entry = { ...savedEvaluation, created_at: savedEvaluation.created_at || new Date().toISOString() };
        return [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 25);
      });
      prependEvaluation(savedEvaluation);
    } catch (err) {
      console.error(err);
      setResultSaved(false);
      setDataError(
        "Tu pre-evaluación finalizó, pero hubo un problema al guardarla en tu historial. Si el problema persiste, vuelve a iniciar sesión.",
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

  const handleAcceptPlan = async () => {
    if (!currentEvaluation) return;

    try {
      setDataError("");
      const updatedEvaluation = await acceptEvaluationPlan(
        currentEvaluation.id,
        userId || profile?.email || "local-user",
      );
      if (updatedEvaluation) {
        setEvaluations((prev) =>
          prev.map((item) =>
            item.id === updatedEvaluation.id ? updatedEvaluation : item,
          ),
        );
      }
      setDataError(
        "Plan activado. Podrás volver a precalificar después de avanzar en tus metas.",
      );
    } catch (err) {
      console.error(err);
      setDataError("No pudimos activar el plan. Intentalo nuevamente.");
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
  // Esta funcion es la que permite registrar un nuevo hito y recalcular el score.
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
        delete parsedMilestoneData.renta_mensual; // Limpiamos el campo incorrecto
      } else if (parsedMilestoneData.ingreso_mensual !== undefined) {
        parsedMilestoneData.ingreso_mensual = Number(parsedMilestoneData.ingreso_mensual);
      }

      if (parsedMilestoneData.ahorro_disponible !== undefined) {
        parsedMilestoneData.ahorro_disponible = Number(parsedMilestoneData.ahorro_disponible);
      }

      console.log('RegisterMilestone: parsedMilestoneData', parsedMilestoneData);

      // 2. Construir el input mezclando la evaluación anterior con los datos sanitizados
      const newFinancialInput = buildFinancialInput({
        ...currentEvaluation.input,
        ...parsedMilestoneData,
      });

      console.log('Payload enviado a la API:', newFinancialInput);

      let res;
      try {
        res = await fetch(scoreUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newFinancialInput),
        });
      } catch (fetchErr) {
        console.error('Network error al contactar API de scoring (¿Está encendido el servidor en el puerto 8000?)', fetchErr);
        throw new Error(`Error de conexión con el motor de evaluación.`);
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

      console.log('Milestone savedEvaluation', savedEvaluation);

      prependEvaluation(savedEvaluation);

      setMilestoneSuccess("¡Hito registrado exitosamente! Tu score y plan han sido recalculados.");
      setPage("tracking");

      setTimeout(() => setMilestoneSuccess(""), 5000);
    } catch (err) {
      console.error("Error registrando hito", err);
      setDataError("Hubo un problema al registrar tu nuevo hito. Por favor, verifica tus datos e intenta nuevamente.");
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
    navigateToPage("landing", { replace: true });
  };

  const handleNotificationClick = () => navigateToPage("leads");

  const handleDismissNotification = () => markLeadsSeen();

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
            onBack={() => navigateToPage("landing")}
          />
        </div>
      );
    }

    if (page === "anon-onboarding") {
      return (
        <div className="anon-shell">
          <AnonHeader onLogin={() => navigateToPage("auth")} onHome={() => navigateToPage("landing")} />
          <div className="app-shell">
            <Onboarding
              isAnon
              onComplete={handleAnonOnboardingComplete}
            />
          </div>
        </div>
      );
    }

    if (page === "anon-evaluate") {
      return (
        <div className="anon-shell">
          <AnonHeader onLogin={() => navigateToPage("auth")} onHome={() => navigateToPage("landing")} />
          <div className="app-shell">
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
                birthDate={null}
                profile={null}
                consentGranted={true}
                isAnon
                onConsentAccept={() => { }}
                onResult={handleAnonResult}
              />
            </section>
          </div>
        </div>
      );
    }

    if (page === "signup-offer") {
      return (
        <div className="anon-shell">
          <AnonHeader onLogin={() => navigateToPage("auth")} onHome={() => navigateToPage("landing")} />
          <div className="app-shell">
            <SignupOffer
              result={anonResult}
              anonBirthDate={anonInput?.birth_date}
              onSignup={handleSignupFromOffer}
              onContinueWithout={handleContinueWithout}
              loading={signupOfferLoading}
              error={signupOfferError}
            />
          </div>
        </div>
      );
    }

    return <LandingPage onStart={() => navigateToPage("anon-onboarding")} onLogin={() => navigateToPage("auth")} />;
  }

  return (
    <div className="app-shell">
      <Navbar
        profile={profile}
        page={page}
        currentScore={currentScore}
        onNavigate={(nextPage) =>
          nextPage === "evaluate" ? startEvaluation() : navigateToPage(nextPage)
        }
        onLogout={handleLogout}
      />
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
        <Onboarding
          initialData={userOnboarding}
          onComplete={handleOnboardingComplete}
        />
      ) : page === "dataconsent" && profile.role === roles.user ? (
        <DataConsent
          profile={profile}
          readonly={consentGranted}
          onAccept={handleDataConsent}
          onBack={() => navigateToPage(consentGranted ? "evaluate" : "onboarding")}
        />
      ) : page === "home" ? (
        <>
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">Solución inmobiliaria</span>
              <h1>ScoreLeads</h1>
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
              <p>
                Plataforma para preevaluar leads inmobiliarios antes de iniciar
                una evaluación bancaria formal. El foco del producto es entregar
                una pre-evaluación financiera clara, rápida y orientativa.
              </p>
              <p className="hero-note">
                Sin documentos, sin claves bancarias y sin aprobación bancaria.
              </p>
            </div>

            <aside className="score-preview" aria-label="Resumen de ScoreLeads">
              <span className="preview-label">Flujo activo</span>
              <strong>Formulario - Score - Recomendaciones</strong>
              <p>Resultado orientativo: Alto, Medio o Bajo.</p>
            </aside>
          </section>

          {result && <Result data={result} />}

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Mapa del producto</span>
              <h2>Implementaciones planificadas</h2>
              <p>
                Estas tarjetas muestran la visión completa de ScoreLeads.
                Actualmente están habilitados el objetivo inmobiliario y la
                pre-evaluación financiera.
              </p>
            </div>

            <div className="module-grid">
              {futureModules.map((module) => (
                <article
                  className={`module-card ${module.status === "Disponible" ? "is-active" : ""}`}
                  key={module.title}
                >
                  <div>
                    <span className="module-status">{module.status}</span>
                    <h3>{module.title}</h3>
                  </div>
                  <p>{module.description}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : page === "evaluate" ? (
        <section className="evaluation-panel">
          <button className="secondary-button" onClick={() => navigateToPage("home")}>
            Volver al inicio
          </button>
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
        />
      ) : page === "tracking" && profile.role === roles.user ? (
        <FinancialTracking
          evaluation={currentEvaluation}
          goals={trackingGoals}
          onAcceptPlan={handleAcceptPlan}
          onGoalStatusChange={handleGoalStatusChange}
          onOpenGoalPlan={handleOpenGoalPlan}
          onStartEvaluation={startEvaluation}
          onOpenMilestoneRegistration={() => setPage("register-milestone")}
          successMessage={milestoneSuccess}
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
        />
      ) : page === "academia" && profile.role === roles.user ? (
        <AcademiaFinanciera evaluation={currentEvaluation} onStartEvaluation={startEvaluation} onNavigate={navigateToPage} />
      ) : page === "leads" && (profile.role === roles.sales || profile.role === roles.admin) ? (
        <DashboardLeads evaluations={evaluations} />
      ) : page === "admin" && profile.role === roles.admin ? (
        <AdminPanel evaluations={evaluations} profile={profile} />
      ) : (
        <section className="section-block">
          <div className="section-heading">
            <span className="eyebrow">Vista no disponible</span>
            <h1>Revisa tu navegacion</h1>
            <p>Tu rol actual no tiene acceso a esta vista.</p>
          </div>
        </section>
      )}
    </div>
  );
}