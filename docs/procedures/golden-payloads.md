# Procedure — golden payloads

The `POST /score` requests frozen in `backend/tests/golden/`. Referenced from the Testing section
of [`../HANDBOOK.md`](../HANDBOOK.md).

They are a **behavior-preservation baseline, not branch coverage** — they pin the main outcome
paths so a refactor can be proved not to have moved them. They do **not** exercise every branch
of the engine, and should not be described as if they do: `blockers.py` alone has eleven distinct
codes, and there are four contract types, four continuity tiers, six commercial actions and four
project-fit classes to combine with them.

Branch coverage belongs to the per-algorithm `ALG-N-cases.json` files, where each algorithm's
branches are enumerated against its own rules table, and it is **measured rather than asserted** —
`pytest --cov=backend/app/scoring_engine` reports it, so the gap is visible instead of claimed.

## The set

| # | Payload | Exercises |
| :- | :------ | :-------- |
| 1 | `perfil_solido` — high income, low debt, `indefinido`, `mas_3_anios`, ample ahorro | the happy path: every component scoring well, no blocker |
| 2 | `morosidad_vigente` — payload 1 with `morosidad_actual: "si"` + monto + antigüedad | the blocker downgrade path (`Alto` → `Medio`) |
| 3 | `morosidad_incierta` — `morosidad_actual: "no_lo_se"` | the partial-penalty branch |
| 4 | `pie_insuficiente` — ahorro far below the comuna's minimum | the down-payment blocker + savings plan |
| 5 | `deuda_alta` — deuda above 40% of ingreso | the debt blocker + reduction plan |
| 6 | `contrato_precario` — `independiente` + `menos_6_meses` | the stability penalties, stacked |
| 7 | `complemento_completo` — valid complemento de renta | the complemento bonus path |
| 8 | `complemento_incompleto` — complemento declared, fields missing | **`"Requiere antecedentes"`** — the classification most likely to regress unnoticed |
| 9 | `sin_comuna` — `comuna_objetivo` omitted | the optional-field path and the fallback property value |
| 10 | `limites` — zeroes and boundary values across the numeric fields | clamping, division guards, no crash on degenerate input |
| 11 | `sin_groq` — payload 1 with no `GROQ_API_KEY` in the environment | proves S1: the score is identical with and without AI |

Every payload is valid against the contract (`consentimiento: true`, all required fields present).
Contract *violations* are endpoint-validation tests, not golden fixtures.

## How the set grows

When a refactor turns out to have moved something the baseline did not pin, **the regression that
escaped becomes payload twelve.** That is the honest way this list reaches good coverage — by
paying for each gap once, rather than by claiming completeness up front.

## Capturing them

Capture **before** a refactor, against the current engine, and store the full JSON response per
payload. After the refactor the responses must be byte-identical or the build is red. A deliberate
behavior change means updating a golden file **in the same PR as the code and the ALG document
that motivated it** — never as a follow-up.
