# 00 — Workflow

**Status: draft, pending ratification.** Nothing here is enforced until the team approves it.

This handbook is the single source of truth for how we build RutaHogar. If `CLAUDE.md`,
`AGENTS.md`, `.github/copilot-instructions.md`, a skill, or a comment disagrees with it, the
handbook wins and the other file is a bug.

We work in a **structured, spec-driven** way, adapted from
[Structured Prompt-Driven Development](https://martinfowler.com/articles/structured-prompt-driven/).
The core idea we take from it: **the specification is a delivery artifact** — written before the
code, reviewed like the code, and kept true afterwards. What we do *not* take is its
single-document, same-session model; we use a plan and a fresh build session instead, because
that is what has worked for us.

## The pipeline

Every story goes through all six phases. There are no fast lanes — a uniform pipeline is what
lets six people pick up each other's work mid-flight.

| # | Phase | Produces | Who |
| :- | :---- | :------- | :-- |
| 1 | **Grill** | resolved design (in-session only) | author + their agent |
| 2 | **Algorithms** | `docs/algorithms/ALG-N.md` + `ALG-N-cases.json`, new or edited | author, human-written |
| 3 | **Plan** | `docs/stories/<HU>/PLAN.md` | author |
| 4 | **Kickoff** | `docs/stories/<HU>/KICKOFF.md` (ephemeral, gitignored) | author |
| 5 | **Build** | code, in a **fresh session** | agent, in any toolchain |
| 6 | **Review** | merged PR | a reviewer who is not the author |

### 1 — Grill

Interview the design until every open decision is resolved, one question at a time. The
procedure and the question bank are in [`01-grill.md`](01-grill.md). This phase is where scope,
risk and edge cases get discovered — it is cheaper to change a decision here than anywhere
downstream.

The grill must answer the **five standing questions** ([`01-grill.md`](01-grill.md)); their
answers are recorded in the plan and checked against the diff by CI.

### 2 — Algorithms

If the story touches shared, business-consequential logic, its algorithm is written or amended
**before any code exists**, by a human, following [`05-algorithms.md`](05-algorithms.md).

**The developer decides the numbers.** We do not block a story waiting for a business owner to
approve a threshold — that is not how we work, and a gate nobody can clear on time is a gate
people route around. What we do instead: **every number that rests on a developer judgment is
written down as an assumption** in the ALG document's assumptions log — what was assumed, by
whom, when, and what would have to be true for it to be right.

The log is what makes the judgment reversible. It gives the per-entrega reconciliation a
concrete list to walk, and it gives the client a specific question to answer ("we assumed a lead
is *Alto* from 75 — is that where you want it?") instead of a vague invitation to review the
scoring.

The build session **implements the algorithm and never invents numbers.** If it finds the
algorithm wrong, missing, or ambiguous, it **stops and reports** — it does not improvise. That
rule is the whole reason this phase exists.

### 3 — Plan

`PLAN.md` is written from the resolved design, using
[`templates/PLAN.md`](templates/PLAN.md). It is committed on the story branch and **reviewed in
the PR alongside the code it produced** — a reviewer may reject the design, not only the code.

The plan **references** algorithms by number and never restates their rules. Two documents
cannot contradict each other if only one of them is allowed to state the rule.

### 4 — Kickoff

`KICKOFF.md` is a self-contained prompt for a fresh session. It is a paste buffer, not an
artifact: it is **gitignored** and may be regenerated or deleted at will. Never let it carry a
rule that is not in the plan or the handbook.

### 5 — Build

Build in a **new session**, started from `KICKOFF.md`. A grill session ends with a context full
of rejected options; building in it is measurably worse than starting clean.

Any toolchain is acceptable — Claude Code, Codex, Copilot, Antigravity, or hands on keyboard.
**The process binds on the artifacts and the gates, not on the tool.** Anything that produces
the artifacts in this table and passes the gates in [`03-norms.md`](03-norms.md) is compliant.

### 6 — Review

Two tiers. See [`03-norms.md`](03-norms.md) for the full gate list.

- **Tier 1 — automated.** CI must be green **before** review is requested. It is not a
  reviewer's job to notice a failing test.
- **Tier 2 — human, run by the reviewer, not the author.** Every acceptance criterion `E1…En`
  in the plan's criteria map is confirmed in the running app, and each row carries **evidence**:
  a test name, or concrete steps plus what was observed. Not a checkmark.

Self-certified acceptance criteria are how work merges with known gaps. A second person either
reproduces the criterion or cannot.

## Definition of done

A story is done when **all** of these hold:

- Tier 1 green.
- Tier 2 confirmed by a reviewer who is not the author, with evidence per criterion.
- `PLAN.md` and any `ALG-*` changes committed **in the same PR** as the code.
- The five standing questions answered, and consistent with what the diff actually touches.
- No criterion silently dropped. Dropping one is a plan edit with a stated reason.

## When the build gets it wrong

An agentic build run reporting "done" is a **claim, not evidence**. Most runs land something
incomplete or subtly wrong, and correcting them is where a large share of the real work happens
— so it gets rules of its own instead of being left to improvisation. This is not a seventh
phase; it is what phases 5 and 6 actually look like in practice.

**First, find which layer was wrong.** Fixing at the wrong layer is how a plan quietly stops
describing the code.

| What was wrong | Fix it here |
| :------------- | :---------- |
| The code does not do what the plan says | the code |
| The plan's design did not survive contact with reality | **amend `PLAN.md` in the same PR**, stating what changed and why |
| The algorithm was wrong, missing or ambiguous | **stop**, amend the `ALG-N` document and its cases, then resume the build |
| The handbook rule was wrong | amend the handbook in the same PR ([`03-norms.md`](03-norms.md)) |

### Before merge — same branch, same PR

- Fixes stay on the story branch. A half-finished story does not become two stories.
- **Never fix forward by inventing a number.** If the build needs a threshold the ALG document
  does not give it, that is an algorithm gap, not a coding decision.
- **Every fix adds the test or fixture case that would have caught it.** A bug that reached
  review is evidence that the gates have a hole exactly there; patching the code and not the
  gate guarantees the next one gets through too.
- **Know when to restart instead of steering.** If the fix list is longer than the plan's step
  list, discard the branch and re-run the build from a corrected plan and a fresh kickoff.
  Negotiating with a session that has the wrong model of the problem in its context costs more
  than starting clean, every time.

### After merge — a `fix/` branch

- No grill and no story file, but the PR body carries a **five-line stub**: symptom · root cause
  · fix · blast radius · the regression test.
- **No bugfix merges without the test that would have caught it.** This is how the suite grows
  where it is actually weak rather than where it was easy to write.
- If the root cause is an algorithm or a handbook rule, the document is amended in that same PR
  — a bugfix is the most common way we discover a document is wrong.
- Production hotfixes go to `main` and are back-merged to `develop` immediately.

### Who fixes it

The author of the story fixes their own bugs by default. A reviewer who finds a defect reports
it; they do not inherit it. Otherwise reviewing becomes the expensive job and nobody volunteers.

## When reality diverges

Both directions, always inside the PR that discovers it, and never by writing a third document:

- **Intent changed** — the rule should be different: amend the handbook or the ALG doc
  **first**, in the same PR as the code. The document leads.
- **Reality diverged** — the code does something no document describes: either fix the code to
  match the document or amend the document to match reality, **in that PR**. Not a TODO, not an
  issue, not a correcting file.
- **A rule broken twice is a bad rule.** Amend or delete it; do not add enforcement.

Once per entrega, a recurring issue triggers a reconciliation pass: walk the handbook and the
ALG docs against the code and close the gaps. Slow drift is invisible day to day and obvious in
one deliberate pass.

## Where things live

| Path | Holds |
| :--- | :---- |
| `docs/handbook/` | these rules — the only binding source |
| `docs/algorithms/` | `ALG-N.md` + `ALG-N-cases.json` |
| `docs/stories/<HU>/PLAN.md` | one plan per story, git-tracked |
| `docs/stories/<HU>/KICKOFF.md` | ephemeral, **gitignored** |
| `Wiki RutaHogar/` | product and requirements: user stories, actors, risks, entregas |
| `AGENTS.md`, `.claude/CLAUDE.md`, `.github/copilot-instructions.md` | pointers here; **no rules of their own** |

`Wiki RutaHogar/` is the product domain and `docs/` is the engineering domain. Engineering
artifacts do not go in the wiki, and requirements do not go in `docs/`.
