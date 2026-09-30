# PLAN — HU <N>: <Title>

- **Story:** HU <N> — <title>
- **Actor:** <role>
- **Source story:** `Wiki RutaHogar/UserStories/HU<N>-<Slug>.md`
- **Status / Sprint:** <status> · <sprint> · <points> SP
- **Depends on / Required by:** <stories, and whether they are implemented>
- **Branch:** `feat/hu<n>-<slug>`

---

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | |
| 2 | Needs RLS / multi-tenant scoping? | |
| 3 | Needs a migration? Who applies it to hosted Supabase? | |
| 4 | Changes the `POST /score` contract? | |
| 5 | Consent / privacy impact? | |

> CI checks these against the diff. An answer contradicted by the files touched fails the build.

## Goal

One paragraph: what becomes possible, for whom, and why now.

## Approach

Two or three sentences of strategy before the step list — how this is being built, and what the
main design choice was. A reviewer should understand the shape before reading the DAG.

## Entities

The data and contract surface this story touches. Tables, columns, RLS policies, endpoints,
service functions, storage keys. Note what is new versus what already exists, and whether a
migration is required and who applies it.

## Algorithms

Referenced, never restated:

- `ALG-3` — implemented as-is, no changes.
- `ALG-5` — **modified** by this story; see `docs/algorithms/ALG-5-project-fit.md`, updated in
  this PR. Numbers changed: … · assumptions logged: … .

### Local logic

Story-local rules that do not warrant an ALG number. Delete the section if there are none.

## In scope

## Out of scope

Echo the guardrails and story limits that apply, and name what owns each excluded item instead.

## Assumptions / unmet dependencies

What this plan assumes about work that does not exist yet, and how the build should stub it.
Delete if none.

## Steps

Ordered. Each names the exact files and functions and the concrete change.

1. …
2. …

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — … | 1, 2 | test name / fixture case / reviewer steps |
| `E2` — … | 3 | … |

## Safeguards

Which safeguards from `docs/handbook/04-safeguards.md` this story touches, and how each stays
intact. Not a copy of the safeguard — a statement of how this work respects it.

## Definition of done

- Tier 1 green: pytest (incl. golden + ALG cases) · eslint · vitest · Playwright journeys.
- Tier 2 confirmed by a reviewer who is not the author, with evidence per criterion.
- This plan and any `ALG-*` changes committed in the same PR as the code.
- No criterion silently dropped.

## Resolved decisions

The grill's conclusions and **why** — the record that stops a settled question from being
reopened by someone who was not in the session.

| Decision | Rationale |
| :------- | :-------- |
| | |
