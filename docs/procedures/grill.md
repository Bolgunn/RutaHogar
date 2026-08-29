# Procedure — the grill

Reference for phase 1 of the pipeline in [`../HANDBOOK.md`](../HANDBOOK.md). Consult it when you
are running a grill; you do not need to read it before every story.

It is written as a **procedure, not a tool feature**, so it runs the same on Claude Code, Codex,
Copilot or Antigravity. Skills in `.claude/skills/` are thin wrappers over this file; if a skill
disagrees with it, the skill is wrong.

The grill produces **no file**. Its conclusions land in `PLAN.md`.

## How to run it

1. **Read first, ask second.** Anything answerable from the repository must be answered by
   reading it. A grill that asks what the code already says wastes the only resource the design
   phase has: the author's attention.
2. **One question at a time.** A list of eight questions gets one answer.
3. **Every question carries a recommended answer** and the reasoning behind it. "What do you
   want?" is not a grill; "here is what I would do and why — do you agree?" is.
4. **Walk the tree in dependency order.** Resolve the decision that constrains other decisions
   first. If an answer invalidates something already settled, say so and reopen it.
5. **Stop when no branch is unresolved** — not when the author sounds tired. Then restate the
   resolved design and get confirmation before writing the plan.
6. **Disagree when the evidence disagrees.** The value of the grill is that a bad assumption dies
   here rather than in review.

## The five standing questions

They live as five rows in [`../templates/PLAN.md`](../templates/PLAN.md) and are answered while
writing the plan. Two are machine-checked against the diff — **scoring/ALG** (paths under
`backend/app/scoring_engine/`) and **migration** (paths under `supabase/migrations/`). The other
three are prompts for thought, not gates, and the handbook says so rather than implying CI catches
everything.

1. **Does it touch scoring?** Which `ALG-N`, and do any numbers change?
2. **Does it need RLS or multi-tenant scoping?**
3. **Does it need a database migration, and who applies it?** Migrations are **not** auto-applied
   to hosted Supabase — an unapplied one passes review and breaks production.
4. **Does it change the `POST /score` contract?**
5. **What is the consent / privacy impact?**

## Question bank

Not a checklist to recite — a floor. Skip what the repository already answers; follow anything
that turns out to be load-bearing.

### Scope and intent
- What does this story make possible that is impossible today? Who is the actor?
- Which acceptance criteria (`E1…En`) exist, and is each observable by a second person?
- What is deliberately *out* of scope, and which guardrail or story owns it instead?
- Does any dependency (`Depends on`) not exist yet? What does the plan assume about it?

### Entities and contracts
- Which tables, columns, RLS policies or endpoints does this touch or add?
- Does it change data anyone has already stored?
- What is the shape of the data crossing each boundary — form, service, endpoint, database?
- If a migration is needed: is it reversible, what happens to rows that already exist, and who
  runs `supabase db push` against the hosted project?

### Algorithms
- Is there logic here that someone will want to tune later? Then it is an algorithm, not an
  implementation detail.
- Is it new, or does it amend an existing `ALG-N`?
- Where does each number come from — a regulator, a bank's published criteria, a client
  statement, or a developer judgment? A judgment is an **assumption** and gets logged as one.
- Which invariants must hold for every possible input?

### Architecture
- Where do the new files go under the handbook's target structure?
- Does any logic belong in `src/lib/` (pure, testable) rather than in a component?
- Does this need a cross-feature import? If yes, the shared piece belongs in `lib/` or `shared/`
  — features never import each other.

### Verification
- How is each criterion verified: automated test, fixture case, or reviewer steps?
- What would a reviewer have to do to be convinced? Is that reasonable to ask?
- What could break silently — something no existing test would catch?

### Risk
- What is the worst outcome if this ships wrong? Who notices — the user, the executive, or the
  client?
- Is there anything here we cannot undo once it is in production data?
- Which in-flight branches touch the same files, and does this need coordination?

## Recording the outcome

Everything decided that still matters afterwards goes into `PLAN.md`: the five answers, and the
resolved decisions **with their rationale** in `## Approach & decisions`.

A decision whose reasoning was not recorded will be re-litigated in three weeks by someone who
was not in the session.
