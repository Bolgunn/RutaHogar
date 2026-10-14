# Sprint review demo seed — plan

Seed the production database with demo accounts so HU 15, HU 14 and HU 20 can be shown working at
the sprint review, then remove everything right after. Decided in a grill session on 2026-10-07.

## Decisions

| # | Decision | Why |
| :- | :------- | :-- |
| D1 | Demo **HU 15, HU 14 and HU 20**. HU 16 is out. HU 18 is out entirely: no co-debtor invitations, tokens, confirmations, revocations or emails. | Agenda of the review. HU 18 was judged not worth the seeding complexity (live Resend emails, token links). |
| D2 | Seed **production** (`adgnxtjkqedtvkwcizzn`); the review is presented on the deployed Vercel app. | It is the only Supabase project, and the demo should run on the real stack (Groq, BCCh snapshots). |
| D3 | Everything lives in one **isolated demo tenant, "Inmobiliaria Sprint Review (demo)"**. All accounts are `sprint-*@example.com`, created confirmed through the Admin API (no email sent). Passwords per D20. | Real tenants' dashboards and lead lists do not change; one prefix plus one tenant makes teardown a single sweep. |
| D4 | Two layers: the existing **bulk seeder** (`backend/scripts/seed_hu15_demo.py`) for volume and history, plus a new **hero personas** script for scripted, known logins. | A live demo needs deterministic examples; random leads would force a search on stage. |
| D5 | Bulk lead count is a `--leads` flag, **sized at run time** to stay under the REST row cap (D16): about 100–175 leads, not the 450 first chosen. | 450 was chosen for a fuller `/metricas`, then dropped when the 1000-row cap surfaced (D16). Dry runs: 150 leads → 299 evaluations, 18 sales; 200 → 426, 23 sales; 250 → 485, 30 sales. |
| D6 | The presenting ejecutivo is **`sprint-ejecutivo-1`**. The whole set uses the `sprint-` prefix (new `--email-prefix` flag, default stays `demo-hu15-`), and the tenant name becomes a flag too. | One naming scheme; `sprint-ejecutivo-1` is the bulk seeder's ejecutivo-1 (Mirador / Plaza / Jardín Ñuñoa) and the heroes attach to its projects. |
| D7 | Hero roster: **Camila** and **Matías** (HU 14), **Diego** (HU 20), generated **in the same run** as the bulk seed (`--heroes`). | One account per story beat (see below). One run lets the HU 14 check see every lead the presenter sees, counts hero evaluations in the same budget, and keeps one account pass, one SQL set and one teardown. |
| D8 | HU 20 events for Diego come from the **real detection code** (`LeadChangeService._detect_events`), run for Diego only, recorded through the real `lead_changes_record_event` RPC with `source = 'job'`. | Shows the feature as it actually works, not hand-written rows. |
| D9 | **Do not back-date** the bulk leads out of the HU 20 cron window. Accept that the daily cron (`/lead-changes/daily-digest`, 12:00 UTC, newest 100 leads) overlaps sprint leads until teardown. | Keeping all 450 leads older than the 100th real lead (2026-06-17) would empty the last 4 months of `/metricas` and fail the seeder's coverage check. The leads it would push out are mostly team test accounts. |
| D10 | **No email can reach sprint accounts.** Lead-change email is enabled in prod (5 sent on 2026-10-07), but it is opt-in per lead: with no `lead_notification_preferences` row with `enabled = true` for channel `email`, the cron skips with `opt_out`. Neither script ever writes email preference rows, and the post-run check asserts it. | Verified read-only against `lead_change_notifications` and `LeadChangeRepository.preference_enabled`. |
| D11 | Claude runs every step; **the user approves each prod write** (account creation, each SQL batch, the hero script, teardown). Read-only queries need no approval. | Explicit user instruction. |
| D12 | Run the real seed **the evening before the review**, with `--anchor` at that moment, and the **teardown the same day after the review**. Dry runs happen now. | The data is anchored to "today"; every day of delay empties the right edge of `/metricas` and lets the cron accumulate `monthly_plan_summary` events on sprint leads. |
| D13 | Every demo project name ends in **" (demo)"** (e.g. "Mirador Ñuñoa (demo)"). The preflight checks whether any user opted into `project_compatible_unlocked` email could be matched to a demo project, and stops the run if so. | The tenant is new and isolated for staff, but RLS `Proyectos select lead` shows every non-agotado project to every `usuario`, and the HU 20 cron's `available_projects()` reads them all too. Real users would see 7 demo projects, and 2 users have opted into that email. The suffix labels anything they see; the check rules out a real email about a fake project. A migration excluding the tenant was rejected as a prod change made only for the demo. |
| D14 | **Revert = the teardown, one approved command, for any failure** at any step (accounts, a batch, heroes, smoke test). No resume logic and no manual partial cleanup: teardown, fix, rerun from scratch. The teardown is rehearsed on a local Supabase first and proven in prod right after seeding with a `--check` run that rolls back. No "hide without deleting" panic mode. Supabase backups / PITR are not a revert path. | Each SQL batch is its own transaction, so a failure never leaves a half-written batch; the teardown selects by prefix + tenant, so it works on any partial state. A restore would also roll back real users' activity in the same window. |
| D15 | **Identity fields like a real signup.** Every seeded account (leads, heroes, staff) gets: a human-looking email that keeps the prefix (`sprint-camila.rojas.042@example.com`; heroes stay `sprint-hero-<name>`); `full_name` plus `nombre`, `apellido_paterno`, `apellido_materno`; a **distinct RUT** from a sequential block starting at **40.000.001**, with a valid check digit (same algorithm as `frontend/src/utils/rut`); a **fake phone** `+56 9 0000 NNNN`. | Lead cards show email and enable call / WhatsApp only with a phone, so blanks would look unfinished. RUTs must all differ; personal RUTs currently top out around 28–29M and company RUTs start around 50M, so a 40M block should not match a real person (understanding of Registro Civil assignment, not verified). Nobody taps call / WhatsApp during the review. |
| D16 | **Stay under the 1000-row REST cap**: before writing, the seeder counts prod evaluations and refuses if `existing + new > 1000 − 100`, printing the `--leads` that would fit. Margin 100 for real activity during the window. | The staff dashboard (`/staff/evaluations`) reads every evaluation in one PostgREST request and prod caps responses at 1000 rows (verified: `206`, `0-999/1134` on a larger table). Past it, real tenants' leads silently drop out of their dashboards. Prod had 523 evaluations on 2026-10-07, growing ~95/week. Fixing the loader is a separate task. |
| D17 | Diego's `score_band_improved` uses the **real market snapshot in force on his evaluation date**, when one exists in `market_snapshots`; otherwise he shows two events (`monthly_plan_summary`, `project_compatible_unlocked`). | The detector only fires when the market changed since the evaluation; inventing an older snapshot would make his evaluation claim data that never existed. |
| D18 | Mirador Maipú (demo) starts at **1,900 UF**, not 1,800. | The HU 20 cron tells each lead about the cheapest project it reaches, ties by name. Prod already has a 1,800 UF project (Parque Lo Espejo, Inmobiliaria Andes (demo)); a demo project at 1,800 named "Mirador…" would win the tie and send the 2 opted-in users a real email about it. Above 1,800 no real lead's cheapest project can be a sprint demo project. Diego's unlocked project may then be Parque Lo Espejo (another demo tenant). |
| D19 | Profiles are **upserted**, not inserted. | Prod's `on_auth_user_created` trigger (`handle_new_user`) creates a bare profile as soon as an account is created; a plain insert would fail on the first SQL file. Found by rehearsing against the prod schema. |
| D20 | **Passwords: leads and heroes = their email's local part; the 8 staff = local part + a secret suffix** (`SEED_STAFF_PASSWORD_SUFFIX`, never committed). | Easy logins for the demo. The repo is public, so a guessable staff login would let anyone use a staff role in prod and reach staff-only data. Lead accounts only see demo data and the public catalog. |

## Accounts

| Account | Role | Purpose |
| :------ | :--- | :------ |
| `sprint-admin-1`, `sprint-admin-2` | admin_inmobiliario | `/metricas` over all 8 projects |
| `sprint-ejecutivo-1` | ejecutivo | **Presenter.** HU 15 per-ejecutivo view; HU 14 lead history, opportunities and comparison on its projects |
| `sprint-ejecutivo-2` … `-6` | ejecutivo | Same assignments as the HU 15 design (shared projects, a `pendiente` link, an empty-state ejecutivo) |
| `sprint-<nombre>.<apellido>.001` … `.450` | usuario | Bulk leads with a year of history |
| `sprint-hero-camila` | usuario | HU 14 E1 + E2 |
| `sprint-hero-matias` | usuario | HU 14 E3 |
| `sprint-hero-diego` | usuario | HU 20 |

All at `@example.com`, created confirmed, passwords per D20. Every account
has names split as a signup does, a distinct RUT from the 40.000.001+ block and a `+56 9 0000 NNNN`
phone (D15). RUTs are assigned in a fixed order (staff, then leads by number, then heroes), so a
rerun gives the same ones.

## Hero personas

Evaluations go through the real scoring engine and the real HU 13 `TrackingService`, like the bulk
leads; only dates are back-dated. Each profile is **searched** over a few parameters until the app's
own code shows the story (ALG-10 / ALG-14 and the HU 14 comparison through Node, the HU 20 detectors
in Python); if none does, the run stops before writing anything.

**Camila — HU 14 E1 (evolution) + E2 (contact opportunity).** Ñuñoa, Mirador Ñuñoa (demo). Four
evaluations at 170, 115, 60 and 4 days before the anchor: income 72 → 100 %, debt 22 → 4 %, savings
30 → 100 %. Alto throughout (so ALG-14 does not rank her by "became Alto", which sorts last). Her
previous evaluation is not Compatible with Mirador Ñuñoa; the latest is, and reaches its minimum
price. Check: she is the **first** opportunity among all of `sprint-ejecutivo-1`'s leads.

**Matías — HU 14 E3 (comparison).** Same project; Medio, rated Marginal / Cercano and short of the
minimum price; debt 12 → 16 % (kept under the share that becomes a critical blocker, which would
exclude him from the project). Two evaluations, no improvement, so he is never an opportunity.

**Diego — HU 20.** Maipú, goal Villa Maipú (demo). One evaluation 35 days before the anchor, so the
real `LeadChangeService._detect_events` finds `monthly_plan_summary` and `project_compatible_unlocked`
(his capacity reaches a demo-tenant project but not his goal), plus `score_band_improved` when D17
applies. Events are recorded through `lead_changes_record_event` with `source = 'job'`. No email:
no preference rows (D10). The one-field quick update (E4) is done live.

## Implementation (built on `chore/sprint-review-seed`)

| File | What |
| :--- | :--- |
| `backend/scripts/seed_hu15_demo.py` | Flags `--leads`, `--email-prefix`, `--tenant`, `--project-suffix`, `--rut-start`, `--margin`, `--heroes`; identity fields (D15); profile upserts (D19); row-cap guard (D16); Mirador Maipú at 1,900 (D18); UTF-8 console output. Defaults keep the HU 15 behavior. |
| `backend/scripts/seed_sprint_heroes.py` + `seed_sprint_heroes_check.mjs` | The heroes, their parameter search and the story checks. |
| `backend/scripts/seed_hu15_demo_teardown.sql` | Template (prefix, tenant, ending). Also removes HU 20 rows, simulations, ARCO requests, lead status history, and real users' HU 20 events about demo projects; counts every public user / tenant / project column before and requires zero after. |
| `backend/scripts/seed_demo_teardown.py` | Renders and applies the teardown; `--check` reports and rolls back. |
| `backend/scripts/seed_sprint_preflight.sql`, `seed_sprint_postcheck.sql` | Read-only checks for steps 2 and 6. |
| `docs/stories/sprint-review-seed/DEMO.md` | Runbook and presenter guide. |

**Rehearsed locally (2026-10-07)** on a local Supabase stack restored from a schema-only dump of prod
(the repo's migrations cannot build a database from scratch), with prod's `auth.users` trigger and a
copy of its 1,800 UF project: full seed (170 leads + heroes, 351 evaluations), post-check all green,
teardown `--check`, teardown to zero rows with the other tenant untouched and triggers re-enabled;
and a seed killed after 17 of 37 files, then teardown to zero.

## Run sequence

| Step | When | Writes to prod | Approval |
| :--- | :--- | :------------- | :------- |
| 1. Implement; dry run (`--dry-run --heroes`) | Done | No | — |
| 1b. Local rehearsal | Done | No | — |
| 2. Read-only preflight: no `sprint-%` users or tenant exist; required tables/RPCs exist (prod migration history is unreliable, so check objects, not versions); still no real projects in Ñuñoa, Providencia or Maipú; for every user with an enabled `project_compatible_unlocked` email preference, their latest `capacidad_compra_estimada_uf` does not reach any demo project's `precio_min_uf` (D13); no profile already has a RUT in the seed's block (D15). Any failure stops the run | Evening before | No | — |
| 3. Dry run at the chosen `--leads` against the evening's anchor; review totals and hero lines | Evening before | No | — |
| 4. Seed (bulk + heroes, one run): budget guard, accounts, ~35 SQL files, Diego's events | Evening before | Yes | Yes |
| 6. Post-run checks (read-only): counts match the printed totals; zero email preference rows for `sprint-%`; Diego has his events; every `sprint-%` profile has a RUT, all distinct and valid, and a phone | Evening before | No | — |
| 6b. Teardown `--check` in prod (rolls back): proves the revert works on the real data | Evening before | No (rolled back) | Yes |
| 7. Smoke test in the deployed app as `sprint-ejecutivo-1`, `sprint-admin-1`, Camila and Diego | Evening before | No | — |
| 8. Teardown | Same day, after the review | Yes | Yes |
| ✕ On any failure in steps 4–7 | Immediately | Yes | Yes: teardown, fix, rerun from step 2 |

## Risks and notes

- **Cron overlap (D9).** Until teardown, sprint leads may receive in-app `monthly_plan_summary`
  events and some real test accounts are skipped by the daily job. No emails (D10).
- **Prod migration drift.** Several recent migrations are applied but not recorded. The preflight
  checks objects directly.
- **HU 14 opportunity dismissals** are stored in the browser's `localStorage`
  (`RutaHogar_dismissed_contact_opportunities`). Do not dismiss Camila's card during the smoke test,
  or clear that key before presenting.
- **Demo projects are visible to every real `usuario`** (catalog, matching, ranking) while the seed
  is live, labeled "(demo)" (D13). Teardown removes them.
- **Real users may simulate or favorite a demo project** while it is visible. Favorites and HU 20
  events about demo projects are deleted by the teardown; their own mortgage simulations keep the row
  with the project reference nulled.
- **If a real tenant opens a project in Ñuñoa, Providencia or Maipú** while the seed is live, demo
  leads appear in its lists. Teardown right after the review limits this.

## Open

- **Review date and time.** Sets `--anchor` and the evening run.
