# Phase 3 Design: Credential Vault & Credential-Assisted Launch

Parent plan: `Plan.md` §5
Depends on: Phase 1 (`Service.launchType = CREDENTIAL`, admin console, `AuditService`, entitlement checks) — Phase 2's `auth` module (session identity), `sso-launch` module (pattern reused, not code-shared)
BRD coverage: FR-06, FR-07, FR-08, FR-17, FR-18, FR-19, FR-27, NFR-SEC-01–08

---

## 1. Summary

Phase 1 shipped `LaunchType.CREDENTIAL` as an enum value with no real behavior behind it — clicking Launch on a CREDENTIAL service just called `POST /catalog/:id/launch`, which logged a `CATALOG_LAUNCH` audit row and did nothing else. Phase 2 built real SSO federation for `SSO`-launchType services but explicitly left CREDENTIAL services alone.

Phase 3 makes CREDENTIAL launch real: each employee stores their own encrypted credential(s) for a non-SSO service (FR-27: possibly more than one, with a default), views or edits them only after re-proving their identity via a mock Active Directory re-authentication step (FR-08, NFR-SEC-04a), and launches by having the backend decrypt server-side and hand the browser a single-use, short-lived token that drives an auto-submitting login into a purpose-built mock legacy app — never a plaintext password in an inspectable JSON response (NFR-SEC-04b).

This is, per `Plan.md` §5, "the highest-risk phase in the BRD" and is scoped, built, and reviewed in isolation from Phases 1/2 for that reason.

---

## 2. Architecture

```
apps/
  api/src/
    vault/                    # NEW — Credential CRUD, encryption, re-auth gate, lockout
      ad-reauth/               # NEW — mock AD adapter (own sub-module, injected into vault)
    credential-launch/         # NEW — decrypt + single-use injection token, mirrors sso-launch
    catalog/                   # unchanged (assertEntitled reused by credential-launch)
    admin/                     # unchanged — no new admin-settable fields (see §9.1)
    audit/                     # unchanged (3 new eventTypes, same AuditService.record)
  web/src/
    pages/ServiceDetail.tsx           # MODIFIED — CREDENTIAL branch gets real behavior
    pages/VaultManager.tsx            # NEW — list/add/edit/delete/reveal own credentials
    components/ReauthModal.tsx        # NEW — Windows/AD password re-entry prompt
  mock-target-apps/
    legacy-demo-app/           # NEW — plain Express form-post login, no OIDC
```

`legacy-demo-app` is deliberately not an OIDC party — FR-06 is specifically about "native username/password login," so the demo target needs a real HTML login form to auto-submit into, contrasting with Phase 2's federated demo apps.

No Security Admin UI and no change to `admin/` — see §9.1 for why.

---

## 3. Data Model

Two new Prisma preview-feature pieces: `multiSchema`, and a second schema, `vault`, holding every Phase 3 table — this is how NFR-SEC-01's "never stored alongside application data in the same database" gets applied without a real separate database or KMS existing yet (an approximation `Plan.md` §5 already accepts explicitly).

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "vault"]
}

// Every existing Phase 1/2 model gains `@@schema("public")` (no behavior change).

model Credential {
  id                String    @id @default(uuid())
  userId            String
  serviceId         String
  label             String?
  encUsername       String
  encPassword       String
  isDefault         Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastRotatedAt     DateTime  @default(now())
  passwordExpiresAt DateTime?

  @@index([userId, serviceId])
  @@schema("vault")
}

model AdAccount {
  adUsername   String @id
  passwordHash String

  @@schema("vault")
}

model CredentialVaultLockout {
  userId         String
  serviceId      String
  failedAttempts Int       @default(0)
  lockedUntil    DateTime?
  updatedAt      DateTime  @updatedAt

  @@id([userId, serviceId])
  @@schema("vault")
}
```

- `Credential.userId`/`serviceId` reference `User`/`Service` by id (no Prisma-level FK relation declared across schemas — cross-schema relations need the FK enforced at the DB level via a manually-written migration statement; Prisma's relational API isn't used for these, application code looks them up explicitly). This needs to be verified as workable during implementation — flagged as a risk in §11, not asserted as certain here.
- "Only one `isDefault` per user+service" is an application-layer invariant (a transaction unsets the previous default when a new one is set), matching how Phase 1/2 already handle invariants Postgres itself doesn't naturally express.
- `AdAccount` is seed data only — one row per seeded `User.adUsername`, `passwordHash` a bcrypt hash of a single fixed dev-only password, documented in `.env.example`/README exactly like Phase 2 documented its dev-only OIDC secrets.
- `AuditLog.eventType` gains three values: `CREDENTIAL_REVEAL`, `CREDENTIAL_UPDATE`, `CREDENTIAL_LAUNCH`.

---

## 4. Encryption

`CredentialCryptoService` — AES-256-GCM via Node's built-in `crypto`, no new dependency (matches Phase 2's precedent for the OIDC-adjacent crypto needs). Key access goes through an injectable `KeyProvider` interface:

```ts
interface KeyProvider { getKey(): Buffer } // 32 bytes
class EnvKeyProvider implements KeyProvider {
  getKey() { return Buffer.from(requireEnv('CREDENTIAL_VAULT_KEY'), 'hex'); }
}
```

`encrypt(plaintext): string` returns `base64(iv[12] + authTag[16] + ciphertext)`; `decrypt(blob): string` reverses it. This is the seam `Plan.md` §5 asks for — swapping to a real KMS later means a new `KeyProvider` implementation, not a change to `Credential` CRUD or `credential-launch`.

---

## 5. Re-Authentication Flow (FR-08, NFR-SEC-04a/e)

BRD's "prompt then proceed" needs a pause for the UI to show a password-entry modal, so it's two calls:

1. `POST /vault/credentials/:serviceId/reauth` `{ adPassword }`
   - `AdReauthService` (in the `ad-reauth` sub-module) looks up the caller's `User.adUsername` in `AdAccount`, bcrypt-compares.
   - Success: issues a step-up token (opaque random string, server-side in-memory map, 2-minute TTL, scoped to `{ userId, serviceId }`, single-use), resets `CredentialVaultLockout.failedAttempts` to 0. Returns `{ reauthToken }`.
   - Failure: increments `CredentialVaultLockout.failedAttempts` for `{ userId, serviceId }`. At 5 failures, sets `lockedUntil = now + 5min` and every request while locked returns `423 Locked` with a plain-language message and remaining time (FR-19), regardless of whether the password given this time was actually correct.
2. Every subsequent reveal/create/update/delete call must include that `reauthToken`; it's validated (unexpired, matching user+service, not already consumed) and consumed on first successful use. A second reveal needs a fresh re-auth call — this is deliberate: BRD says re-entry is mandatory "for every reveal/update action," not once per browser session.

Listing credentials (id, label, username, isDefault, lastRotatedAt, passwordExpiresAt — **no password**) needs no re-auth at all: FR-07 gates the *password*, and the employee needs to see their own saved usernames/labels just to pick which credential to manage or launch with.

---

## 6. Credential CRUD Endpoints

All under `vault`, scoped to the calling user's own credentials only (no admin surface — see §9.1):

| Method | Path | Re-auth token required | Audit event |
|---|---|---|---|
| GET | `/vault/credentials/:serviceId` | no | — |
| POST | `/vault/credentials/:serviceId/reauth` | — | — |
| POST | `/vault/credentials/:serviceId` | yes | `CREDENTIAL_UPDATE` |
| PATCH | `/vault/credentials/:serviceId/:credentialId` | yes | `CREDENTIAL_UPDATE` |
| DELETE | `/vault/credentials/:serviceId/:credentialId` | yes | `CREDENTIAL_UPDATE` |
| PATCH | `/vault/credentials/:serviceId/:credentialId/default` | no | `CREDENTIAL_UPDATE` |
| GET | `/vault/credentials/:serviceId/:credentialId/reveal` | yes | `CREDENTIAL_REVEAL` |

Setting default doesn't touch a secret value, so it's excluded from the re-auth requirement — a deliberate scope call, flagged in §9.1.

---

## 7. Launch Flow (distinct mechanism from Reveal — no re-auth)

1. `ServiceDetail`'s Launch button, for a `CREDENTIAL` service: if the user has no credential at all for it, the button becomes "Set up credential" linking to `VaultManager`. Otherwise `POST /credential-launch/:serviceId {credentialId?}` (omitted → the current default).
2. `CredentialLaunchService` re-checks entitlement via the same `CatalogService.assertEntitled` `sso-launch` already reuses, loads the resolved `Credential`, decrypts server-side, mints a single-use launch token (in-memory, ~60s TTL, one-shot consumption) mapped to `{ username, password, targetLoginUrl: LEGACY_APP_LOGIN_URL }`. Logs `CREDENTIAL_LAUNCH`. Returns `{ injectUrl }`.
3. Frontend does a full-page navigation (`window.location.href = injectUrl`), same cross-origin-handoff pattern Phase 2 established for SSO. No fetch/XHR carries the credential.
4. `GET /credential-launch/inject/:token` — consumes the token (second call 404s), sets `Cache-Control: no-store`, and returns a small server-rendered HTML page: a hidden `<form method="POST" action="{legacy-demo-app}/login">` with `username`/`password` pre-filled, auto-submitted via an inline script on load. This is the closest a prototype can get to Plan.md's "single-use... auto-submitting login, raw password never delivered as inspectable JSON" — it is **not** a real secure proxy (the values do sit briefly in the DOM of a one-time page), and the spec says so plainly rather than overclaiming.

---

## 8. Failure Path (FR-17)

Because the auto-submit is a genuine cross-origin form POST, the portal has no visibility into whether `legacy-demo-app` accepted the login — the browser has navigated away. Since `legacy-demo-app` is our own demo app, it's built to cooperate: on a rejected login it redirects back to `WEB_BASE_URL/services/:id?credentialLaunchFailed=1` instead of showing its own error page. `ServiceDetail` checks for that query flag on mount and shows a direct "this credential didn't work — update it" banner linking straight into `VaultManager` for that credential, rather than a generic error (FR-17, FR-19).

A successful login just lands the user in `legacy-demo-app`'s own page — same as any real launch, no redirect back needed.

---

## 9. Frontend

**`ServiceDetail.tsx`** — `CREDENTIAL` branch gains: a primary Launch button (uses the default credential) plus, when more than one credential exists, a small "launch with…" list naming each by label (FR-27's "explicitly select and launch using a non-default credential"). The `credentialLaunchFailed` banner from §8.

**`VaultManager.tsx`** (new route `/services/:id/credentials`, `RequireAuth`, no special role — every employee manages only their own) — table of the caller's credentials for that service (label, username, isDefault badge, lastRotatedAt, expiry warning banner if `passwordExpiresAt` is within 14 days — FR-18's stub). Add/Edit/Delete/Reveal each open `ReauthModal` first; the modal's `onSuccess` hands the caller the `reauthToken` to complete the actual action. "Set default" skips the modal (§6).

**`ReauthModal.tsx`** — single password field, submits to `POST /vault/credentials/:serviceId/reauth`; on `423` shows the lockout message with remaining time in plain language.

### 9.1 Choices `Plan.md` left open — explicitly flagged

1. **No admin-settable "connection details" field for CREDENTIAL services.** `Plan.md`/FR-10 mention admin configuring "the relevant connection details," but Phase 3 uses one fixed `legacy-demo-app` rather than an admin-configurable arbitrary login URL — the same simplification Phase 2 made (2 fixed SSO demo apps instead of an admin-configurable OIDC target).
2. **FR-26's Help Desk support view was never actually built in Phase 1**, despite `Plan.md`'s traceability table listing it as delivered there. Phase 3's job per that table is only "excludes credential values" — there's nothing to exclude from yet. This gap is called out honestly, not backfilled here; it's a pre-existing Phase 1 gap, not Phase 3 scope.
3. **No Security Admin UI.** The `SECURITY_ADMIN` role exists in the schema (unused since Phase 1) and `Plan.md` §2.4 loosely implies it "reviews audit logs, vault configuration," but no BRD requirement or `Plan.md` §5 component names a screen for this. All three vault audit event types are fully logged and directly queryable in `AuditLog`; building a viewer for them is deferred as a separate, later concern.

---

## 10. Error Handling

- `POST /vault/credentials/:serviceId/reauth` with a wrong password → `401` plain-language ("That password wasn't recognized"), not detail about which check failed. Locked-out state → `423` with remaining lockout time.
- Reveal/update/delete without a valid (or with an expired/already-used) `reauthToken` → `401`, directs the user back through re-auth — never silently allowed.
- `POST /credential-launch/:serviceId` on a service with no credential (and none specified) → `400` "You don't have a saved credential for this service yet," pointing at `VaultManager` — mirrors Phase 2's "not configured" 400 pattern for SSO.
- `GET /credential-launch/inject/:token` with a missing/expired/already-consumed token → plain-language HTML error page with a help-desk link (same tone as Phase 2's OIDC-callback-failure page), not raw JSON.
- A failed target login surfaces through the FR-17 flow in §8, not a raw error.

---

## 11. Risks / Open Implementation Questions

- **Cross-schema references**: `Credential.userId`/`serviceId` pointing at `public.User`/`public.Service` from the `vault` schema needs verifying against this Prisma version's `multiSchema` support during implementation; if FK enforcement across schemas proves awkward, the fallback is enforcing referential integrity at the application layer only (no DB-level FK), documented as a deviation if taken.
- **In-memory token maps** (step-up `reauthToken`, launch token) don't survive an API process restart — acceptable for a local prototype (matches Phase 2's precedent of accepting in-process, non-persistent state for short-lived OIDC `state`/PKCE values), but explicitly not production-grade.

---

## 12. Explicitly Out of Scope for Phase 3

- Real KMS/HSM and real AD/LDAP — both mocked behind swappable interfaces (`KeyProvider`, `AdReauthService`).
- MFA for the portal's own login (Phase 2's territory, already deferred there to "whatever real IdP eventually provides").
- Shared/departmental credentials — BRD §10.3's open question, resolved as individual-only (NFR-SEC-05's audit model assumes one identifiable user per credential).
- Security Admin audit-log viewer UI (§9.1).
- Backfilling FR-26's Help Desk view (§9.1).
- Real security architecture review, penetration test, incident-response runbook (`Plan.md` §8 — explicit prototype exclusion, called out as a mandatory pre-production gate instead).
- Access-request workflow (Phase 4).

---

## 13. Testing Plan

- **Unit:** `CredentialCryptoService` encrypt/decrypt round-trip; `CredentialVaultLockout` threshold/backoff math; default-credential selection/reassignment logic (FR-27); `AdReauthService` against seeded `AdAccount` rows (correct/incorrect password).
- **Integration:** reveal/update/delete all reject without a valid `reauthToken`; repeated failed re-auth attempts trigger `423` lockout and it clears after the backoff window; every reveal/update/launch writes exactly one audit row of the correct `eventType`; `credential-launch` enforces the same entitlement check `catalog` does.
- **E2E (Playwright, six processes now — api, web, mock-idp, demo-app-a, demo-app-b, legacy-demo-app):** full reveal flow requiring re-auth end-to-end; launch using a non-default credential; a deliberately wrong stored credential to prove the FR-17 recovery banner actually fires and links to the right place.
- **Frontend unit:** `ReauthModal` success/lockout states; `VaultManager` CRUD and default-setting; `ServiceDetail`'s credential-picker and failure-banner rendering.
- **Manual security-review checklist** (in place of a real pen test, per `Plan.md` §5): confirm no code path logs, caches, or returns a plaintext password outside the two designated channels (`GET .../reveal` and the inject page), and that the inject page sets `Cache-Control: no-store`.
- **Accessibility:** axe-core pass on `VaultManager` and `ReauthModal`; `legacy-demo-app`'s login form gets the same lower-bar keyboard-reachability check Phase 2 applied to its own demo apps.
