import { useEffect, useRef, useState } from "react";

// Only schedules revalidation; visibility and the deadline always come from T6.
export default function useStaffProjectionRead({ scopeKey, load, projections }) {
  const callbacks = useRef({ load, projections });
  callbacks.current = { load, projections };
  const [state, setState] = useState(null);
  const reader = useRef(null);
  useEffect(() => {
    let active = true;
    let revision = 0;
    let deadlineTimer;
    const checked = new Set();
    const refresh = async ({ conceal = true } = {}) => {
      const request = ++revision;
      if (conceal) setState({ scopeKey, data: null, loading: true, error: "" });
      try {
        const data = await callbacks.current.load();
        if (!active || request !== revision) return;
        window.clearTimeout(deadlineTimer);
        const deadlines = callbacks.current.projections(data)
          .filter((p) => p?.version === "hu30-projection-v1" && p.visibility === "visible" && p.historical_visible_until)
          .map((p) => Date.parse(p.historical_visible_until))
          .filter((date) => Number.isFinite(date) && !checked.has(date));
        const deadline = Math.min(...deadlines);
        if (Number.isFinite(deadline)) {
          const schedule = () => {
            const remaining = deadline - Date.now();
            if (remaining <= 0) { checked.add(deadline); refresh(); }
            else deadlineTimer = window.setTimeout(schedule, Math.min(remaining, 2147483647));
          };
          // Even a response received just after its deadline must be revalidated.
          if (deadline <= Date.now()) { checked.add(deadline); refresh(); return; }
          schedule();
        }
        setState({ scopeKey, data, loading: false, error: "" });
      } catch {
        if (active && request === revision) setState({ scopeKey, data: null, loading: false, error: "No pudimos consultar la información vigente. Reintenta para continuar." });
      }
    };
    reader.current = refresh;
    refresh();
    const onFocus = () => refresh({ conceal: false });
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => { if (document.visibilityState !== "hidden") refresh({ conceal: false }); }, 30000);
    return () => {
      active = false; reader.current = null;
      window.clearInterval(interval); window.clearTimeout(deadlineTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [scopeKey]);
  const current = state?.scopeKey === scopeKey ? state : { data: null, loading: true, error: "" };
  return { ...current, refresh: () => reader.current?.() };
}
