# PLAN — HU 25: Carga masiva de proyectos inmobiliarios mediante archivo

- **Story:** `Wiki RutaHogar/UserStories/HU25-carga-masiva-proyectos.md` · **Actor:** Administrador
  inmobiliario (`admin_inmobiliario`, or `admin` with an inmobiliaria)
- **Status:** Built · Deseable (the handed-over text lists both *Opcional* and *Deseable*; the
  backlog proposal says *Deseable*) · 5 SP · **Depends on:** HU 7 catalog (`proyectos`,
  `projectValidation.js`, `/admin/proyectos`, merged) · CATALOGO-UNICO fields (`descripcion`,
  `entrega_estimada`, merged). **Required by:** none.
- **Numbering:** HU 25 of the current sprint. The wiki's `HU25-exportacion-dossier.md` carries the
  previous sprint's numbering; it is not this story.
- **Supersedes:** the unnumbered proposal `propuesta-importacion-masiva-catalogo.md` (its E1–E3; its
  E4, tipologías, still depends on the unbuilt unit model and stays out).
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
| 2 | Needs RLS / multi-tenant scoping? | Yes, and it reuses what exists. The new RPC is `security invoker`, so every row passes the existing `proyectos` insert/update policies. The tenant is always the session's (`get_my_inmobiliaria()`): there is no argument to choose it and a key in the file is ignored. No policy changes |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes, one function: `20261103210000_hu25_importar_proyectos.sql` + rollback + `schema.sql` sync. Applied by the CTO with `supabase db push` after merge — never pasted into the SQL editor |
| 4 | Changes the `POST /score` contract? | No |
| 5 | Consent / privacy impact? | None. Rows are commercial project data, no personal data. The file is parsed in the browser and never stored; only the validated rows reach the database |

## Goal

The admin of an inmobiliaria can put tens of projects into the catalog from one Excel or CSV file
instead of typing them one by one, and can refresh existing ones the same way. The file is checked
completely — with the exact row and column of every problem — before anything is written, and the
write is all or nothing, so the catalog is never left half-loaded. Imported projects are in the
catalog (and so in the lead feed and the matching) the moment the load is confirmed.

## Approach

A pure module in `lib/catalog/` turns the file's rows into an analysis: each row run through
`validateProject()`, plus the file-level checks only a batch has (headers, size, duplicates). A
`.xlsx` is turned into rows by `exceljs` (already used by HU 22), loaded on demand; a `.csv` by our own parser. The
modal only renders the analysis and enables **Confirmar carga** when it has zero errors. The write
is one RPC call: a PL/pgSQL function is a single transaction, which is what makes "todo o nada"
true; writing row by row from the browser cannot.

| Decision | Rationale |
| :------- | :-------- |
| **`.xlsx` and `.csv`** are accepted. `.xls` (pre-2007), `.ods` and `.numbers` get a message asking to save as `.xlsx` or CSV | E1 says "CSV/Excel" and admins work in Excel. Legacy `.xls` is a different binary format no small reader handles |
| `.xlsx` is read with **`exceljs`**, the library HU 22 (#174) already brought in, loaded with a dynamic `import()` | One spreadsheet library for HU 22 and HU 25, as the HU 22 story asks (review of #177). An earlier version used `read-excel-file`; it was dropped once `exceljs` landed on `develop`, so HU 25 adds no dependency. exceljs returns formulas, hyperlinks and rich text as objects, so `readXlsx.js` flattens them to the visible value and trims the template's 500 formatted empty rows. Files are capped at 1 MB, so parsing on the main thread is negligible |
| The reader keeps blank rows in place (it fills rows absent from the sheet XML), so record *i* is spreadsheet row *i + 1* — the same contract as the CSV parser | E2 "exactamente qué filas". Verified on files written by LibreOffice, including rows missing from the XML and blank rows before the header |
| Two templates: a static **`.xlsx`** (`public/plantillas/plantilla-proyectos-rutahogar.xlsx`) and the generated **CSV** | The `.xlsx` brings drop-down lists for `comuna`, `tipo` and `estado`, `entrega_estimada` formatted as text (so Excel does not turn `2027-06` into a date), and an *Instrucciones* sheet. It is a static file built by `frontend/scripts/build-import-template.mjs` from the validator's own constants, so no Excel-writing library is needed; a test fails if the published file drifts from those constants |
| CSV: UTF-8 with BOM, `;` separator, CRLF; the parser accepts `;` or `,`, detected from the header line, RFC 4180 quotes | Excel in a Chilean locale opens it in columns with accents; Google Sheets and LibreOffice default to `,` |
| A CSV is read as UTF-8 and, if it is not valid UTF-8, as Windows-1252 | Excel on Windows saves "CSV (delimitado por comas)" in Windows-1252; read as UTF-8 every "Ñuñoa" would arrive broken |
| Templates have no example rows; the modal and the *Instrucciones* sheet show a column guide | An example row inside the file would be imported as a real project whenever it is not deleted |
| Column names are the catalog field names, case- and accent-insensitive; the header is the first non-blank row | One vocabulary with the form and the contract. Six required, `descripcion` and `entrega_estimada` optional |
| Values are normalized before `validateProject()`: `comuna`, `tipo` and `estado` match case- and accent-insensitively, and `estado` also accepts its label ("En construcción") | Spreadsheets mangle case and accents; the normalized value is the canonical one, so the rules themselves are untouched |
| **Amounts follow Chilean usage**: `.` separates thousands and `,`, when present, decimals (`51.000`, `$51.000,00`, `UF 3.250,5`, `3,5`). A `$`, `UF`, `CLP` or `U.F.` prefix or suffix and spaces are dropped. A lone `.` that does not form thousands groups (`9200.5`) is read as a decimal point, for sheets written in English. A numeric Excel cell is taken as is | The client's convention: the comma is never a thousands separator in Chile. Any other text (`tres mil`, `-3000`, `1,234.5`) yields an error on that cell — the parser never throws |
| A date cell in `entrega_estimada` becomes its month (`AAAA-MM`) | Excel converts a typed `2027-06` into 1 June 2027; the month is exactly what the catalog stores |
| Row numbers are spreadsheet rows; blank rows are skipped but still counted | E2 says "exactamente qué filas": the number must be the one the admin sees in Excel |
| Any error blocks the whole load; there is no "import the valid rows" | E2 "antes de guardar" plus all-or-nothing: a partial load leaves the admin unsure what entered |
| A row whose `nombre` matches an existing project of the tenant (case-insensitive) **updates** it; otherwise it **creates** one. The preview labels each row *Nuevo* or *Actualiza* | The story says "agilizar la actualización del catálogo"; the tenant's unique name index already defines identity. Labelling before confirming keeps an overwrite from being a surprise |
| A name repeated inside the file is an error on every later occurrence | Both rows would hit the same project; which one wins would be arbitrary |
| **Always the session's inmobiliaria.** RPC `importar_proyectos(p_proyectos jsonb)` takes no tenant; an `inmobiliaria_id` column or key is ignored (warned in the modal). The global admin, who has no inmobiliaria, does not see **Carga masiva** and gets `forbidden` from the RPC | Client decision (2026-11-02). Loading projects for a client from RutaHogar's own staff needs another flow, out of this story |
| RPC is `security invoker` | Under invoker rights the existing insert/update policies check each row, so the function grants nothing a direct insert would not. It upserts on `(inmobiliaria_id, lower(nombre))` and returns `{ creados, actualizados }` |
| Executive assignments are not in the file | The story asks for "proyectos y sus características". Assigning needs `assign_executive()`'s cross-tenant rules; it stays in the project modal |
| Without Supabase the modal still downloads the templates and validates; **Confirmar** says the load requires Supabase | Handbook, Architecture: the localStorage branches are legacy and not extended. Same precedent as `assignAdmin()` |

### Local logic

Story-local, no ALG number (no tunable business number; promote if a second importer appears):

- **Limits:** at most **500** project rows and **1 MB** per file. Developer judgment (Mauro,
  2026-11-02), not a measured constraint. 500 is far more than any tenant's catalog today and keeps
  the preview table usable and an accidental upload (a whole export, the wrong sheet) from turning
  into hundreds of overwrites. 1 MB fits 500 rows many times over — about 150 bytes per CSV row, a
  500-row `.xlsx` is under 50 KB — and stops a picture-heavy workbook before the browser unzips it.
  Neither is a database limit: one transaction upserts thousands of rows in well under a second.
  Right if no client publishes more than 500 projects at once; to change it, edit
  `IMPORT_MAX_ROWS`/`IMPORT_MAX_BYTES` and the `500` in the migration together.
- The amount format, the separator detection and the case/accent matching above.

## Entities

**New — `public.importar_proyectos(p_proyectos jsonb) returns jsonb`**, `volatile security invoker
set search_path = public`, granted to `authenticated` only.

1. Tenant: `get_my_inmobiliaria()`. Raises `forbidden` (`42501`) unless it is not null and
   `can_admin_inmobiliaria(tenant)`.
2. Raises `invalid_import` (`22023`) unless `p_proyectos` is a non-empty array of at most 500
   objects, each with a non-blank `nombre`; `nombre_repetido` (`22023`) if two share a name.
3. One `insert … select from jsonb_to_recordset(p_proyectos)` with `inmobiliaria_id = tenant`,
   `on conflict (inmobiliaria_id, lower(nombre)) do update` of the eight catalog fields, `returning
   (xmax = 0)` to count inserts. Keys outside the eight are ignored.
4. Returns `{ "creados": n, "actualizados": m }`. Any failing row (a `check`, a policy) aborts the
   call and nothing is written.

**Read/written, unchanged:** `proyectos` (its checks, unique name index, `updated_at` trigger and the
HU 12 `estado` trigger all fire as for a manual edit). No new table, column or policy.

**Frontend:** `services/projectService.js` gains `importProjects(proyectos)`. The frozen contract
(`getProjects` shape) is untouched. No new dependency: `.xlsx` is read with HU 22's `exceljs`. New static asset `frontend/public/plantillas/plantilla-proyectos-rutahogar.xlsx`.

## Algorithms

None referenced or changed. Row rules: `validateProject()` (HU 7 / CATALOGO-UNICO), reused as-is.

## In scope

The migration (function), rollback, `schema.sql` sync, SQL tests; `lib/catalog/projectImport.js`,
`lib/catalog/readXlsx.js` and their tests; the `.xlsx` template and its build script; sample files
for the reviewer; `importProjects()`; the "Carga masiva" modal in `/admin/proyectos`; the wiki
story page and the proposal's status.

## Out of scope

- `.xls`, `.ods`, `.numbers` → a message asks to save as `.xlsx` or CSV.
- Loading projects into a client's catalog from RutaHogar's staff (global admin) → its own flow, to
  be designed.
- Tipologías in the file (proposal E4) → depends on the unit model (`propuesta-carga-proyectos-por-unidad`).
- Executive assignments, deleting projects absent from the file → not asked; deletion has HU 12
  history rules of its own.
- Scheduled or recurring sync, ERP/portal connections → HU 12 territory (CRM), out without an
  explicit request.
- Importing into the local (no Supabase) provider → legacy branch, not extended.

## Steps

1. **Migration** `supabase/migrations/20261103210000_hu25_importar_proyectos.sql` per **Entities**,
   in `begin; … commit;`, idempotent (`create or replace`). Rollback
   `supabase/rollback/20261103210000_hu25_importar_proyectos_rollback.sql` drops only the function.
   Append the same DDL to `supabase/schema.sql`.
2. **SQL tests** `supabase/tests/importar_proyectos.sql` (style of `project_interest_facts.sql`),
   each case as the `authenticated` role so RLS applies:
   1. Tenant admin A: two new rows → `{creados: 2, actualizados: 0}`, both in A.
   2. Same admin, a row named like an existing project in another case → updates it
      (`actualizados: 1`), keeps its `id`; the name match is case-insensitive.
   3. A row carrying `"inmobiliaria_id": B`, sent by an `admin` of A → lands in A.
   4. A row violating a `check` (min > max, bad `entrega_estimada`, bad `tipo`) aborts the call and
      the other rows of that call are not written.
   5. A name repeated in one call aborts it, nothing written.
   6. Global admin → `forbidden`, even when a row names an inmobiliaria.
   7. Ejecutivo and lead → `forbidden`; `anon` cannot execute.
   8. Empty array, a non-array, a non-object element, a blank name and 501 rows → `invalid_import`.
3. **Pure module** `frontend/src/lib/catalog/projectImport.js`: `IMPORT_COLUMNS` (key, required,
   help text, example), `IMPORT_MAX_ROWS`, `IMPORT_MAX_BYTES`, `buildImportTemplate()`,
   `parseCsv(text)`, `parseImportNumber(raw)`, `decodeImportFile(buffer)`,
   `analyzeProjectRecords(records, { inmobiliariaId, existingProjects })` →
   `{ fileErrors, warnings, rows: [{ fila, input, errors: [{ columna, mensaje }], accion }],
   summary, canImport }`, `analyzeProjectImport(csvText, options)` and `toImportPayload(analysis)`.
   `frontend/src/lib/catalog/readXlsx.js`: `readXlsxRecords(buffer)`, first sheet, Spanish errors.
4. **Template and samples**: `frontend/scripts/build-import-template.mjs` writes the `.xlsx`
   template (run with `npx vite-node`, needs LibreOffice). Reviewer files in
   `docs/stories/HU25-carga-masiva-proyectos/samples/`: `proyectos-validos.xlsx` (numeric cells, a
   date cell, `$51.000,00`, a blank row), `proyectos-con-errores.xlsx`, `proyectos-validos.csv`.
5. **Tests** `frontend/src/lib/catalog/__tests__/projectImport.test.js`: template round-trips; `;`
   and `,` files; quotes; BOM; Windows-1252; spreadsheet row numbers with blank rows before and
   after the header; typed cells (numbers, dates, null); missing required header; unknown and
   `inmobiliaria_id` columns warned and ignored; every `validateProject()` error surfaces with its
   column; normalization; Chilean amounts and that the parser never throws; duplicates in file;
   *Nuevo*/*Actualiza*; the 500-row limit; `canImport` false on any error; invariant: a row is
   valid iff `validateProject()` accepts its normalized input; the published `.xlsx` template matches
   the constants; the three sample files give exactly the expected result.
6. **Service** `importProjects(proyectos)` in `projectService.js`: local provider → Spanish
   "requires Supabase" error; `42501` / `22023` / `23502` / `23514` → Spanish messages.
7. **Modal** `frontend/src/components/ProjectBulkImport.jsx`, opened from a **Carga masiva** button
   in the catalog controls of `AdminProjectCatalog.jsx`, shown only to an admin with an
   inmobiliaria: the session's inmobiliaria (fixed), both templates, column guide, file input,
   summary, error list (fila · columna · motivo), row preview with *Nuevo*/*Actualiza*, and
   **Confirmar carga** enabled only when `canImport`. On success the catalog list is reloaded and the
   result ("N creados, M actualizados") shown. The modal calls `useModalFocus` itself, so Escape
   cannot close it while a load is running. The *Nuevos* / *Se actualizan* counters count valid rows
   only.
8. **Wiki** story page `Wiki RutaHogar/UserStories/HU25-carga-masiva-proyectos.md` (Spanish,
   criteria verbatim, manual test steps), and the proposal page pointing to it.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — downloadable template (CSV/Excel) with the required columns | 3, 4, 5, 7 | `the published .xlsx template has the catalog columns and the same lists as the validator`, `the template lists every catalog column`; reviewer: `/admin/proyectos` → **Carga masiva** → **Plantilla Excel (.xlsx)**, open it, see the columns and the drop-down lists |
| `E2` — validates formats and required fields and names the exact rows before saving | 3, 5, 7 | `proyectos-con-errores.xlsx: reports exactly the rows and columns the reviewer will see`, `every validateProject error surfaces with its column`, `row numbers are spreadsheet rows`, `missing required header`, `duplicate names`; reviewer: upload `samples/proyectos-con-errores.xlsx`, read rows 3–7 and see **Confirmar** disabled; nothing new in the list |
| `E3` — a confirmed valid file is in the catalog instantly | 1, 2, 6, 7 | SQL cases 1–5; `proyectos-validos.xlsx … import cleanly`; reviewer: upload `samples/proyectos-validos.xlsx`, confirm, see the three projects in the list without reloading; as a lead see them in the catalog |
| Tenant isolation (S6) | 1, 2, 3, 7 | SQL cases 3, 6, 7; `inmobiliaria_id column is ignored and warned`; reviewer: as global admin, no **Carga masiva** button |

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
| `.xlsx` support with a read-only library, template as a static file | First version was CSV-only to avoid a dependency; the client requires `.xlsx` (2026-11-02). Reading needs a library; writing the template does not, so only a reader was added |
| No tenant argument at all, rather than one honoured only for the global admin | First version let the global admin pick the target inmobiliaria; the client requires the session's inmobiliaria always (2026-11-02) |
