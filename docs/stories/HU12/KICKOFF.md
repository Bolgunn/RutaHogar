# KICKOFF — HU 12: Sistema de Derivación e Integración Comercial

You are building story **HU 12 — Sistema de Derivación e Integración Comercial** in a fresh session. You have no prior context;
everything you need is in this prompt plus the files it points to.

## Story facts

- **Story:** HU 12 — Sistema de Derivación e Integración Comercial
- **Plan:** `docs/stories/HU12/PLAN.md` — the binding spec for this story. Read it first,
  in full.
- **Source story:** `Wiki RutaHogar/UserStories/HU12-derivacion-comercial.md`
- **Branch:** `feat/hu12-derivacion-comercial` — all commits go here.
- **Depends on / stubs:** Spike 2 E3 (Investigación). Depende de que el backend mock CRM (`/api/v1/crm-mock/sync`) ya exista, lo cual es cierto.

## Read first, in order

1. `docs/stories/HU12/PLAN.md`
2. `Wiki RutaHogar/UserStories/HU12-derivacion-comercial.md`
3. `backend/tests/test_crm_mock.py` — para ver el formato esperado del payload.
4. `docs/handbook/04-safeguards.md`

## Ground rules

Pointers, not new rules — the binding versions are in the plan and the handbook
(`docs/handbook/00-workflow.md`, `03-norms.md`):

- Implement the algorithm as written. **Never invent a number.** If an ALG document is wrong,
  missing or ambiguous, stop and report.
- Follow the plan's steps. If reality diverges from the plan, report it rather than silently
  redesigning.
- No acceptance criterion is dropped or reinterpreted. One that cannot be met is reported,
  not skipped.

## When done

Run Tier 1 gates before claiming completion (`docs/handbook/03-norms.md`) and report per
acceptance criterion: implemented how, verified by which test. A "done" report is a claim,
not evidence.
