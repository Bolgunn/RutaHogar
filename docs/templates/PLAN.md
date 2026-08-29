# PLAN — HU <N>: <Title>

- **Story:** `Wiki ScoreLeads/UserStories/HU<N>-<Slug>.md` · **Actor:** <role>
- **Status:** <status> · <sprint> · <points> SP · **Depends on / Required by:** <stories + whether implemented>
- **Branch:** `feat/hu<n>-<slug>`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first: <the 3–5 files that matter — patterns to mirror, traps to avoid, ALG docs referenced>
- Stop and report if: <the ambiguities most likely to bite, beyond the standing "never invent a number">

## Goal

One paragraph: what becomes possible, for whom, and why now.

## Approach & decisions

Two or three sentences of strategy — how this is being built and what the main design choice was —
then the decisions the grill resolved, with the reasoning that stops them being re-litigated.

| Decision | Rationale |
| :------- | :-------- |
| | |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | |
| 2 | Needs RLS / multi-tenant scoping? | |
| 3 | Needs a migration? Who applies it to hosted Supabase? | |
| 4 | Changes the `POST /score` contract? | |
| 5 | Consent / privacy impact? | |

> 1 and 3 are checked against the diff by CI.

## Entities

The data and contract surface this story touches: tables, columns, RLS policies, endpoints,
service functions. What is new versus what exists, and — if a migration is needed — what happens
to rows that already exist.

## Algorithms

Referenced, never restated:

- `ALG-3` — implemented as-is, no changes.
- `ALG-5` — **modified**; see `docs/algorithms/ALG-5-project-fit.md`, updated in this PR. Numbers
  changed: … · assumptions logged: … .

**Local logic** (no ALG number, story-local): …

## Scope

**In:** …

**Out:** … — and what owns each excluded item instead.

## Steps

Ordered. Each names the exact files and functions and the concrete change.

1. …

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — … | 1, 2 | test name / fixture case / reviewer steps |

## Assumptions

Anything this plan assumes about work that does not exist yet, and how the build should stub it.
**Delete this section if there are none.**
