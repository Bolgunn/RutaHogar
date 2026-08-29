# RutaHogar — Engineering Handbook

**Status: draft, pending ratification.** Nothing here is enforced until the team approves it.

This is the **single binding source** for how we build RutaHogar. If `CLAUDE.md`, `AGENTS.md`,
`.github/copilot-instructions.md`, a skill, or a code comment disagrees with it, this file wins
and the other one is a bug to fix — not a second opinion to keep.

> The product is **RutaHogar**. The repository, the Vercel project and the `Wiki ScoreLeads/`
> vault still carry the old *ScoreLeads* name; those are paths, not the product.

**Why this exists.** The problem was never delivery speed. It was that the same rule came to
exist in several places with different values, and the only authoritative copy was the code. The
threshold that decides whether a lead is `Alto` — and therefore whether an executive ever sees
it — was documented three ways at once. This handbook is the mechanism for having one version of
each rule, written where a person can read it and a machine can check it.

**Any toolchain.** Some of us use Claude Code, some Codex, some Copilot or Antigravity. The
process binds on the **artifacts and the gates, never on the tool**. Anything that produces the
artifacts below and passes the gates is compliant. Skills in `.claude/skills/` are convenience
wrappers; a skill that disagrees with this handbook is a bug in the skill.

---

## The pipeline

Every story, five phases. No fast lane — a uniform pipeline is what lets six people pick up each
other's work mid-flight.

| # | Phase | Produces |
| :- | :---- | :------- |
| 1 | **Grill** | a resolved design (no file — see [procedures/grill.md](procedures/grill.md)) |
| 2 | **Algorithms** | `docs/algorithms/ALG-N.md` + `ALG-N-cases.json`, if shared logic is touched |
| 3 | **Plan** | `docs/stories/<HU>/PLAN.md` from [templates/PLAN.md](templates/PLAN.md) |
| 4 | **Build** | code, in a **fresh session**, started from the plan |
| 5 | **Review** | a merged PR, verified by someone who is not the author |

**Grill** resolves every open decision before code exists, one question at a time, with a
recommended answer for each. Anything the repository can answer is answered by reading, not
asking.

**Algorithms** are written *before* implementation, by a human. See [Algorithms](#algorithms).

**The plan** is committed on the story branch and **reviewed in the PR alongside the code it
produced** — a reviewer may reject the design, not only the code. It references algorithms by
number and never restates their rules: two documents cannot contradict each other if only one is
allowed to state the rule.

**Review** is two tiers. Tier 1 is automated and must be green **before** review is requested —
it is not a reviewer's job to notice a failing test. Tier 2 is human, **run by the reviewer**,
against the running app.

## Starting a build session

Build in a **new session**. A grill session ends with a context full of rejected options, and
building in it is measurably worse than starting clean. There is no separate handoff file: the
plan's `## Start here` block is the handoff.

Standing instructions for any build session — the same every time, so they live here and are
never copied into a story:

1. Read `docs/stories/<HU>/PLAN.md` in full, plus every `ALG-N` it references. Do not rely on
   any prior conversation.
2. Create the branch the plan names. **Never commit to `main` or `develop`.**
3. Work the steps in order. Follow the plan; it is the specification, not a suggestion.
4. **Never invent a number.** If an algorithm is missing, ambiguous or wrong, **stop and
   report** — that is an algorithm gap, not a coding decision.
5. Finish by verifying every acceptance criterion in the plan's map, and say plainly which ones
   you could not verify yourself.

## When the build gets it wrong

An agentic run reporting "done" is a **claim, not evidence**. Most runs land something incomplete
or subtly wrong, and correcting them is where much of the real work happens.

**Find which layer was wrong** — fixing at the wrong layer is how a plan quietly stops describing
the code:

| What was wrong | Fix it here |
| :------------- | :---------- |
| The code does not do what the plan says | the code |
| The plan's design did not survive contact with reality | **amend `PLAN.md` in the same PR**, saying what changed and why |
| The algorithm was wrong, missing or ambiguous | **stop**, amend the `ALG-N` and its cases, then resume |
| The handbook rule was wrong | amend this file in the same PR |

**Before merge**, fixes stay on the story branch — a half-finished story does not become two
stories. Every fix adds the test or fixture case that would have caught it: a bug that reached
review means the gates have a hole exactly there. And know when to **restart instead of steer** —
if the fix list is longer than the plan's step list, discard the branch and re-run the build from
a corrected plan. Negotiating with a session that has the wrong model of the problem costs more
than starting clean.

**After merge**, a `fix/` branch. No grill, no story file, but the PR body carries five lines:
symptom · root cause · fix · blast radius · the regression test. **No bugfix merges without the
test that would have caught it** — that is how the suite grows where it is actually weak.
Production hotfixes go to `main` and are back-merged to `develop` immediately.

**Who fixes it:** the story's author. A reviewer who finds a defect reports it and does not
inherit it, or reviewing becomes the expensive job nobody volunteers for.

## Definition of done

- **Tier 1 green:** pytest (engine, golden fixtures, ALG cases) · eslint · vitest · the three
  Playwright journeys · commit lint · the ALG path check.
- **Tier 2 confirmed by a reviewer who is not the author**, with **evidence** per acceptance
  criterion — a test name, or steps taken plus what was observed. Not a checkmark.
- `PLAN.md` and any `ALG-*` changes committed **in the same PR** as the code.
- The plan's five standing questions answered, and consistent with what the diff touches.
- No criterion silently dropped. Dropping one is a plan edit with a stated reason.

## Algorithms

An **algorithm** is business logic with numbers in it that someone will eventually want to argue
about. It earns `docs/algorithms/ALG-N-<slug>.md` if it is business-consequential, has tunable
numbers, or has more than one consumer — in practice everything in `backend/app/scoring_engine/`
plus classification and commercial priority. Everything else is **story-local logic**: it stays
in the plan, gets no number, and is promoted only when a second consumer appears.

**Three layers, because none can do the others' job** (detail:
[procedures/algorithms.md](procedures/algorithms.md)):

1. **Narrative** — purpose, inputs → outputs, invariants, edge cases, why it is this way.
2. **Rules table** — every threshold, weight and cutoff as a row. The review surface: readable by
   someone who does not read Python, and what we show a client who needs to confirm a number.
3. **`ALG-N-cases.json`** — fixtures the test suite asserts. This is what makes it governance
   rather than description: change a number without changing its document and **the build goes
   red**.

**Rules:**

- Written **before** the code, by a human or human assisted generative ai, committed on the story branch.
- The build session implements it and **never invents a number**.
- The plan **references, never restates**.
- **The developer decides the numbers.** We do not block a story waiting for business approval —
  a gate nobody can clear on time is a gate people route around. Instead, every number resting on
  a developer judgment goes in that algorithm's **assumptions log**: what was assumed, by whom,
  when, and what would have to be true for it to be right. The reviewer confirms it was *logged*,
  not that the value is correct. The log gives the per-entrega reconciliation a concrete list, and
  gives the client an answerable question — *"we assumed Alto starts at 75; is that where you want
  it?"*
- **Every tunable lives in `constants.py`, once.** A literal threshold inside a function is a
  defect even when the value is right.
- `ALGORITHM_VERSION` moves when a rule changes.

## Architecture

**Two layers, everywhere.** *Pure logic* — no framework, no I/O, no database, testable with plain
function calls, and the only place an algorithm may be implemented. *Everything else* —
components, services, endpoints — wires the pure layer to the world.

```
frontend/src/
├── features/     auth · scoring · leads · tracking · academy · admin
├── lib/          PURE: routing, score-form validation/payload, …
├── shared/       cross-feature UI + helpers (3+ real consumers)
└── services/supabase.ts

backend/app/
├── main.py             FastAPI app, Pydantic contract, wiring only
├── ai.py               Groq calls — narration only, never scoring
└── scoring_engine/     the whole engine; constants.py holds every tunable
```

**The import rule, enforced by ESLint:** a feature may import from `lib/`, `shared/` and itself;
**a feature never imports another feature**; `lib/` imports only `lib/`. If two features need the
same thing it moves to `lib/` (logic) or `shared/` (UI).

**Where new code goes**, in order: can it be a pure function? → `lib/`. Belongs to one product
area? → that feature. Three or more real consumers? → `shared/`. None of the above? It is
probably premature.

**Also:** comment the reason, never the mechanics · no helper, hook or context without three real
consumers · validate at the boundary and trust the inside · **a commit either moves a file or
changes its behavior, never both** (a mixed commit hides the one line that mattered and breaks
`git log --follow`).

**On record:** no React Router — routing is our own URL router whose pure part lives in
`lib/routing/`. **Supabase is the datastore**, not an optional one; the existing
`isSupabaseDataConfigured` localStorage branches are **legacy** — do not extend them, and do not
delete them casually, because the `scoreleads_*` keys hold real local state.

## Norms

**Language.** English for the handbook, plans, ALG documents, commit subjects and code
identifiers. Spanish for wiki product docs, informes de entrega and UI copy. **Domain vocabulary
is Spanish everywhere and never translated** — `ingreso_mensual`, `clasificacion`, `Alto`,
`Requiere antecedentes`. Generic programming constructs stay English. Client-facing sign-off is a
Spanish summary in the entrega, never a Spanish duplicate of an English document.

**Branches.** `develop` integrates and is gated by CI. `main` is deployable — Vercel deploys
production from it — and is promoted from `develop` **at each entrega, plus hotfixes**. One branch
per story: `feat/hu17-project-catalog`. **No per-person branches**; a branch scoped to a person
cannot have a definition of done.

**Commits.** `feat|fix|docs|refactor|chore|test(scope): subject`, checked in CI. Imperative, one
concern, English subject with Spanish domain terms verbatim. If the subject needs "and", it is two
commits.

**Pull requests.** Base `develop`. **1 approving review**, and the **reviewer is never the
author** — a rotating pool, claimed first-come. PRs touching `scoring_engine/`, an `ALG-*` or the
`POST /score` contract also get a CTO code review; **no business sign-off blocks a merge**, but
judgments must be in the assumptions log. Template:
[templates/pull-request.md](templates/pull-request.md).

**Testing.** Golden fixtures in `backend/tests/golden/` freeze `POST /score` responses so a
refactor can be *proved* behavior-preserving (the payload set:
[procedures/golden-payloads.md](procedures/golden-payloads.md)). ALG cases are asserted by the
suite. **Tests assert invariants, not literals** wherever possible — retuning a number should not
require rewriting the suite. `src/lib/` is unit-tested; components are not, unless a component
holds logic that belonged in `lib/`.

**Secrets.** No keys, tokens or credentials in source, ever, including examples. No bank
credentials and no sensitive documents stored, in any form.

**Gates are enabled in three steps:** reporting only → blocking → approvals required. Turning
them all on at once, on top of in-flight branches, teaches the team that the process is the thing
that broke everything.

## Safeguards

Non-negotiable. Not resolved by a grill — relaxing one is a conversation with the team and the
client. Each names its proof; *(planned)* means the proof lands in phase 2.

| # | Safeguard | Proof |
| :- | :-------- | :---- |
| S1 | **The AI never decides the score.** It narrates an already-computed result; it never calculates, adjusts, reorders or overrides a score, classification, blocker or priority. | `test_score_does_not_require_groq_api_key`, extended to assert identical scores with and without AI *(planned)* |
| S2 | **The `POST /score` contract is frozen.** Changing it is its own story, with both sides shipping together. | golden fixtures *(planned)* |
| S3 | **Scoring is rules, not ML.** No trained model computes or adjusts a score. | ALG path check *(planned)* + review |
| S4 | **The score is clamped to [0,100] and always classified** — no null, no out-of-range value, no undocumented class. | invariant tests + ALG cases *(planned)* |
| S5 | **Financial data is held under explicit consent.** `consentimiento` must be `true`; no external financial data (CMF, Dicom, banks, bureaus) without explicit consent and approved scope; ARCO requests stay serviceable. | contract validation + ARCO journey *(planned)* |
| S6 | **Leads are scoped to their inmobiliaria.** Every table holding lead or profile data has an RLS policy; a new table without one does not ship. | standing question 2, checked against the diff *(planned)* |
| S7 | **The system does not approve credit.** Orientative pre-qualification only; no approval, no guarantee, no personalized financial advice. Every surface showing a score says so. | acceptance criteria of the result view |
| S8 | **No credentials in source, no sensitive documents stored.** Every env var optional locally. | secret scanning *(planned)* + review |

**Out of scope until explicitly commissioned** — scope limits, not safeguards, recorded so a grill
does not quietly adopt one: CRM integration · stress/rate simulation beyond documented stories ·
new authentication systems · external APIs (CMF, Dicom, banks) · document OCR · trained ML models
for scoring.

## When reality diverges

Always inside the PR that discovers it, and never by writing a third document:

- **Intent changed** — amend this handbook or the ALG **first**, in the same PR as the code. The
  document leads.
- **Reality diverged** — the code does something no document describes: fix the code or amend the
  document, **in that PR**. Not a TODO, not an issue, not a correcting file.
- **A rule broken twice is a bad rule.** Amend or delete it; do not add enforcement.

**Amending this handbook** is a PR labeled `docs(handbook):` with one approval, and it must state
**what changed in reality** that motivates it. No amendment without a cause. **Any norm CI can
check, CI checks**; a norm nobody can check and no reviewer looks for gets deleted at the next
amendment, because decoration makes the enforceable rules look optional too.

Once per entrega a recurring issue triggers a **reconciliation pass**: walk this handbook and the
ALG documents against the code, and close the open assumptions. Slow drift is invisible day to day
and obvious in one deliberate pass.

## Where things live

| Path | Holds |
| :--- | :---- |
| `docs/HANDBOOK.md` | this file — the only binding source |
| `docs/procedures/` | how-to detail, consulted while working: grill, algorithms, golden payloads |
| `docs/templates/` | `PLAN.md`, `ALG-N.md`, `ALG-N-cases.json`, `pull-request.md` |
| `docs/algorithms/` | `ALG-N.md` + `ALG-N-cases.json` |
| `docs/stories/<HU>/PLAN.md` | one plan per story, git-tracked, reviewed in its PR |
| `Wiki ScoreLeads/` | product and requirements: user stories, actors, risks, entregas |
| `AGENTS.md`, `.claude/CLAUDE.md`, `.github/copilot-instructions.md` | pointers here; **no rules of their own** |
