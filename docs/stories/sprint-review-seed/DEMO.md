# Sprint review demo data

Demo accounts in **production** to show HU 15, HU 14 and HU 20 at the sprint review, removed right
after it. Decisions and reasons: [PLAN.md](PLAN.md). HU 18 is deliberately not seeded.

## What it creates

**Inmobiliaria Sprint Review (demo)**, new and isolated, with the 8 HU 15 projects, every name ending
in "(demo)" (Mirador Maipú starts at 1,900 UF, see PLAN D18). All accounts are `@example.com`,
created confirmed (no email is sent). Every account has a distinct RUT from the 40.000.001 block and
a `+56 9 0000 NNNN` phone.

**Passwords:** a lead's or hero's password is its email's local part (`sprint-hero-camila`). A staff
account's is its local part plus a secret suffix (`sprint-admin-1<suffix>`), set in
`SEED_STAFF_PASSWORD_SUFFIX` when the seed ran. **The suffix is not in the repository** (it is public, and
staff roles can read more than demo data): ask whoever ran the seed.

| Account | Role | Use it for |
| :------ | :--- | :--------- |
| `sprint-admin-1`, `sprint-admin-2` | admin_inmobiliario | `/metricas` over all 8 projects |
| `sprint-ejecutivo-1` | ejecutivo | **Presenter.** HU 15 per-ejecutivo `/metricas`; HU 14 leads dashboard (Mirador / Plaza / Jardín Ñuñoa) |
| `sprint-ejecutivo-2` … `-6` | ejecutivo | Other scopes; `-5` has a pendiente link, `-6` shows the empty state |
| `sprint-<nombre>.<apellido>.NNN` | usuario | Bulk leads with a year of history (count chosen at run time) |
| `sprint-hero-camila` | usuario | HU 14 E1 + E2 |
| `sprint-hero-matias` | usuario | HU 14 E3 |
| `sprint-hero-diego` | usuario | HU 20 |

## Presenter path

1. **HU 15** — sign in as `sprint-ejecutivo-1`, open `/metricas`: funnel, times between stages,
   engagement, bands. Switch to `sprint-admin-1` to show the whole inmobiliaria.
2. **HU 14 E2** — as `sprint-ejecutivo-1`, leads dashboard: Camila Fuentes is the first contact
   opportunity, "Pasó a estado Compatible con Mirador Ñuñoa (demo)" (or "Ahora alcanza el precio
   mínimo"). **Do not dismiss the card** before presenting: dismissals live in the browser
   (`localStorage` key `RutaHogar_dismissed_contact_opportunities`).
3. **HU 14 E1** — open Camila's history: four evaluations over ~6 months, income up, debt down,
   savings up, now Compatible.
4. **HU 14 E3** — compare Camila with Matías Herrera for Mirador Ñuñoa (demo): Alto and Compatible
   vs Medio, Marginal and short of the minimum price.
5. **HU 14 E4** — suggested questions in either lead's detail view.
6. **HU 20** — sign in as `sprint-hero-diego`: the unseen-changes panel shows his monthly review reminder and
   the project now within reach (and a band improvement if the seed printed one). Do the one-field
   quick update live (E4).

## Running it (Claude runs it; each prod write is approved)

From `backend/`, with the venv, Node, the Supabase CLI linked to the project, and `SUPABASE_URL`,
`SUPABASE_SECRET_KEY` and `SEED_STAFF_PASSWORD_SUFFIX` in the environment. Common flags:

```bash
FLAGS='--heroes --email-prefix sprint- --tenant "Inmobiliaria Sprint Review (demo)" --project-suffix " (demo)"'
```

1. Preflight, read-only; every row must be `ok`:
   `supabase db query --linked -f backend/scripts/seed_sprint_preflight.sql` (from the repo root).
2. Dry run, choose `--leads`: `python scripts/seed_hu15_demo.py $FLAGS --leads N --dry-run`. The
   real run refuses if prod's evaluations plus the seed's would pass 900 (PLAN D16) and prints the
   `--leads` that fits.
3. Seed: `python scripts/seed_hu15_demo.py $FLAGS --leads N`. It prints the seed used, the totals
   `/metricas` must show, each staff account's lead count and the hero lines.
4. Post-check, read-only: `supabase db query --linked -f backend/scripts/seed_sprint_postcheck.sql`.
5. Prove the revert: `python scripts/seed_demo_teardown.py --email-prefix sprint- --tenant "Inmobiliaria Sprint Review (demo)" --check`
   must print `TEARDOWN CHECK OK`.
6. Smoke test the presenter path in the deployed app.

## Removing it

Right after the review, or immediately if any step above fails:

```bash
cd backend
python scripts/seed_demo_teardown.py --email-prefix sprint- --tenant "Inmobiliaria Sprint Review (demo)"
```

One transaction. It removes the tenant, its projects and every `sprint-*@example.com` account with
everything that points at them, including what the app and the HU 20 cron wrote after seeding, and
real users' HU 20 events about demo projects. It refuses (and changes nothing) if anything would be
left behind. It works on a seed stopped halfway.
