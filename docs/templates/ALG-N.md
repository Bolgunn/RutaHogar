# ALG-<N> — <name>

| Field | Value |
| :---- | :---- |
| **Version** | matches `ALGORITHM_VERSION` in `backend/app/scoring_engine/constants.py` |
| **Runs on / implemented in** | backend · `scoring_engine/<module>.py` |
| **Cases** | `docs/algorithms/ALG-<N>-cases.json` |
| **Open assumptions** | count — see the log below |
| **Last changed** | YYYY-MM-DD · PR #… · what changed |

## Purpose

What this computes, when it runs, what depends on its output — and **why it is this way**: the
reasoning a future reader needs in order to change it safely, including what was rejected.

## Inputs → outputs

- **Inputs:** named fields with types and **units** — CLP, UF, ratio or percentage. Most defects in
  financial logic are unit confusion.
- **Outputs:** the exact shape returned, including every possible value of any enumerated field.

## Rules

The review surface. Every threshold, weight and cutoff as a row, readable by someone who does not
read Python.

| Condition | Effect | Code | Message shown |
| :-------- | :----- | :--- | :------------ |
| `ratio_dividendo_ingreso <= 0.25` | 100 pts | — | — |

**Source of each number:** regulator · bank's published criteria · client statement · developer
judgment. A number with no stated source cannot be defended when the client asks. Every judgment
gets a row below.

## Invariants and edge cases

**Invariants** — true for every input, asserted by tests rather than by fixture values: output
clamped to its documented range · a blocker never *raises* a classification · same input always
yields the same output (no time, randomness or AI in the path).

**Edge cases** — missing data, zero income, absent comuna, unknown contract type, conflicting
declarations: what happens, and why that is right rather than an error.

## Assumptions log

Numbers we decided ourselves. Logging one does not block a merge; **not** logging one is a review
failure.

| Assumption | Made by | Date | Would be wrong if | Status |
| :--------- | :------ | :--- | :---------------- | :----- |
| | | | | open / confirmed / changed |
