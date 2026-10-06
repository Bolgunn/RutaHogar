Follow-up on `e71798c`. Thanks for the quick turnaround. Most of the first review is fixed: the feature mismatch, `float(None)`, RLS on `lead_status_history`, the `evaluations.input` references, the sweeper columns, the executive visibility and the date filter, and the SQL now lives in a real migration.

## Blocking merge

### 1. Remove the ML model and its dependencies
XGBoost, SHAP, pandas, numpy and scikit-learn have to come out of this PR. HU16 doesn't need ML for any of its acceptance criteria, and these libraries break the deploy: the Vercel backend build fails with `Total bundle size (1809.85 MB) exceeds the maximum function size (500 MB)`.

The model also adds nothing on top of the rules:
- The flagging that matters is already done by the hard rules (savings jump, repeated attempts, fill time < 5s) and the database triggers.
- The model only scores cases no rule caught.
- It's trained on labels those same rules produced.
- Its SHAP output ("la variable 'edad' aumentó la sospecha") doesn't tell an admin what's inconsistent.

**Required changes:**
- Delete `ml_fraud.py`'s model path, `xgboost_fraud_model.json`, `/score/retrain`, `fraud_score_probability`/`shap_top_factors` naming tied to the model, and the `xgboost`, `shap`, `pandas`, `scikit-learn` lines in both `requirements.txt` files.
- Keep the rules as plain Python in their own module (e.g. `backend/app/scoring_engine/reliability.py`), working on dicts, the way `scoring.py`/`scoring_engine/` are written. Each rule returns a code and a readable message.

### 2. The new migration brings back the 42501 outage
It recreates `"Evaluations select own"` with a subquery on `lead_status_history`. That's exactly what `20261001120000_evaluations_select_policy.sql` (#104, already on `develop`) removed: in prod, `authenticated` has no privileges on that table, and Postgres checks privileges on every table a policy reads, so every select on `evaluations` fails. Please rebase on `develop` (the branch is 10+ commits behind) and drop section 1 of the migration. #104 also decided that `admin_inmobiliario` sees the same leads as `ejecutivo`.

### 3. `update_lead_reliability` still lets anonymous callers through
Details inline.

### 4. The migration assumes objects no migration creates
`lead_status_history`, `profiles.reliability_status`, `profiles.rut`, the fraud columns, `admin_inmobiliario` in `profiles_role_check`, and the triggers only exist in loose SQL files or were applied by hand in prod. The fix migration fails on a fresh database. These need a create migration that runs before it.

## Acceptance criteria (not counting the ML)

| Criterion | ✅ Done | ❌ Missing |
| :-- | :-- | :-- |
| **E1 — Automatic detection** | • New evaluations and savings-plan updates are checked automatically<br>• The lead's status changes without anyone acting<br>• Admins see the alert and its factor messages | • The planned inconsistency rules were never built (debt ≥ income, dividend > 85%, savings > 120× income, contradictory delinquency answers, age + term > 85)<br>• No comparison against the lead's previous evaluation; the savings jump is checked by device<br>• Executives don't see the factors<br>• Evaluation flags set `sospechoso`, savings-plan flags set `en_revision` |
| **E2 — Report and manual review** | • "Reportar lead" button on the lead card → `en_revision`<br>• The lead shows up in the admin queue<br>• Contact is blocked while in review or silenced | • The executive's reason is optional<br>• Admin only has Reactivar / Silenciar (no Normal, no En revisión)<br>• Admin can't enter a reason (fixed text)<br>• Executives can set any status through the RPC |
| **E3 — Show status and filter** | • Status badges on cards and in the lead detail<br>• "Confiabilidad" filter; by default it hides `sospechoso` and `en_revision`<br>• Silenced leads are excluded from lists and counts | • Silenced leads can't be shown through any filter<br>• A reported lead stays in the list until a reload<br>• `ExecutiveHome` counts suspicious and silenced leads as "prioritarios" |
| **E4 — History and traceability** | • `lead_status_history` stores date, who, old/new status and reason for manual changes<br>• Admin "Reportes" page<br>• Leads are never deleted<br>• History can't be edited through the API | • Triggers change status without writing to the history<br>• The sweeper records the lead as the author of its own flag |

### E1: detecting inconsistencies automatically
The PR has automatic detection, but of the wrong kind. What's built is anti-bot and anti-tampering detection: the form filled in under 5 seconds, more than 3 attempts from one device in 15 minutes, and savings that jump more than 3× income in 24 hours. These run in the backend and again in the `check_ml_fraud_on_insert` trigger. `check_housing_plan_progress` adds two checks on savings-plan updates.

E1 asks for *contradictory values*, *abnormal changes compared with the lead's history*, and *data that doesn't add up*. The PR's own plan lists the rules for that (debt ≥ income, dividend over 85% of income, savings over 120× income, contradictory delinquency answers, age + loan term over 85, jumps against the previous evaluation), but there's no `inconsistencies.py`, no `inconsistencyDetector.js` and no `inconsistency_flags`. The only check about change over time, the savings jump, compares by `device_id_hash`, so it compares different people on a shared laptop and misses the same lead on a different device.

E1 also asks to show the factors. Admins see them in "Control de leads reportados", but executives filtering by "Solo sospechosos" only see a badge. Finally, the two automatic paths disagree: an evaluation flag sets `sospechoso`, while a savings-plan flag sets `en_revision`.

### E2: reporting and manual review
The executive side works: "Reportar lead" moves the lead to `en_revision`, it appears in the admin queue, and the contact buttons are blocked. But the criterion says the executive reports *indicando un motivo*, and the reason field is optional, with a default text saved instead.

On the admin side, E2 lists four states: Normal, En revisión, silenciado and reactivado. `AdminReportedLeads` only offers Reactivar and Silenciar, so a lead the system flagged `sospechoso` can't be moved into review, and there's no way to set Normal. The admin also can't write a reason; each button saves a fixed sentence. Finally, the RPC doesn't limit what an executive can set, so through the API an executive can reactivate or silence leads, which E2 reserves for the admin.

### E3: showing status and filtering
This one is mostly done. Every card and the lead detail show a status badge, and the "Confiabilidad" filter's default hides `sospechoso` and `en_revision`, as the criterion requires. The remaining gaps:
- Silenced leads are filtered out unconditionally, even with "Todos los leads activos", so there's no way to view them; the plan had a "Silenciado" option.
- After reporting, the code changes the lead object in place instead of updating state, so the reported lead stays in the list until a full reload.
- `ExecutiveHome` wasn't updated and still counts suspicious and silenced leads in "prioritarios".

### E4: history and traceability
Manual changes are traced correctly. `update_lead_reliability` writes date, author (`auth.uid()`), old and new status, and reason to `lead_status_history`. Admins can read it on the new "Reportes" page, leads are never deleted, and since the fix commit the history can't be edited through the API.

Automatic changes are not traced. `check_ml_fraud_on_insert` and `check_housing_plan_progress` update `profiles.reliability_status` directly and never write a history row, so the status changes from E1 leave no record, even though they're the ones E4 most needs to trace. The sweeper does write history, but with `changed_by = p.id`, so the timeline shows the lead marking themselves suspicious. It should be `NULL` (shown as "Sistema") or a dedicated system actor.


supabase/migrations/20261003000000_fix_hu16_review_issues.sql
            OR pr.comuna = (SELECT onboarding_data->>'comuna_alternativa' FROM public.profiles p WHERE p.id = evaluations.user_id)
          )
        )
        OR EXISTS (

This `EXISTS` on `lead_status_history` is what caused the prod 42501 fixed in #104 (`authenticated` has no privileges on that table). Please drop this policy section and rebase on `develop`.


supabase/migrations/20261003000000_fix_hu16_review_issues.sql
  v_changed_by := auth.uid();
  v_role := public.get_my_role();

  IF v_role NOT IN ('ejecutivo', 'admin', 'admin_inmobiliario') THEN


supabase/migrations/20261003000000_fix_hu16_review_issues.sql
    AND p.reliability_status = 'normal';
END;
$$;
REVOKE ALL ON FUNCTION public.sweep_fraudulent_leads() FROM public;  

Same grant issue. The sweeper is still executable by `anon` and `authenticated` on a fresh database. Add `REVOKE EXECUTE ... FROM anon, authenticated` and let only a scheduled job or the service role call it.


supabase/migrations/20261003000000_fix_hu16_review_issues.sql
    'normal', 
    'sospechoso', 
    'Alerta automática (Sweeper): Probabilidad de fraude (' || e.fraud_score_probability || '%) excede el umbral.', 
    p.id

`changed_by = p.id` records the lead as the author of its own `sospechoso` status, so the history shows the lead flagging themselves. Use `NULL` (shown as "Sistema" in `AdminReportHistory`) or a dedicated system actor.


backend/app/main.py
    """
    from .ml_fraud import retrain_adaptive_model

    if x_admin_token != os.environ.get("ADMIN_RETRAIN_TOKEN", "super-secret-token"):

The fallback `"super-secret-token"` is in the repo (`test_fraude.py`), so any deploy without `ADMIN_RETRAIN_TOKEN` has a public retrain token. Return 503 when the variable isn't set.


backend/app/ml_fraud.py
import json
import pandas as pd
import numpy as np
import xgboost as xgb

HU16 doesn't need XGBoost, SHAP or pandas, and they're what makes the backend bundle 1.8 GB and breaks the Vercel deploy. Please remove the model, `xgboost_fraud_model.json`, `/score/retrain` and these dependencies. Keep the three hard rules as plain Python in their own module that returns a code and a readable message. See the top-level comment.


supabase/schema.sql

    IF v_profile.reliability_status IN ('normal', 'reactivado') THEN
      UPDATE public.profiles 
      SET reliability_status = 'sospechoso', updated_at = now() 

This trigger (and `check_housing_plan_progress` at line 1167) changes `reliability_status` without inserting into `lead_status_history`, so E4 has no record of automatic flags. Also, one path sets `sospechoso` and the other `en_revision` for the same kind of signal.


frontend/src/components/DashboardLeads.jsx
              </div>
              <textarea 
                className="admin-textarea" 
                placeholder="Motivo del reporte (opcional)" 

E2 says the executive reports "indicando un motivo", but the reason is optional here and a default text is saved. Make it required.


frontend/src/components/AdminReportedLeads.jsx
                      type="button" 
                      className="secondary-button compact-button" 
                      style={{ color: "var(--color-success, #2e7d32)" }}
                      onClick={() => handleResolve(lead.id, "reactivado", "Lead verificado y reactivado por administrador")}

E2 lets the admin set Normal, En revisión, silenciado or reactivado with a reason. This screen only offers Reactivar and Silenciar, with fixed reasons, so a `sospechoso` lead can't be moved into review. Add the missing states and a reason field.