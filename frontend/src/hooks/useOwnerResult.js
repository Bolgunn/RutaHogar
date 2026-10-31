import { useEffect, useRef, useState } from "react";
import { getEvaluations } from "../services/evaluationService";
import { getTracking, updateScoreWithConfirmedCoDebtor } from "../services/trackingService";
import { roles } from "../lib/roles";
import { createOwnerResultSession } from "../services/ownerResultSession";

export default function useOwnerResult({ ownerId, evaluation, onRefreshEvaluation }) {
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
    const session = createOwnerResultSession({ ownerId, read: () => readRef.current(), incorporate: () => updateScoreWithConfirmedCoDebtor({ expectedUserId: ownerId }), onChange: setState });
    sessionRef.current = session;
    session.refresh();
    const refresh = () => { if (!session.getState().updating) session.refresh(); };
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState !== "hidden") refresh(); }, 60000);
    return () => {
      session.dispose(); sessionRef.current = null;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [ownerId, enabled]);

  const scopedState = state?.ownerId === ownerId ? state : null;
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

  return { enabled, ...(scopedState || { loading: enabled }), refresh: () => sessionRef.current?.refresh(), update: () => sessionRef.current?.update() };
}
