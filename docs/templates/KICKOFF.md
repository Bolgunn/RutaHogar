<!--
Template for docs/stories/HU<N>/KICKOFF.md — phase 4 of docs/handbook/00-workflow.md.

A kickoff is a self-contained prompt for a fresh build session. It is a paste buffer, not an
artifact: it is gitignored and may be regenerated or deleted at will. It points; it never
states a rule of its own — if a rule is missing here, it belongs in the plan or the handbook.
Fill every placeholder, delete sections that do not apply, then paste into a new session.
-->

# KICKOFF — HU <N>: <Title>

You are building story **HU <N> — <title>** in a fresh session. You have no prior context;
everything you need is in this prompt plus the files it points to.

## Story facts

- **Story:** HU <N> — <title>
- **Plan:** `docs/stories/HU<N>/PLAN.md` — the binding spec for this story. Read it first,
  in full.
- **Source story:** `Wiki RutaHogar/UserStories/HU<N>-<Slug>.md`
- **Branch:** `feat/hu<n>-<slug>` — all commits go here.
- **Depends on / stubs:** <stories not yet implemented, and how the plan says to stub them>.
  Delete if none.

## Read first, in order

1. `docs/stories/HU<N>/PLAN.md`
2. <ALG documents referenced by the plan, e.g. `docs/algorithms/ALG-N-<slug>.md` + their
   `-cases.json`>
3. `docs/handbook/04-safeguards.md` — only if the plan names safeguards
4. <anything else the build touches: existing module, contract, fixture set>

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
