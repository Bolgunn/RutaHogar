# Procedure — authoring an ALG document

Detail for the Algorithms section of [`../HANDBOOK.md`](../HANDBOOK.md), which holds the binding
rules. This file is how-to: what to write, in what order, and what already needs fixing.

Template: [`../templates/ALG-N.md`](../templates/ALG-N.md) +
[`../templates/ALG-N-cases.json`](../templates/ALG-N-cases.json).

## The planned set

Seeded from the existing engine. `backend/app/REGLAS_SCORING.md` — which already translates the
engine into structured Spanish rules with CMF, ChileAtiende and BancoEstado sources — is the
**primary source material for ALG-1 and ALG-3**, and is absorbed into them rather than maintained
alongside.

| ID | Covers | Module |
| :- | :----- | :----- |
| ALG-1 | component scoring + weights | `components.py`, `constants.py` |
| ALG-2 | blockers and severities | `blockers.py` |
| ALG-3 | classification thresholds, clamping, blocker downgrade | `constants.py`, orchestrator |
| ALG-4 | commercial priority and actions | `commercial_priority.py` |
| ALG-5 | project fit | `project_fit.py` |
| ALG-6 | property value / UF resolution | `property_value.py` |
| ALG-7 | improvement plan generation | `improvement_plan.py` |

Written since, outside the seeded set:

| ID | Covers | Module |
| :- | :----- | :----- |
| ALG-9 | preference-independent purchase capacity | `purchase_capacity.py`, `constants.py` |
| ALG-10 | lead–project affinity | **frontend** `src/lib/matching/leadProjectMatching.js` |

**ALG-8 is claimed by HU 8** — `housing_benefits.py`, the housing-benefits detector (FOGAES, DS49,
PADHI, DS1, Leasing, Ley 21.748), merged to `develop` in PR #80. Its row is deliberately **not**
added here: HU 8 adds it to the seeded table above, and duplicating it would conflict on merge. HU 10
renumbered off ALG-8 rather than colliding with it.

ALG-10 is the first ALG whose cases are asserted by **vitest** rather than pytest, because it governs
frontend code. The runner follows the module, not the tier.

## Writing one

1. **Start from the code, then decide what it *should* say.** Read the module and write down what
   it actually does — including the branches nobody documented. Then decide, with the author, which
   parts are intended.
2. **Fill the rules table first.** It is the hardest and most valuable part: every threshold,
   weight and cutoff as a row, with the message the user sees. If a row cannot be stated without
   reading Python, rewrite it until it can.
3. **Name the source of every number.** Regulator · bank's published criteria · client statement ·
   developer judgment. Every judgment gets a row in the assumptions log — that is the whole point
   of not blocking on business approval.
4. **Write the invariants as invariants**, not examples: output clamped to range, a blocker never
   *raises* a classification, same input always yields the same output (no time, randomness or AI
   in the path). These become tests that survive retuning.
5. **Write 5–10 cases**, one per branch of your table plus the edge cases you named. Keep them
   small and legible; a case nobody can read is a case nobody will fix when it fails.
6. **Move every literal into `constants.py`** as you go. A threshold inline in a function is a
   defect even when the value is right.

## Promotion from story-local logic

Story-local logic lives in the plan and gets no number. When it gains a **second consumer**, the
PR that adds that consumer promotes it into `docs/algorithms/`. The old plan is left untouched —
it is history, not a live document.

## Known drift to resolve while seeding

Recorded so the first author does not rediscover it. These are backlog items, not rules.

- **Classification thresholds exist in three places with two values.** The engine hardcodes
  `>= 75` / `>= 50`; `CLASSIFICATION_THRESHOLDS` in `constants.py` says the same but **nothing
  imports it**; `CLAUDE.md` documents `>= 70` / `>= 40` from the retired additive model. ALG-3
  establishes the true value — and whether 70 was ever quoted to the client.
- **`"Requiere antecedentes"`** is returned by the engine, documented nowhere, and not enumerated
  by the executive dashboard's classification filter.
- **`honorarios_variable`** is in `VALID_CONTRACT_TYPES` in `main.py`, but the docstring two lines
  below it and `CLAUDE.md` both list only three contract types.
- **`ALGORITHM_VERSION = "1.1.0-prep"`** carries a comment saying the layers are not integrated,
  while the orchestrator imports and calls all nine of them. `REGLAS_SCORING.md` documents version
  `1.0.1`. One of these is true.
- **`REGLAS_SCORING.md` lives on `main` only**, not on `develop`.
