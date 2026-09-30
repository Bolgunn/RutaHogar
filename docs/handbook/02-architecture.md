# 02 — Architecture

**Status: draft, pending ratification.** The target structure below is **not yet the structure
on disk** — it is what the refactor delivers. Where the two differ, this file describes the
destination.

## Principle

Two layers, everywhere:

- **Pure logic** — no framework, no I/O, no database. Testable with plain function calls, and
  the only place a governed algorithm may be implemented.
- **Everything else** — components, services, endpoints. Wires the pure layer to the world.

The backend already half-embodies this (`scoring_engine/`). The frontend does not, and that is
the gap the refactor closes. Every governance mechanism in this handbook — ALG fixtures, unit
tests, reviewable diffs — depends on there being a pure layer to point at.

## Frontend target

```
frontend/src/
├── features/            # one folder per product area
│   ├── auth/            # components + service + styles for that area
│   ├── scoring/         # ScoreForm, Result, evaluation service
│   ├── leads/           # DashboardLeads, useLeads
│   ├── tracking/        # FinancialTracking, MonthlyPlan, goals
│   ├── academy/         # AcademiaFinanciera + content
│   └── admin/           # AdminPanel, AdminArcoRequests
├── lib/                 # PURE. no React, no Supabase, no fetch
│   ├── routing/         # path <-> page <-> role resolution
│   ├── score-form/      # validation + POST /score payload construction
│   └── ...
├── shared/              # cross-feature UI + helpers (3+ real consumers)
└── services/supabase.ts # the client itself
```

**The import rule, enforced by ESLint:**

- a feature may import from `lib/`, `shared/`, and its own folder;
- a feature **may not import from another feature**;
- `lib/` imports nothing but `lib/`.

If two features need the same thing, it moves to `lib/` (logic) or `shared/` (UI). This single
rule is what keeps feature folders from decaying into the tangle they were meant to replace.

**Where new code goes** — decide in this order:

1. Can it be a pure function? → `lib/`.
2. Does it belong to exactly one product area? → that `features/` folder.
3. Does it have three or more real consumers? → `shared/`.
4. None of the above? It is probably premature. Leave it where it is used.

## Backend target

```
backend/app/
├── main.py              # FastAPI app, Pydantic contract, endpoint wiring only
├── ai.py                # Groq calls — narration only, never scoring
└── scoring_engine/      # the entire engine, one concern per module
    ├── constants.py     # every tunable number, in one place
    ├── indicators.py    blockers.py       components.py
    ├── project_fit.py   property_value.py commercial_priority.py
    ├── explanations.py  improvement_plan.py
    └── orchestrator.py  # composes the above; no rules of its own
```

`scoring.py` is **dissolved** into `scoring_engine/`. It is currently a 918-line orchestrator
that both composes the engine and holds rules of its own (classification thresholds among
them) — which is why the same threshold exists in three places today.

**Constants rule:** every tunable number lives in `constants.py`, once. A threshold written as a
literal inside a function is a defect, even when it is correct — it is the mechanism by which
`CLASSIFICATION_THRESHOLDS` came to exist while nothing used it.

## Rules that apply to both sides

- **No obvious comments.** Comment the reason, never the mechanics.
- **No premature abstraction.** No helper, hook or context without three real consumers.
- **No error handling for impossible states.** Validate at the system boundary — request
  parsing, form submit, service entry — and trust the inside.
- **Supabase is the datastore.** The product is built to run on it — persistence, auth and RLS
  are not optional features to be mirrored elsewhere. New services target Supabase directly and
  are not expected to ship a parallel local implementation.
  - The existing `isSupabaseDataConfigured` localStorage branches are **legacy**, kept because
    removing them is its own story with a data-migration question attached (the `RutaHogar_*`
    keys hold real local state). Do not extend them; do not delete them casually.

## Decisions on record

- **No React Router.** Routing is a hand-rolled URL router with history integration, whose pure
  part lives in `lib/routing/`. `react-router-dom` was installed and never used; it is removed.
  Adopting it later is a deliberate decision, not a drive-by import.
- **Scoring is rules, not ML.** No trained model decides a score. See
  [`04-safeguards.md`](04-safeguards.md).
- **Supabase is optional by construction**, not by fallback.

## Refactor sequencing

The move ships as sequenced PRs, least entangled first, each provably behavior-preserving:

| # | Slice | Protected by |
| :- | :---- | :----------- |
| 1 | `scoring.py` → `scoring_engine/` | golden fixtures (byte-identical `POST /score` responses) |
| 2 | extract pure logic into `src/lib/` (additive, no moves) | new vitest suites |
| 3 | `services/` → features | vitest + Playwright journeys |
| 4 | components → features | Playwright journeys |
| 5 | split `styles.css` | manual pass; duplicate selectors resolved during the move |
| 6 | delete dead code and `react-router-dom` | CI |

A **merge window** precedes slices 3–5: open branches merge to `develop` first, or their owner
opts to rebase after. Slices 1–2 need no window, which is why they lead.

**A commit either moves a file or changes its behavior — never both.** A mixed commit shows up
as a delete plus a new file, hides the one line that mattered, and breaks `git log --follow`.
