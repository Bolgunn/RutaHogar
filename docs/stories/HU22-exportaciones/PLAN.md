# PLAN — HU 22: Information export center and commercial dossier

- **Story:** HU22 — Centro de exportación de información y dossier · **Actors:** Commercial executive and real-estate administrator
- **Status:** Implemented locally; hosted acceptance verification pending · Desirable · 5 SP
- **Depends on:** authenticated staff projection (HU18), authorized project catalogue, commercial history and existing dashboard metrics (ALG-18) · **Required by:** none
- **Branch:** `feat/hu22-centro-exportacion`

## Start here

For implementation, review and deployment. Standing instructions remain in `agents/agent.md`,
`.claude/CLAUDE.md` and `docs/HANDBOOK.md`; this plan records the story-specific contract.

- Read first: `backend/app/exports/routes.py`, `backend/app/exports/service.py`,
  `frontend/src/components/ExportAction.jsx`, `frontend/src/lib/exports/files.js`,
  `frontend/src/lib/commercial/funnelMetrics.js` and
  `supabase/migrations/20261029120000_hu22_export_events.sql`.
- Preserve scoring, matching, HU13 tracking, HU18 co-debtor privacy and existing commercial transitions.
- Stop and report if an export requires weakening RLS, exposing a service credential in the browser,
  returning an unauthorized project or lead, or exporting raw evaluation snapshots.
- Local validation does not establish hosted acceptance. Verify the complete Supabase schema,
  actual roles and Safari downloads before closing the story.

## Goal

An executive or real-estate administrator can download a selected lead's commercial dossier in PDF,
export filtered leads to XLSX and export dashboard sections into separate workbook sheets. They
choose the included information and filename. RutaHogar checks access before releasing data and
records export metadata without storing the generated file.

## Approach & decisions

Reuse the existing lead detail, lead inbox and commercial dashboard. A shared export dialog sends
the selection to a dedicated authenticated backend boundary. The backend returns an allowlisted
snapshot after recording preparation; the browser generates the file with lazily loaded libraries.

| Decision | Rationale |
| :------- | :-------- |
| PDF for individual dossiers; XLSX for leads and dashboard | Confirmed formats; no CSV implementation. |
| All eligible leads start checked; users uncheck exclusions | One selection flow instead of competing all/manual modes. Require 1–500 distinct leads. |
| Eligibility preview followed by authorization during preparation | The preview improves selection; it never substitutes for the final permission check. |
| Preserve filtered inbox order, including collapsed result groups | Export scope follows the visible filters rather than only expanded cards. |
| Separate workbook sheets for selected dashboard sections | Keep management data organized without recalculating ALG-18. |
| Export chart values and tables, not chart images | Current implementation boundary; visual chart export remains an unresolved product requirement. |
| Allowlisted primary-party fields and structured plan only | Avoid leaking raw snapshots, free-form AI narratives or individual co-debtor data. |
| Human-readable Spanish fields, no internal IDs or algorithm versions | Commercial files must be understandable outside the database model. |
| Optional filename with automatic PDF/XLSX extension | Preserve a usable default and replace invalid filename characters. |
| Official logo, local Fraunces and Plus Jakarta Sans, navy/gold PDF | Follow the existing RutaHogar identity; font licenses accompany the assets. |
| Record preparation before returning data; record delivery request before download | Preserve traceability and fail closed when audit persistence is unavailable. |
| Recent exports restricted to current account, role and real-estate company | Administrators do not see other users' exports through this endpoint. |
| No generated file storage | Download-only flow with metadata retained for audit. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No.** Export persisted evaluation results and existing ALG-18 outputs; do not recalculate score or compatibility. |
| 2 | Needs RLS / multi-tenant scoping? | **Yes.** Derive actor from authentication and project scope from authenticated `commercial_funnel_facts()`. Private export RPCs are executable only by `service_role`. History queries additionally filter current actor, role and company. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes.** `20261029120000_hu22_export_events.sql` creates audit storage and private RPCs. The deployment owner applies it through the project's migration procedure and verifies hosted permissions before release. |
| 4 | Changes the `POST /score` contract? | **No.** New `/exports` routes are independent; Vercel forwards them to the existing backend entry point. |
| 5 | Consent / privacy impact? | **Yes, contained.** Reject an explicit refusal of lead consent, exclude co-debtor fields, omit joint plans where needed and restrict audit access. Search filters can contain personal text and remain protected metadata. |

## Entities

| Surface | New / change | Ownership and history |
| :------ | :----------- | :-------------------- |
| `public.export_events` | New: internal export/actor/company references, kind, format, blocks, evaluation selection, project, filters, source time, generation time, count, status and client SHA-256 | Metadata only. RLS permits own executive records and tenant administrator reads; the API narrows all recent-history reads to current account, role and tenant. No browser writes. |
| `hu22_record_export(jsonb)` | Private audit insertion | Backend service credential only; request identity and scope are validated in the service. |
| `hu22_export_delivery(uuid,text)` | Private delivery-request update | Backend verifies ownership before invocation. Reject a conflicting digest for an existing request. |
| `hu22_export_rows(uuid[],uuid[])` | Private batch evaluation reader | Backend supplies projects derived from authenticated scope, never a project list from request JSON. |
| `POST /exports/eligible` | Authorized selection preview | Returns eligible evaluation references without financial content or creating an audit record. |
| `POST /exports/prepare` | Allowlisted snapshot and preparation record | Role/company are server-derived. Reject invalid blocks, duplicate leads and unauthorized selections. |
| `POST /exports/{id}/delivery` | Record browser delivery request | Store client digest; this is neither a server signature nor proof that a file was saved. |
| `GET /exports` | Latest 100 own export records | Current account, role and company; resolve responsible person's name/email in the backend. |
| `ExportAction.jsx` and `exportService.js` | Shared selection, generation and history UI | Dialog-local history reuse; collapsible records/details, loading states and no zero-lead downloads. |
| `lib/exports/files.js` | PDF/XLSX presentation | Preserve numeric cells and zero versus missing values; write text as strings rather than executable formulas. |

## Algorithms

Referenced, never restated:

- **ALG-18 — commercial funnel metrics:** export the existing computed result and its original
  source cutoff. No alternative conversion, funnel or duration formulas.
- Existing scoring and project matching remain unchanged. Objective compatibility refers to the
  persisted declared objective, not a newly computed result for the analyzed project.
- SHA-256 identifies the browser-generated bytes reported by the client. It does not certify the
  authenticity of client-supplied metric aggregates or establish successful file storage.

## Scope

**In:** selected dossier blocks · separate evaluation/financial and commercial histories · selected
leads within active filters · selected dashboard sheets plus Contexto · optional filename · Spanish
labels without technical paths · no IDs or algorithm versions in output · branded, paginated PDF ·
backend authorization · metadata audit · collapsible own recent exports · local tests and deployment
verification procedure.

**Out:** CSV · attached documents (explicitly removed from E1 by the user) · suggested contact
questions · new commercial notes · individual co-debtor information · raw snapshots · generated-file
storage · automatic emailing · new scoring/matching rules · an independent export navigation page.

**Unresolved before acceptance:** confirm whether chart images are required in addition to exported
chart data. Verify that the authorized-project RPC matches the agreed administrator project scope.
The implementation must not be declared fully accepted until these points and hosted checks close.

## Steps

1. **Establish the export boundary (E3).** Authenticate using the existing staff repository;
   derive role/company and authorized projects in the server. Allowlist export blocks and fields.
   Reject unauthorized evaluations/projects and explicit consent refusal. Keep dossier and batch
   selection limits separate; preview must not create a preparation event.

2. **Add metadata persistence (E4).** Apply the timestamped migration in a disposable database first.
   Verify grants, RLS and service-only RPC execution. Preserve `prepared` and `delivery_requested`:
   the latter is displayed as “Descarga iniciada”, never as proof of a saved file. Retain metadata
   only; no financial snapshot or generated binary is stored in `export_events`.

3. **Generate individual dossiers (E1).** Connect the shared lead detail action. Export only selected
   blocks, retaining objective/analyzed-project distinction and chronological histories. Exclude
   joint-plan information that could reveal co-debtor details. Apply the official logo, locally
   served licensed fonts, brand colors, repeating header/footer and page numbering. Handle long
   content and history tables without overlapping text or exposing IDs/algorithm versions.

4. **Generate lead workbooks (E2).** Pass the filtered inbox universe in its existing order. Mark
   eligible leads initially; permit exclusions and block zero selections in UI and API. Use Spanish
   column names and option labels. Separate histories into sheets linked by lead name/email when
   contact is selected, otherwise by a shared “Lead 1” style reference. Preserve zero and missing
   values distinctly and never interpret cell text as a formula.

5. **Generate dashboard workbooks (E2).** Use the existing computed result to create selected
   Resumen, Embudo, Tiempos, Engagement, Desgloses and Histórico sheets plus Contexto. Include active
   filters and source cutoff. Reject changes in authorized project scope before download. Use direct
   indicator names and parenthesized context where needed; do not emit database-style paths.

6. **Complete download and own-history UX (E3–E4).** Allow an optional sanitized filename while
   preserving the correct extension. Record delivery request before triggering the browser download;
   release temporary object URLs afterwards. Open/close history immediately, show loading feedback
   and reuse loaded records within the dialog. Offer per-record details without internal IDs.

7. **Run local verification.** From `backend`, run `python -m pytest tests/exports -q` and the
   existing staff co-debtor projection tests. From `frontend`, run
   `npm test -- --run src/lib/exports/files.test.js` and `npm run build`; retain ALG-18/ranking
   regression coverage. Reopen an actual workbook and render a multipage PDF for visual review.
   SQL fixtures are `backend/tests/exports/rls_schema.sql` and `rls_assertions.sql`; run them around
   the migration only in a disposable PostgreSQL database. Never run fixture setup in hosted data.

8. **Verify hosted acceptance before release.** Apply the migration through the normal deployment
   process, then deploy frontend/backend together. With two companies and different staff accounts,
   prove unauthorized leads/projects and other users' history are unavailable. Check administrator
   scope, active filters, selection counts, exact metric values/cutoff, file naming and all selected
   blocks. Revoke access between preview and preparation and confirm rejection. Simulate audit
   failure and confirm no download. Exercise Safari on an actual iPhone. Keep evidence in the PR.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — individual PDF with selected profile, evaluation, objective, finances and permitted documents | 1, 3, 7–8 | Snapshot allowlist, co-debtor exclusion, real PDF pagination tests and rendered review. Documents excluded by explicit user agreement. Hosted walkthrough pending. |
| `E2` — spreadsheet respecting filters and segmentation | 4–5, 7–8 | Workbook round-trip, numeric/missing-value tests, indicator labels and existing ALG-18 regression tests. Hosted filter/segment comparison and chart-image decision pending. |
| `E3` — information selection with role/permission limits | 1, 4, 6–8 | Unauthorized scope, forged actor, empty/oversized selection, explicit consent refusal and block-selection tests. Hosted cross-account/project verification pending. |
| `E4` — generation date, data context and export traceability | 2, 5–8 | Preparation/delivery routes, idempotency/digest behavior, own-history filters, workbook context and PDF date. Hosted audit verification pending; saved-file confirmation is not claimed. |

## Assumptions

- A tenant-scoped staff account is required; global administrators without a company cannot export.
- Preparation rechecks permissions. The eligibility preview and cached history do not authorize a download.
- The current implementation consumes `commercial_funnel_facts()` for scope; verify its role semantics
  against the agreed project-only administrator requirement before accepting E3.
- Without Supabase/audit persistence, exports fail with a controlled error; there is no local bypass.
- Local PDF/XLSX tests and browser demos use fixtures. Disposable PostgreSQL validates HU22 privileges
  and RLS against a minimal schema, not the complete hosted deployment.
- Existing full-suite failures were observed outside HU22 in RUT/project fixtures, an expired
  co-debtor fixture and professional-score market snapshots. Do not change unrelated rules to hide them.
- Staff loading performance is a separate known issue on this branch. An existing optimization in
  `origin/develop` (`767696f`) requires independent integration; it is not silently included in HU22.
- The browser cannot prove a file was saved. Traceability ends at the delivery request.
