# RutaHogar — Engineering Handbook

**Status: draft, pending ratification.** Reviewed as a PR, then walked through in one team
meeting. Until then, nothing here is enforced.

> **The product is RutaHogar.** The repository, the Vercel project and the `Wiki RutaHogar/`
> vault still carry the old *RutaHogar* name; those are paths and identifiers, not the product,
> and they are renamed only by a deliberate story. In new prose, write **RutaHogar**.

This is the **single source of truth** for how we build RutaHogar. If `CLAUDE.md`, `AGENTS.md`,
`.github/copilot-instructions.md`, a skill, or a code comment disagrees with it, the handbook
wins and the other file is a bug to fix — not a second opinion to keep.

## Contents

| File | Read it when |
| :--- | :----------- |
| [`00-workflow.md`](00-workflow.md) | starting any story — the pipeline, the DoD, the drift rule |
| [`01-grill.md`](01-grill.md) | running the design phase — procedure, standing questions, question bank |
| [`02-architecture.md`](02-architecture.md) | deciding where a file goes |
| [`03-norms.md`](03-norms.md) | language, branches, commits, PRs, gates, testing, amendments |
| [`04-safeguards.md`](04-safeguards.md) | before changing scoring, the contract, or anything touching personal data |
| [`05-algorithms.md`](05-algorithms.md) | writing or changing business logic with numbers in it |

Templates in [`templates/`](templates/): `PLAN.md`, `ALG-N.md`, `ALG-N-cases.json`,
`pull-request.md`.

## The short version

1. **Grill** the design before writing code.
2. **Write the algorithm** — document and fixtures — before implementing it. Never let a build
   session invent a number.
3. **Write the plan**, commit it, and let it be reviewed alongside the code.
4. **Build in a fresh session**, from a kickoff prompt.
5. **Green CI before review.** A reviewer who is not the author verifies every acceptance
   criterion in the running app.
6. **When the build gets it wrong, fix it at the layer that was wrong** — code, plan, or
   algorithm — and add the test that would have caught it.
7. **When reality diverges, fix the document in the same PR.** Never write a second document to
   correct the first.

## Why this exists

The project outgrew its MVP phase. The symptom was not slow delivery — it was that the same rule
had come to exist in several places with different values, and the only authoritative version
was the code. The classification threshold for a `Alto` lead, which decides whether an executive
ever sees a lead, was documented three ways at once.

This handbook is the mechanism for having one version of each rule, written where a person can
read it and a machine can check it.

## Any toolchain

Some of us use Claude Code, some Codex, some Copilot or Antigravity. The process binds on the
**artifacts and the gates**, never on the tool: anything that produces a resolved design, an
up-to-date ALG document, a committed plan, and code that passes the gates is compliant. Skills
in `.claude/skills/` are a convenience for one toolchain, and a skill that disagrees with this
handbook is a bug in the skill.
