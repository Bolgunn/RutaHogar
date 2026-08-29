# PLAN — REFACTOR: file architecture

- **Story:** none — a structural migration, run through the pipeline as its own story · **Actor:** the team
- **Status:** 🔜 phase 3 (after the handbook and the safety net) · **Depends on:** golden fixtures captured; `develop` → `main` reconciled
- **Branch:** one per slice, `refactor/<slice>` off `develop`

## Start here

- Read first: `docs/HANDBOOK.md` (Architecture), `backend/app/scoring.py`, `backend/app/scoring_engine/`, `frontend/src/App.jsx`, `frontend/src/components/ScoreForm.jsx`
- Stop and report if: a slice cannot be made behavior-preserving, or a golden fixture changes for a reason you cannot explain

## Goal

Move the codebase to the target structure in the handbook — feature folders plus a pure `src/lib/`
layer on the frontend, and the whole engine inside `scoring_engine/` on the backend — without
changing any behavior. The point is not tidiness: the governance in this handbook (ALG fixtures,
unit tests, reviewable diffs) needs a pure layer to point at, and today the frontend has none.

## Approach & decisions

Ship as **six sequenced PRs**, least-entangled first, each provably behavior-preserving. This is
also the dogfood run for the pipeline: six passes through grill → plan → build → review while the
only work at risk is our own.

| Decision | Rationale |
| :------- | :-------- |
| Six PRs, not one | ~14k lines in one diff cannot be reviewed; with one approver it would be a rubber stamp, and a break could not be attributed to a slice |
| Backend first | isolated, touches no in-flight branch, and golden fixtures make it provable — it validates the process before the frontend is at risk |
| `src/lib/` extraction is additive | new files that old ones call; no moves, so no conflicts while people finish open branches |
| Merge window before slices 3–5 | a teammate's edits inside a moved file resolve badly; git often fails to follow the rename |
| Delete `react-router-dom` rather than adopt it | a working URL router already exists; swapping it mid-refactor doubles the blast radius |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | Slice 1 moves the engine. **No numbers change** — golden fixtures must stay byte-identical |
| 2 | Needs RLS / multi-tenant scoping? | No |
| 3 | Needs a migration? Who applies it? | No |
| 4 | Changes the `POST /score` contract? | **No** — S2; the fixtures are the proof |
| 5 | Consent / privacy impact? | None |

## Entities

No schema, contract or endpoint changes. Module paths change on both sides; `POST /score`'s
request and response shapes do not.

## Algorithms

No ALG document changes. Slice 1 relocates the code that ALG-1…7 will describe, so **seed the ALG
documents before or after, never inside, a move slice** — a commit that moves code and restates a
rule cannot be reviewed as either.

## Scope

**In:** the six slices below; deleting `react-router-dom` and known dead code
(`formatPhoneDisplay`, the unused `CLASSIFICATION_THRESHOLDS` once ALG-3 lands); resolving the
duplicate CSS selectors as part of slice 5.

**Out:** behavior changes of any kind · new features · the ALG seeding (its own work) ·
`REGLAS_SCORING.md` absorption (owned by ALG-1/ALG-3) · removing the legacy localStorage branches
(its own story, with a data-migration question attached).

## Steps

| # | Slice | Branch | Protected by |
| :- | :---- | :----- | :----------- |
| 1 | Dissolve `scoring.py` into `scoring_engine/`; orchestrator holds no rules of its own | `refactor/engine` | golden fixtures byte-identical |
| 2 | Extract pure logic into `src/lib/` — `routing/` first, then `score-form/`. **Additive**: old files call the new modules | `refactor/lib` | new vitest suites |
| 3 | `services/` → feature folders | `refactor/services` | vitest + Playwright journeys |
| 4 | Components → feature folders; add the ESLint import rule | `refactor/features` | Playwright journeys |
| 5 | Split `styles.css` (3,088 lines) per feature; resolve `.evaluation-panel` and `.nav-links` duplicates | `refactor/styles` | manual pass, journeys |
| 6 | Delete `react-router-dom` and dead code | `refactor/cleanup` | CI |

**Merge window before slice 3:** open branches merge to `develop` first, or their owner opts to
rebase after. Announce it; do not discover it. Slices 1–2 need no window, which is why they lead.

**Every commit either moves a file or changes its behavior — never both.** A pure-move commit is
reviewable in seconds; a mixed one hides the line that mattered.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `POST /score` responses unchanged | 1 | golden fixtures, byte-identical |
| Routing resolution is pure and unit-tested | 2 | vitest over `lib/routing/` |
| Score-form validation and payload building are pure and unit-tested | 2 | vitest over `lib/score-form/` |
| No feature imports another feature | 4 | ESLint rule fails the build |
| The three user journeys still work | 3, 4, 5 | Playwright |
| `react-router-dom` and named dead code are gone | 6 | absent from `package.json`; grep |

## Assumptions

- Golden fixtures exist and are green on `develop` before slice 1. **Without them slice 1 is not
  reviewable** and must not start.
- `develop` → `main` is reconciled first, so the eventual promotion carries features *or* a
  reorganization, not both.
- Playwright journeys exist before slice 3; slices 1–2 are covered by unit tests alone.
