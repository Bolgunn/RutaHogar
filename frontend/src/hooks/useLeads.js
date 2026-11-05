import { useEffect, useMemo, useState } from "react";
import { getEvaluations } from "../services/evaluationService";
import { isUUID, updateLastLeadSeenAt } from "../services/profileService";
import { updateStoredProfile } from "../services/auth";
import { isStaffRole } from "../lib/roles";
import { supabase } from "../utils/supabase";

const CLASSIFICATION_ORDER = { Alto: 1, Medio: 2, Bajo: 3 };
// /tracking/staff/evaluations is the heaviest staff read (15 s timeouts near 300 leads).
const STAFF_REFRESH_MS = 60_000;
const REFRESH_FAILED = "No pudimos actualizar los leads. Mostramos la última versión cargada.";

function sortEvaluations(list) {
  return [...list].sort((a, b) => {
    const diff =
      (CLASSIFICATION_ORDER[a.result.classification] ?? 99) -
      (CLASSIFICATION_ORDER[b.result.classification] ?? 99);
    return diff !== 0 ? diff : new Date(b.created_at) - new Date(a.created_at);
  });
}

export function useLeads({ userId, profile }) {
  const [evaluations, setEvaluations] = useState([]);
  const [newHighLeadsCount, setNewHighLeadsCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(userId));
  const [loadedScope, setLoadedScope] = useState(null);
  const scope = `${userId || ""}:${profile?.role || ""}`;

  const isStaff = isStaffRole(profile?.role);

  useEffect(() => {
    let active = true;
    if (!userId) { setEvaluations([]); setLoading(false); return; }
    setLoading(true);

    async function load() {
      try {
        setError("");
        const filterId = isStaff ? null : isUUID(userId) ? userId : "loading";
        if (filterId === "loading") return;

        const list = await getEvaluations(filterId, profile?.role);
        const sorted = sortEvaluations(list);

        if (isStaff) {
          const lastSeenAt = profile?.last_lead_seen_at || null;
          const fresh = sorted.filter((ev) => {
            if (ev.result.classification !== "Alto" || ev.user_id === userId) return false;
            if (!lastSeenAt) return true;
            return ev.created_at && ev.created_at > lastSeenAt;
          });
          if (active) setNewHighLeadsCount(fresh.length);
        }

        if (active) setEvaluations(sorted);
      } catch (err) {
        console.error(err);
        if (active) setError("No pudimos cargar el historial. Revisa que las tablas de Supabase esten creadas.");
      } finally {
        if (active) { setLoading(false); setLoadedScope(scope); }
      }
    }

    load();
    return () => { active = false; };
  }, [userId, profile?.role]);

  useEffect(() => {
    // Sin Supabase configurada no hay realtime: el flujo local debe seguir funcionando.
    if (!isStaff || !supabase) return;

    let active = true;
    let inFlight = false;
    let lastRefresh = Date.now();
    // Raw Postgres INSERT payloads bypass consent redaction. Refresh the authorized feed.
    const refresh = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      if (Date.now() - lastRefresh < STAFF_REFRESH_MS / 2) return;
      inFlight = true;
      lastRefresh = Date.now();
      try {
        const list = await getEvaluations(null, profile?.role);
        if (!active) return;
        const sorted = sortEvaluations(list);
        setEvaluations(sorted);
        setError((current) => (current === REFRESH_FAILED ? "" : current));
        setNewHighLeadsCount(sorted.filter((ev) => ev.result.classification === "Alto"
          && ev.user_id !== userId
          && (!profile?.last_lead_seen_at || ev.created_at > profile.last_lead_seen_at)).length);
      } catch (err) {
        // Keep the last authorized view; never fall back to raw table reads.
        console.error(err);
        if (active) setError(REFRESH_FAILED);
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(refresh, STAFF_REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, profile?.role, profile?.last_lead_seen_at]);

  const counts = useMemo(() => {
    const c = { Alto: 0, Medio: 0, Bajo: 0 };
    evaluations.forEach((ev) => {
      if (c[ev.result.classification] !== undefined) c[ev.result.classification]++;
    });
    return c;
  }, [evaluations]);

  const markLeadsSeen = async () => {
    if (!isStaff || !userId) return;
    setNewHighLeadsCount(0);
    try {
      await updateLastLeadSeenAt(userId);
      updateStoredProfile({ ...profile, last_lead_seen_at: new Date().toISOString() });
    } catch (err) {
      console.error("Error al marcar leads como vistos:", err);
    }
  };

  const dismissToastLocally = () => setNewHighLeadsCount(0);

  const removeEvaluation = (id) => {
    setEvaluations((prev) => prev.filter((item) => item.id !== id));
  };

  const prependEvaluation = (ev) => {
    setEvaluations((prev) => sortEvaluations([ev, ...prev.filter((item) => item.id !== ev.id)]).slice(0, 25));
  };

  return {
    evaluations,
    setEvaluations,
    newHighLeadsCount,
    counts,
    error,
    loading: Boolean(userId) && (loading || loadedScope !== scope),
    markLeadsSeen,
    dismissToastLocally,
    removeEvaluation,
    prependEvaluation,
  };
}
