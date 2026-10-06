Code review of HU12 — 9 findings, details inline. Based on reading the diff, not on running it.

### Which of these were intentional?
@rodrigo-ramirezd, please tick each item that was **intentional** (and add a short note on why). Unticked items will be treated as bugs to fix before merge.

- [ ] **(1)** `20260922000001_update_list_lead_contacts.sql:3` — Migration can't be applied, and it replaces the prod function
- [ ] **(2)** `evaluationService.js:171` — Executives can't read `profiles.reliability_status`
- [ ] **(3)** `leadManagementService.js:20` — `update_lead_reliability` isn't defined in the repo
- [ ] **(4)** `crm_mock.py:80` — Unauthenticated CRM mock exposes lead PII
- [ ] **(5)** `crmService.js:61` — Placeholder RUT `11111111-1` sent to the CRM
- [ ] **(6)** `DashboardLeads.jsx:565` — Date filter check deleted
- [ ] **(7)** `DashboardLeads.jsx:1027` — Report mutates the prop; list stays stale
- [ ] **(8)** `SignupOffer.jsx:45` — Post-evaluation signup doesn't validate RUT

### Also worth confirming
- [ ] **Overlap with #102:** both PRs add `AdminReportedLeads`, `leadManagementService` and the `admin_inmobiliario` role, written differently. Should HU16 live here or in #102?
- [ ] **Scope:** CLAUDE.md lists CRM integration (HdU 5) as out of scope. Is the CRM derivation in HU12 approved?

🤖 Generated with [Claude Code](https://claude.com/claude-code)

**(1) Migration can't be applied.** The function reads `p.rut`, but no migration adds `profiles.rut` (only `schema.sql` does). It's also dated `20260922`, before migrations already applied in prod (`20260923`, `20260930`, `20261001`), so `supabase db push` rejects it as out of order. With `--include-all` it fails with `column p.rut does not exist` on any DB built from migrations. It also drops and recreates the function without `REVOKE ... FROM public` / `GRANT EXECUTE ... TO authenticated`.

**(2) Replaces the prod function.** Prod's hand-applied `list_lead_contacts` returns `reliability_status`. This version drops that column and leaves `admin_inmobiliario` out of the role filter, even though `schema.sql` in this PR adds it. Once applied, admin_inmobiliario users get no contact data.

**(3) Always 'normal' for executives.** RLS on `profiles` only allows reading your own row, or any row if you're a global admin, so this query returns nothing for an `ejecutivo`. The error is ignored, and every lead falls back to `"normal"`. Result: a reported lead still shows as Normal under "Ocultar sospechosos" after a reload. Consider returning `reliability_status` from `list_lead_contacts` (SECURITY DEFINER), as prod's version does.

**(4) RPC doesn't exist in the repo.** No migration or `schema.sql` in this PR defines `update_lead_reliability`. It only exists hand-applied in prod (from PR #97). On any environment built from the repo, "Reportar lead" and the admin Reactivar/Descartar buttons fail with `function update_lead_reliability does not exist`. If it's added as a migration, it should keep prod's staff-only check and take the actor from `auth.uid()`.

**(5) No auth on the CRM mock.** Every `/api/v1/crm-mock/*` endpoint is open. `GET /leads` returns every derived lead's name, RUT, email, phone and score to anyone who can reach the API, and anyone can POST fake leads. The data is held in memory, so it is per worker and lost on restart.

**(6) Fake identifiers.** A missing RUT falls back to `11111111-1` and a missing email to `sin_correo@ejemplo.cl`. Every lead without a RUT (all users who signed up before this PR) is sent with the same RUT, so a CRM that dedupes on RUT (PlanOK; `planok_{rut}` in the mock) merges them into one record. Better to send `null` and let the CRM side decide.

**(7) Date filter no longer works.** This hunk removed `if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;`, so the Fecha selector has no effect (it still counts as an active filter).

**(8) Stale UI after reporting.** This mutates `selectedLead` in place instead of updating `evaluations` state, so the inbox badge and filters keep the old status until a reload. Also: if `executiveScope` is missing the button silently does nothing, and without Supabase `reportLead` returns `null` but the success alert still shows.

**(9) RUT not validated here.** `AuthPanel` validates the check digit and stores `12345678-9`, but `SignupOffer` only checks that the field isn't empty and stores free text like `12.345.678-9`. Users who sign up after an anonymous evaluation can save an invalid RUT, and the same person can end up stored in two formats. Consider reusing `validateRut` and normalizing the format.