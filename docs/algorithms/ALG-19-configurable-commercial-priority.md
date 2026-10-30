# ALG-19 — Prioridad comercial configurable por inmobiliaria

| Field | Value |
| :---- | :---- |
| **Version** | `hu21-commercial-priority-v1` — stored in `configuracion_comercial.alg_version` and returned as `commercial_priority_configured.alg_version`. Independent of `SCORING_VERSION`: this algorithm never changes a stored result |
| **Runs on / implemented in** | **backend** · `backend/app/scoring_engine/commercial_priority.py` (R0–R8) · **frontend** · `frontend/src/lib/matching/leadRanking.js` (R9 only) |
| **Cases** | `docs/algorithms/ALG-19-cases.json` — asserted by `backend/tests/test_alg19_cases.py` (pytest, R0–R8) · `docs/algorithms/ALG-19-ranking-cases.json` — asserted by `frontend/src/lib/matching/__tests__/leadRanking.test.js` (vitest, R9) |
| **Open assumptions** | 7 open — see the log below |
| **Last changed** | 2026-10-29 · HU 21 · created with AI assistance during the HU 21 grill; reviewed and approved by Benjamín · implemented on `feat/hu21-configuracion-comercial-priorizacion` (PR number pending) |

## Purpose

**What it computes.** For one persisted evaluation and one inmobiliaria's commercial criteria, the
**commercial action** that inmobiliaria's staff sees for the lead (`contact_now`, `contact_with_review`,
`reorient`, `request_info`, `nurture`, `do_not_route`). On the frontend, the **order of the executive's
lead tray** derived from that action (R9).

**When it runs.** On every staff read: `GET /tracking/staff/evaluations` enriches each row with
`commercial_priority_configured`, computed with the criteria of the actor's inmobiliaria. It also runs
inside `POST /tracking/staff/commercial-config/preview` to count how many leads would change action.
It **never runs inside `POST /score`** and **its output is never persisted**.

**What it depends on.** Only fields already stored in the evaluation: `result.classification`,
`result.adjusted_score` (falls back to `result.score`), `result.project_fit`, `result.blockers`,
and `financial_data.input.plazo_compra` / `tiene_propiedad_vista`. It never re-runs scoring, never
reads external data and never calls the AI. R9 additionally consumes `ALG-10` affinity, computed in the
browser — affinity is never recomputed here.

**Why it is this way.**

1. **Per-inmobiliaria, not per-evaluation.** One lead is visible to several inmobiliarias at once
   (`staff_evaluations_for_inmobiliaria`: favourite in a tenant project, or a declared comuna where the
   tenant has projects). A per-tenant priority therefore cannot live inside the shared evaluation. The
   stored `commercial_priority_detail` stays as the engine's reference and is shown, unchanged, to the
   lead and to the global admin.
2. **Computed at read time, never written back.** HU 21 E2 forbids modifying historical evaluations, and
   E4 requires the *current* configuration to apply to every lead. Read-time computation satisfies both:
   a new configuration applies to all leads at once, and nothing stored changes.
3. **Closed parameters over a fixed chain, not a rule editor.** Every reachable configuration is
   enumerable, so it can be validated and covered by cases; the chain always yields exactly one action.
4. **The defaults reproduce today's engine exactly.** An inmobiliaria that never configured anything sees
   precisely the action stored by the engine. This is asserted, not hoped (invariant 1).
5. **Tiers, not weights, for the tray.** A weighted sum would need weights nobody can calibrate (see the
   nine open assumptions in `ALG-10`) and would let a high-affinity `nurture` lead outrank a
   `contact_now` one — contradicting the action the same admin configured.

**Rejected.** Making the stored `commercial_priority_detail` tenant-specific (breaks point 1 and E2).
Re-implementing the chain in JavaScript (two copies of one rule — the failure the handbook exists to
prevent). A free rule editor (unvalidatable, out of 5 SP).

## Inputs → outputs

### Inputs

`calculate_commercial_priority(classification, project_fit, blockers, score, data, criterios=None)`

| Field | Source | Type | Notes |
| :---- | :----- | :--- | :---- |
| `classification` | `result.classification` | `"Alto" \| "Medio" \| "Bajo"` or other | Anything else reaches R8 |
| `score` | `result.adjusted_score ?? result.score` | number 0–100 | Used only by R6 |
| `project_fit.classification` | `result.project_fit` | `"Compatible" \| "Cercano" \| "Fuera de alcance" \| "Requiere antecedentes"` | Fit against the lead's **declared objective**, not against tenant projects |
| `project_fit.status` | `result.project_fit` | `compatible \| near \| out_of_reach \| requires_info` | |
| `blockers[].code` | `result.blockers` | string | Only `complemento_incompleto`, `morosidad_vigente`, `carga_total_alta` are read |
| `data.plazo_compra` | `financial_data.input` | string | Canonical: `inmediato`, `3_a_6_meses`, `6_a_12_meses`, `mas_12_meses`, `solo_explorando`. Aliases: `0_3_meses`→`inmediato`, `3_6_meses`→`3_a_6_meses`, `6_12_meses`→`6_a_12_meses` (same map as `main.py` and `ScoreForm.jsx`) |
| `data.tiene_propiedad_vista` | `financial_data.input` | bool | Only `true` counts |
| `criterios` | latest `configuracion_comercial` row of the actor's inmobiliaria | object (R0) | `None` → defaults |

### Outputs

```
{
  "action_key":   "contact_now" | "contact_with_review" | "reorient" | "request_info" | "nurture" | "do_not_route",
  "action":       COMMERCIAL_ACTIONS[action_key],      // Spanish label, as today
  "level":        same as action,                      // kept for shape compatibility
  "reason":       string,                              // see R4–R8
  "send_to_crm":  bool,                                // true only for contact_now / contact_with_review
  "promoted":     bool,                                // true only when R5b fired
  "fixed_rule":   bool,                                // true when R1–R3 decided
  "alg_version":  "hu21-commercial-priority-v1",
  "config_version": int | null                         // null = defaults, no configuration saved
}
```

The staff row additionally carries `differs_from_engine: bool` — `true` when `action_key` differs from
the key of the stored `commercial_priority_detail` (resolved from its label, as `priorityKeyFromDetail`
does).

## Rules

### R0 — The criteria object and its validation

| Key | Allowed values | Default | Source |
| :-- | :------------- | :------ | :----- |
| `contactar_ahora.clasificaciones` | `["Alto"]` · `["Alto","Medio"]` | `["Alto"]` | developer judgment · A4 |
| `contactar_ahora.compatibilidades` | `["Compatible"]` · `["Compatible","Cercano"]` | `["Compatible"]` | developer judgment · A4 |
| `contactar_con_revision.clasificaciones` | `["Medio"]` · `["Medio","Bajo"]` | `["Medio"]` | developer judgment |
| `contactar_con_revision.compatibilidades` | `["Compatible","Cercano"]` · `["Compatible","Cercano","Fuera de alcance"]` | `["Compatible","Cercano"]` | developer judgment |
| `senales.plazos` | non-empty subset of `inmediato`, `3_a_6_meses`, `6_a_12_meses` | `["inmediato","3_a_6_meses"]` | today's engine · A5 |
| `senales.propiedad_vista` | `true` · `false` | `true` | today's engine |
| `subir_con_senales` | `0` (off) · `1` · `2` | `0` | developer judgment · A3 |
| `umbral_reorientar` | `60`, `65`, `70`, `75`, `80`, `85` | `70` | today's engine (70) · range A1 |
| `proyectos_prioritarios` | 0–5 distinct project ids | `[]` | developer judgment · A2 |
| `orden_desempate` | `"afinidad"` · `"capacidad"` | `"afinidad"` | today's tray default |

**Validation (on preview and on save; `422` with a per-key error otherwise):**

- Unknown keys are rejected; a saved configuration always carries every key.
- Sets are compared as sets: order and duplicates inside a list do not matter; the stored form is sorted.
- `subir_con_senales = 2` requires `senales.propiedad_vista = true` (otherwise two signals are unreachable).
- Each `proyectos_prioritarios` id must belong to the actor's inmobiliaria and have `estado != "agotado"`
  **at save time**. At read time, an id that later became `agotado`, was deleted or moved is **ignored**,
  never an error — a stale configuration must not break the tray.
- A stored configuration whose `alg_version` predates a key added later is completed with that key's
  default for the version it was saved under.

### R1–R3 — Fixed rules (not configurable, shown to the admin as locked)

Evaluated first, in this order. Identical to today's engine.

| # | Condition | Action | `send_to_crm` | Reason (verbatim from today) |
| :- | :-------- | :----- | :-: | :----- |
| R1 | blocker `complemento_incompleto` | `request_info` | false | "Faltan antecedentes del complemento de renta antes de priorizar comercialmente." |
| R2 | blocker `morosidad_vigente` or `carga_total_alta` | `do_not_route` | false | "El lead presenta bloqueadores financieros críticos y no debe derivarse todavía." |
| R3 | `project_fit.status == "requires_info"` or `project_fit.classification == "Requiere antecedentes"` | `request_info` | false | "Faltan antecedentes para evaluar la compatibilidad con el objetivo inmobiliario." |

### Signals (used by R4, R5 and R5b)

```
senal_plazo     = normalize(data.plazo_compra) ∈ criterios.senales.plazos
senal_propiedad = criterios.senales.propiedad_vista and data.tiene_propiedad_vista is True
n_senales       = senal_plazo + senal_propiedad          // 0, 1 or 2
```

### R4–R8 — Opportunity rules (configurable)

| # | Condition | Action | `send_to_crm` | Reason |
| :- | :-------- | :----- | :-: | :----- |
| R4 | `classification ∈ contactar_ahora.clasificaciones` and `project_fit.classification ∈ contactar_ahora.compatibilidades` | `contact_now` | true | both signals → "Lead con alta preparación financiera, objetivo compatible, compra pronta y propiedad o proyecto visto." · otherwise → "Lead con alta preparación financiera y compatible con el objetivo inmobiliario." |
| R5 | `classification ∈ contactar_con_revision.clasificaciones` and `project_fit.classification ∈ contactar_con_revision.compatibilidades` | `contact_with_review` | true | `n_senales ≥ 1` → "Lead con potencial comercial y señales de intención de compra; requiere revisión antes de avanzar." · otherwise → "Lead con potencial comercial, pero requiere revisión antes de avanzar." |
| R5b | R5 fired, `subir_con_senales > 0` and `n_senales ≥ subir_con_senales` | **`contact_now`** (`promoted = true`) | true | "Lead con potencial comercial y señales de intención de compra; tu inmobiliaria prioriza contactarlo ahora." |
| R6 | `score ≥ umbral_reorientar` and `project_fit.classification == "Fuera de alcance"` | `reorient` | false | "Lead financieramente interesante, pero el objetivo inmobiliario declarado está fuera de alcance." |
| R7 | `classification == "Bajo"` | `nurture` | false | "Lead con baja preparación financiera actual; conviene nutrirlo con un plan de mejora." |
| R8 | none of the above | `request_info` | false | "Se requieren más antecedentes antes de definir una prioridad comercial." |

**Precedence.** First match wins, R1 → R8. Consequences worth stating:

- With `Medio` enabled in both R4 and R5, a `Medio` lead that satisfies R4 is `contact_now` (the higher
  level wins, as today's chain order already guarantees).
- With `Fuera de alcance` enabled in R5, a `Medio` + `Fuera de alcance` lead is `contact_with_review`
  **before** R6 can reorient it. `Bajo` + `Fuera de alcance` with `Bajo` enabled in R5 likewise. This is
  intended: the admin chose to review those leads rather than reorient them.
- R5b promotes **one level only** and **only from `contact_with_review`**. A `nurture`, `reorient` or
  `request_info` lead is never promoted (A3).

**Today's equivalence.** With the defaults, R4 is today's `classification == "Alto" and
project_fit.compatible is True` (`compatible` is `status == "compatible"`, i.e. classification
`Compatible`), R5 is today's `Medio` + `{Compatible, Cercano}`, R5b never fires, R6 uses 70, and the
signal set `{inmediato, 3_a_6_meses}` + aliases equals today's `{inmediato, 0_3_meses, 3_a_6_meses,
3_6_meses}`.

### R9 — Tray ordering (frontend, `leadRanking.js`)

Each row carries `action_key` (from `commercial_priority_configured`; rows without it use the stored
detail via `priorityKeyFromDetail`), `prioritario_compatible`, `afinidad`, `capacidad_uf`, `created_at`
and `id`. Rows are sorted by, in order:

1. **Action tier**, ascending: `contact_now` 0 · `contact_with_review` 1 · `reorient` 2 · `request_info` 3
   · `nurture` 4 · `do_not_route` 5 · `sin_prioridad` 6 (A6).
2. **`prioritario_compatible`** — `true` first (A7).
   - *Project selected:* the selected project is in `proyectos_prioritarios` and the pair's `ALG-10`
     `clasificacion` is `Compatible`.
   - *No project selected:* the lead has an `ALG-10` `Compatible` pair with at least one project in
     `proyectos_prioritarios`.
3. **Tie-break chosen by `sortBy`**, descending: `afinidad` or `capacidad_uf` (missing → −1, as today).
   `sortBy` starts at the configuration's `orden_desempate`; the executive may switch it.
   - *Project selected:* `afinidad` is the pair's `ALG-10` affinity.
   - *No project selected:* `afinidad` is the lead's **best** `ALG-10` affinity across the tenant's
     non-`agotado` projects; `null` when none → treated as −1.
4. **`created_at`** descending (most recent evaluation first).
5. **`id`** ascending — arbitrary but deterministic.

With a project selected, `ALG-10`'s split into `ranked` / `descartados` / `requiereAntecedentes` is
unchanged; R9 only replaces the comparator of `ranked`. `descartados` keeps its current order.

**This replaces the HU 2 behaviour pinned in `leadRanking.js`** ("sin proyecto … mismas filas, mismo
orden"): without a project the tray is now ordered by R9. The pinning test is amended in the HU 21 PR.

## Invariants and edge cases

**Invariants** — asserted by tests, not by fixture values:

1. **No regression under defaults.** For every evaluation, `calculate_commercial_priority(...,
   criterios=None)` and `(..., criterios=DEFAULT_CRITERIOS)` return the same `action`, `reason` and
   `send_to_crm` as today's engine. Asserted over every case in `ALG-19-cases.json` marked `default` and
   over the `POST /score` responses of the existing scoring test payloads.
2. **Exactly one action.** Every input × every valid configuration yields one of the six keys.
3. **Locked rules are locked.** For any configuration, an input that matches R1–R3 gets the same action
   as under defaults. Asserted by enumerating all valid configurations (the space is finite: 2·2·2·2·7·2·3·6 =
   8 064, minus the 672 with `subir_con_senales = 2` and `propiedad_vista = false` → **7 392**;
   `orden_desempate` and `proyectos_prioritarios` do not affect R0–R8).
4. **The score is never touched.** Computing the configured priority does not modify `result` or any
   stored field; the stored `commercial_priority_detail` is returned unchanged next to it.
5. **Deterministic.** Same evaluation + same configuration → same output. No clock, randomness or AI.
6. **R9 is a total order.** No two distinct rows compare equal.

**Edge cases.**

- **Legacy evaluation without `project_fit` or `blockers`.** Treated as `{}` / `[]`, exactly as the
  engine does today — R3 does not fire, the chain continues.
- **Missing `classification`.** Reaches R8 (`request_info`), same as today.
- **Missing or unknown `plazo_compra`.** `senal_plazo = false`; never an error.
- **No configuration saved.** Defaults; `config_version = null`.
- **Actor without inmobiliaria (global admin).** No `commercial_priority_configured` is emitted; surfaces
  show the stored detail.
- **Priority project ids that are stale.** Ignored (R0).

## Assumptions log

| # | Assumption | Made by | Date | Would be wrong if | Status |
| :- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | `umbral_reorientar` is limited to 60–85 in steps of 5 | Benjamín · HU 21 grill | 2026-10-29 | Below 60 a weak `Medio` would be reoriented instead of reviewed; above 85 almost no lead qualifies. Wrong if real data shows leads reoriented at 55–60 convert, or the client wants to reorient only near-perfect scores | open |
| A2 | At most 5 priority projects per inmobiliaria | Benjamín · HU 21 grill | 2026-10-29 | "If everything is a priority, nothing is." Wrong if an inmobiliaria legitimately runs more than 5 simultaneous launch campaigns | open |
| A3 | Signal promotion lifts one level, only `contact_with_review` → `contact_now` | Benjamín · HU 21 grill | 2026-10-29 | Purchase intent should not override low financial preparation. Wrong if the client wants a `Bajo` lead with immediate intent to be reviewed | open |
| A4 | `contact_now` never admits `Bajo` nor `Fuera de alcance` | Benjamín · HU 21 grill | 2026-10-29 | "Call now" must not be reachable for a lead the engine considers unprepared or out of reach — that case has `reorient`. Wrong only if the client explicitly asks for it | open |
| A5 | `mas_12_meses` and `solo_explorando` can never be a purchase-intent signal | Benjamín · HU 21 grill | 2026-10-29 | More than a year is not near-term intent. Wrong if conversion data shows 12+ month leads convert like 6–12 month ones | open |
| A6 | Tier order `contact_now` > `contact_with_review` > `reorient` > `request_info` > `nurture` > `do_not_route` | Benjamín · HU 21 grill | 2026-10-29 | `reorient` sits above `request_info` because it is an actionable call with a concrete alternative. Wrong if executives treat "request info" calls as warmer | open |
| A7 | Priority projects act as a tie-break inside a tier, only for `ALG-10` `Compatible` pairs | Benjamín · HU 21 grill | 2026-10-29 | A priority project must not lift a lead above a better action, nor surface a lead that cannot buy it. Wrong if the client wants priority projects to override actions | open |
