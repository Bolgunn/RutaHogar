# HU 15 demo data

Demo data to show `/metricas` working end to end: one inmobiliaria with projects, staff and about
150 leads with a year of history, written by `backend/scripts/seed_hu15_demo.py`, removed by
`backend/scripts/seed_hu15_demo_teardown.sql`. Decided in the HU 15 demo grill (2026-10-05).

## What it creates

**Inmobiliaria Demo Métricas**, in production, isolated from every other tenant: its leads declare
only Ñuñoa, Providencia or Maipú, comunas no other project used when it was written. HU 15 is scoped
per inmobiliaria, so no other tenant's dashboards change. If a real tenant later opens a project in
one of those comunas, the demo leads would appear there too: run the teardown.

| Project | Comuna | Type | UF | State |
| :------ | :----- | :--- | :- | :---- |
| Mirador Ñuñoa | Ñuñoa | departamento | 4,200–5,600 | disponible |
| Plaza Ñuñoa | Ñuñoa | departamento | 5,800–7,500 | en construcción |
| Jardín Ñuñoa | Ñuñoa | departamento | 3,200–4,300 | sold out ~6 months into the history, restocked 2 months later |
| Altos de Providencia | Providencia | departamento | 3,800–5,200 | sold out ~10 months in, still agotado |
| Parque Providencia | Providencia | departamento | 4,500–6,000 | disponible |
| Villa Maipú | Maipú | casa | 2,200–2,900 | disponible |
| Condominio Maipú | Maipú | casa | 2,700–3,500 | disponible |
| Mirador Maipú | Maipú | departamento | 1,800–2,400 | disponible |

**Accounts** (`@example.com`, created confirmed, so no email is ever sent). All of them, leads
included, use the password set in `SEED_DEMO_PASSWORD` when the seed ran. **The password is not in
the repository** (it is public): ask whoever ran the seed.

| Account | Role | Sees on /metricas |
| :------ | :--- | :---------------- |
| `demo-hu15-admin-1`, `demo-hu15-admin-2` | admin_inmobiliario | all 8 projects, every lead |
| `demo-hu15-ejecutivo-1` | ejecutivo | Mirador Ñuñoa, Plaza Ñuñoa, Jardín Ñuñoa |
| `demo-hu15-ejecutivo-2` | ejecutivo | Jardín Ñuñoa (shared with ejecutivo-1), Altos de Providencia |
| `demo-hu15-ejecutivo-3` | ejecutivo | Parque Providencia, Villa Maipú |
| `demo-hu15-ejecutivo-4` | ejecutivo | Villa Maipú (shared with ejecutivo-3), Condominio Maipú, Mirador Maipú |
| `demo-hu15-ejecutivo-5` | ejecutivo | Mirador Maipú; its link to Mirador Ñuñoa is **pendiente** and must not count |
| `demo-hu15-ejecutivo-6` | ejecutivo | nothing: only a pendiente link, so the page shows the empty state |
| `demo-hu15-lead-001` … `lead-150` | usuario | — (each lead can sign in and see its own evaluations and plan) |

**Leads.** About 150, arriving over the 12 months before the run (slightly more in recent months),
so the year view shows two years. Random, from a fixed seed:

- Financial profiles from hand-set ranges (constants at the top of the script); 12% are "late buyers"
  (55–60, little savings). Each evaluation is computed by the **real scoring engine** and saved
  through the **real HU 13 TrackingService** (against an in-memory copy of `hu13_commit`), so
  lineage, tracking plans and improvement goals are the app's own; only the dates are back-dated.
- Activity: favorites, applying to a project (an evaluation with that project as goal), accepting an
  improvement plan (`plan_accepted`), progress updates and confirmed goals.
- Commercial stages follow the stage rules: lead-level `contactado` / `en_plan_mejora`, negotiation,
  reserva and sale on a project, losses per project, revivals, undone sales (by an admin), skipped and
  backward moves, and the sell-out / restock jobs. Each move is recorded by an ejecutivo `vinculado`
  on that project, so "Contactados por ti" differs per login. Better leads (by the engine's priority
  and whether they can afford their project) are contacted sooner and convert more, so "Mejores leads"
  outperforms "Todos".

**Coverage check.** Before writing anything, the script runs ALG-18 on the generated facts and
refuses to write if a dashboard section would be empty: every funnel stage, a standing sale, an
undone sale, a revival, a sell-out closure and a restock, losses by gestión and by agotamiento, a
skipped stage, plan → sale and en plan de mejora → sale, every engagement action, every month with
new leads, best leads not yet contacted, and every band and priority except two the current engine
cannot produce for a new evaluation:

- **`requiere_antecedentes`** (affinity and capacity) needs `capacidad_status = requires_info`,
  which only income 0 gives, and the score contract rejects income 0;
- **"Nutrir con plan de mejora"** needs a *Bajo* classification without a critical blocker; in the
  current engine a Bajo score practically only comes with "carga total alta" (critical →
  "No derivar todavía").

If a seed fails the check, the script tries the next one (up to `--attempts`, default 20) and prints
the seed it used. It prints the expected totals and each account's lead count; `/metricas` must show
exactly those.

## Running it

Needs the backend venv, Node (for the ALG-18 check) and the Supabase CLI linked to the project
(`supabase link --project-ref adgnxtjkqedtvkwcizzn`, run once in the repository root: the script calls
`supabase db query` from there).

```bash
cd backend
```

```bash
.venv/Scripts/python.exe scripts/seed_hu15_demo.py --dry-run
```

The dry run generates everything, runs the coverage check, prints the totals and writes the SQL files
to `.seed_hu15_demo/` with placeholder account ids. Nothing is created or written to the database.
Then the real run, with `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) and
`SEED_DEMO_PASSWORD` (8+ characters) in the environment:

```bash
.venv/Scripts/python.exe scripts/seed_hu15_demo.py
```

It creates the 158 accounts through the Admin API, then applies one SQL file per 5 leads, each its own
transaction, with `supabase db query --linked`. It refuses to run if the demo inmobiliaria already
exists. Options: `--seed N`, `--attempts N`, `--anchor YYYY-MM-DD` ("today" of the data; default the
day you run it), `--target local` (a local `supabase start` stack, through `psql` in its database
container), `--out DIR`.

The data's dates are relative to the day it runs, so a week later the running period is a week old.
Re-seed (teardown, then seed) before a demo if you want "this month" to look current.

## Removing it

```bash
supabase db query --linked -f backend/scripts/seed_hu15_demo_teardown.sql
```

One transaction. It deletes only the demo inmobiliaria (projects, assignments, stage history) and the
`demo-hu15-*@example.com` accounts with every row that belongs to them, and aborts without changing
anything if the demo inmobiliaria has a non-demo account or demo leads have history in another
tenant. The history tables are immutable, so it disables their triggers for that transaction only,
as table owner, and enables them again before committing; the last query prints how many demo
accounts and tenants are left (both 0).

## How it was verified (2026-10-05, local `supabase start` stack)

- Seed → `commercial_funnel_facts()` called as each staff account → ALG-18: identical to the totals
  the seed printed (150 leads, funnel 150/77/43/38/26/18, 17 lost of which 1 by agotamiento, 13 months,
  53 weeks, 2 years; ejecutivo-6 empty).
- The HU 13 `TrackingService` reads all 150 leads' history back (174 goals reconstructed).
- Sign-in with `SEED_DEMO_PASSWORD` as an admin, an ejecutivo and a lead; `/metricas` as
  admin-1 shows the same numbers.
- Teardown removes every demo row and leaves the triggers enabled; a seed after a teardown works.

**Known, not caused by the seed:** with this many evaluations the app's general evaluation loader
shows "No pudimos cargar tu historial": it requests every evaluation's annotations in a single
`evaluation_events?evaluation_id=in.(…)` URL, which grows past what the gateway accepts. `/metricas`
is not affected. Tracked separately.
