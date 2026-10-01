# ALG-17 — Co-debtor consent resolution

| Field | Value |
| :---- | :---- |
| **Version** | `1.0.0` |
| **Owner story** | HU18 — Participación y consentimiento del co-deudor |
| **Cases** | `docs/algorithms/ALG-17-cases.json` |
| **Status** | Planned; written before implementation |

## Purpose

This algorithm resolves which complementary-income data may be used for a lead
evaluation and which provenance label must accompany it. It does not change
scoring weights, classification thresholds, blockers, or the `POST /score`
contract. It protects the distinction between data declared by a lead and data
provided and consented to by the co-debtor.

The lead can still obtain an orientative prequalification while an invitation is
pending or expired. That result is explicitly labelled as having an unconfirmed
complement. Once the co-debtor submits their own data and consents, their five
financial fields prevail and an evaluation is recalculated immediately. A
revocation affects only later evaluations; historic evaluation snapshots remain
historical records but the co-debtor's data is no longer exposed to staff.

## Inputs → outputs

### Inputs

| Field | Source | Notes |
| :---- | :----- | :---- |
| Lead-declared complement | Lead evaluation / invitation | Income, debt, contract, continuity, delinquency and the lead-declared relation. |
| Invitation state | `co_debtor_invitations` | `pending`, `expired`, `confirmed`, or `revoked`. |
| Co-debtor submission | Token-gated confirmation | Own income, debt, contract, continuity and delinquency. The relation remains lead-declared. |
| Consent state | Separate co-debtor consent record | Required before confirmed data can be used. |
| Current time | Server only | Determines invitation expiry; never client time. |

### Outputs

| Key | Values | Meaning |
| :-- | :----- | :------ |
| `complement_source` | `lead_declared`, `co_debtor_confirmed`, `excluded_after_revocation` | The only source the scorer may use for a future evaluation. |
| `complement_confirmation_status` | `not_confirmed`, `confirmed`, `revoked` | Lead/executive-facing provenance; executives never receive raw co-debtor financial fields. |
| `rescore_required` | boolean | Whether confirmation must immediately create a new evaluation. |

## Rules

Every tunable is defined once in backend constants during implementation.

| ID | Condition | Output / effect | Source |
| :-- | :-------- | :-------------- | :----- |
| R1 | An invitation is created | Generate one random, single-use token; store only its digest; set `expires_at = created_at + CO_DEBTOR_INVITATION_TTL_DAYS`. A new invitation invalidates any active one for the same lead. | HU18 E1 + Grill |
| R2 | `now >= expires_at` and invitation is still pending | Mark it `expired`; future evaluations may use lead-declared values and are labelled `not_confirmed`. Notify both parties through the invitation channels. | HU18 E1 + Grill |
| R3 | Invitation pending, token valid, SMS phone verification succeeds, and the co-debtor accepts separate data-processing consent | The co-debtor submits their own five financial values. They prevail over lead-declared values; set status `confirmed`; consume token; immediately recalculate with reason `confirmacion_codeudor`. | HU18 E2–E3 + Grill |
| R4 | Co-debtor declines, or validation fails | Do not use a co-debtor submission. The lead may correct the declared complement and create a replacement invitation. No rejection reason is required or stored. | Data minimization + Grill |
| R5 | No valid co-debtor confirmation exists | The lead may be evaluated with lead-declared complement values. Mark result `not_confirmed`; it is always referential, never a bank approval. | HU18 E3 + S7 |
| R6 | Co-debtor revokes consent | Record revocation. Do not recalculate existing historical results. All later evaluations set source `excluded_after_revocation` and omit the complement until a new invitation, verification and consent complete. Staff lose access to the co-debtor's financial fields and phone. | HU18 E4 + Grill |
| R7 | Staff reads a lead with complement data | Expose only confirmation status/provenance; never raw co-debtor values or phone. | Grill + privacy minimization |
| R8 | Co-debtor has explicitly opted in to WhatsApp contact | Assigned executive may use the phone only about the lead's evaluation. This opt-in is separate from treatment consent and is withdrawn with revocation. | Grill |

### Constants and assumptions

| Constant / assumption | Value | Why | Owner |
| :-------------------- | :---- | :-- | :---- |
| `CO_DEBTOR_INVITATION_TTL_DAYS` | `7` days | Product decision made in the HU18 Grill on 2026-10-01. | HU18 |
| Phone verification | SMS OTP before submission | Verifies control of the provided Chilean mobile number; selected in Grill. | HU18 |
| WhatsApp contact | Off by default; explicit separate opt-in | Treatment consent must not be bundled with commercial contact. | HU18 |
| One active invitation | Yes | Prevents ambiguity over which token/data set is current. | HU18 |

## Invariants

1. A valid co-debtor confirmation always overrides the lead-declared five financial values in a later evaluation.
2. No confirmation, expired invitation, or declined invitation blocks the lead's orientative evaluation.
3. A revoked co-debtor is never included in a future evaluation until a new valid consent exists.
4. The co-debtor cannot read lead financial data through any invitation endpoint or response.
5. A token is never stored or returned in plaintext after its invitation response is created.
6. Invitation, consent, confirmation and revocation audit events contain no raw financial values.
7. The same state and input select the same complement source; no AI, client clock, or random branch decides it.

## Edge cases

| Condition | Expected behavior |
| :-------- | :---------------- |
| Token expired or already consumed | Reject access without revealing lead or co-debtor data. |
| Lead changes declared complement while an invitation is pending | Invalidate the invitation; a replacement invitation represents the new declaration. |
| Co-debtor submission differs from lead declaration | Use submitted values after consent and recalculate immediately. |
| SMS provider unavailable | Do not accept/confirm the co-debtor; retain pending state and report a controlled error. |
| Revoked co-debtor appears in historic evaluation | Preserve the historical result as a snapshot, but remove raw co-debtor data from staff-facing responses. |

