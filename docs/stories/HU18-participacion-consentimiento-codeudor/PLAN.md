# PLAN — HU18: Co-debtor participation and consent

- **Story:** HU18 — Participación y consentimiento del co-deudor
- **Actor:** Lead · co-debtor
- **Source story:** `Wiki RutaHogar/UserStories/HU18-participacion-consentimiento-codeudor.md`
- **Status / Sprint:** Planned · Sprint 2 · 3 SP
- **Depends on / Required by:** Extends HU1 complement data. It corrects the complement-debt defect identified by the source story. The audit-event proposal in Spike 2 is not yet implemented, so this plan provides a narrowly-scoped append-only consent audit rather than assuming that future infrastructure exists.
- **Branch:** `feat/hu18-participacion-consentimiento-codeudor` off `develop`

---

## Start here

For the fresh build session:

1. Read this plan, `ALG-17-co-debtor-consent-resolution.md` and its cases in full.
2. Read `Wiki RutaHogar/UserStories/HU18-participacion-consentimiento-codeudor.md`, `backend/app/scoring_engine/indicators.py`, `backend/app/scoring_engine/blockers.py`, `backend/app/scoring_engine/purchase_capacity.py`, and the current evaluation write path.
3. Read `docs/database.md` before creating the migration and use its migration + rollback + schema-sync procedure.
4. Stop and report if an approved transactional email or SMS provider/configuration is absent. A fake successful phone verification cannot satisfy this plan.
5. Stop and report if the existing evaluation persistence cannot create an immutable recalculated snapshot atomically with the confirmed submission.

## Goal

Allow a lead to invite one co-debtor to submit their own complement-income data and separate consent through a time-limited, single-use link. The lead remains able to receive a referential result while the complement is unconfirmed, but a confirmed submission becomes the only complementary source for later evaluations. A co-debtor can revoke consent, preventing all later use and staff exposure without rewriting historical evaluation snapshots.

## Approach & decisions

The co-debtor remains an unauthenticated, token-gated participant rather than a new account type. Sensitive co-debtor data is stored separately from lead evaluations, is written through server-side endpoints, and is resolved into a scorer input only through ALG-17. The frontend never receives a reusable token or raw co-debtor data in an executive response.

| Decision | Rationale |
| :------- | :-------- |
| Email invitation with a random single-use token, 7-day expiry, and one active invitation | Meets E1 without creating authentication; the TTL is a documented product decision rather than an inline literal. |
| The co-debtor enters their own five financial fields | HU18 E2 is authoritative: the co-debtor completes renta, deuda, contrato, continuidad and morosidad. `relacion_complementario` remains the lead's declaration. |
| Confirmation immediately recalculates | HU18 E3 explicitly requires a recalculation when confirmed values differ. The result remains referential. |
| Pending/expired invitation permits a labelled, unconfirmed complement | E3 preserves the existing immediate lead flow; it must not wait for a third party. |
| Revocation affects future evaluations only | E4 says later evaluations stop using the data. Historic results remain immutable snapshots, while staff cannot read raw co-debtor data after revocation. |
| Executive sees provenance/status only | Minimizes third-party data exposure while preserving the commercial signal required by E3. |
| Chilean phone is mandatory and SMS-verified before submission; WhatsApp contact requires its own opt-in | The lead's account already requires a phone. Co-debtor contact consent cannot be bundled with financial-data consent; revocation disables this use. |
| Co-debtor debt is included with confirmed income | The source story identifies the current omission as a precondition defect; using confirmed income while discarding confirmed debt would invalidate the result. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | Yes. `ALG-17` controls source/provenance selection and requires the confirmed complementary debt to reach indicators and capacity. No score weight, classification threshold or blocker severity changes. `CO_DEBTOR_INVITATION_TTL_DAYS = 7` is new and belongs in one constants module. |
| 2 | Needs RLS / multi-tenant scoping? | Yes. New co-debtor tables require lead-only creation/read policies, no browser access for unauthenticated co-debtor data, and no raw staff reads. Token-gated operations run server-side. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes. Add an idempotent migration, matching rollback and `schema.sql` update. The person merging the PR applies it manually to hosted Supabase and records that action in the PR. |
| 4 | Changes the `POST /score` contract? | No. Existing scoring input remains compatible. New token-gated endpoints resolve confirmed data server-side and invoke the current scoring orchestration without changing `POST /score`. |
| 5 | Consent / privacy impact? | High. Separate treatment consent, optional WhatsApp-contact opt-in, proof events without raw financial values, minimal disclosure to the co-debtor, and revocation exclusion are mandatory. |

## Entities

Add dedicated Supabase entities rather than placing co-debtor consent and data inside `evaluations.financial_data`:

- `co_debtor_invitations`: lead ID, recipient email, verified phone, token digest, state, expiry, consumption/replacement metadata and WhatsApp opt-in; exactly one active invitation per lead.
- `co_debtor_confirmations`: invitation ID, five co-debtor-supplied financial fields, treatment-consent version/timestamp and confirmation timestamp. Raw fields are never selected by executive-facing services.
- `co_debtor_consent_events`: append-only invitation, consent, confirmation and revocation events, with actor/time/state but no raw financial values.

The migration supplies RLS, restrictive grants, a trigger that prevents update/delete of consent events, indexes/constraints for one active invitation, a rollback and a synchronized schema snapshot. The backend owns token validation, SMS OTP verification, confirmation, revocation and rescoring so the public browser never receives database authority over another person’s data.

## Algorithms

- `ALG-17` — new; implemented as written with six fixture cases. It owns invitation state, 7-day expiry, complement source precedence, revocation behavior and privacy invariants.
- Existing scoring component/blocker/capacity logic — amended only to consume the resolved source and include complementary debt when the source is confirmed. No numeric scoring rule changes.

## In scope

- One email invitation and expiry notification to each party.
- One unauthenticated co-debtor token flow with Chilean mobile SMS verification.
- Separate treatment consent and optional WhatsApp executive-contact consent.
- Co-debtor financial form for income, debt, contract, continuity and delinquency.
- Immediate recalculation after confirmation and explicit source/status in lead-facing results.
- Future-evaluation exclusion, staff-data hiding and append-only audit after revocation.
- The complementary-debt scoring correction and automated coverage for all ALG-17 branches.

## Out of scope

- Co-debtor accounts, login, password resets or a general authentication system.
- More than one co-debtor.
- Documents, bank credentials, OCR, CMF/Dicom/bank queries, or financial-data verification beyond phone possession.
- General WhatsApp notifications or a multichannel notification platform; the optional contact opt-in is restricted to the assigned executive discussing this lead evaluation.
- Deleting or rewriting historic evaluation snapshots after revocation.
- Any bank approval, formal preapproval, guarantee or use of the word “official” in user-facing copy.

## Assumptions / unmet dependencies

- A transactional email provider is already configured for the invitation and expiry emails, or the build stops before claiming E1 complete.
- An approved SMS provider and secret-management path are available before implementation. No provider is selected by this plan.
- Existing evaluation persistence can create a recalculated snapshot with provenance `confirmacion_codeudor`; otherwise that atomic write is a blocking design gap.
- Existing executive lead responses must be traced before implementation to ensure raw complement fields cannot leak through legacy payloads.

## Steps

1. Add migration, rollback and `schema.sql` changes for the three dedicated entities, state constraints, RLS/grants, append-only event protection and one-active-invitation rule. Run the schema-drift check.
2. Add backend constants and a pure ALG-17 resolver with unit tests generated from `ALG-17-cases.json`; keep token generation/transport outside the pure resolver.
3. Add server-side invitation, token inspection, SMS verification, co-debtor submission, expiry and revocation services/endpoints. Hash tokens and OTPs; never return them after creation.
4. Amend the scoring-input assembly so confirmed complementary income **and debt** are both selected through ALG-17. Keep lead-declared data only for `not_confirmed`, omit all complement values after revocation, and preserve the `POST /score` contract.
5. Wire atomic confirmation → new referential evaluation with reason `confirmacion_codeudor`, provenance status and append-only audit event. Confirm that unchanged score still creates this person-initiated historical entry.
6. Add lead UI for declaring recipient email/phone, invitation state, expiry/replacement and explicit “complemento declarado, no confirmado” versus “complemento confirmado” labels. Never call a result official or approved.
7. Add the minimal unauthenticated co-debtor page: identify the invitation without exposing lead finance, SMS verification, own-data entry, treatment consent and optional WhatsApp opt-in.
8. Restrict executive responses/UI to provenance status; ensure revocation hides co-debtor financial data and phone while historical evaluation snapshots remain intact.
9. Add backend, frontend and hosted-RLS verification; run all Tier 1 gates and prepare reviewer steps for every criterion.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| E1 — expiring invitation | 1–3, 6 | ALG-17 pending/expired/replacement cases; integration tests for token hash, single use and 7-day expiry; reviewer receives invitation and expiry notification. |
| E2 — own data and separate consent without lead-data exposure | 1–3, 7 | Token-route authorization tests; backend contract tests; hosted RLS test; reviewer confirms co-debtor page does not reveal lead finance. |
| E3 — declared vs confirmed precedence and recalculation | 2, 4–6 | ALG-17 pending/confirmed cases; scoring regression test includes confirmed complementary debt; integration test proves a confirmation creates a `confirmacion_codeudor` snapshot. |
| E4 — revocation excludes later use and executive display | 1, 3–5, 8 | ALG-17 revocation case; integration test for later evaluation source; hosted executive test proving raw values/phone are unavailable after revocation. |

## Safeguards

- **S1/S3:** All source selection is deterministic ALG-17 logic; AI does not participate.
- **S2:** `POST /score` remains unchanged; regression tests protect its existing payload contract.
- **S5:** Co-debtor data has its own consent lifecycle, minimal access, revocation effect and no external financial lookup.
- **S6:** New entities use RLS and server-side token gates; executive access is narrower than lead access.
- **S7:** Every result remains referential and UI copy avoids approval/formal-evaluation language.
- **S8:** No documents or credentials; tokens and OTPs are stored only as digests and secrets stay outside source.

## Definition of done

- Tier 1 green: pytest including ALG-17 cases and scoring regression, ESLint, Vitest, Playwright journeys, migration/schema-drift check and contract checks.
- Tier 2 run by a non-author reviewer, with evidence for E1–E4 on a hosted RLS-enabled environment.
- This plan, ALG-17 and its cases are committed in the same PR as the implementation.
- The migration is applied manually to hosted Supabase by the merger and documented in the PR.

