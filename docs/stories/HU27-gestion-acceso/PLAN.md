# PLAN — HU 27: Professional account and access management

- **Actors:** all roles; Google sign-in/linking only for `usuario`.
- **Status:** implemented; owner reports confirmation and both hooks enabled; remaining provider acceptance pending · Desirable · 5 SP.
- **Branch:** `feat/hu27-gestion-acceso-cuentas`.

## Start here

Preserve HU18 invitations, anonymous evaluation migration, scoring, project permissions and existing
passwords. Supabase is the only authentication provider; never fall back to simulated sessions.
No hosted settings or credentials are changed automatically during implementation.

## Goal

Provide verified email/password access, Google access for users, account recovery, password changes
and explicit local/global sign-out. Keep UI identity consistent with Supabase across tabs and prevent
old account data or pending responses from appearing after an identity change.

## Approach & decisions

- Validate the session before mounting private application state; observe auth events and revalidate
  on visibility/network restoration. Remount account-bound state on identity changes.
- Retain valid sessions between visits. No unapproved 30-minute inactivity rule; server-managed
  inactivity limits require a compatible Supabase plan.
- Public signup always creates `usuario`. Staff roles come from existing server-managed profiles.
- Google accounts complete missing required profile fields before entering private areas. Never merge
  by RUT. A conflicting normalized RUT requires account recovery, without revealing another email.
- Link Google through verified same-email automatic identity linking. Do not enable unrestricted
  different-email manual linking; reject a mismatched callback without merging accounts.
- New/replaced passwords require 8 characters, uppercase, lowercase, number and special character.
  Do not apply the new validation to login with an existing password.
- Preserve recovery/invitation route `/definir-password`; add `/auth/callback` for Google/confirmation.
- Use generic recovery/confirmation responses, resend cooldown and safe errors without raw tokens.

## Standing questions

| Topic | Decision |
| --- | --- |
| Scoring | No changes. |
| Provider | Supabase Auth, email/password and Google for users only. |
| Email changes | Out of scope. |
| Account disable controls | Out of scope; respect Supabase-disabled accounts. |
| Session persistence | Keep valid sessions; synchronize all tabs to one account per browser storage. |
| Hosted operations | Owner saves settings after application deployment and tests delivery. |

## Entities

Reuse `auth.users`, identities, sessions and `profiles`. A normalized RUT trigger rejects new/changed
duplicate assignments while preserving legacy duplicates and unrelated profile edits. A transaction
advisory lock serializes competing assignments. A read-only hosted count found 3 duplicate groups
affecting 16 profiles; no hosted records were changed. Hook restrictions protect Google role scope and
same-email identities at token issuance; no frontend-only role restriction is claimed.
Direct browser profile writes cannot promote their own role or change their own company. Existing
administrator/service provisioning and same-role profile upserts remain supported.

## Algorithms

No financial algorithms change. Supabase validates credentials, verification links and OAuth.
RUT is an existing identifier, never proof of identity or authorization to merge records.

## Scope

In: session consistency, email verification/resend, Google callback, profile completion, recovery,
password changes, local/global logout, generic failures, settings checklist and regression tests.
Out: account deletion, email changes, new administrative banning UI, MFA, automatic account merging.

## Steps

1. Centralize validated auth bootstrap and auth-event handling; eliminate stale cached-profile access.
2. Add shared password policy and prevent signup continuation while email verification is pending.
3. Add Google user flow and same-email linking; preserve invitations and anonymous drafts.
4. Add recovery/resend and authenticated access settings to all three profile surfaces.
5. Guard normalized RUT and Google role/email scope in trusted server configuration.
6. Test expired/reused links, legacy passwords, cross-tab switching, pending old responses, account
   disablement, OAuth cancellation and anonymous evaluation migration; verify build.
7. Configure hosted Auth using the checklist below and perform real account/provider tests.

## Acceptance criteria map

| Criterion | Verification |
| --- | --- |
| E1 | Email/password and Google; same user/profile for same verified email; duplicate RUT rejected without merge. |
| E2 | Verification, resend cooldown, recovery, password change, explicit local/global sign-out. |
| E3 | Validated bootstrap, cross-tab cleanup, safe expired/disabled/error handling and trusted role enforcement. |

## Supabase and Google deployment checklist

All screenshots were treated as unsaved configuration. Save each panel explicitly and reopen to verify.

1. **URL Configuration:** Site URL `https://www.rutahogar.cl`. Redirect allowlist:
   `https://www.rutahogar.cl/auth/callback`, `http://localhost:5173/auth/callback`,
   `https://www.rutahogar.cl/definir-password`, `http://localhost:5173/definir-password`.
   Avoid broad production wildcards.
2. **SMTP:** enable custom SMTP; sender `novedades@rutahogar.cl`, name `RutaHogar`, host
   `smtp.resend.com`, port `465`, username `resend`, password a Resend API key entered directly in
   the dashboard. Verify the domain in Resend. Do not put the key in frontend configuration or docs.
3. **Sign In / Providers:** enable email and public signups; keep anonymous Auth sign-ins off.
   Enable Confirm email only after deploying the pending-verification UI and callback.
   Keep manual identity linking off: the implemented same-email flow uses automatic linking.
4. **Email provider:** minimum password length `8`; require uppercase/lowercase/digits/symbols.
   Enable Require current password when updating. Keep Secure email change on as defense in depth,
   though email changes are not exposed. Enable Secure password change only with its reauthentication
   flow tested; do not turn it on without checking the implemented change-password path.
5. **Email link validity:** use `1800` seconds and resend minimum interval `60` seconds where exposed.
   The displayed Email OTP expiry is shared: do not promise independent 24-hour confirmation and
   30-minute recovery lifetimes. Confirm actual hosted behavior before release.
6. **Google Cloud:** create a Web OAuth client and consent screen for RutaHogar; authorized origins
   `https://www.rutahogar.cl` and `http://localhost:5173`. Authorized redirect URI is the exact
   Supabase Google Callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`). Complete
   publication/test-user configuration as appropriate. Enter client ID/secret only in Supabase.
7. **Google provider:** enable Google and save client credentials; keep Skip nonce checks off and
   Allow users without an email off. Do not enable OAuth Server (not needed for Google sign-in).
8. **Session settings:** keep access token expiry `3600`, refresh-token reuse detection on and reuse
   interval `10`. Do not enable single-session enforcement or Pro-only timeouts for this release.
9. **Security notifications:** after SMTP works, enable Password changed and Sign-in method linked;
   customize brand/copy without modifying Supabase confirmation URL placeholders.
10. Apply `supabase/migrations/20261102000353_hu27_access_guards.sql` through the normal migration
    workflow. It preserves the existing 3 duplicate RUT groups and blocks new duplicate assignments;
    never merge those profiles automatically. In Authentication > Hooks, select
    `public.hu27_access_token_hook` as the **Custom Access Token** hook and save **before enabling
    Google**. If another custom-token hook already exists, integrate the checks instead of replacing
    it blindly. For rollback, disable this hook first, then use the matching file under `supabase/rollback`.
    Validate an existing staff password login, a newly confirmed user, same-email Google linking,
    wrong-email linking rejection, RUT conflict and expired/reused recovery links.
11. In Edge Functions secrets, check `APP_URL=https://www.rutahogar.cl` for the existing executive
    invitation function, plus its authorized Resend sender. Those invitations keep their existing
    generation path and must return to the same `/definir-password` route.

Save **each panel**: URL Configuration, SMTP, Email, Auth Hooks, Google provider and Sign In / Providers.
Configure SMTP and return URLs first; deploy the application; then enable confirmation and Google
after hook verification. This avoids enabling a provider before its application/authorization path exists.

### Local verification

- Auth/password, session-identity and tracking transport tests cover legacy password login, pending
  verification without private reads, safe errors/cooldown, stale-session rejection, OAuth role scope,
  recovery token routing and old-account evaluation write rejection.
- Two real Chrome tabs with mocked Auth and actual components passed login, cross-tab account
  switching, pending-old-result isolation, restored session after reload, cross-tab sign-out and recovery
  feedback. A mobile-width capture was visually reviewed. This is not a real Google/email test.
- Disposable PostgreSQL passed role/company self-change restrictions, commercial-profile upserts,
  legacy duplicate preservation, new duplicate rejection, hook grants, staff OAuth/refresh rejection and
  same-email enforcement. No hosted DDL was executed.
- Production build passes. The complete frontend suite retains three previously known failures:
  `chileanRut.test.js`, `projectAdapter.test.js` and the expired pending invitation in `coDebtorService.test.js`.
- Schema drift check reports the same nine unrelated existing divergences; HU27's own function/policy
  bodies match `schema.sql`. No unrelated schema definitions were rewritten.

Run from `frontend`:

```powershell
npm test -- --run src/lib/authPolicy.test.js src/services/__tests__/authAccess.test.js src/services/__tests__/trackingServiceTimeout.test.js src/services/__tests__/evaluationPlanAcceptance.test.js
npm run build
```

For SQL verification, create a disposable PostgreSQL database and execute
`backend/tests/auth/hu27_schema.sql`, the HU27 migration, then `backend/tests/auth/hu27_assertions.sql`
with `ON_ERROR_STOP=1`. The schema file creates fixture roles/tables: **never execute it in hosted Supabase**.

## Assumptions

Profile completion reuses the registration date controls and validates separate first/paternal/maternal
names, split RUT/check digit, Chilean phone prefix/format and verified read-only email. Security/access
appears once at the end of each profile. Desktop/mobile browser fixtures verified normalized saved values.

The owner confirmed email verification works and supplied evidence that the Custom Access Token hook is enabled. The owner also reports the Before User Created migration is applied and its hook enabled. These supersede the earlier unsaved dashboard state. Real Google same-account continuity and disabled-account acceptance remain to be verified. Google consent branding is configured in Google Auth Platform.

Hosted settings, DNS/domain verification and Google client publication require owner configuration.
Signing out revokes refresh sessions; already-issued JWTs may remain usable until expiry on services
that validate JWTs alone. Do not claim instantaneous global revocation without server-session checks.
Real provider/email/Safari verification remains a deployment acceptance step.

## Final verification and release status

- Branch: `feat/hu27-gestion-acceso-cuentas`; built on the export-center branch. If that branch is not merged, this branch also contains its commit history.
- Targeted access/policy/tracking frontend regression suite: 49 passed. Full frontend suite: 756 passed, 3 pre-existing failures (RUT fixture, project adapter fixture, expired co-debtor invitation fixture). Build passes.
- Backend exports/tracking: 127 passed, 6 failures. A temporary checkout of parent commit 5e0f1f7 reproduced the exact same six failures (one down-payment confirmation test and five projection/market-source tests). No new failures were introduced in those suites.
- Disposable PostgreSQL 15 passed both migrations, the signup assertions and the original access/RUT assertions. Previous rollback verification passed. Never run test fixture SQL against hosted Supabase.
- Browser fixtures cover existing/new incomplete Google callbacks, intentional logout, wrong-email linking, cancelled callback, legacy login, account switching across tabs and local logout. These simulate provider responses.
- Recovery stores no credentials in its reload context: only user ID, session ID, type and a 30-minute expiry. Browser tests verified OTP recovery, removal of URL tokens, reload, expired-context rejection and changed-session rejection. Context is cleared on logout.
- Access messages use the branded floating window; profile security uses matching typography, scoped borders and responsive columns. Fifteen captures at 393, 440 and 1280 px showed no horizontal overflow. Linked Google accounts show status instead of a linking button.
- Registration confirmation notice is visually highlighted and scoped to signup. Unconfirmed login exposes resend only inside that error. Mode changes clear previous messages.
- Global sign-out revokes refresh sessions. Existing access tokens can remain usable until expiry where APIs/RLS only validate JWTs; immediate cross-service revocation is not implemented.

## Before User Created: deployment and scope

The owner reports the following migration and hook are already applied/enabled. For another environment:

1. Apply `20261102000353_hu27_access_guards.sql` then `20261102200914_hu27_before_user_created_rut.sql`.
2. In Authentication > Hooks, enable Postgres / public.hu27_access_token_hook as Custom Access Token.
3. Add Before User Created, Postgres / public.hu27_before_user_created; save and enable without replacing the token hook.
4. Register a new test email with a RUT already in profiles: expect rejection and no new Auth user. Then verify a new RUT, Google completion and staff invitations. Hosted end-to-end checks remain distinct from local tests.

The signup hook checks trusted app_metadata.provider and normalizes the RUT against profiles. It is SECURITY INVOKER, uses the Auth-only profile policy and exposes no browser RPC. Google and missing-RUT staff provisioning remain supported. It does not reserve RUTs for concurrent pending signups, prove RUT ownership, merge accounts or delete legacy duplicates. The existing profile-write trigger remains authoritative.

To reproduce SQL verification, use a disposable database: hu27_schema.sql, both migrations, hu27_signup_assertions.sql, then hu27_assertions.sql. Disable the corresponding hook before using its rollback. Shared grants are retained to avoid breaking other hooks.
