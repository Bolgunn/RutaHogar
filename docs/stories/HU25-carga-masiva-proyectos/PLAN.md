# PLAN — HU 25: Carga masiva de proyectos inmobiliarios mediante archivo

- **Story:** `Wiki RutaHogar/UserStories/HU25-carga-masiva-proyectos.md` · **Actor:** Administrador
  inmobiliario (`admin_inmobiliario`, or `admin` — tenant or global)
- **Status:** Built · Deseable (the handed-over text lists both *Opcional* and *Deseable*; the
  backlog proposal says *Deseable*) · 5 SP · **Depends on:** HU 7 catalog (`proyectos`,
  `projectValidation.js`, `/admin/proyectos`, merged) · CATALOGO-UNICO fields (`descripcion`,
  `entrega_estimada`, merged). **Required by:** none.
- **Supersedes:** the unnumbered proposal `propuesta-importacion-masiva-catalogo.md` (its E1–E3; its
  E4, tipologías, still depends on the unbuilt unit model and stays out).
- **Number collision:** the wiki index already has `HU25-exportacion-dossier.md`. This story was
  handed over as "HU25 - Carga masiva de proyectos inmobiliarios mediante archivo"; the backlog owner
  must decide which one keeps the number before merge. Renaming is docs-only (story page, this
  folder, the proposal's pointer).
- **Branch:** `feat/hu25-carga-masiva-proyectos` (from `develop`)

## Start here

- Read first: `frontend/src/services/projectValidation.js` — `validateProject()` is the only rule
  set a row is checked against. This plan never restates it.
- Read first: `docs/project-catalog-contract.md` — the frozen catalog shape. Nothing here changes it.
- Read first: the `proyectos` policies in `supabase/schema.sql` (`Proyectos insert/update admin
  tenant` → `can_admin_inmobiliaria()`) — the import runs under them, not around them.
- Stop and report if: a row needs a rule `validateProject()` does not have; the import seems to need
  a new column on `proyectos`, a new policy, or `security definer`; anything would change
  `POST /score`, `scoring_engine/` or an `ALG-*`.

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No. No ALG: the import has no business numbers; row rules are `validateProject()`'s, reused as-is |
| 2 | Needs RLS / multi-tenant scoping? | Yes, and it reuses what exists. The new RPC is `security invoker`, so every row passes the existing `proyectos` insert/update policies. The tenant comes from the session (`get_my_inmobiliaria()`), never from the file. No policy changes |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes, one function: `20261102120000_hu25_importar_proyectos.sql` + rollback + `schema.sql` sync. Applied by the CTO with `supabase db push` after merge — never pasted into the SQL editor |
| 4 | Changes the `POST /score` contract? | No |
| 5 | Consent / privacy impact? | None. Rows are commercial project data, no personal data. The file is parsed in the browser and never stored; only the validated rows reach the database |

## Goal

The admin of an inmobiliaria can put tens of projects into the catalog from one file instead of
typing them one by one, and can refresh existing ones the same way. The file is checked completely
— with the exact row and column of every problem — before anything is written, and the write is all
or nothing, so the catalog is never left half-loaded. Imported projects are in the catalog (and so
in the lead feed and the matching) the moment the load is confirmed.

## Approach

A pure module in `lib/catalog/` turns the file text into an analysis: parsed rows, each run through
`validateProject()`, plus the file-level checks only a batch has (headers, size, duplicates). The
modal only renders that analysis and enables **Confirmar carga** when it has zero errors. The write
is one RPC call: a PL/pgSQL function is a single transaction, which is what makes "todo o nada"
true; writing row by row from the browser cannot.

| Decision | Rationale |
| :------- | :-------- |
| **CSV only**, saved the way Chilean Excel opens it: UTF-8 with BOM, `;` separator, CRLF | E1 says "CSV/Excel". A real `.xlsx` needs a parsing dependency (guardrail 1). With `;` and the BOM, Excel in a Chilean locale opens the template in columns and keeps the accents, and "Guardar como CSV" gives back what the parser reads |
| The parser accepts `;` or `,`, detected from the header line; RFC 4180 quotes (`"a;b"`, `""`) | Excel uses the locale's list separator; Google Sheets and LibreOffice default to `,`. Detecting on the header avoids a separator setting the admin would get wrong |
| The template is the header row only; the modal shows a column guide with required flag, allowed values and an example | An example row inside the file would be imported as a real project whenever it is not deleted |
| Column names are the catalog field names (`nombre`, `comuna`, …, `entrega_estimada`), case-insensitive | One vocabulary with the form and the contract. Six required, `descripcion` and `entrega_estimada` optional (header may be absent) |
| Values are normalized before `validateProject()`: `comuna`, `tipo` and `estado` match case- and accent-insensitively, and `estado` also accepts its label ("En construcción") | Spreadsheets mangle case and accents; the normalized value is the canonical one, so the rules themselves are untouched |
| UF numbers accept Chilean format: `3.500` and `3.500,5` are thousands-dotted; `3500`, `3500,5`, `3500.5` are plain; `3,500` is rejected as ambiguous | Excel in es-CL writes `,` decimals and `.` thousands. `3.500` read as 3,5 UF would be a silent thousand-fold error; no project costs 3,5 UF. `3,500` is 3,5 in es-CL and 3500 in en-US, so the row asks instead of guessing |
| The file is read as UTF-8 and, if it is not valid UTF-8, as Windows-1252 | Excel on Windows saves "CSV (delimitado por comas)" in Windows-1252; read as UTF-8 every "Ñuñoa" would arrive broken and fail the comuna check |
| Row numbers are spreadsheet rows: the header is row 1, the first project row 2; blank lines are skipped but still counted | E2 says "exactamente qué filas": the number must be the one the admin sees in Excel |
| Any error blocks the whole load; there is no "import the valid rows" | E2 "antes de guardar" plus all-or-nothing: a partial load leaves the admin unsure what entered |
| A row whose `nombre` matches an existing project of the tenant (case-insensitive) **updates** it; otherwise it **creates** one. The preview labels each row *Nuevo* or *Actualiza* | The story says "agilizar la actualización del catálogo"; the tenant's unique name index already defines identity. Labelling before confirming keeps an overwrite from being a surprise |
| A name repeated inside the file is an error on every later occurrence | Both rows would hit the same project; which one wins would be arbitrary |
| An `inmobiliaria_id` (or any other unknown) column is ignored and reported as a warning | E3/S6: the file is untrusted input. The tenant admin's rows always land in their own inmobiliaria; the global admin picks the target inmobiliaria in the modal |
| RPC `importar_proyectos(p_inmobiliaria uuid, p_proyectos jsonb)`, `security invoker` | Under invoker rights the existing insert/update policies check each row, so the function grants nothing a direct insert would not. It upserts on `(inmobiliaria_id, lower(nombre))` and returns `{ creados, actualizados }` |
| Executive assignments are not in the file | The story asks for "proyectos y sus características". Assigning needs `assign_executive()`'s cross-tenant rules; it stays in the project modal |
| Without Supabase the modal still downloads the template and validates; **Confirmar** says the load requires Supabase | Handbook, Architecture: the localStorage branches are legacy and not extended. Same precedent as `assignAdmin()` |

### Local logic

Story-local, no ALG number (no tunable business number; promote if a second importer appears):

- **Limits:** at most **500** project rows and **1 MB** per file. Developer judgment (Mauro, 2026-11-02): far
  more than any tenant's catalog today, and it bounds
  the browser preview and one transaction. Right if no client catalog exceeds 500 projects; if one
  does, raise both numbers here and in the migration together.
- The Chilean number format, the separator detection and the case/accent matching above.

## Entities

**New — `public.importar_proyectos(p_inmobiliaria uuid, p_proyectos jsonb) returns jsonb`**,
`volatile security invoker set search_path = public`, granted to `authenticated` only.

1. Tenant: `coalesce(get_my_inmobiliaria(), p_inmobiliaria)` — a tenant admin's own inmobiliaria
   always wins over the argument. Raises `forbidden` (`42501`) unless that tenant is not null and
   `can_admin_inmobiliaria(tenant)`.
2. Raises `invalid_import` (`22023`) unless `p_proyectos` is a non-empty array of at most 500
   objects.
3. One `insert … select from jsonb_to_recordset(p_proyectos)` with `inmobiliaria_id = tenant`,
   `on conflict (inmobiliaria_id, lower(nombre)) do update` of the eight catalog fields, `returning
   (xmax = 0)` to count inserts.
4. Returns `{ "creados": n, "actualizados": m }`. Any failing row (a `check`, a policy, a repeated
   name) aborts the call and nothing is written.

**Read/written, unchanged:** `proyectos` (its checks, unique name index, `updated_at` trigger and the
HU 12 `estado` trigger all fire as for a manual edit). No new table, column or policy.

**Frontend:** `services/projectService.js` gains `importProjects({ inmobiliariaId, proyectos })`.
The frozen contract (`getProjects` shape) is untouched.

## Algorithms

None referenced or changed. Row rules: `validateProject()` (HU 7 / CATALOGO-UNICO), reused as-is.

## In scope

The migration (function), rollback, `schema.sql` sync, SQL tests; `lib/catalog/projectImport.js`
and its tests; `importProjects()`; the "Carga masiva" modal in `/admin/proyectos`; the wiki story
page and the proposal's status.

## Out of scope

- `.xlsx`/`.ods` files → would need a parsing dependency (guardrail 1); CSV saved from Excel covers it.
- Tipologías in the file (proposal E4) → depends on the unit model (`propuesta-carga-proyectos-por-unidad`).
- Executive assignments, deleting projects absent from the file → not asked; deletion has HU 12
  history rules of its own.
- Scheduled or recurring sync, ERP/portal connections → HU 12 territory (CRM), out without an
  explicit request.
- Importing into the local (no Supabase) provider → legacy branch, not extended.

## Steps

1. **Migration** `supabase/migrations/20261102120000_hu25_importar_proyectos.sql` per **Entities**,
   in `begin; … commit;`, idempotent (`create or replace`). Rollback
   `supabase/rollback/20261102120000_hu25_importar_proyectos_rollback.sql` drops only the function.
   Append the same DDL to `supabase/schema.sql`.
2. **SQL tests** `supabase/tests/importar_proyectos.sql` (style of `project_interest_facts.sql`),
   each case as the `authenticated` role so RLS applies:
   1. Tenant admin A: two new rows → `{creados: 2, actualizados: 0}`, both in A.
   2. Same admin, a row named like an existing project in another case → updates it
      (`actualizados: 1`), keeps its `id`; the name match is case-insensitive.
   3. `p_inmobiliaria` = B from A's admin → rows still land in A.
   4. A row violating a `check` (min > max, bad `entrega_estimada`, bad `tipo`) aborts the call and
      the other rows of that call are not written.
   5. A name repeated in one call aborts it, nothing written.
   6. Global admin with `p_inmobiliaria = B` writes to B; with `null` → `forbidden`.
   7. Ejecutivo and lead → `forbidden`; `anon` cannot execute.
   8. Empty array, a non-array and 501 rows → `invalid_import`.
3. **Pure module** `frontend/src/lib/catalog/projectImport.js`: `IMPORT_COLUMNS`,
   `IMPORT_MAX_ROWS`, `IMPORT_MAX_BYTES`, `buildImportTemplate()`, `parseCsv(text)`,
   `parseImportNumber(raw)`, `decodeImportFile(buffer)`, `analyzeProjectImport(text, { inmobiliariaId, existingProjects })` →
   `{ fileErrors, warnings, rows: [{ fila, input, errors: [{ columna, mensaje }], accion }],
   summary, canImport }`, and `toImportPayload(analysis)`.
4. **Tests** `frontend/src/lib/catalog/__tests__/projectImport.test.js`: template round-trips through
   the parser; `;` and `,` files; quotes; BOM; Windows-1252; spreadsheet row numbers with blank lines; missing
   required header; unknown and `inmobiliaria_id` columns warned and ignored; every
   `validateProject()` error surfaces with its column; normalization of comuna/tipo/estado;
   Chilean numbers; duplicates in file; *Nuevo*/*Actualiza*; the 500-row limit; `canImport` false
   on any error; invariant: a row is valid iff `validateProject()` accepts its normalized input.
5. **Service** `importProjects({ inmobiliariaId, proyectos })` in `projectService.js`: local provider
   → Spanish "requires Supabase" error; `42501` / `22023` / `23505` / `23514` → Spanish messages.
6. **Modal** `frontend/src/components/ProjectBulkImport.jsx`, opened from a **Carga masiva** button
   in the catalog controls of `AdminProjectCatalog.jsx`: target inmobiliaria (fixed for a tenant
   admin, a select for the global admin), template download, column guide, file input, summary,
   error list (fila · columna · motivo), row preview with *Nuevo*/*Actualiza*, and **Confirmar
   carga** enabled only when `canImport`. On success the catalog list is reloaded and the result
   ("N creados, M actualizados") shown. The modal calls `useModalFocus` itself, so Escape cannot close
   it while a load is running. The *Nuevos* / *Se actualizan* counters count valid rows only.
7. **Wiki** story page `Wiki RutaHogar/UserStories/HU25-carga-masiva-proyectos.md` (Spanish,
   criteria verbatim), and the proposal page pointing to it.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — downloadable template with the required columns | 3, 4, 6 | `the template round-trips through the parser`, `the template lists every catalog column`; reviewer: `/admin/proyectos` → **Carga masiva** → **Descargar plantilla**, open it in Excel |
| `E2` — validates formats and required fields and names the exact rows before saving | 3, 4, 6 | `every validateProject error surfaces with its column`, `row numbers are spreadsheet rows`, `missing required header`, `duplicate names`, `canImport is false on any error`; reviewer: upload a file with a blank `comuna` on row 3 and `precio_min_uf > precio_max_uf` on row 5; read both and see **Confirmar** disabled; nothing new in the list |
| `E3` — a confirmed valid file is in the catalog instantly | 1, 2, 5, 6 | SQL cases 1–5; reviewer: upload a valid file, confirm, see the projects in the list without reloading; as a lead see them in the catalog |
| Tenant isolation (S6) | 1, 2, 3 | SQL cases 3, 6, 7; `inmobiliaria_id column is ignored` |

## Safeguards

- **S6** — no table, column or policy changes; the RPC runs with the caller's rights, so the
  `proyectos` policies decide every row, and the tenant is the session's, never the file's.
- **S8** — the file is never stored; it holds no credentials or personal data.
- **S1–S5, S7** — not touched: no scoring, no `POST /score`, no lead data.

## Definition of done

- Tier 1 green: vitest (incl. `projectImport.test.js`) · the SQL test file against a disposable
  database · existing suites unchanged.
- Tier 2 confirmed by a reviewer who is not the author, with evidence per criterion.
- This plan committed in the same PR as the code.
- No criterion silently dropped.

## Resolved decisions

| Decision | Rationale |
| :------- | :-------- |
| Upsert by name instead of create-only | "Actualización del catálogo" is in the story; create-only would make the second load of the same file fail on every row |
| One RPC instead of `supabase.from("proyectos").upsert([...])` | PostgREST cannot upsert on an expression index (`lower(nombre)`), and a function makes the transaction boundary explicit and testable |
| `security invoker`, not `definer` | A definer function would have to re-implement the tenant policy; invoker reuses it, so there is one rule |
| Validate in the browser and rely on the database checks as the backstop | The browser gives the per-row, per-column report E2 asks for; `check` constraints and RLS keep a direct RPC call from bypassing what matters. The `comuna` list is not enforced in SQL — same as the manual form today |
