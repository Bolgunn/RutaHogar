Third pass, on `2450f31`, `d1e8fb3` and `d1a34a2`. Good progress: the ML is gone and the Vercel preview builds again.

**Fixed since the last review:**
- XGBoost, SHAP, pandas, scikit-learn, the model file and `/score/retrain` are removed. The three rules now run as plain Python in `predict_fraud`.
- The `"Evaluations select own"` recreation is gone from `20261003000000`.
- `20261002000000_create_hu16_objects.sql` now creates the table, columns, role and triggers.
- `update_lead_reliability` rejects anonymous calls, and executives can only set `en_revision`.
- The sweeper is revoked from `anon`/`authenticated`/`public` and writes `changed_by = NULL`.
- Both triggers write to `lead_status_history` and both set `sospechoso`.
- E2: the executive's reason is required, and the admin has all four states with a required reason.
- E3: a "Silenciados" filter, the list updates without a reload, and `ExecutiveHome` excludes unreliable leads.

## Blocking merge

### 1. The migrations will break `supabase db push` against prod
- Prod's registered migrations end at `20261003120000_lead_status_history_read` (#108). `20261002000000` and `20261003000000` are dated before it, so `db push` refuses them unless run with `--include-all`.
- Both were already run by hand in prod's SQL editor (prod's trigger functions match `20261002000000`), but neither is registered as applied, so a push runs them again.
- Running `20261003000000` again recreates `"Staff select lead_status_history"` with a broader rule, which undoes #108's version (scoped by inmobiliaria). Every executive could then read every inmobiliaria's history.

**Required:**
- Rebase on `develop` (the PR currently has merge conflicts).
- Rename both migrations to timestamps after `20261003120000`.
- Remove the `lead_status_history` policy from `20261003000000` so #108 stays in charge of it.
- Coordinate before pushing, since prod already has these objects.

### 2. The savings-plan trigger can never run
HU13 made `evaluations` immutable: `hu13_immutable` (from `20260920190000_hu13_immutable_tracking.sql`) rejects every UPDATE with `immutable_history`. Triggers that run before the same event fire in alphabetical order, so it runs before `trg_check_housing_plan_progress` and the HU16 trigger never gets a chance. Updating `evaluations.housing_plan` is a dead path: only 32 of 434 evaluations in prod have one, from before HU13.

(Separately, the new version reads `housing_plan->'meta_ahorro'->>'monto_actual'`, which nothing in the app writes. That doesn't matter once it's replaced.)

`supabase/test_hu16_rules.sql` Test 1 fails for the same reason: its UPDATE is rejected. Please remove this trigger and its test, and move the savings check to `tracking_events` (proposal B below).

### 3. E1 still doesn't detect inconsistent data
`plan.md` §3.2 was rewritten to list only the three anti-bot rules, and the inconsistency rules were removed instead of built. E1's acceptance criterion hasn't changed: it still asks to flag *valores contradictorios, cambios anormales respecto a su historial o datos poco consistentes*, and to show the factors. Fill time and attempts per device are useful anti-bot signals, but they don't detect inconsistent data.

Everything E1 needs is already in the database. Proposal:

**A. Contradictory values when an evaluation is inserted.** Extend `check_ml_fraud_on_insert` (or a sibling BEFORE INSERT trigger on `evaluations`) with rules over `NEW.financial_data->'input'`. Each one appends a readable message to `v_reasons`, and the existing ≥ 90 / history-row path stays as it is. Prod evaluations already carry every field these rules need:

| Rule | Condition |
| :-- | :-- |
| Debt exceeds income | `deuda_mensual >= ingreso_mensual` (with `ingreso_mensual > 0`) |
| Dividend not viable | `dividendo_estimado > ingreso_mensual * 0.85` |
| Disproportionate savings | `ahorro_disponible > ingreso_mensual * 120` |
| Contradictory delinquency | `morosidad_actual = 'no'` and `monto_morosidad > 0`, or `'si'` and `monto_morosidad <= 0` |
| Age + loan term | `edad + plazo_credito_hipotecario > 85` |

**B. Abnormal changes compared with the lead's own history, on `tracking_events`.** HU13 already records every financial update a lead makes. `event_kind` is `baseline`, `data_update` or `evaluation`, and each row has the changed fields in `patch`, a complete snapshot in `recorded_complete_snapshot`, and a link to the previous event in `previous_event_id`. An AFTER INSERT trigger on `tracking_events` for `data_update` and `evaluation` events compares the new snapshot with the previous event's:

| Rule | Condition |
| :-- | :-- |
| Income jump | `ingreso_mensual` up more than 200% or down more than 70% within 30 days |
| Delinquency cleared | `morosidad_actual` from `'si'` to `'no'` within 7 days |
| Impossible savings pace | `ahorro_disponible` rising faster than 3× income plus one income per elapsed month (the rule the savings-plan trigger meant to apply) |

This works per lead (`user_id`), not per device, so shared laptops and the same lead on another device are handled correctly. It replaces both the dead savings-plan trigger and the device-based 24h savings jump.

**C. Record the factors in `lead_status_history`.** When A or B fires and the lead is `normal`/`reactivado`, set `sospechoso` and insert a history row with `changed_by = NULL` and the rule messages joined into `reason`, as the insert trigger already does. `tracking_events` and `evaluations` can't be updated after insert, so the history row is where the factors live. That covers E4 for automatic changes, and gives the frontend one source to show the factors to executives on the lead card (the latest automatic reason).

Any new trigger migration also has to be dated after `20261003120000` (blocker 1).

## Acceptance criteria

| Criterion | ✅ Done | ❌ Missing |
| :-- | :-- | :-- |
| **E1 — Automatic detection** | • Anti-bot rules in `predict_fraud` and the insert trigger<br>• Automatic flag → `sospechoso` with a history row<br>• Admins see the factor messages | • No contradictory-value rules (proposal A)<br>• No per-lead history comparison; the savings jump is by device (proposal B)<br>• The savings-plan trigger can never run (blocker 2)<br>• Executives don't see the factors (proposal C + lead card) |
| **E2 — Report and manual review** | • Executive report with a required reason → `en_revision`<br>• Admin can set Normal / En revisión / Reactivado / Silenciado, each with a required reason<br>• The RPC limits executives to `en_revision` | • A logged-in user without a profile row gets past the role check (inline) |
| **E3 — Show status and filter** | • Badges, default filter hides `sospechoso`/`en_revision`<br>• "Silenciados" filter<br>• List updates after reporting<br>• `ExecutiveHome` excludes unreliable leads | • The list update only changes the reported evaluation, not the lead's other evaluations (inline) |
| **E4 — History and traceability** | • Manual changes, the insert trigger and the sweeper write history<br>• System changes recorded as `NULL` ("Sistema")<br>• Admin "Reportes" page | • Depends on fixing the migration order (blocker 1)<br>• Automatic changes from B need history rows (proposal C) |

### E1
The only automatic detection is anti-bot: the form filled in under 5 seconds, more than 3 attempts from one device in 15 minutes, and savings that jump more than 3× income within 24 hours on the same device. Because those checks are by device, they compare different people sharing a laptop and miss the same lead on another device. The savings-plan trigger was meant to watch a lead's own updates, but HU13's immutability means it never runs (blocker 2). Nothing checks whether the declared values contradict each other. Proposals A, B and C cover all three parts of E1 using objects already in prod.

### E2
Done. The one gap: `get_my_role()` returns NULL for a logged-in user with no profile row, and `NULL NOT IN (...)` doesn't raise.

### E3
Done. Reliability status belongs to the lead (`profiles.reliability_status`), but the list update after a report only changes the evaluation with the matching `id`. A lead with several evaluations keeps showing the others as reliable until a reload.

### E4
Done in code for manual changes, the insert trigger and the sweeper. It only works in prod once blocker 1 is fixed, and the new rules from B need to write history rows too (proposal C).

## Smaller issues
- `backend/test_fraude.py` TEST 5 still posts to the removed `/score/retrain`, so `make test-fraude` fails.
- `predict_fraud` turns `time_to_submit = 0` into 30 (`or 30`), so the backend skips the under-5-seconds rule for sub-second submissions. The database trigger still catches them.


supabase/migrations/20261002000000_create_hu16_objects.sql
-- Base migration for HU16: Create tables, columns, roles, and automated triggers
-- Required so that migrations run cleanly on fresh databases and track history for automatic flags.

-- 1. Allow 'admin_inmobiliario' in profiles role check
This migration is dated before `20261003120000` (#108), the last migration registered in prod, so `supabase db push` rejects it without `--include-all`. It was also already run by hand in prod without being registered. Please rename it to a timestamp after `20261003120000`.


supabase/migrations/20261002000000_create_hu16_objects.sql
);

-- 5. Trigger for housing plan progress check
CREATE OR REPLACE FUNCTION public.check_housing_plan_progress()

This trigger can never run: `hu13_immutable` on `evaluations` rejects every UPDATE and fires first (triggers on the same event run alphabetically). It also reads `meta_ahorro.monto_actual`, which nothing writes. Please remove it and move the savings-pace check to an AFTER INSERT trigger on `tracking_events`, comparing each snapshot with the previous event's by `user_id` (proposal B in the top-level comment).


supabase/migrations/20261003000000_fix_hu16_review_issues.sql
-- 2. Add RLS to lead_status_history
ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff select lead_status_history" ON public.lead_status_history;
CREATE POLICY "Staff select lead_status_history"

This policy has the same name as #108's and is broader (any executive reads all history). Since `20261003000000` already ran by hand in prod without being registered, a push runs it again and replaces #108's tenant-scoped version. Please remove this policy and rename the migration after `20261003120000`.


Comment thread
supabase/migrations/20261003000000_fix_hu16_review_issues.sql
    RAISE EXCEPTION 'Unauthorized: anonymous calls not allowed';
  END IF;

  IF v_role NOT IN ('ejecutivo', 'admin', 'admin_inmobiliario') THEN

`get_my_role()` is NULL for a logged-in user with no profile row, and `NULL NOT IN (...)` is NULL, so this check doesn't raise. Use `IF v_role IS NULL OR v_role NOT IN (...)`.


supabase/migrations/20261002000000_create_hu16_objects.sql
    END IF;
  END IF;

  -- Script automatizado

This is the natural place for E1's contradictory-value rules (proposal A): `deuda_mensual >= ingreso_mensual`, `dividendo_estimado > ingreso_mensual * 0.85`, `ahorro_disponible > ingreso_mensual * 120`, delinquency answer vs `monto_morosidad`, and `edad + plazo_credito_hipotecario > 85`. Each should append a readable message to `v_reasons` so it ends up in the history row.


frontend/src/components/DashboardLeads.jsx
                      await reportLead(selectedLead.user_id, executiveScope.id, reportReason);
                      // Optimistic UI update
                      setLocalEvaluations(prev => prev.map(item => 
                        item.id === selectedLead.id 

Reliability status belongs to the lead, so match item.user_id === selectedLead.user_id. Otherwise the lead's other evaluations keep showing as reliable.


backend/test_fraude.py
    mock_retrain.table().select().execute().data = [] # Retornará 0 datos

    with patch("app.ml_fraud.get_supabase_client", return_value=mock_retrain):
        response_retrain = client.post("/score/retrain", headers=headers)

/score/retrain was removed, so this returns 404 and the assertion fails. Please delete TEST 5.


backend/app/ml_fraud.py
    """
    Predice la probabilidad de fraude y extrae los factores usando reglas determinísticas.
    """
    time_to_submit = float(data.get("time_to_submit") or 30)

or 30 turns a 0-second submission into 30, which skips the < 5 rule. Use 30 if data.get("time_to_submit") is None else float(...).

