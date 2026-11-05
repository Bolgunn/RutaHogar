import { useEffect, useRef, useState } from "react";
import { getEvaluations } from "../services/evaluationService";
import { getTracking, updateScoreWithConfirmedCoDebtor } from "../services/trackingService";
import { roles } from "../lib/roles";
import { canRetainOwnerResult, createOwnerResultSession } from "../services/ownerResultSession";

export default function useOwnerResult({ ownerId, evaluation, trackingState, onRefreshEvaluation }) {
  const enabled = Boolean(ownerId && evaluation?.id);
  const readRef = useRef(null);
  readRef.current = onRefreshEvaluation || (async () => {
    const [tracking, evaluations] = await Promise.all([getTracking(), getEvaluations(ownerId, roles.user)]);
    return { tracking, evaluations };
  });
  const sessionRef = useRef(null);
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const session = createOwnerResultSession({ ownerId, initialEvaluation: evaluation, initialTracking: trackingState, read: () => readRef.current(), incorporate: () => updateScoreWithConfirmedCoDebtor({ expectedUserId: ownerId }), onChange: setState });
    sessionRef.current = session;
    session.refresh();
    const refresh = () => { if (!session.getState().updating) session.refresh(); };
    let lastForegroundRead = -Infinity;
    const refreshForeground = () => {
      const now = Date.now();
      // A tab return can emit both focus and visibilitychange. Sensitive
      // participation and forced deadline reads keep their immediate checks.
      if (canRetainOwnerResult(session.getState().evaluation, ownerId) && now - lastForegroundRead < 1000) return;
      lastForegroundRead = now;
      refresh();
    };
    const onFocus = () => refreshForeground();
    window.addEventListener("focus", onFocus);
    const onVisible = () => { if (document.visibilityState === "visible") refreshForeground(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState !== "hidden") refresh(); }, 60000);
    return () => {
      session.dispose(); sessionRef.current = null;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [ownerId, enabled, evaluation?.id]);

  const scopedState = state && state.ownerId === ownerId && state.sourceEvaluationId === evaluation?.id ? state : null;
  const projection = scopedState?.evaluation?.co_debtor;
  const deadlineRef = useRef(null);
  // Keep the server deadline scheduled while another read is in flight.
  if (projection) deadlineRef.current = projection.visibility === "visible" ? projection.historical_visible_until : null;
  const deadline = deadlineRef.current;
  const checkedDeadline = useRef(null);
  useEffect(() => {
    if (!enabled || !deadline || checkedDeadline.current === deadline) return undefined;
    const expires = Date.parse(deadline);
    if (!Number.isFinite(expires)) return undefined;
    let timer;
    const schedule = () => {
      const remaining = expires - Date.now();
      if (remaining <= 0) {
        checkedDeadline.current = deadline;
        sessionRef.current?.refresh({ force: true });
      } else {
        timer = window.setTimeout(schedule, Math.min(remaining, 2147483647));
      }
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [enabled, deadline]);

  const initial = canRetainOwnerResult(evaluation, ownerId) ? { evaluation, tracking: trackingState, loading: false } : { loading: enabled };
  return { enabled, ...(scopedState || initial), refresh: () => sessionRef.current?.refresh(), update: () => sessionRef.current?.update() };
}
