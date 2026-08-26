# Phase 2 Design: SSO / IdP Federation Launch

Parent plan: `Plan.md` §4
Depends on: Phase 1 (`docs/specs/phase-1-core-catalog-portal.md`) — `Service.launchType`, admin console, `auth`/`AuthGuard`, `AuditService`.
BRD coverage: FR-05, FR-10, NFR-SEC-06, NFR-SEC-09, NFR Availability/Performance (SSO latency).

---

## 1. Summary

Phase 1's login is a seeded-user stand-in and every service tile's "Launch" is a stub that just logs an audit event. Phase 2 makes both real: the portal itself becomes an OIDC relying party against a mock Identity Provider, and clicking an `SSO`-launchType tile performs a genuine OIDC-federated redirect into one of two mock downstream apps — landing the user in, authenticated, with no second login prompt.

This phase intentionally does **not** touch `CREDENTIAL`-launchType services (Phase 3's job) or add a generic/admin-configurable OIDC target (scoped down to 2 fixed demo apps — see §9).

---

## 2. Architecture

```
apps/
  api/src/
    auth/            # MODIFIED — OIDC relying-party flow replaces seeded login
    sso-launch/       # NEW — resolves a Service's ssoTargetApp to a redirect URL
    admin/            # MODIFIED — PATCH accepts ssoTargetApp
    catalog/          # unchanged (entitlement-check helper reused by sso-launch)
    audit/            # unchanged (new SSO_LAUNCH eventType, same AuditService.record)
  web/src/
    pages/LoginPage.tsx        # MODIFIED — single "Sign in with SSO" button
    pages/ServiceDetail.tsx    # MODIFIED — Launch branches on launchType
    pages/admin/AdminConsole.tsx (+ new SsoTargetEditor.tsx)  # MODIFIED
  mock-idp/           # NEW — standalone Express app wrapping `oidc-provider`
  mock-target-apps/
    demo-app-a/       # NEW — minimal Express OIDC relying party
    demo-app-b/       # NEW — same, second instance
```

`mock-idp` and the two demo apps are separate processes (own `package.json`, own port), matching Plan.md's intent that the SSO flow be a real, network-level OIDC federation rather than something simulated inside the main API process. `mock-idp` reads the shared Postgres DB read-only (via its own minimal Prisma client pointed at the same `DATABASE_URL`) to enumerate the 4 seeded users and to emit `sub`/`email`/`department`/`role` as ID token claims — this avoids a second, driftable source of truth for "who are the users."

No new top-level `infra/` folder — Phase 1 already deviated from Plan.md's sketch by keeping `docker-compose.yml` at the repo root, and this phase follows that established convention rather than reintroducing the split.

---

## 3. Data Model

One new field, one new enum, on the existing `Service` model:

```prisma
enum SsoTargetApp {
  DEMO_APP_A
  DEMO_APP_B
}

model Service {
  // ...existing Phase 1 fields unchanged...
  ssoTargetApp SsoTargetApp?
}
```

Deliberately a typed enum, not Plan.md's loose `ssoConfig JSON?` sketch — since target apps are fixed at 2 (not admin-configurable arbitrary OIDC parameters), an enum is simpler and type-safe, consistent with how `launchType`/`status` already work. `ssoTargetApp` is meaningless for `CREDENTIAL`-launchType services and is ignored there.

No new tables. `AuditLog.eventType` gains one new value used by this phase: `SSO_LAUNCH`.

---

## 4. API Endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/auth/oidc/login` | public | Redirects browser to `mock-idp`'s authorization endpoint. **Replaces** `POST /auth/login`, which is removed. |
| GET | `/auth/oidc/callback` | public | OIDC callback — exchanges code, matches ID token email to a `User`, issues the existing session cookie, redirects to `/`. |
| GET | `/sso-launch/:serviceId` | any authenticated user (must be entitled) | Resolves the service's `ssoTargetApp` to that demo app's federated entry URL; returns `{ redirectUrl }`; writes `SSO_LAUNCH` audit row. |
| PATCH | `/admin/services/:id` | `CATALOG_ADMIN` | **Extended** (existing endpoint) — now also accepts `ssoTargetApp: 'DEMO_APP_A' \| 'DEMO_APP_B' \| null`. |

`GET /auth/me`, `POST /auth/logout`, and every Phase 1 `catalog`/`admin` endpoint are unchanged. `POST /catalog/:id/launch` (Phase 1's generic stub) remains, now used only for `CREDENTIAL`-launchType services until Phase 3.

---

## 5. Auth Data Flow (replaces Phase 1 login)

1. Unauthenticated user sees `LoginPage`'s single "Sign in with SSO" button (no email field) → full-page navigation to `GET /auth/oidc/login`.
2. Portal builds an OIDC authorization request (PKCE, standard `openid-client` RP flow) and redirects to `mock-idp`.
3. `mock-idp` shows a one-click "pick a user" screen the first time in a browser session; if the browser already has a `mock-idp` session (e.g. from a prior login this browsing session), it skips straight through — this is what makes a later SSO **launch** silent.
4. `mock-idp` redirects back to `GET /auth/oidc/callback?code=...`. The portal exchanges the code, reads `email` off the ID token, looks up the matching `User` row by email, and issues the **same** session JWT/httpOnly cookie `AuthService` already produces in Phase 1.
5. Browser lands on `/`; `AuthContext`'s existing `/auth/me`-on-mount probe (already built in Phase 1) picks up the new session with no frontend changes needed there.

`AuthGuard`, `RolesGuard`, `@CurrentUser()`, `@Roles()`, and `AuthService.verify()` are **completely unchanged** — this is the seam Phase 1 was explicitly built to leave open (see Task 3's design note in the Phase 1 plan).

---

## 6. SSO Launch Data Flow

1. On `ServiceDetail`, the Launch button branches on `service.launchType`:
   - `SSO` → `GET /sso-launch/:id`, then `window.location.href = redirectUrl` (a real full-page navigation, since this crosses origins to the demo app — not an XHR/fetch).
   - `CREDENTIAL` → unchanged Phase 1 stub (`POST /catalog/:id/launch`, no navigation).
2. `sso-launch` re-checks entitlement using the same helper `catalog`'s `assertEntitled` already implements (imported, not re-derived, so the two access checks can't drift apart), reads `ssoTargetApp`, resolves it to that demo app's federated entry URL, writes `AuditService.record(user.id, 'SSO_LAUNCH', serviceId)`, returns `{ redirectUrl }`.
3. The demo app's own OIDC client redirects to `mock-idp`; since the user already has a `mock-idp` session from §5, they land inside the demo app authenticated, with **no second login prompt** — the concrete thing this phase exists to prove end-to-end.

---

## 7. Admin UI

A new `SsoTargetEditor` component, rendered in the same table-row expand area as the existing `EntitlementEditor`/`AliasEditor` (same inline-edit pattern: a `<select>` — None / Demo App A / Demo App B — that `PATCH`es `/admin/services/:id` on change and calls the row's existing `onChanged`/`reload`). Rendered only when the service's `launchType === 'SSO'`; omitted entirely for `CREDENTIAL` services, matching the field's semantics.

---

## 8. Error Handling

- `GET /sso-launch/:id` on an `SSO` service with `ssoTargetApp` unset → clear 4xx with a plain-language message ("This service isn't configured for SSO launch yet — contact the help desk"), not a crash or raw error. Frontend surfaces it via the existing `ErrorState`-style pattern.
- `GET /auth/oidc/callback` with no matching `User` for the ID token's email → plain-language error page with a help-desk link (same tone as `EmptyState`/`ErrorState`), not raw JSON.
- A live `mock-idp` or demo-app outage during the browser's own redirect hops (step 3 of §5, step 3 of §6) is outside anything the portal can catch server-side — explicitly accepted as a known prototype limitation, not built out with health-checking (consistent with Phase 1's `healthCheckUrl` already being a stub).

---

## 9. Explicitly Out of Scope for Phase 2

- `CREDENTIAL`-launchType services and anything vault-related (Phase 3).
- Admin-configurable arbitrary OIDC parameters per service — scoped down to picking between exactly 2 fixed demo apps (see §3's rationale).
- MFA (NFR-SEC-06 notes this is deferred to whatever real IdP capability eventually replaces `mock-idp`; the mock exposes the same OIDC surface a real MFA-capable IdP would, but doesn't implement MFA itself).
- Access-request workflow (Phase 4).
- The pre-existing focus-management gap and FR-24 first-run banner carried over from Phase 1 (tracked separately, not blocking this phase).

---

## 10. Testing Plan

- **Unit:** `sso-launch` resolves the correct redirect URL per `ssoTargetApp` value; rejects with a clear error when unset on an `SSO` service; the OIDC callback handler's logic (exchange → match `User` by email → issue cookie) tested with the `openid-client` exchange mocked, not a live IdP round-trip.
- **Integration:** `/auth/oidc/login` redirects (302) to `mock-idp`'s authorize endpoint; `/sso-launch/:id` enforces the same entitlement rule `catalog` does (403/404 parity); admin `PATCH` persists `ssoTargetApp` and is `CATALOG_ADMIN`-only.
- **E2E (Playwright):** boots all four processes (api, web, `mock-idp`, both demo apps) and drives the full browser flow — log in via mock IdP → click an `SSO` tile → land authenticated inside a demo app with no second login prompt. This is the literal scenario Plan.md §4 asks for.
- **Frontend unit:** `ServiceDetail`'s Launch button branches correctly by `launchType`; `LoginPage` navigates to the right URL; `SsoTargetEditor` PATCHes correctly and is hidden for `CREDENTIAL` services.
- **Accessibility:** axe-core pass on the new `LoginPage` button and `SsoTargetEditor`; both `mock-idp`'s picker screen and the demo apps' landing pages get a basic keyboard-reachability check (lower bar than the main portal, since these are throwaway demo surfaces, not the product itself).
