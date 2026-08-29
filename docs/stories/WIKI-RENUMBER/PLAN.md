# PLAN — WIKI-RENUMBER: renumeración del backlog, reconciliación con el código y reorganización de carpetas

- **Story:** none — this is a documentation/methodology task, not a product story
- **Source of truth:** `HUs para Sprint 1.md` (shared 2026-08-26) — authoritative
- **Branch:** `docs/actualizar-wiki` (already created, off `develop`)

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this task goes here.

- Read first: `docs/HANDBOOK.md` (Norms, Where things live), `Wiki ScoreLeads/UserStories/index.md`,
  `Wiki ScoreLeads/AtributosDeCalidad.md`, and the source doc.
- **Never invent a criterion.** Título, descripción and every `E1…En` are transcribed **verbatim**
  from the source doc. If the doc is silent, the page says so — it does not fill the gap.
- Stop and report if: a story in the source doc cannot be matched to any wiki page **and** cannot be
  written from the doc alone; or if a status flag cannot be decided from the code.

## Goal

The wiki publishes a backlog numbered `HU 1–33` from the E4 plan, a status column claiming four
stories are implemented, and a folder layout that duplicates the methodology folders in `docs/`.
None of the three is true any more. This rebuilds `Wiki ScoreLeads/UserStories/` from the source
doc, marks each shipped criterion against the code that implements it, and moves every methodology
artifact out of the vault into `docs/`.

## Approach & decisions

The source doc replaces the backlog rather than renumbering it: stories are added, dropped and
reassigned across sprints, and ten former stories are demoted to non-functional requirements. So
the folder is rebuilt, not edited. The old numbering is dropped with **no mapping table and no
`Antes:` cross-reference** — a deliberate clean break, justified by there being no implementation
behind the old numbers except HU 1–3, whose numbers do not change.

| Decision | Rationale |
| :------- | :-------- |
| Source doc is authoritative | A backlog where two numberings are both partly true is unusable. Reconciling would produce exactly that. |
| HU 1–3 keep their numbers and criteria | The doc omits them because they are PMV-done, not because they were dropped. |
| HU 20 and HU 30 get `TBD` placeholder pages | The doc reserves their SP ("Falta HU20 de 8 SP"). Omitting the pages would silently falsify the sprint totals. |
| HU 14 and HU 21 both get full pages | They are byte-identical in the doc, and the doc is the truth as written. The index notes they are identical; **no SP is adjusted** and neither is merged. |
| Spanish kebab-case filenames, full Spanish body | Handbook: "Spanish for wiki product docs". Matches `docs/stories/HU6-simulacion-compatibilidad/`. |
| Criterio text transcribed verbatim | It is the client-facing contract; it must be diffable against the source, not paraphrased. |
| Ten demoted stories become `RNF/`, indexed by `AtributosDeCalidad.md` | Two pages both claiming to be "the RNF page" is the duplication the handbook exists to stop. Acceptance criteria survive as verification criteria. |
| `informes_entregas/` frozen | E2 and E4 are delivered artifacts. Rewriting them to say something they did not say at submission falsifies the record. |
| Product name in prose → **RutaHogar**; vault folder stays `Wiki ScoreLeads/` | Handbook: the old name survives in paths, not in the product. |
| `docs/algorithms/` left empty | Writing nine ALG documents is a human's job with real numbers in it, per the handbook. Out of scope; the gap is recorded. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No.** Documentation only. No file under `backend/app/scoring_engine/` is edited. |
| 2 | Needs RLS / multi-tenant scoping? | No. |
| 3 | Needs a migration? | No. |
| 4 | Changes the `POST /score` contract? | **No** — S2 holds. |
| 5 | Consent / privacy impact? | No. No lead data is touched; RNF 2 documents the existing ARCO flow, it does not change it. |

## Entities

No tables, endpoints or service functions change. The surface is entirely markdown under
`Wiki ScoreLeads/` and `docs/`, plus four `git mv` operations.

## Algorithms

None referenced, none modified. **Local logic:** none — this plan produces no executable code.

## Scope

**In:** `Wiki ScoreLeads/UserStories/` (rebuild) · new `Wiki ScoreLeads/RNF/` · `AtributosDeCalidad.md`
· cross-references in the 11 non-informe files · the four committed merge conflicts · moving
`QA/`, `research/`, `implementation_plans/` and `story-work/HU17/` into `docs/` · folding
`Functionalities/` into its owning stories · status reconciliation against the code.

**Out:**

- `informes_entregas/E2`, `informes_entregas/E4`, `informes_entregas/Informe ScoreLeads` — frozen; header note only.
- `docs/algorithms/` — the ALG gap is recorded in the wiki, not filled here.
- The handbook's architecture section, which describes `frontend/src/features/` + `lib/` + `shared/`
  that do not exist — a handbook amendment is its own PR with a stated cause.
  `docs/stories/REFACTOR/PLAN.md` owns it.
- Renaming the `Wiki ScoreLeads/` vault folder or the repo.
- Any change under `frontend/src/`, `backend/`, or `api/`.

## Steps

Ordered so that every file move is a pure move — a commit either moves a file or changes its
content, never both (handbook, Architecture).

1. **Resolve the four committed merge conflicts**, hunk by hunk, in
   `UserStories/index.md`, `UserStories/HU1-FinancialDataEntry.md`,
   `UserStories/HU3-HybridScoring.md`, `Wiki Score Leads.md`.
   Per hunk: product name → `RutaHogar`; numbering → `HU`; completeness → the `Updated upstream`
   side; drop `number of dependants` from HU 1's required fields (no such field exists in
   `ScoreForm.jsx`, the Pydantic contract, or `scoring_engine/`).
   Verify afterwards: a grep for conflict markers across the vault returns nothing.
   → commit `fix(wiki): resolve committed merge conflicts`

2. **Pure moves into `docs/`** — `git mv` only, no content edits:
   - `Wiki ScoreLeads/QA/` → `docs/QA/`
   - `Wiki ScoreLeads/research/` → `docs/research/`
   - `Wiki ScoreLeads/implementation_plans/landing-page-anonymous-flow.md` → `docs/stories/landing-page-anonymous-flow/PLAN.md`
   - `story-work/HU17/` → `docs/stories/HU7-catalogo-de-proyectos/` (picks up the new number)

   → commit `chore(docs): move QA, research and plans out of the wiki vault`

3. **Repair the links those moves broke.** Obsidian wikilinks cannot cross the vault boundary.
   Convert every `[[research/…]]` and `[[QA/…]]` link to a relative markdown link
   (`[…](../../docs/research/…)`). Known callers: `UserStories/index.md`, `AtributosDeCalidad.md`.
   Re-grep for others.
   → commit `fix(wiki): convert cross-vault links to relative paths`

4. **Rebuild `UserStories/`** from the source doc — delete the 33 English pages, write the Spanish
   set below. Título, descripción and every `E1…En` verbatim from the doc. Overview table per page:
   Categoría · Puntos de Historia · Actor · Sprint · Estado · Depende de / Requerido por.
   **No `Antes:` row.**

   | Nuevo | Archivo | Origen |
   | :-- | :-- | :-- |
   | HU 1 | `HU1-ingreso-datos-financieros.md` | HU1-FinancialDataEntry (traducida, criterios sin cambios) |
   | HU 2 | `HU2-priorizacion-leads.md` | HU2-LeadPrioritization (traducida) |
   | HU 3 | `HU3-scoring-hibrido.md` | HU3-HybridScoring (traducida) |
   | HU 4 | `HU4-plan-de-mejora.md` | HU7-ImprovementPlan |
   | HU 5 | `HU5-academia-financiera.md` | HU12-FinancialAcademy |
   | HU 6 | `HU6-simulacion-compatibilidad.md` | HU9-CompatibilitySimulation |
   | HU 7 | `HU7-catalogo-de-proyectos.md` | HU17-ProjectCatalog |
   | HU 8 | `HU8-beneficios-habitacionales.md` | **nueva** — del doc |
   | HU 9 | `HU9-cotizacion-orientativa.md` | **nueva** — del doc |
   | HU 10 | `HU10-matching-lead-proyecto.md` | HU13-LeadProjectMatching |
   | HU 11 | `HU11-checklist-preparacion-bancaria.md` | **nueva** — del doc |
   | HU 12 | `HU12-derivacion-comercial.md` | HU4-CommercialDerivation |
   | HU 13 | `HU13-seguimiento-mensual.md` | HU8-MonthlyPlanTracking |
   | HU 14 | `HU14-mapa-accesibilidad.md` | HU10-AccessibilityMap — ⚠️ idéntica a HU 21 |
   | HU 15 | `HU15-evolucion-financiera-lead.md` | HU18-LeadFinancialEvolution |
   | HU 16 | `HU16-dashboard-conversion.md` | HU27-ConversionDashboard |
   | HU 17 | `HU17-reporte-leads-inconsistentes.md` | HU24-FraudulentLeadReporting |
   | HU 18 | `HU18-simulador-escenarios-hipotecarios.md` | HU20-EconomicSimulation |
   | HU 19 | `HU19-ranking-proyectos-brecha.md` | **nueva** — del doc |
   | HU 20 | `HU20-TBD.md` | **placeholder** — 8 SP reservados |
   | HU 21 | `HU21-mapa-accesibilidad.md` | HU10-AccessibilityMap — ⚠️ idéntica a HU 14 |
   | HU 22 | `HU22-actualizacion-mapa-accesibilidad.md` | HU11-AccessibilityMapUpdate |
   | HU 23 | `HU23-parametros-scoring.md` | HU15-ScoringParameters |
   | HU 24 | `HU24-carga-documentos.md` | HU19-SupportingDocuments |
   | HU 25 | `HU25-exportacion-dossier.md` | HU21-DossierExport |
   | HU 26 | `HU26-simulacion-subsidios.md` | HU25-SubsidySimulation |
   | HU 27 | `HU27-revision-antecedentes.md` | HU31-SimulatedCMFQuery |
   | HU 28 | `HU28-gastos-iniciales.md` | **nueva** — del doc |
   | HU 29 | `HU29-comparador-costo-credito.md` | HU26-CreditTermSimulation |
   | HU 30 | `HU30-TBD.md` | **placeholder** — 4 SP reservados |

   **Eliminadas sin destino:** `HU22-CommercialReport`, `HU28-DemographicVisualization`.
   → commit `docs(wiki): rebuild user stories from the Sprint 1-3 backlog`

5. **Create `Wiki ScoreLeads/RNF/`** — one page per item in the doc's tail list, in the doc's order.
   Each carries the demoted story's acceptance criteria as **criterios de verificación**.

   | ID | Página | Origen |
   | :-- | :-- | :-- |
   | RNF 1 | `RNF1-seguridad-basica.md` | HU5-BasicSecurity + la historia "Seguridad básica del sistema" del doc |
   | RNF 2 | `RNF2-privacidad-minima.md` | HU6-PrivacyPanel |
   | RNF 3 | `RNF3-roles-y-permisos.md` | HU14-RolesAndPermissions |
   | RNF 4 | `RNF4-auditoria-tecnica.md` | HU16-EvaluationAudit **+ HU23-EventLogAnalytics** |
   | RNF 5 | `RNF5-historial-inmutable.md` | HU33-ImmutableEvaluationHistory |
   | RNF 6 | `RNF6-experiencia-movil-lead.md` | HU29-MobileLeadExperience |
   | RNF 7 | `RNF7-dashboard-movil-ejecutivo.md` | HU30-MobileExecutiveDashboard |
   | RNF 8 | `RNF8-disponibilidad-escalabilidad.md` | HU32-SystemAvailability |
   | RNF 9 | `RNF9-manejo-seguro-errores.md` | HU5-BasicSecurity E2 — cross-linked to RNF 1 |
   | RNF 10 | `RNF10-validacion-entradas.md` | HU5-BasicSecurity E1 — cross-linked to RNF 1 |

   Then rewrite `AtributosDeCalidad.md` as the index: keep its 8 attributes with SMART goals and
   verification mechanisms, repoint "Where these are enforced" at `RNF/` pages and the new HU numbers.
   → commit `docs(wiki): add RNF folder indexed by AtributosDeCalidad`

6. **Fold `Functionalities/` into its owning stories**, then delete the folder.
   `e6-score-redirect` → HU 3 (it is HU 3's E6) · `notificacion-leads-alto`,
   `dashboard-count-badges`, `evaluaciones-staff-visibility` → HU 2. Each becomes a
   `## Notas de implementación` section on the owning story, not a separate page.
   → commit `docs(wiki): fold Functionalities into their owning stories`

7. **Criterion-level code reconciliation** for the shipped stories. For each `E1…En`, mark
   `✅ / ⚠️ parcial / ❌` **with a `path/file.jsx:line` citation**; write "no verificable desde el
   código" where that is the honest answer.

   | HU | Evidencia a revisar |
   | :-- | :-- |
   | HU 1 | `ScoreForm.jsx`, `DataConsent.jsx`, `main.py` (contrato Pydantic) |
   | HU 2 | `DashboardLeads.jsx`, `hooks/useLeads.js`, `scoring_engine/commercial_priority.py` |
   | HU 3 | `scoring.py`, `scoring_engine/`, `ai.py`, `Result.jsx`, `AiExplanationBlock.jsx` |
   | HU 4 | `scoring_engine/improvement_plan.py`, `Recommendations.jsx`, `HousingSavingsPlan.jsx`, `housingSavingsPlanService.js` |
   | HU 5 | `AcademiaFinanciera.jsx`, `constants/academyContent.js`, `GlossaryTerm.jsx` |
   | HU 6 | `SimulationPage.jsx`, `lib/simulation/`, `data/mockProjects.js` |
   | HU 7 | ⚠️ `data/mockProjects.js` **solamente** — sin CRUD admin ni persistencia |
   | HU 9 / HU 10 | `scoring_engine/project_fit.py`, `commercial_priority.py`, `blockers.py` |
   | HU 11 | `BankingChecklist.jsx` (usado en `Result.jsx` y `Recommendations.jsx`) |
   | HU 13 | `RegisterMilestone.jsx`, `MonthlyPlan.jsx`, `FinancialTracking.jsx`, `monthlyPlanService.js`, `goalsService.js` |
   | RNF 2 | `AdminArcoRequests.jsx`, `arcoService.js`, `DataConsent.jsx` |

   Stories with no code get `🗓 Planificada` with no citation — their absence needs no evidence.
   → commit `docs(wiki): reconcile story status against the implemented code`

8. **Update cross-references and totals** in the 11 non-informe files: `Actores.md`,
   `AtributosDeCalidad.md`, `Distribucion.md`, `Riesgos.md`, `Tech Stack.md`,
   `Wiki Score Leads.md`, `ScoreLeads Shared/hu_gaps.md`,
   `ScoreLeads Shared/Survey Cobertura Requisitos.md`, plus the moved `docs/QA/QA_REPORTS.md`
   and `docs/research/spike1-…md`.
   Sprint totals from the doc: **Sprint 1 = 60 SP · Sprint 2 = 62 SP · Sprint 3 = 46 SP**.
   Spikes are **13 SP each** (the wiki currently says 10 and 20 — the doc wins).
   Rewrite `UserStories/index.md` around the new backlog, noting that HU 14 and HU 21 are identical
   and that HU 20 / HU 30 are reserved.
   → commit `docs(wiki): update cross-references and sprint totals`

9. **Add a header note to the three frozen informes**: *"Este informe usa la numeración vigente a su
   fecha de entrega."* No other edit to those files.
   → commit `docs(wiki): mark delivered informes as frozen`

10. **Record the two gaps** in `deuda-tecnica.md`: `docs/algorithms/` empty against nine
    `scoring_engine/` modules; the handbook's `features/` + `lib/` + `shared/` architecture not
    implemented (owned by `docs/stories/REFACTOR/PLAN.md`).
    → commit `docs(wiki): record the ALG and architecture gaps as deuda técnica`

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| Wiki matches the source doc's numbering, categories and SP | 4, 8 | Each HU page diffed against the source doc; sprint totals sum to 60 / 62 / 46 |
| No conflict markers remain | 1 | A grep for conflict markers across `Wiki ScoreLeads/` and `docs/` returns nothing |
| No dead links | 3, 4, 5, 8 | Every `[[wikilink]]` target in the vault resolves to a file that exists |
| No stale HU references | 8 | No `HU 22`–`HU 33` reference in the old sense survives outside `informes_entregas/` |
| Status reflects the code | 7 | Every `✅` / `⚠️` carries a `file:line` citation that resolves |
| Methodology folders live under `docs/` | 2 | `QA/`, `research/`, `implementation_plans/` absent from the vault; `story-work/` gone |
| Informes unmodified except the header note | 9 | `git diff` on `informes_entregas/` shows only the added note |

## Assumptions

- **HU 1–3 are renamed and translated along with the rest.** The carve-out fixed their *numbers and
  criteria*, not their filenames; leaving three English pages in a Spanish folder would be worse.
  Their criteria are transcribed unchanged. Cheap to reverse if that reads wrong.
- **The doc's actor and category fields are trusted where the wiki disagrees.** The doc is
  authoritative, including on `Esencial` / `Importante` / `Opcional` / `Deseable`.
- **`ScoreLeads Shared/` is left in place.** It is a shared-vault folder, not a methodology folder;
  its contents (`hu_gaps.md`, `Survey Cobertura Requisitos.md`) get renumbered but not moved.
- **`docs/story-graph.html`** is untracked and predates this work. Left alone.
