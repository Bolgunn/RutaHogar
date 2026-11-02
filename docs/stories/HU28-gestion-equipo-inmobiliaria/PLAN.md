# PLAN — HU 28: Gestión de equipo de la inmobiliaria

- **Story:** `Wiki RutaHogar/UserStories/HU28-gestion-equipo-inmobiliaria.md` · **Actor:** Administrador inmobiliario (`admin_inmobiliario`, or `admin`)
- **Status:** 🔧 Built, not reviewed or deployed · Sprint 3 · 5 SP (the resolved scope is closer to 8; re-estimate before the build) · **Depends on / Required by:** HU 21 (PR #169, open) · PR #171 (open, not applied) · shares `estado_acceso` with HU 27 (partly in prod, not in the repo) · `audit_events` reused by HU 22 and HU 27
- **Branch:** `feat/hu28-gestion-equipo-inmobiliaria`, cut from HU 21 `a8aecdc` with PR #171 `cb713a8` merged in `c947dda`. PR #170 is left out on purpose.

> **The approved UI is `frontend/mockups/hu28-equipo.html`.** Open it at
> `http://localhost:5173/mockups/hu28-equipo.html`. It is the specification for layout, states and
> Spanish copy. Build what it shows, not a reinterpretation of it.

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first:
  - `frontend/mockups/hu28-equipo.html`: the approved screens. Click through every flow before writing code.
  - `backend/app/tracking/commercial_config.py` and the staff routes in `backend/app/tracking/routes.py`: the backend pattern to mirror (tenant from `staff_actor`, `checked()`, service role).
  - `supabase/functions/create-executive/index.ts`: the invitation flow being extended.
  - `supabase/migrations/20261031120000_profiles_privilege_guard_fix.sql`: the current `profiles` guard and assignment RPCs.
  - `docs/database.md`, and `docs/research/spike2-e2-auditoria-historial-versionado.md` §5.5–5.6 for the audit shape.
- Stop and report if:
  - PR #171 changed after `cb713a8`, or is not applied in prod when you need to test against prod's shape.
  - HU 27 introduced its own account-status column, or `estado_acceso` was not agreed with Andrés.
  - Prod's `get_my_role()`, `list_inmobiliaria_executives` or `profiles` policies differ from what this plan assumes. Prod's bodies are the source of truth, not the repo.
  - Making `get_my_role()` return `NULL` lets any caller pass an `if not ...` check. List every such check first; `can_admin_inmobiliaria` was the known case and #171 fixed it.
  - Any screen depends on reading another inmobiliaria's profiles once Step 3 narrows the policies.
  - The mockup and this plan disagree, or something the mockup shows can't be built as drawn. Do not choose silently.

## Goal

Give each inmobiliaria's administrator one page to control who can use RutaHogar on its behalf:
invite people, see whether they have joined, change their role and projects, and deactivate or
reactivate access. Today executives are created from the project catalog, deactivation does not
exist, nothing records who changed what, and `admin_inmobiliario` receives an empty roster.

## Approach & decisions

A new `/admin/equipo` page backed by staff endpoints that mirror HU 21: the tenant comes from
`staff_actor`, never from the request, except for a global admin's explicit selection. Writes run in
service-only RPCs so that the change and its audit entry commit together. Invitations stay in the
`create-executive` Edge Function, and assignment changes keep their existing browser RPCs, with a
database trigger writing their audit entries.

| Decision | Rationale |
| :------- | :-------- |
| "Funciones permitidas" means the role: `ejecutivo` or `admin_inmobiliario`, both directions. Never `admin`, and no per-person permissions. | Both roles already exist and the screens respect them. A permission system would not fit the story. `admin` stays with RutaHogar. |
| Only `admin_inmobiliario` and `admin` manage a team. `admin` with an inmobiliaria counts as a tenant admin (4 in prod). | Decided in the grill. Executives manage nobody, including themselves. |
| Global admins pick an inmobiliaria first, then see the same page. Only they may send `inmobiliaria_id`. | RutaHogar can support an inmobiliaria without any caller reaching another tenant by editing a request. HU 21 excluded them; this story does not. |
| Admins cannot change or deactivate themselves. No change may leave an inmobiliaria without an active admin, for any actor. | One mistake must not lock an inmobiliaria out of its own team page. |
| Invitations stay in `create-executive`. Everyone else goes through the backend. | It is live, sends the email and was secured by #171. Moving it would add another Resend copy with no user-visible gain. |
| Invitation problems are in scope: a failed email is visible, an expired link has a way forward, and the email and link use RutaHogar. | The invitation is the story's first step, so it has to work end to end. The account exists before the email is sent, so a silent failure would show a person as `Invitado` who never received anything. |
| An invited email belonging to a lead is refused. | A lead's account holds personal finances, and a typo must not turn a buyer into staff. This reverses today's behaviour and #171's "a lead still converts" test. |
| Deactivation has two layers: `profiles.estado_acceso` cuts staff access from the next request, and a Supabase Auth ban stops new logins. | A ban alone leaves access for up to about an hour. A status field alone leaves a working login until HU 27 ships. |
| Deactivation removes the person's project assignments. Reactivation does not restore them. | Product decision. The audit log keeps each removed project, and the confirmation lists them and warns if a project is left with no executive. |
| One shared, insert-only `audit_events` table with `inmobiliaria_id`. | Spike 2's shape plus tenant isolation. HU 21 left the generic log to this story, and HU 22 and HU 27 reuse it. |
| Assignment audit comes from a trigger on `proyecto_ejecutivos`. | Assignments are also made from the project catalog, so logging only in the team page would fail E3. |
| One "Historial" list with a filter by person. | Answers both "what changed on my team?" and "what happened to this person?" with one screen. |
| Staff read only their own profile and their inmobiliaria's team. Role, tenant and status changes only go through audited paths. | Without this, E3's isolation and audit promises do not hold. Global admins keep full read. |
| Invitations are always sent as `ejecutivo`. | Approved with the mockup. An admin promotes afterwards, which keeps one audited path for role changes. |
| `/admin/equipo` uses tabs for Miembros and Historial. Each person is managed in a pop-up, opened with "Gestionar". | Approved with the mockup, and matches the pop-ups of the rest of the admin area. |
| The counters at the top are also the status filter. | Approved with the mockup. There is no separate row of filter buttons. |
| A deactivated person's role and projects can't be changed until they are reactivated. | Shown in the approved mockup. The backend must refuse these too. |

## What changed during the build

Prod was read on 2026-11-02 before writing the migration. The body of `get_my_role()`, `list_inmobiliaria_executives` and the `profiles` policies matched what this plan assumes, with one addition: prod also has `"Profiles select own"` and `hu27_auth_hook_profile_read`, and both stay. No screen needs another tenant's profiles: the browser only reads its own row and `fetchExecutiveNames`, on the feature branch and on `main`.

**Open: `estado_acceso` has not been agreed with Andrés.** The name appears only in the migration, its rollback, `schema.sql`, `hu30_guard_profile_privileges`, `create-executive`, `repository.py`, `team.py` and the tests, so renaming it before deployment is one search and replace.

| Change from the plan | Why |
| :------------------- | :-- |
| `is_global_admin()` now returns `false` instead of `NULL`. | With `get_my_role()` returning `NULL`, `update_support_ticket_status` and `submit_ticket_user_feedback` would let a deactivated global admin through their `not is_global_admin()` checks. It is the only `if not` case this change opened. Every other check in prod was read and already fails closed. |
| `assign_executive` and `unassign_executive` take an optional `p_origen`, default `proyectos`. | Both screens call the same RPCs, and Historial must show "Desde Proyectos" only for catalog changes. Existing two-argument calls keep working. |
| `assign_executive` also links an admin of the same inmobiliaria. | The mockup offers project assignment to administrators. Before, their email produced a permanently pending row. An admin from outside is never linked, because that branch would write their tenant. |
| `assign_admin` writes `equipo.rol_cambiado`, refuses a deactivated account and respects the last-admin limit. | It is the other path that changes a role, and the decisions above say every such path is audited and no actor may leave an inmobiliaria without an admin. |
| Private helpers `hu28_lock_member` and `hu28_is_last_active_admin`. The row lock is on the `inmobiliarias` row. | Three writers share them. One per-tenant lock makes the last-admin race impossible without ordering member rows. |
| `audit_events.occurred_at` defaults to `clock_timestamp()`. | Entries written in one transaction must keep their order. |
| Project rows deleted by a deactivation carry `details.por_desactivacion` and Historial hides them. | The audit log keeps one row per project, while Historial shows the single line the mockup draws. |
| Historial has a "Ver más" link. | The endpoint is paginated and the mockup shows no pager; without it, entries past the first page could not be reached. |
| New `frontend/public/brand/rutahogar/logo-rutahogar.png`, rendered from the SVG. | Gmail and Outlook do not display SVG in email. |
| Linked person whose email failed: "ya tenía cuenta y se sumó al equipo, pero no pudimos avisarle por correo." | The mockup has no copy for this case. |

Prod-only item left as it is: `hu23_may_upload` uses `get_my_role()<>'usuario'`, which is `NULL` for a deactivated account, so that check no longer refuses them. The function still requires a document process owned by the caller, which staff do not have, so nothing is reachable. It has no migration on this branch, so HU 23 should change it to `is distinct from`.

**Deployment order:** PR #171 and this migration were applied to production on 2026-11-02 and recorded with `migration repair`; `audit_events` was empty afterwards. `APP_URL` and `EJECUTIVO_FROM_EMAIL` (`RutaHogar <no-reply@rutahogar.cl>`) were set the same day. Next, the backend, frontend and `create-executive` together. Until then nobody can be deactivated, a lead's email can still be linked from the catalog, and the old email text still goes out.

**Redirect, checked on 2026-11-02:** `https://www.rutahogar.cl/definir-password` is allowed. A `/auth/v1/authorize` call kept it in `auth.flow_state.referrer`, while an unlisted URL fell back to the Site URL, `https://www.rutahogar.cl`.

**Sender, checked on 2026-11-02:** a real invitation from that address, sent by the function from a local stack, reached a Gmail inbox, not Spam.

**Not verified, needs the live domain or the dashboard:** delivery from production with a working link, and the recovery link lifetime (the CLI cannot read it). If the link lasts about an hour, this plan says to stop and report before release.

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No.** No ALG added or changed. |
| 2 | Needs RLS / multi-tenant scoping? | **Yes.** `audit_events` is deny-all to browsers. `profiles` SELECT and UPDATE policies narrow. Every endpoint resolves the tenant on the server. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes**, one file: `supabase/migrations/20261102120000_hu28_gestion_equipo.sql`, plus rollback and `schema.sql` mirror. **The author applies it** after #171 is applied, as a single file with `supabase db query --linked -f` and `supabase migration repair`. Never `db push`. |
| 4 | Changes the `POST /score` contract? | **No.** |
| 5 | Consent / privacy impact? | **Staff data only.** Audit entries hold staff identifiers and role changes, no lead financial data. Refusing lead emails prevents a lead's account becoming staff. Narrowing `profiles` reduces exposure. |

> 1 and 3 are checked against the diff by CI.

## Entities

| Entity | New / existing | Change |
| :----- | :------------- | :----- |
| `profiles.estado_acceso` | **new** | `text not null default 'activo'`, check `activo` / `desactivado`. Existing rows become `activo`. Name to be agreed with Andrés. |
| `public.audit_events` | **new** | Spike 2 columns plus `inmobiliaria_id`. `actor_id` and `inmobiliaria_id` are plain `uuid` with no cascading FK, so entries outlive what they describe. RLS on with no browser policy. Update, delete and truncate are refused. Index on `(inmobiliaria_id, occurred_at desc)`. |
| `get_my_role()` | existing | Returns `NULL` for a `desactivado` account, so policies and RPCs fail closed. `get_my_inmobiliaria()` stays unchanged. |
| `hu30_guard_profile_privileges()` | existing | Also refuses browser changes to `estado_acceso`. |
| `"Profiles select"`, `"Profiles select admin"`, `"Profiles update admin"` | existing | Replaced as in Step 3. |
| `hu28_list_team`, `hu28_set_member_role`, `hu28_set_member_access`, `hu28_update_member`, `hu28_log_event` | **new** | Service-only RPCs. Each write locks the affected rows, enforces the limits and writes its audit entry in one transaction. |
| `list_inmobiliaria_executives`, `assign_executive` | existing | The list accepts `admin_inmobiliario` and leaves out deactivated people. Assignment refuses a deactivated person. |
| Trigger on `proyecto_ejecutivos`, and `BEFORE DELETE` on `proyectos` | **new** | Records assignment changes. A cascading delete has already lost the project's tenant by the time the child row goes, so the parent trigger writes those entries and the child trigger skips them. |
| `GET /tracking/staff/team` | **new** | Members with name, email, phone, role, status, projects, last sign-in and invitation date, plus the inmobiliaria's projects and those with no active executive. Marks the caller's own row and each member's locked reason. Global admin passes `inmobiliaria_id`. |
| `PATCH /tracking/staff/team/{member_id}` | **new** | Organizational data: name and phone. |
| `POST /tracking/staff/team/{member_id}/role` | **new** | `{ rol }`. |
| `POST /tracking/staff/team/{member_id}/access` | **new** | `{ estado }`. Calls the RPC, then the Auth admin API. |
| `GET /tracking/staff/team/history` | **new** | Paginated, optional `miembro_id`. Each entry has actor name, a sentence built from the event, time and origin, so that catalog changes show "Desde Proyectos". |
| `create-executive` | existing | Adds resend, lead refusal, already-on-team response, email to linked executives and audit entries. Records a failed send. Uses RutaHogar branding and name. Refuses a deactivated caller. |
| `.github/workflows/deploy-supabase-functions.yml` | existing | Adds a `create-executive` deploy step. Today the workflow deploys only `submit-feedback` and `co-debtor-consent`, plus `commercial-funnel-metrics` in PR #170, so changes to this function never reach production by themselves. |
| `APP_URL` secret | existing | Set to `https://www.rutahogar.cl` when the function ships. It currently points to `score-leads-one.vercel.app`, which redirects. The code's fallback changes too. |

**Status shown:** `Invitado` (never signed in), `Activo`, `Desactivado`. `Invitado` is derived from `auth.users.last_sign_in_at`, not stored, so someone reactivated without ever signing in returns to `Invitado`. 13 of 47 production executives have never signed in and will show as `Invitado`.

**Failed email:** `create-executive` keeps the account when the send fails, writes `equipo.invitacion_fallida` and returns `email_enviado: false`. `GET /tracking/staff/team` marks a member as failed when their latest invitation event is that one. A successful resend clears it. No new column is needed.

**Audit event types:** `equipo.invitacion_enviada`, `equipo.invitacion_reenviada`, `equipo.invitacion_fallida`, `equipo.miembro_vinculado`, `equipo.rol_cambiado`, `equipo.datos_actualizados`, `equipo.acceso_desactivado`, `equipo.acceso_reactivado`, `equipo.proyecto_asignado`, `equipo.proyecto_retirado`.

## Algorithms

None referenced.

**Local logic** (no ALG number, story-local): the self-change and last-active-admin limits. The last admin check counts `admin_inmobiliario` and tenant `admin` accounts with `estado_acceso = 'activo'` in that inmobiliaria, under a row lock, so two concurrent changes cannot both pass.

## Scope

**In:** the team page, invitation and resend, organizational data, role changes, project assignment, deactivation and reactivation, history, narrowed `profiles` policies, and the `list_inmobiliaria_executives` fix.

**Out:**
- The messages a deactivated person sees at login, and session handling: HU 27.
- Individual permissions: not planned.
- Removing an account or deleting its history: not offered.
- `profiles.reliability_status` and `update_lead_reliability(uuid, text)`: PR #171 and its follow-up.
- The project catalog's existing team table and "Nuevo ejecutivo" button stay as they are.
- From the mockup, the bottom "Ver como" bar, the "Solo mockup" email buttons and the fake data: review aids, not product.

## UI specification

The mockup is binding. Its CSS moves to `frontend/src/components/admin-team.css`, scoped to the page. Its script is a demo and is not reused. These behaviours must survive the move:

| Screen | Must show |
| :----- | :-------- |
| Global admin | "Elige una inmobiliaria" until one is selected, then the full page. `Priorización` and `Métricas` stay hidden in the menu. |
| Page top | Four counters that filter the list, and the warning listing projects with no active executive, when there are any. |
| Miembros | Search by name or email, "Invitar ejecutivo", and a table with Persona, Función, Estado, Proyectos, Último ingreso and "Gestionar". Below 1180 px each row becomes a labelled card. The caller's row has the "Tú" badge. |
| Gestionar | Header with status. Blocks for Datos, Invitación (only `Invitado`), Función, Proyectos and Acceso. The email is read-only. "Ver historial de esta persona" opens Historial filtered. |
| Locked states | Self and last active admin: Función disabled, and Acceso replaced by the exact explanation in the mockup. Deactivated: Función and project assignment disabled. |
| Deactivation | Confirmation listing lost access, the projects removed, kept history, and a red warning naming projects left with no active executive. |
| Invite | Name, optional phone, email and optional projects. Each refused case shows its error inside the pop-up. A linked executive shows the "ya tenía cuenta" message. A failed send says the account exists but the email didn't go out. |
| Failed email | "Correo no enviado" under the status in the list, plus the red message and "Reenviar invitación" in Gestionar. |
| Historial | "Ver cambios de" filter, then entries with newest first. |

Pop-ups close with `Esc`, the backdrop or "Cerrar", and return focus to the button that opened them.

## Steps

1. **Migration base.** In `supabase/migrations/20261102120000_hu28_gestion_equipo.sql`, add `estado_acceso` and `audit_events` with its RLS and insert-only protection. Add the rollback file and mirror everything in `supabase/schema.sql`.
2. **Access enforcement.** Starting from prod's body, change `get_my_role()` as above and extend `hu30_guard_profile_privileges()`. First list every `if not` authorization check and every caller of `get_my_role()`. Update `staff_actor` in `backend/app/tracking/repository.py` to read `estado_acceso` and refuse deactivated accounts.
3. **Policies.** Replace `"Profiles select"` and `"Profiles select admin"` so that a person reads their own row, staff read their own inmobiliaria's staff, and a global admin reads all, keeping whatever lead access `"Profiles select admin"` grants today once its full body is read from prod. Drop `"Profiles update admin"` after confirming that no browser write depends on it. `fetchExecutiveNames` in `frontend/src/services/projectService.js` already tolerates hidden rows.
4. **Team RPCs.** Add the service-only RPCs. `hu28_set_member_access` deletes the assignments and writes the entries in one transaction, and sets the actor for the trigger. Role changes on a deactivated person are refused.
5. **Assignment audit.** Add both triggers. Actor is `auth.uid()` for browser calls and the RPC's actor for backend calls. Update `list_inmobiliaria_executives` and `assign_executive`.
6. **Backend.** Add `backend/app/tracking/team.py` with a `TeamService`, repository methods, and routes in `routes.py`. Resolve the tenant from `staff_actor`, and accept `inmobiliaria_id` only from a global admin. Add the new error codes to `checked()`.
7. **Ban handling.** To deactivate, commit the RPC first and then set the ban. To reactivate, lift the ban first and then commit the RPC. If the Auth call fails, return a retryable error, and make both directions idempotent.
8. **`create-executive`.** Make the Entities changes, including the failed send, the RutaHogar email text, logo, subject and sender fallback, and the `APP_URL` fallback. Add its deploy step to the workflow. Update `supabase/tests/profiles_privilege_stack.mjs`, where a lead is now refused.
   Check three things and report the results in the PR: the project's recovery link lifetime in Supabase Auth, that `https://www.rutahogar.cl/definir-password` is an allowed redirect URL, and that `EJECUTIVO_FROM_EMAIL` sends from a RutaHogar address. If the link lasts about an hour, stop and report, because invited people may often need a resend.
9. **Frontend.** Build the UI specification. Add `frontend/src/components/AdminTeam.jsx`, `frontend/src/components/admin-team.css` and `frontend/src/services/teamService.js`. Add the `/admin/equipo` route and `"admin-equipo"` guard in `frontend/src/lib/staffRoutes.js`, and register the page in `App.jsx`. Add "Equipo" after "Leads" to the admin menus in `Navbar.jsx`, not hidden for global admins. Unlike `"admin-priorizacion"`, the guard admits global admins. Project assignment reuses `assignExecutive` and `unassignExecutive`. Copy comes from the mockup.
10. **Tests.** Add SQL tests for policies, limits, immutability and triggers, backend tests for tenant isolation and error codes, and frontend tests for the page. Run the SQL on a local `supabase start` stack, and test anonymous calls over HTTP.
11. **Wiki and docs.** Update the HU 28 story, and record the `estado_acceso` agreement in the plan. The agreement is still open: see "What changed during the build".

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — invite by email, see onboarding status, manage organizational data | 4, 6, 8, 9 | `create-executive` stack tests for each existing-account case and a failed send · backend team list and update tests · a real invitation opened from the email, password set and first login on the deployed domain · an expired link shows `SetPassword.jsx`'s existing "pide a tu administrador" message · invite, resend and edit in the running app |
| `E2` — change role, assign or remove projects, deactivate and reactivate without deleting history | 2, 4, 5, 6, 7, 9 | SQL tests for the limits and last admin race · test that a deactivated account loses access on its next request · ban and unban checked with real GoTrue · confirm history survives reactivation |
| `E3` — keep who, when and what; block other inmobiliarias | 1, 3, 4, 5, 6 | SQL tests that entries exist for each event and cannot be changed · trigger tests from the catalog and on project deletion · cross-tenant tests on every endpoint and policy |
| Approved UI | 9 | Reviewer compares `/admin/equipo` with `frontend/mockups/hu28-equipo.html`, as tenant admin and global admin, at desktop and phone widths |

## Assumptions

- **HU 27 is partly in prod but not in the repo.** `hu27_access_token_hook`, `hu27_guard_own_access` and `hu27_guard_profile_rut` exist in production with no migration in the ledger after `20261030120000`, no branch and no PR. None of them handles deactivation, and no status column exists yet. The build must not overwrite them. Ask Andrés before finalizing `estado_acceso`.
- **PR #171 reaches prod first.** This branch holds its current version. Until it reaches `develop`, HU 28's PR also shows its changes.
- **HU 21 merges first.** HU 21 and #170 conflict in six files, including `staff.py`, `repository.py` and `evaluationService.js`, which this story also edits. Rebase if #169 or #170 merges first.
- **The mockup has no phone menu.** The real page uses the app's existing mobile navigation.
- **Screens outside `/admin/equipo` show no message for deactivated people.** They simply lose access until HU 27 adds the messages. The build does not need a stub for this.
