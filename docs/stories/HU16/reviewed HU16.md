Code review of HU16 — 11 findings, inline below. Not tested by running; based on reading the diff.

**Blockers:** the committed XGBoost model makes every `/score` call 500 (feature mismatch), `float(None)` crash when `time_to_submit` is omitted, `update_lead_reliability` open to any logged-in user, `lead_status_history` has no RLS, and the SQL references a nonexistent `evaluations.input` column.

**Process notes:**
- CLAUDE.md excludes trained ML models and new dependencies without explicit team approval; this adds XGBoost, SHAP, pandas and the supabase client to the backend. That needs a team decision.
- All SQL is loose files / edits to `schema.sql`; nothing is in `supabase/migrations/`, so `supabase db push` won't apply it. That's how the PR #97 objects ended up hand-applied in prod. Please move these into timestamped migrations that keep the prod containment of `update_lead_reliability`.
ml_fraud.py code:

    # --- PREDICCIÓN ML REAL ---
    # XGBoost predice clase 1 (Fraude) o 0 (Normal)
    proba = _xgb_model.predict_proba(features)[0][1] * 100.0  # Probabilidad de clase 1

**Blocker — every `/score` call 500s.** The committed `xgboost_fraud_model.json` was trained on 5 features (`time_to_submit, ingreso_mensual, deuda_mensual, edad, ahorro_disponible`), but `_extract_features` builds 6 (adds `intentos_previos`). Because the file exists, the model is always loaded and `predict_proba` raises a feature_names mismatch — the fallback rules never run. Also breaks `/score/explain` (goes through `calculate_score`) and `tests/test_ml_fraud.py`.


backend/app/ml_fraud.py
def _extract_features(data: Dict) -> pd.DataFrame:
    """Extrae las variables de comportamiento para el modelo."""
    return pd.DataFrame([{
        "time_to_submit": float(data.get("time_to_submit", 30)),

**Blocker — `float(None)` crash.** `payload.model_dump()` always includes `time_to_submit` with value `None`, so `data.get("time_to_submit", 30)` returns `None`, not 30. Callers that don't send it — "Fijar como mi Meta" (`App.jsx` ~1333) and milestone re-scoring, since old evaluations lack the field and `JSON.stringify` drops `undefined` — get a 500. Use `data.get(...) or 30`.


supabase/schema.sql
  v_old_status text;
  v_changed_by uuid;
begin
  v_changed_by := coalesce(auth.uid(), p_reporter_id);

**Security — no role check.** `update_lead_reliability` is `SECURITY DEFINER`, granted to all `authenticated`, with no staff check and no status-transition validation. A logged-in lead (`usuario`) can `rpc('update_lead_reliability', {p_lead_id: <own id>, p_new_status: 'reactivado'})` to clear its own flag, or silence anyone else; an executive can undo an admin's `silenciado`. Prod already runs a staff-only version with the actor fixed to `auth.uid()` (contained by hand on 2026-10-01) — re-applying this file would overwrite it. Please require staff role, ignore `p_reporter_id`, and validate `p_new_status`/transitions (executives → `en_revision` only).


supabase/schema.sql
add column if not exists consent_data jsonb,
add column if not exists reliability_status text not null default 'normal' check (reliability_status in ('normal', 'sospechoso', 'en_revision', 'descartado', 'reactivado', 'silenciado'));

create table if not exists public.lead_status_history (

**Security — no RLS.** `lead_status_history` is created without `enable row level security` or policies. With Supabase's default grants, anyone holding the anon key can SELECT/INSERT/UPDATE/DELETE it via PostgREST, so the "immutable" audit trail isn't. Enable RLS, add a staff-only SELECT policy, and revoke INSERT/UPDATE/DELETE (writes should go only through the SECURITY DEFINER function).


supabase/schema.sql
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]))
    or (public.get_my_role() = 'admin')
    or (
      public.get_my_role() in ('admin_inmobiliario', 'ejecutivo')

**Behavior change — executives lose most leads.** This narrows the evaluations select policy so `ejecutivo` only sees leads whose comuna matches one of their inmobiliaria's projects. An executive with null `inmobiliaria_id`, or whose tenant has no project in the lead's comuna, gets an empty dashboard (HdU 2). `App.jsx` explicitly says the lead feed is not per-inmobiliaria. Also, the second `or exists (...)` sits outside the role condition because AND binds tighter than OR. This also overlaps with the evaluations select-policy fix in migration `20261001120000`.


supabase/e1_fraud_columns_migration.sql
BEGIN
  -- 1. Insertar el historial para los leads que van a ser cambiados
  INSERT INTO public.lead_status_history (
    lead_id, 

**Sweeper always fails.** It inserts `lead_id`, `previous_status`, `changed_by_role`, but `lead_status_history` has `profile_id`, `old_status`, and no role column — every call errors, so the sweeper never flags anything (and `test_hu16_rules.sql` Test 2 / cleanup fail the same way). Also: `SECURITY DEFINER` with no `set search_path` and no `REVOKE ... FROM public`, so anonymous callers can execute it; and the JOIN inserts one history row per matching evaluation, not per lead.


backend/app/main.py
    return response


@app.post("/score/retrain")

**Security — unauthenticated retrain.** `/score/retrain` has no auth, reads every profile and evaluation with the service-role key, retrains, and overwrites the model on disk and in memory for all requests. Anyone who can reach the API can trigger it repeatedly. Also, the labels count a nonexistent `reportado` status and ignore `en_revision`/`silenciado`, and training uses 5 features while prediction uses 6 (see the comment on `ml_fraud.py`).


frontend/src/components/DashboardLeads.jsx
      if (item.input?.edad != null && (item.input.edad < ageRange.min || item.input.edad >= ageRange.max)) return false;
      if (ageRange.min && item.input?.edad == null) return false;
      if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;
      const status = item.reliability_status || "normal";

**Regression — date filter removed.** This hunk deleted the `dateThreshold` check, so the Fecha selector no longer filters anything (`dateThreshold` is still computed and counts as an active filter). Restore `if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;`.

