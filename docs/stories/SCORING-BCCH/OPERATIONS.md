# OPERATIONS — SCORING-BCCH market snapshot refresh

**Status:** design prerequisite closed on 2026-09-18. This runbook records the
chosen operational contract for the later Build; it creates no endpoint, job,
migration or scoring behavior by itself.

## BCCh source binding and evidence

`plazo_referencial_anios` is sourced from **`F022.PZCHV.PER50.Z.Z.Z.D`**.

Evidence is the official BCCh BDE table [Indicadores Mercado de la Vivienda —
Plazo de créditos hipotecarios para la vivienda (meses)](https://si3.bcentral.cl/Siete/ES/Siete/Cuadro/CAP_IND_VIVIENDA/MN_IND_VIVIENDA/IVM_ECRED_01/638290046022543847).
Its `Percentil 50` row identifies itself in the official HTML as:

```html
data-name="Percentil 50"
data-serie="F022.PZCHV.PER50.Z.Z.Z.D"
```

The table labels the statistic in months. The adapter will preserve that source
unit and calculate `plazo_referencial_anios = published_months / 12` without
integer rounding. It must query this exact code, not discover a near match by
title or substitute another percentile.

## BCCh REST authentication and request shape

Use BCCh BDE REST, not SOAP. The official [API access](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/acceso_api.html)
and [REST documentation](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/documentacion.html)
state that an API Key Token is the recommended authentication method and is
sent in the `token` query parameter on every REST request.

The future backend adapter request is:

```text
GET https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx
    ?token=<BCCH_API_KEY_TOKEN>
    &function=GetSeries
    &timeseries=<exact-series-id>
    [&firstdate=YYYY-MM-DD&lastdate=YYYY-MM-DD]
```

`BCCH_API_KEY_TOKEN` is a backend/server-side secret. It is never committed,
sent to a browser, named `VITE_*`, copied into a snapshot, or emitted in logs.
Logs may include the series ID, result status and redacted URL only. BCCh
receives series queries and no lead data.

## Refresh execution

### Development

Build provides one explicit local operator command:

```text
cd backend && python scripts/refresh_market_snapshot.py
```

It reads local backend environment variables and performs the same fetch,
validation and atomic persistence as production. It has no HTTP exposure and
is run deliberately by the developer for local seeding/recovery.

#### Temporary local fixture seed (BCCh unavailable)

When BCCh is unavailable, a developer may deliberately seed the first existing
`ALG-9-cases.json` snapshot. It retains `fixture_only: true`; its values are
not quotations and it is never selected by a normal production resolver.

From `backend/`, first export the local backend environment in the shell, then
opt in only for the DEV command/process:

```text
set -a
. ./.env
set +a
export MARKET_SNAPSHOT_ALLOW_FIXTURE=true
python scripts/seed_dev_market_snapshot.py seed --confirm-dev
```

Use the same explicit opt-in in the local `/score` process. To remove all rows
explicitly marked `fixture_only` from that development database:

```text
python scripts/seed_dev_market_snapshot.py delete --confirm-dev
```

Do not set `MARKET_SNAPSHOT_ALLOW_FIXTURE=true` in GitHub Actions, production
deployment configuration, or shared secrets. Without it, fixture rows are
ignored; a store containing only fixture rows yields the normal controlled 503.

### Production

The selected mechanism is a **GitHub Actions scheduled workflow**. This fits
the repository because `.github/workflows/` already hosts the deployed
Supabase-edge-function workflow, while the application has no durable worker
or scheduler. Build adds a separate workflow that:

1. runs once per day via GitHub Actions `schedule` (UTC cron, documented in
   the workflow), and also supports `workflow_dispatch` for initial seeding or
   operator recovery;
2. installs the backend dependencies and invokes the same refresh command;
3. supplies `BCCH_API_KEY_TOKEN`, `SUPABASE_URL`, and the configured backend
   Supabase service credential only from GitHub Actions secrets;
4. fails visibly if acquisition, validation or persistence fails, while the
   previously persisted valid snapshot remains available.

The workflow is external to the request runtime. `/score` only resolves a
validated persisted snapshot and **never calls BCCh, starts refresh work, or
waits for the scheduler**. There is no public refresh route.

Before production enablement, the implementation PR records the responsible
owner, actual cron, timeout/retry values, failure-notification destination,
GitHub secret names/configuration evidence, and successful initial seed. Those
are deployment prerequisites; they are not scoring constants or a freshness
cutoff.

## Version allocation for Build

| Surface | Current | Build allocation | Reason |
| :------ | :------ | :--------------- | :----- |
| Engine algorithm | `ALGORITHM_VERSION = "1.1.0-prep"` | `ALGORITHM_VERSION = "1.2.0"` | The current value expressly marks preparatory, unexposed logic. The persisted-snapshot ALG-1/ALG-9 behavior becomes functional. |
| Score orchestrator/result | `SCORING_VERSION = "1.1.0"` | `SCORING_VERSION = "1.2.0"` | Existing score behavior and its market/provenance dependency change materially while retaining the response envelope. |
| Matching | `MATCHING_VERSION = "e4-matching-v1"` | unchanged | This story must not relabel matching behavior. |

The later implementation changes both proposed `1.2.0` values in the same
behavioral release, preserves versions embedded in historical evaluations, and
does not treat an ALG document's design label as a runtime version.

## Handbook gate inventory verified on 2026-09-18

| Handbook Tier-1 expectation | Exists in repository | Current verification / limitation |
| :-------------------------- | :------------------- | :------------------------------- |
| pytest: engine, golden fixtures, ALG cases | Partial | Python test files exist (`backend/tests/`, `backend/test_thresholds.py`) and four ALG case JSON files exist, including ALG-1/ALG-9. There is no `backend/tests/golden/`, no pytest configuration/command, and `backend/requirements.txt` does not declare `pytest` or coverage tooling. The inspected environment has no pytest installed. |
| eslint | No | No ESLint package, config or npm script exists. |
| vitest | Yes, local command | `frontend/package.json` defines `npm test` as `vitest run`, and unit tests exist. Dependencies were not installed in the inspected checkout, so the command currently reports `vitest: not found`; it is not CI-enforced. |
| three Playwright journeys | No | `playwright` is declared as a frontend dependency, but there is no Playwright config, spec/e2e test, browser setup or CI command. |
| commit lint | No | No commitlint dependency/config, hook or workflow was found. |
| ALG-path check | No | No script, config or workflow implementing it was found. |
| schema/migration parity | Yes, standalone | `scripts/check-schema-drift.js` exists and is executable with Node. It currently exits non-zero: 8 objects are absent from `schema.sql` and 6 policy/function bodies diverge; it also reports 13 migrations without rollbacks. This is pre-existing repository drift and not modified by this prerequisite work. |
| CI enforcement | No general CI | The only workflow is `.github/workflows/deploy-supabase-functions.yml`; it deploys an edge function and does not run Tier-1 tests/gates. |

The Build must add/enable the story-relevant missing gates or carry them as
explicit review blockers. None of their absence permits claiming a passing
Tier-1 gate today.

## Build implementation record — 2026-09-18

- Refresh is implemented in `.github/workflows/refresh-market-snapshot.yml` at
  `0 0 * * *` UTC, with `workflow_dispatch`. It invokes the same backend
  `scripts/refresh_market_snapshot.py` command used locally.
- The adapter timeout is 15 seconds per BCCh series request. It makes no retry
  or partial publish: a failed run is visible as a failed GitHub Actions job
  and the last validated persisted bundle remains selectable.
- Required GitHub Actions secrets are `BCCH_API_KEY_TOKEN`, `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY`. They are backend-only and are not serialized in a
  snapshot or request log.
- Production owner, failure-notification destination, hosted migration evidence
  and the first successful seed remain deployment prerequisites. They cannot be
  established from this checkout and must be recorded by the deploy operator.
