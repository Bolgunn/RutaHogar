# PLAN — HU18: Co-debtor participation and consent

- **Story:** HU18 — Participación y consentimiento del co-deudor
- **Actor:** Lead · co-debtor
- **Source story:** `Wiki RutaHogar/UserStories/HU18-participacion-consentimiento-codeudor.md`
- **Status / Sprint:** Planned · Sprint 2 · 3 SP
- **Branch:** `feat/hu18-participacion-consentimiento-codeudor` off `develop`

## Start here

1. Read this plan, `ALG-17-co-debtor-consent-resolution.md`, its cases, and the source story.
2. Read the scoring-input and evaluation write paths before Steps 4–5; ALG-17 changes source selection only.
3. Read `docs/database.md` before changing Supabase: write an idempotent migration, matching rollback, and synchronize `schema.sql`.
4. Stop and report if the approved transactional-email configuration for Resend is absent. Email/Resend is the only external provider required by HU18.
5. Do not add authentication, identity verification, SMS, OTP, phone verification, WhatsApp, or extra contact consents to this story.

## Goal

Allow a lead to invite one co-debtor by email to provide their own five complementary financial fields and separate treatment consent through a time-limited, single-use link. Until confirmation, the lead can receive a referential evaluation using declared data labelled `not_confirmed`. A valid confirmation becomes the source for later evaluations; it does not recalculate automatically. Revocation excludes the confirmed data from future evaluations and staff exposure while retaining historic snapshots.

## Approach & decisions

The co-debtor is an unauthenticated, token-gated participant, not an account type. Co-debtor data is stored separately from lead evaluations and is accessed only through server-side endpoints. The public browser receives no Supabase authority, and executive-facing services expose provenance only.

| Decision | Rationale |
| :-- | :-- |
| Email invitation, secure single-use token, seven-day expiry, one active invitation | Satisfies E1 without creating a login. Tokens are stored only as digests. |
| Co-debtor supplies exactly five fields | E2 requires income, debt, contract type, employment continuity, and delinquency. `relacion_complementario` remains lead-declared. |
| Separate treatment consent | The co-debtor's consent lifecycle is independent of the lead's consent. |
| Pending, expired, and replaced invitations preserve a labelled lead declaration | E3 must not block the lead's referential flow. |
| Confirmation changes source without automatic recalculation | A later lead action in Steps 4–5 may create a normal historical prequalification with reason `confirmacion_codeudor`. |
| Separate revocation-management token after confirmation | Supports E4 without an account and without indefinitely reusing the invitation token. Only its digest is persisted. |
| Revocation affects future use only | Historic evaluation snapshots remain intact; executive-facing services do not expose raw co-debtor data. |

## Standing questions

| # | Question | Answer |
| :- | :-- | :-- |
| 1 | Touches scoring? | ALG-17 resolves data source/provenance only. No weights, thresholds, caps, blockers, classifications, or monetary rules change. `CO_DEBTOR_INVITATION_TTL_DAYS = 7` remains centralized. |
| 2 | Needs RLS? | Yes. Leads have narrowly scoped records; public co-debtor operations are server-side; executives have no direct raw-data read policy. |
| 3 | Needs a migration? | Yes. The merger applies the incremental migration manually to hosted Supabase and records it in the PR; `schema.sql` is synchronized for bootstrap. |
| 4 | Changes `POST /score` now? | No. Steps 4–5 will integrate resolved data without changing its public contract. |
| 5 | External dependency? | Resend transactional email only. No SMS or other contact provider is a HU18 dependency. |

## Entities

- `co_debtor_invitations`: lead ID, recipient email, invitation-token digest, state, expiry, consumption/replacement metadata, and nullable management/revocation-token digest. Exactly one invitation is pending per lead.
- `co_debtor_confirmations`: invitation ID; only the five co-debtor-supplied financial fields; treatment-consent version/timestamp; confirmation timestamp.
- `co_debtor_consent_events`: append-only invitation, consent, confirmation, and revocation evidence with actor/time/state, never financial values.

RLS and grants prevent anonymous direct Supabase access and executive direct reads of raw co-debtor data. Server-side token operations own invitation validation, confirmation, expiry/replacement, and revocation.

## Algorithms

- `ALG-17` owns invitation state, seven-day expiry, source precedence, confirmation provenance, and revocation exclusion.
- Existing scoring logic is not changed by Steps 1–3. Steps 4–5 will consume ALG-17 output and create the later lead-requested historical evaluation when applicable.

## In scope

- One email invitation for one co-debtor, a secure single-use token, seven-day expiry, and replacement.
- Co-debtor access from the email link without an account or login.
- The five co-debtor fields and separate treatment consent, without disclosing lead financial data.
- Lead-declared `not_confirmed` data until confirmation, then confirmed-data precedence for later evaluations.
- A prepared management/revocation token flow, future-evaluation exclusion, restrictive executive display, and append-only consent audit.

## Out of scope

- Co-debtor accounts, login, passwords, identity verification, phone verification, SMS, OTP, WhatsApp, or contact opt-ins.
- More than one co-debtor; documents, credentials, OCR, or third-party financial checks.
- Automatic recalculation on confirmation. The later lead-requested update belongs to Steps 4–5.
- Deleting or rewriting historical evaluation snapshots after revocation.
- Formal bank approval, preapproval, guarantee, or "official" evaluation claims.

## Assumptions / unmet dependencies

- Resend is configured for invitation email before Step 3 claims E1 complete.
- Evaluation persistence can create an ordinary historic prequalification with reason `confirmacion_codeudor` when the lead later requests an update in Steps 4–5.
- Existing executive responses will be reviewed before integration so raw co-debtor fields cannot leak.

## Steps

1. Add the three dedicated entities, RLS/grants, append-only consent-event protection, one-pending-invitation rule, rollback, and `schema.sql` synchronization. Run schema-drift checks.
2. Add the central TTL constant and pure ALG-17 resolver with fixture-driven tests. Keep generation, hashing, transport, and persistence outside the resolver.
3. Add server-side invitation, token inspection, co-debtor submission, expiry/replacement and revocation services/endpoints. Hash invitation/management tokens and never persist raw tokens.
4. Amend scoring-input assembly to consume ALG-17: lead declaration for `not_confirmed`, confirmed values when valid, and no complement after revocation. Preserve `POST /score`.
5. Add the lead-requested "Actualizar score con datos confirmados" action. If it creates an evaluation, persist an ordinary immutable historical prequalification with reason `confirmacion_codeudor`; confirmation alone never creates one.
6. Add lead UI for recipient email, invitation state/expiry/replacement, and distinct declared/confirmed labels.
7. Add the unauthenticated co-debtor page: inspect invitation without lead financial data, enter five fields, accept treatment consent, and later inspect/revoke via the management link.
8. Restrict executive responses/UI to provenance and enforce revocation hiding while preserving historic evaluation snapshots.
9. Add backend, frontend, and hosted-RLS verification with reviewer evidence for E1–E4.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-- | :-- | :-- |
| E1 — expiring invitation | 1–3, 6 | ALG-17 pending/expired/replacement cases; token digest, single-use, replacement, and seven-day integration tests; Resend invitation review. |
| E2 — own data and separate consent | 1–3, 7 | Token-route authorization, consent/confirmation contracts, hosted RLS, and reviewer confirmation that no lead finance is exposed. |
| E3 — declared versus confirmed precedence | 2, 4–6 | ALG-17 cases; scoring integration; lead-requested `confirmacion_codeudor` historical-evaluation test with no automatic submission recalculation. |
| E4 — revocation | 1, 3–5, 8 | ALG-17 revocation case, management-token route tests, future-evaluation exclusion, and hosted executive raw-data denial. |

## Safeguards

- **S1/S3:** ALG-17 is deterministic; no AI, client clock, or random branch selects a source.
- **S2:** `POST /score` remains compatible until the dedicated integration steps.
- **S5:** The co-debtor has a separate treatment-consent lifecycle and no external financial lookup.
- **S6:** RLS plus server-side token gates restrict raw data; executives receive provenance only.
- **S7:** Results remain referential and never claim approval.
- **S8:** No documents or credentials; invitation and management tokens are stored only as digests.

## Definition of done

- Tier 1 is green: ALG-17/scoring tests, backend/frontend checks, migration/schema-drift check, and contract coverage.
- A non-author reviewer records hosted-RLS evidence for E1–E4.
- The plan, ALG-17, fixtures, implementation, migration, rollback, and schema snapshot are in the same PR.
- The merger applies every HU18 migration manually to hosted Supabase and records it in the PR.
