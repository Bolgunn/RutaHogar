# Table: profiles

One row per authenticated Supabase user. Created automatically on first sign-in via `ensureUserProfile()` in `profileService.js`.

---

## Columns

| Column | Type | Nullable | Default | Notes |
| :----- | :--- | :------- | :------ | :---- |
| `id` | `uuid` | NO | — | Primary key. References `auth.users(id)` — cascade delete. |
| `full_name` | `text` | YES | — | Display name. Falls back to email if not provided. |
| `role` | `text` | YES | — | One of `usuario`, `ejecutivo`, `admin`. See role constraints below. |
| `onboarding_data` | `jsonb` | YES | — | Answers from the onboarding flow (objective, property type, target commune, etc.). Written by `updateProfileOnboarding()`. |
| `last_lead_seen_at` | `timestamptz` | YES | — | Last time the ejecutivo visited `/leads` or dismissed the notification toast. Null = never seen leads. Used to compute the unseen Alto leads count. Written by `updateLastLeadSeenAt()`. |
| `consent_data` | `jsonb` | YES | — | Consent record. Undocumented in schema.sql — added manually. No service reads or writes it yet. |
| `created_at` | `timestamptz` | YES | — | Set on insert. |
| `updated_at` | `timestamptz` | YES | — | Auto-updated by `profiles_set_updated_at` trigger on every UPDATE. |

---

## Constraints

| Name | Type | Definition |
| :--- | :--- | :--------- |
| `profiles_pkey` | PRIMARY KEY | `id` |
| `profiles_id_fkey` | FOREIGN KEY | `id → auth.users(id) ON DELETE CASCADE` |
| `profiles_role_check` | CHECK | `role IN ('usuario', 'ejecutivo', 'admin')` |

---

## Indexes

| Name | Definition |
| :--- | :--------- |
| `profiles_pkey` | UNIQUE on `id` |

No secondary indexes. Lookups are always by `id` (primary key).

---

## RLS policies

| Policy | Command | Rule |
| :----- | :------ | :--- |
| `Profiles select staff` | SELECT | `auth.uid() = id` OR role is `ejecutivo`/`admin` |
| `Profiles insert own` | INSERT | `auth.uid() = id` |
| `Profiles update own` | UPDATE | `auth.uid() = id` (no `with_check` — intentional for dev) |

No DELETE policy. Deleting a profile is handled by the `auth.users` cascade.

---

## Trigger

`profiles_set_updated_at` — fires `BEFORE UPDATE`, sets `updated_at = now()`.

---

## Service layer

| Operation | Function | File |
| :-------- | :------- | :--- |
| Read profile | `getCurrentProfile(userId)` | `profileService.js` |
| Create or sync | `ensureUserProfile(user)` | `profileService.js` |
| Upsert | `upsertProfile(userId, fullName, role, onboardingData)` | `profileService.js` |
| Save onboarding answers | `updateProfileOnboarding(userId, onboardingData)` | `profileService.js` |
| Mark leads seen | `updateLastLeadSeenAt(userId)` | `profileService.js` |

---

## `onboarding_data` shape

```json
{
  "objetivo_principal": "comprar",
  "tipo_propiedad": "departamento",
  "comuna_interes": "Providencia",
  "comuna_alternativa": "Ñuñoa",
  "plazo_compra": "6_a_12_meses"
}
```

---

## Notes

- `role` is normalized client-side via `normalizeRole()` before every read/write. Aliases (`usuario_comun`, `ejecutivo_comercial`) are mapped to canonical values.
- There is no `email` column on this table. Email lives in `auth.users` and is accessed via `supabase.auth.getSession()`.
- `consent_data` has no corresponding code yet. It was added manually in the Supabase dashboard.
