# ALG-17 — Co-debtor consent resolution

| Field | Value |
| :-- | :-- |
| **Version** | `1.1.0` |
| **Owner story** | HU18 — Participación y consentimiento del co-deudor |
| **Cases** | `docs/algorithms/ALG-17-cases.json` |
| **Status** | Implemented as pure source-resolution logic |

## Purpose

ALG-17 selects the complementary-income source and provenance for a future lead evaluation. It changes no scoring weights, thresholds, caps, blockers, classifications, monetary rules, or public score contract. It distinguishes lead-declared data from the five fields personally supplied and treatment-consented to by the co-debtor.

The lead may receive a referential result while no valid co-debtor confirmation exists. A valid confirmation prevails for later evaluations, but confirmation itself does not recalculate. A later lead-requested update may persist a normal historical prequalification with reason `confirmacion_codeudor`. Revocation affects only future selection; historic snapshots remain intact.

## Inputs → outputs

### Inputs

| Field | Source | Notes |
| :-- | :-- | :-- |
| Lead-declared complement | Lead evaluation / invitation | Five financial fields plus `relacion_complementario`. |
| Invitation state and timestamps | `co_debtor_invitations` | `pending`, `expired`, `confirmed`, `revoked`, or `replaced`; time is server supplied. |
| Token validity and submission | Server-side token flow | The resolver receives facts, never a raw token. |
| Co-debtor confirmation | Dedicated confirmation record | The co-debtor's five fields; relation remains lead-declared. |
| Treatment consent and revocation | Separate consent lifecycle | Consent is required to select confirmed values; revocation excludes them. |

### Outputs

| Key | Values | Meaning |
| :-- | :-- | :-- |
| `complement_source` | `lead_declared`, `co_debtor_confirmed`, `excluded_after_revocation` | Only source eligible for a future evaluation. |
| `complement_confirmation_status` | `not_confirmed`, `confirmed`, `revoked` | Minimal provenance for subsequent layers. |
| `selected_complement` | mapping or `null` | Five selected financial fields and lead-declared relation when usable. |
| `decision_rule` | `R1`–`R6` | Minimal reason for acceptance or rejection. |
| `rescore_required` | `false` | Confirmation never triggers an automatic recalculation. |

## Rules

| ID | Condition | Output / effect | Source |
| :-- | :-- | :-- |
| R1 | Invitation is created | Generate a secure single-use token, store only its digest, and set expiry from `CO_DEBTOR_INVITATION_TTL_DAYS`. A replacement invalidates the prior invitation for that lead. | E1 |
| R2 | Pending invitation reaches expiry | It is `expired`; future evaluations may use lead-declared values labelled `not_confirmed`. | E1, E3 |
| R3 | Pending invitation has a valid token, the co-debtor submits five fields, and accepts treatment consent | Persist confirmation, consume invitation, and select the co-debtor's fields in later evaluations. Do not recalculate automatically. | E2, E3 |
| R4 | Invitation is replaced, invalid, declined, or submission lacks valid consent | Do not select a co-debtor submission. The lead declaration remains eligible as `not_confirmed`; no financial rejection detail is stored. | E1–E3, data minimization |
| R5 | No valid co-debtor confirmation exists | Select lead-declared complement and mark it `not_confirmed`; it remains referential. | E3 |
| R6 | Co-debtor revokes treatment consent | Record revocation; do not alter historic snapshots. Exclude complement from all later evaluations and raw executive access. A new valid invitation and consent are required for later use. | E4 |

## Constants and assumptions

| Constant / assumption | Value | Why |
| :-- | :-- | :-- |
| `CO_DEBTOR_INVITATION_TTL_DAYS` | `7` days | Central HU18 product decision. |
| One active invitation | Yes | Prevents ambiguous active tokens for a lead. |
| Access channel | Email invitation link | No co-debtor account or login is required. |
| Revocation access | Separate management token after confirmation | Supports E4 without reusing the consumed invitation token. |

## Invariants

1. Valid confirmed values override lead-declared five financial values; `relacion_complementario` stays lead-declared.
2. No confirmation, expiry, replacement, or decline blocks a referential evaluation with a lead declaration.
3. A revoked confirmation is never selected for future evaluation until a new valid invitation and consent exist.
4. Co-debtor responses never expose lead financial data.
5. Invitation and management tokens are never stored or returned after creation in plaintext.
6. Invitation, consent, confirmation, and revocation audit events contain no financial values.
7. Equal input and supplied time always yield equal resolution without mutating inputs.

## Edge cases

| Condition | Expected behavior |
| :-- | :-- |
| Expired, consumed, or replaced invitation token | Reject co-debtor access without revealing lead or co-debtor data. |
| Lead changes declaration while an invitation is pending | Invalidate it and create a replacement invitation. |
| Confirmation differs from lead declaration | Select the confirmed five fields for later evaluation; no automatic recalculation. |
| Revoked co-debtor appears in historic evaluation | Preserve the historical snapshot; do not select its values later or expose raw values to executives. |
