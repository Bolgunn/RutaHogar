# Dependency Analysis — Stage 1

> Generated 2026-08-08 against branch `feature/sprint1/HU7` (commit `1ae2089`).
> Scope: the 33 stories in `UserStories/`. HU 34–43 (from [[ScoreLeads Shared/hu_gaps|hu_gaps]]) are covered in §5 only.

> [!done] Accepted and applied — 2026-08-08
> All 17 proposed edges were accepted and written into the story files. `Depends on` and `Required by` now carry the full 53-edge set, mirrored in both directions, and every story has a `## Dependencies` section explaining each upstream dependency.
> This document is now the **audit trail** — it records where each edge came from, not what is pending.
> Two corrections were made during promotion: **S6's direction was reversed** (it asserted HU 2 depended on HU 7x; the reverse is true) and **S1 was promoted to B12** as a hard dependency per the team's call.
>
> Consequences: unconfirmed edges dropped from 3 to **0**; backward-in-sprint edges rose from 2 to **7**; lane widths were unaffected.

---

## How to read this

Each asserted relation carries a **basis**:

| Basis | Meaning |
| :---- | :------ |
| `declared` | Already present in a story's `Depends on` / `Required by` |
| `proposed · textual` | The prose states the relation in dependency language |
| `proposed · semantic` | Derived from what the acceptance criteria require |
| `proposed · code` | The implementation shows the relation directly |

And a **type**:

- **blocks** — the dependent story cannot satisfy its acceptance criteria until the other exists.
- **enhances** — it works without, but is materially better with.

`overlap` and `sibling` relations carry no ordering and are **not** edges. They are in §3 and §4.

---

## Summary of findings

| Finding | Count |
| :------ | :---: |
| Declared edges (unchanged) | 37 |
| Proposed new **blocks** edges | 12 |
| Proposed new **enhances** edges | 5 |
| Prose references that are **not** dependencies | 25 |
| Scope-overlap clusters | 3 |
| Stories whose implementation contradicts their status | 8 |
| Sprint-1 stories blocked by later sprints | **3** |
| HU 34–43 duplicates of existing stories | 4 |

The three most consequential items, stated plainly:

1. **HU 23 (Event-Log Analytics, 8 SP, Sprint 1) has no implementation and gates 6 SP of Sprint 3.** No event-log table exists in `schema.sql`; no logging code was found anywhere in `frontend/src`, `backend/`, or `supabase/`.
2. **Three Sprint 1 stories depend on later sprints.** HU 30 needs HU 24 (Sprint 3) and HU 9 (Sprint 2); HU 13 needs HU 9 (Sprint 2). None of these edges is currently declared.
3. **HU 32 and HU 36 are the same story**, written twice in two different documents.

---

## 1. Proposed dependency edges

### 1.1 Hard — `blocks`

#### B1 · HU 7x → HU 12 &nbsp;·&nbsp; `proposed · textual + semantic` &nbsp;·&nbsp; Sprint 1 → Sprint 1

HU 12 E2 requires the improvement plan to exist:

> **Given** the user has an identified financial blocker, **When** they review their result **or improvement plan**, **Then** the system must suggest related educational content.

Confirmed by HU 12's own note: *"The blocker detection that drives E2 reuses the `risk_codes` produced by the scoring engine (HU 3) and the improvement plan (HU 7x)."* Only HU 3 is declared.

#### B2 · HU 33 → HU 8 &nbsp;·&nbsp; `proposed · textual` &nbsp;·&nbsp; Sprint 2 → Sprint 2 · **intra-sprint**

HU 8 E4 recalculates the score on milestone completion. HU 8's note: *"Recalculations (E4) must produce a new versioned evaluation rather than mutate the prior one — see HU 33."* HU 33 E1 names the same coupling from the other side: *"a recalculation or score adjustment occurs (debt payment HU 8…)"*.

#### B3 · HU 33 → HU 31 &nbsp;·&nbsp; `proposed · textual` &nbsp;·&nbsp; Sprint 2 → Sprint 2 · **intra-sprint**

HU 31 E6 applies a scoring adjustment and records the reason. HU 31's note: *"A scoring adjustment (E6) is a recalculation trigger for HU 33."*

#### B4 · HU 33 → HU 25 &nbsp;·&nbsp; `proposed · textual` &nbsp;·&nbsp; Sprint 2 → Sprint 3

HU 25 E2 recalculates the dividend with the subsidy applied. HU 25's note: *"A recalculated dividend (E2) is a scoring-recalculation trigger for HU 33."*

#### B5 · HU 33 → HU 15 &nbsp;·&nbsp; `proposed · textual` &nbsp;·&nbsp; Sprint 2 → Sprint 3

HU 15's note: *"A parameter change is a recalculation trigger for HU 33."*

> **B2–B5 together are the real finding.** HU 33 is not a leaf reporting story — it is the versioning substrate that four separate recalculation paths depend on. Today it declares only `Depends on HU 3` and `Required by HU 18`. It should have four more dependents.

#### B6 · HU 24 → HU 30 &nbsp;·&nbsp; `proposed · textual + semantic` &nbsp;·&nbsp; **Sprint 3 → Sprint 1 · BACKWARD**

HU 30 E4:

> **Then** they must be able to run main actions such as view detail, change status, mark follow-up, **or report inconsistency**.

"Report inconsistency" is HU 24 E3. HU 24's note confirms it: *"Quick 'report inconsistency' action is exposed on mobile — see HU 30 E4."*

**A Sprint 1 story has an acceptance criterion that requires a Sprint 3 story.** Either HU 30 E4 drops that action, or HU 24 moves earlier, or E4 ships partially.

#### B7 · HU 9 → HU 13 &nbsp;·&nbsp; `proposed · semantic + code` &nbsp;·&nbsp; **Sprint 2 → Sprint 1 · BACKWARD**

HU 13 E1 orders leads by *"affinity and purchase capacity"*; E3 requires the executive to see *"estimated capacity, down payment, classification, and main blocker."*

"Maximum estimated value the lead could finance" is defined by HU 9 E4 and nowhere else.

**Code check:** no such value is computed. `backend/app/scoring_engine/indicators.py` returns 20 indicators, all relative to a *declared* `property_value` (`pie_ratio`, `brecha_pie_minimo`, `ratio_dividendo_ingreso`…). There is no maximum-financeable-value output in `scoring.py` or any `scoring_engine` module. `main_blocker` **does** exist, so the "main blocker" half of E3 is satisfied.

#### B8 · HU 9 → HU 30 &nbsp;·&nbsp; `proposed · semantic + code` &nbsp;·&nbsp; **Sprint 2 → Sprint 1 · BACKWARD**

Same root cause. HU 30 E3 requires the lead card to show *"name, classification, score, estimated capacity, main blocker, and commercial status."*

> **B7 + B8 together:** "estimated purchase capacity" is consumed by two Sprint 1 stories and produced by a Sprint 2 story that isn't built. This is the single most concrete scheduling problem in the backlog.

#### B9 · HU 5 → HU 30 &nbsp;·&nbsp; `proposed · textual` &nbsp;·&nbsp; Sprint 1 → Sprint 1 · **intra-sprint**

HU 30 E6 requires the mobile dashboard to maintain desktop access restrictions. HU 30's note: *"E6 role enforcement aligns with HU 5 and HU 14."*

#### B10 · HU 1 → HU 23 &nbsp;·&nbsp; `proposed · textual` &nbsp;·&nbsp; PMV → Sprint 1

HU 23 E3 excludes non-consented users from the log. HU 23's note: *"E3 makes consent-gating a hard requirement of the logging layer — non-consented traffic is logged only as anonymous, consistent with HU 1 E3."* The consent flag originates in HU 1 E3.

#### B11 · HU 16 → HU 33 &nbsp;·&nbsp; **confirms an existing one-sided edge** &nbsp;·&nbsp; Sprint 2 → Sprint 2

This edge is currently declared only by HU 16's `Required by` and was flagged as unconfirmed by the graph. It is real. HU 33 E4:

> **Given** an executive/admin consults the history **via HU 16**, **Then** they must be able to reconstruct the chain of versions in chronological order.

**Recommendation: add `HU 16` to HU 33's `Depends on` and the edge stops being unconfirmed.**

#### B12 · HU 2 → HU 13 &nbsp;·&nbsp; `proposed · semantic` &nbsp;·&nbsp; PMV → Sprint 1

HU 13 E1:

> **Given** the executive selects a project, **When** they access **their leads panel**, **Then** the system must show compatible users ordered by affinity and purchase capacity.

"Their leads panel" is HU 2's dashboard. HU 13's note frames this softly — *"Complements the priority dashboard HU 2 by adding a project-centric view"* — but the criterion is written against the existing panel, not a new one.

**Team decision (2026-08-08): this is a hard dependency.** HU 13 extends HU 2's dashboard rather than shipping its own view. HU 2 is delivered, so the dependency is already satisfied — but it belongs in the graph, because anything that changes HU 2's panel now has a known downstream consumer.

---

### 1.2 Soft — `enhances`

| # | Edge | Basis | Evidence |
| :- | :--- | :---- | :------- |
| S2 | HU 2 → HU 18 | textual | *"Complements the executive dashboard HU 2 with a temporal view of each lead."* |
| S3 | HU 16 → HU 24 | textual | HU 24 E7 stores *"date, responsible, reason, and previous/subsequent status"* — that is HU 16's audit record. Note: *"E7 aligns with the auditing story HU 16."* |
| S4 | HU 14 → HU 30 | textual | *"E6 role enforcement aligns with HU 5 and HU 14."* Sprint 2 → Sprint 1, **backward**, but soft: E6 only requires parity with whatever desktop enforces. |
| S5 | HU 6 → HU 23 | textual | *"Consent state set here gates event logging in HU 23 E3."* Sprint 2 → Sprint 1, **backward**, soft: the baseline consent flag comes from HU 1 (B10); HU 6 only adds management of it. |
| S6 | HU 2 → HU 7x | textual | *"Users with a High score bypass this flow and are routed to the executive dashboard."* HU 7x's high-score branch needs HU 2's dashboard as its destination. Both already delivered. **Direction corrected 2026-08-08** — first recorded as HU 7x → HU 2, which asserted that the PMV dashboard depended on a later story. |

---

## 2. What did *not* become an edge

Of the 42 HU→HU references found in prose but absent from the dependency table, **25 are not dependencies**. This was the expected outcome flagged before the analysis began, and it held.

| Kind | Instances |
| :--- | :-------- |
| **Sibling** — same feature, different actor or surface | HU 29 ↔ HU 30 (*"the lead-side counterpart is HU 29"*); HU 29 → HU 1/HU 3/HU 7x already declared as its real deps |
| **Related simulation** — shares logic, no ordering | HU 9 ↔ HU 20 ↔ HU 25 ↔ HU 26, mutually cross-referenced as *"related simulations"* |
| **Contrast** — cited to say "deliberately not this" | HU 1 ↔ HU 19 (*"earlier stages deliberately avoid document upload"*); HU 2 ↔ HU 4 (*"This story deliberately avoids CRM integration"*) |
| **Principle alignment** — shares a rule, needs no code from the other | HU 24 E8 ↔ HU 33 (*"aligns with the immutability principle"*) |
| **Content link** — links to material, not to a feature | HU 12 → HU 25/HU 26 (*"Concepts surfaced here connect to…"*) |

Promoting these would have added ~25 false blockers to a 37-edge graph.

---

## 3. Scope overlaps

These carry no ordering, so they are not edges — but each is a live planning question.

### 3.1 The reporting cluster — HU 22 · HU 23 · HU 27 · HU 28 &nbsp;·&nbsp; 17 SP across 3 sprints

All four consume evaluation/event data and emit tables, charts, or exports. HU 22's own note concedes it: *"Overlaps with the analytics in HU 23 and the conversion dashboard HU 27; this story is the exportable, period-scoped commercial report."*

| Story | Sprint | SP | Distinguishing claim |
| :---- | :----- | :-: | :------------------- |
| HU 23 | Sprint 1 | 8 | Raw event log + charts + AI explanation of the data |
| HU 22 | Sprint 2 | 3 | Period-scoped export to Excel/PDF |
| HU 27 | Sprint 3 | 5 | Conversion funnel and cycle-time KPI |
| HU 28 | Sprint 3 | 1 | Demographic distribution + anonymised PDF |

HU 28 at 1 SP is essentially a filtered PDF of HU 23's dataset.

**Team decision (2026-08-08): HU 28 stays its own story.** The cluster is not merged. The overlap remains worth knowing — all four consume the same dataset, so HU 23's data model constrains three downstream stories — but no consolidation is planned. This section is retained as context, not as a pending action.

### 3.2 The simulation cluster — HU 9 · HU 20 · HU 25 · HU 26 &nbsp;·&nbsp; 16 SP across 2 sprints

All four re-derive dividend and financial-burden outcomes under varied inputs, and all four explicitly disclaim introducing a new model (*"reuses the scoring engine's dividend and financial-burden logic"*, *"reuses the dividend/interest logic"*). They differ only in which variable moves: property value (HU 9), rate/UF (HU 20), subsidy (HU 25), term (HU 26).

**Question: is this one simulation engine with four entry points?** If so, the first of the four to be built carries most of the cost and the remaining three are much cheaper than their combined 11 SP suggests.

### 3.3 HU 31 E6 reaches into the scoring engine

HU 31 E6 applies an adjustment to the financial score. That is scoring-engine behaviour living in a Sprint 2 "Optional" story, and it is one of the four recalculation triggers in B2–B5.

---

## 4. Status accuracy

Implementation found in the repository that contradicts the wiki's `Status`. **None of these is a claim that a story is done** — a file existing does not mean its acceptance criteria pass. Each row states what was located and what was not.

| HU | Wiki says | Implementation found | Read |
| :- | :-------- | :------------------- | :--- |
| **HU 6** Privacy Panel | 🗓 Planned · S2 | `AdminArcoRequests.jsx`, `arcoService.js`, `DataConsent.jsx`, `SetPassword.jsx`, `public.arco_requests` + RLS policies | E1, E2 appear covered; E4 plausible via `SetPassword`. **E3 (unrecoverable deletion) not located.** Not "Planned". |
| **HU 8** Monthly Tracking | 🗓 Planned · S2 | `FinancialTracking.jsx`, `MonthlyPlan.jsx`, `RegisterMilestone.jsx`, `goalsService.js`, `monthlyPlanService.js`, `public.improvement_goals` | E1, E3, E5 appear covered. **E4 (recalculate score on milestone) not located** — which is exactly the criterion that needs B2. |
| **HU 12** Financial Academy | 🔜 Sprint 1 | `AcademiaFinanciera.jsx`, `academyContent.js`, `GlossaryTerm.jsx`, `FieldTooltip.jsx` | E1, E3 appear covered. **E2 (blocker-driven suggestion) not located** — the criterion that needs B1. |
| **HU 7** Project Catalog | 🔜 Sprint 1 | `AdminProjectCatalog.jsx`, `projectService.js`, `projectValidation.js`, `public.proyectos`, `public.proyecto_ejecutivos` | E1–E3 appear covered. **E4 (sold-out excluded from matching) not located.** In flight on this branch. |
| **HU 14** Roles & Permissions | 🗓 Planned · S2 | `executiveService.js`, `20260731_executive_accounts.sql`, `supabase/functions/create-executive`, `roles` in `auth.js` | E1 partially (executive account creation); E2/E3 via existing role routing. Substantially underway. |
| **HU 13** Lead–Project Matching | 🔜 Sprint 1 | `backend/app/scoring_engine/project_fit.py`, wired into `/score`, returns `project_fit` | Backend matching exists. **No executive-facing UI located.** Blocked on B7 regardless. |
| **HU 4** CRM Derivation | 🗓 Planned · S2 | `commercial_priority.py` emits `send_to_crm`; `docs/crm-integration.md` (new, uncommitted) | Scaffolding only — no CRM client, no field mapping. Consistent with its note that Spike 2 must define the API. |
| **HU 3** Hybrid Scoring | ✅ PMV | Whole `scoring_engine/` package; `/score` returns `algorithm_version`, `component_scores`, `blockers`, `main_blocker` | E5's immutable-record fields are present. Materially **beyond** what the wiki describes. |

### 4.1 Sprint 1 stories with no implementation found

| HU | SP | Note |
| :- | :-: | :--- |
| **HU 23** Event-Log Analytics | 8 | **No event-log table in `schema.sql`; no logging code found in `frontend/src`, `backend/`, or `supabase/`.** Gates HU 27 (5 SP) and HU 28 (1 SP). |
| **HU 5** Basic Security | 8 | Pydantic validation exists in `main.py` (E1 partially). No dedicated work located for E2/E3. |
| **HU 9** purchase capacity | — | Confirmed absent (see B7). HU 9 itself is Sprint 2, but two Sprint 1 stories need its output. |

### 4.2 Side finding — `CLAUDE.md` is stale

Not a dependency issue, but it affects anyone reasoning about this system:

- The documented `POST /score` contract lists 8 required and 5 optional fields. `main.py` defines roughly 20, including `edad`, `property_value`, `property_value_uf`, `plazo_credito_hipotecario`, `monto_morosidad`, `antiguedad_morosidad`, and `dividendo_esperado`.
- `CLAUDE.md` describes the engine as a flat rule list in `scoring.py`. There is now a `scoring_engine/` package with weighted components, blockers, commercial priority, and project fit.

---

## 5. HU 34–43 — ten stories outside the graph

[[ScoreLeads Shared/hu_gaps|hu_gaps.md]] (dated 2026-06-24) defines HU 34–43, derived from a requirements-coverage survey. They appear in **no** other document: not `UserStories/`, not [[UserStories/index|index]], not [[Distribucion|Distribución]]. They are in no sprint and have no story pages.

### 5.1 Four are duplicates of existing stories

| New | Existing | Assessment |
| :-- | :------- | :--------- |
| **HU 36** Disponibilidad y escalabilidad (5 SP) | **HU 32** System Availability & Scalability (5 SP) | **The same story.** Both: uptime ≥ 95 % with alerting; post-deploy smoke tests covering `POST /score`; load test of ≥ 100 evaluations against Supabase. Same three criteria, same points, two documents. |
| **HU 39** Historial inmutable / versionado | **HU 33** Immutable, Versioned Evaluation History | Same requirement (survey FR18). |
| **HU 41** Integración CMF/Dicom real | **HU 31** Simulated CMF Query | Adjacent, not identical: HU 31 ships a *simulation* and explicitly defers real integration per the project guardrail. HU 41 is the real integration. Keep both, but HU 41 depends on HU 31. |
| **HU 42** App móvil nativa (RN + Expo) | **HU 29 / HU 30** Mobile Experience | Different delivery: HU 29/30 are responsive web; HU 42 is a native app. Keep both, but they compete for the same goal. |

Note that [[UserStories/HU33-ImmutableEvaluationHistory|HU 33]] already documents a numbering collision from the same source: *"the E4 source referenced 'HU41' and 'HU15' in this story's E1; these are corrected here to HU 31 and HU 16."* The two numbering schemes have collided before.

### 5.2 A probable numbering error in HU 33 E1

HU 33 E1 lists its recalculation triggers as *"debt payment HU 8, configuration change **HU 14**/HU 15, CMF adjustment HU 31, subsidy simulation HU 25."*

HU 14 is Roles & Permissions. A role change is not a scoring-recalculation trigger. Given the documented history of HU 14/HU 15/HU 41 confusion from the E4 source, **this is likely meant to be HU 15 alone.** Worth a one-line fix.

### 5.3 Their own internal dependencies

HU 35 E2 notifies *"vía HU34"*; HU 34 E2 references HU 38 for re-engagement timing. If HU 34–43 are ever adopted, HU 34 (notifications) is their hub — and it overlaps HU 3 E6 (*"the sales executive must be notified"*) and HU 24 E6 (report-status notification), neither of which currently has a notification mechanism.

---

## 6. What this means for the sprint plan

1. **Sprint 1 is not self-contained.** Three of its stories reach forward: HU 30 → HU 24 (Sprint 3), HU 30 → HU 9 (Sprint 2), HU 13 → HU 9 (Sprint 2). Add the two already-known backward edges from HU 5 into PMV, and Sprint 1 has five cross-sprint entanglements.
2. **HU 23 is the critical path nobody has started.** 8 SP, Sprint 1, zero implementation, and it gates 6 SP in Sprint 3. Every other Sprint 1 story has at least partial code.
3. **Sprint 2's real load is well below 73 SP.** HU 6, HU 8, and HU 14 all have substantial implementations while marked Planned. Conversely Sprint 2 gains internal sequencing it didn't have: HU 16 → HU 33 → { HU 8, HU 31, HU 18 }.
4. **HU 33 is understated.** It reads as a Desirable 5 SP admin story; it is the versioning substrate under four recalculation paths across two sprints.
5. **Two clusters may be over-decomposed.** Reporting (17 SP / 4 stories) and simulation (16 SP / 4 stories) — 33 SP, 18 % of the plan, with heavy internal duplication.

---

## 7. Suggested next actions

| # | Action | Cost |
| :- | :----- | :--- |
| 1 | Decide HU 32 vs HU 36 — delete one | minutes |
| 2 | Fix HU 33 E1: `HU 14` → `HU 15` | minutes |
| 3 | Add `HU 16` to HU 33's `Depends on` (resolves an unconfirmed edge) | minutes |
| 4 | Decide HU 30 E4: drop "report inconsistency", or pull HU 24 forward | discussion |
| 5 | Decide where "estimated purchase capacity" is built — it blocks HU 13 and HU 30 | discussion |
| 6 | Re-status HU 6, HU 8, HU 12, HU 14, HU 7 against actual code | ~1 hour |
| 7 | Start HU 23 or accept that HU 27/HU 28 slip | planning |
| 8 | ~~Review the reporting cluster for merge~~ — resolved 2026-08-08: HU 28 stays a story, no merge | — |
| 9 | Review the simulation cluster (HU 9/20/25/26) for a shared engine | discussion |

---

## Machine-readable findings

Consumed by `scripts/build-story-graph.js` in Stage 2. Not authoritative — `UserStories/*.md` remains the source of declared truth.

```json scoreleads-findings-v1
{
  "generated": "2026-08-08",
  "source_commit": "1ae2089",
  "proposed_edges": [
    {"id":"B1","from":"HU7","to":"HU12","type":"blocks","basis":"textual+semantic","evidence":"HU12 E2 requires the improvement plan; HU12 note names HU7 explicitly."},
    {"id":"B2","from":"HU33","to":"HU8","type":"blocks","basis":"textual","evidence":"HU8 note: recalculations must produce a new versioned evaluation. HU33 E1 lists 'debt payment HU8'.","intra_sprint":true},
    {"id":"B3","from":"HU33","to":"HU31","type":"blocks","basis":"textual","evidence":"HU31 note: a scoring adjustment (E6) is a recalculation trigger for HU33.","intra_sprint":true},
    {"id":"B4","from":"HU33","to":"HU25","type":"blocks","basis":"textual","evidence":"HU25 note: a recalculated dividend (E2) is a scoring-recalculation trigger for HU33."},
    {"id":"B5","from":"HU33","to":"HU15","type":"blocks","basis":"textual","evidence":"HU15 note: a parameter change is a recalculation trigger for HU33."},
    {"id":"B6","from":"HU24","to":"HU30","type":"blocks","basis":"textual+semantic","evidence":"HU30 E4 includes 'report inconsistency', which is HU24 E3.","backward":true},
    {"id":"B7","from":"HU9","to":"HU13","type":"blocks","basis":"semantic+code","evidence":"HU13 E1/E3 require estimated purchase capacity, defined only in HU9 E4; no such value is computed in scoring_engine.","backward":true},
    {"id":"B8","from":"HU9","to":"HU30","type":"blocks","basis":"semantic+code","evidence":"HU30 E3 requires 'estimated capacity'; same missing computation as B7.","backward":true},
    {"id":"B9","from":"HU5","to":"HU30","type":"blocks","basis":"textual","evidence":"HU30 note: E6 role enforcement aligns with HU5 and HU14.","intra_sprint":true},
    {"id":"B10","from":"HU1","to":"HU23","type":"blocks","basis":"textual","evidence":"HU23 note: E3 consent-gating is consistent with HU1 E3, where the consent flag originates."},
    {"id":"B11","from":"HU16","to":"HU33","type":"blocks","basis":"semantic","evidence":"HU33 E4: 'consults the history via HU16'. Confirms an edge currently declared by only one side.","confirms_unconfirmed":true},
    {"id":"B12","from":"HU2","to":"HU13","type":"blocks","basis":"semantic","evidence":"HU13 E1 is written against 'their leads panel', which is HU2's dashboard. Team confirmed 2026-08-08 that HU13 extends HU2 rather than shipping its own view."},
    {"id":"S2","from":"HU2","to":"HU18","type":"enhances","basis":"textual","evidence":"HU18 note: complements the executive dashboard HU2."},
    {"id":"S3","from":"HU16","to":"HU24","type":"enhances","basis":"textual","evidence":"HU24 note: E7 aligns with the auditing story HU16."},
    {"id":"S4","from":"HU14","to":"HU30","type":"enhances","basis":"textual","evidence":"HU30 note: E6 role enforcement aligns with HU5 and HU14.","backward":true},
    {"id":"S5","from":"HU6","to":"HU23","type":"enhances","basis":"textual","evidence":"HU6 note: consent state set here gates event logging in HU23 E3.","backward":true},
    {"id":"S6","from":"HU2","to":"HU7","type":"enhances","basis":"textual","evidence":"HU7's high-score branch routes the lead into HU2's executive dashboard instead of generating a plan, so HU7 needs that destination to exist. Direction corrected 2026-08-08: originally recorded HU7->HU2, which asserted the reverse."}
  ],
  "status_flags": [
    {"id":"HU6","wiki":"planned","evidence":["frontend/src/components/AdminArcoRequests.jsx","frontend/src/services/arcoService.js","frontend/src/components/DataConsent.jsx","supabase/migrations/20260608_arco_requests.sql"],"covered":["E1","E2"],"not_located":["E3"]},
    {"id":"HU8","wiki":"planned","evidence":["frontend/src/components/FinancialTracking.jsx","frontend/src/components/MonthlyPlan.jsx","frontend/src/services/goalsService.js","frontend/src/services/monthlyPlanService.js"],"covered":["E1","E3","E5"],"not_located":["E4"]},
    {"id":"HU12","wiki":"next","evidence":["frontend/src/components/AcademiaFinanciera.jsx","frontend/src/constants/academyContent.js","frontend/src/components/GlossaryTerm.jsx"],"covered":["E1","E3"],"not_located":["E2"]},
    {"id":"HU7","wiki":"next","evidence":["frontend/src/components/AdminProjectCatalog.jsx","frontend/src/services/projectService.js","frontend/src/services/projectValidation.js","supabase/migrations/20260729_project_catalog.sql"],"covered":["E1","E2","E3"],"not_located":["E4"]},
    {"id":"HU14","wiki":"planned","evidence":["frontend/src/services/executiveService.js","supabase/migrations/20260731_executive_accounts.sql","supabase/functions/create-executive/index.ts"],"covered":["E1"],"not_located":["E2","E3"]},
    {"id":"HU13","wiki":"next","evidence":["backend/app/scoring_engine/project_fit.py"],"covered":["E2"],"not_located":["E1","E3","E4"]},
    {"id":"HU4","wiki":"planned","evidence":["backend/app/scoring_engine/commercial_priority.py","docs/crm-integration.md"],"covered":[],"not_located":["E1","E2","E3"]},
    {"id":"HU23","wiki":"next","evidence":[],"covered":[],"not_located":["E1","E2","E3","E4"],"note":"no event-log table or logging code found anywhere"}
  ],
  "overlaps": [
    {"members":["HU22","HU23","HU27","HU28"],"sp":17,"note":"reporting cluster; HU22 concedes the overlap in its own notes"},
    {"members":["HU9","HU20","HU25","HU26"],"sp":16,"note":"simulation cluster; all disclaim introducing a new model"},
    {"members":["HU31","HU3"],"sp":13,"note":"HU31 E6 adjusts the financial score, which is scoring-engine behaviour"}
  ],
  "non_dependencies": [
    {"from":"HU29","to":"HU30","kind":"sibling"},
    {"from":"HU9","to":"HU20","kind":"related-simulation"},
    {"from":"HU9","to":"HU25","kind":"related-simulation"},
    {"from":"HU9","to":"HU26","kind":"related-simulation"},
    {"from":"HU20","to":"HU25","kind":"related-simulation"},
    {"from":"HU20","to":"HU26","kind":"related-simulation"},
    {"from":"HU25","to":"HU26","kind":"related-simulation"},
    {"from":"HU1","to":"HU19","kind":"contrast"},
    {"from":"HU2","to":"HU4","kind":"contrast"},
    {"from":"HU24","to":"HU33","kind":"principle"},
    {"from":"HU12","to":"HU25","kind":"content-link"},
    {"from":"HU12","to":"HU26","kind":"content-link"},
    {"from":"HU22","to":"HU23","kind":"overlap"},
    {"from":"HU22","to":"HU27","kind":"overlap"}
  ],
  "external_stories": {
    "source": "Wiki ScoreLeads/ScoreLeads Shared/hu_gaps.md",
    "duplicates": [
      {"new":"HU36","existing":"HU32","verdict":"identical"},
      {"new":"HU39","existing":"HU33","verdict":"same requirement (FR18)"},
      {"new":"HU41","existing":"HU31","verdict":"adjacent; HU41 is the real integration HU31 defers"},
      {"new":"HU42","existing":"HU29,HU30","verdict":"native app vs responsive web; competing delivery"}
    ],
    "internal_edges": [{"from":"HU34","to":"HU35"},{"from":"HU38","to":"HU34"}]
  },
  "doc_errors": [
    {"file":"UserStories/HU33-ImmutableEvaluationHistory.md","location":"E1","issue":"lists HU14 (Roles) as a recalculation trigger; almost certainly meant HU15 (Scoring Parameters)"},
    {"file":".claude/CLAUDE.md","location":"POST /score contract","issue":"documents 8 required + 5 optional fields; main.py defines ~20"},
    {"file":".claude/CLAUDE.md","location":"Backend section","issue":"describes a flat scoring.py; a scoring_engine/ package now exists"}
  ]
}
```
