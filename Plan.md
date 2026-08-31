# Implementation Plan: Enterprise Launchpad (Internal Service Catalog & SSO Portal)

Source: `BRD_Internal_Service_Catalog_Portal_v0.3.docx`
Mode: **Prototype / local demo build.** Real Identity Provider, enterprise vault, and HR system do not exist yet — every external integration is built behind a swappable interface, seeded with mock data, so a real integration later is a config/adapter change, not a rewrite.

---

## 1. Guiding Principles

1. **Spec-driven, phased delivery.** The BRD is decomposed into 4 phases, each independently buildable, testable, and demoable. Later phases depend on earlier ones but not vice versa.
2. **Mock everything external, behind a real interface.** The mock OIDC IdP speaks real OIDC. The mock AD service implements the same interface a real AD/LDAP adapter would. Swapping later means writing a new adapter, not touching business logic.
3. **Modular monolith, not microservices.** One backend, one frontend, one database — internally organized into the same module boundaries the BRD's phases already imply. See §2.
4. **Security requirements are first-class**, per BRD §9.1 — the vault phase (Phase 3) is scoped and reviewed on its own rather than bolted onto the catalog.
5. **YAGNI.** Nothing in this plan builds for a future requirement that isn't in the BRD.

---

## 2. Architecture

### 2.1 Approach

**Modular monolith.** One NestJS (TypeScript) backend service, internally split into bounded modules that mirror the BRD's phases:

```
apps/
  api/                      # NestJS backend
    src/
      catalog/              # Phase 1 — services, categories, search, favorites
      admin/                 # Phase 1 — catalog CRUD, entitlements
      auth/                  # Phase 1+2 — session, RBAC guards, OIDC login (mock IdP)
      sso-launch/            # Phase 2 — SSO launch orchestration
      vault/                 # Phase 3 — credential storage, reveal, injection
      ad-reauth/             # Phase 3 — mock Active Directory re-auth adapter
      access-requests/       # Phase 4 — request/approve workflow
      audit/                 # cross-cutting — immutable audit log
      common/                # guards, interceptors, decorators, pipes
  web/                      # React + TypeScript SPA (end-user + admin views)
  mock-idp/                 # standalone OIDC provider (oidc-provider), seeded users
  mock-target-apps/          # 2 toy downstream apps to federate SSO against, for demoing Phase 2
infra/
  docker-compose.yml        # postgres, api, web, mock-idp, mock-target-apps
docs/
  specs/                    # per-phase specs (this plan is decomposed into these next)
```

Each module talks to others only through injectable service interfaces (e.g. `VaultService`, `AuditService`) — never reaching into another module's database tables directly. This is what lets Phase 3 (the vault) later become an actually-separate service with a real HSM/KMS behind it without touching Phase 1/2 code.

**Why not microservices now:** this is a single-machine prototype. Distributed-systems overhead (service discovery, inter-service auth, N docker-compose files) has no payoff until there's a real scaling or team-split need. The module boundaries are the seam for that later, if it happens.

### 2.2 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS + TypeScript | Guards/interceptors map directly onto RBAC, audit logging, and the vault's re-auth gate |
| Database | PostgreSQL + Prisma ORM | Relational fit for entitlements/roles; Prisma migrations keep schema changes reviewable |
| Frontend | React + TypeScript + Vite + Tailwind | Fast local iteration; Tailwind + a headless component kit (Radix) supports WCAG AA without reinventing widgets |
| Mock IdP | `oidc-provider` (npm) | Real OIDC federation, not a fake login form — Phase 2's SSO flow is genuine, just pointed at a fake IdP instead of Azure AD/Okta |
| Mock AD | Custom stub service, same interface a real AD/LDAP client would implement | Swappable later |
| Vault crypto | AES-256-GCM, key sourced via a `KeyProvider` interface (local dev = env var; real KMS = later adapter) | Matches NFR-SEC-01 without requiring a real KMS to exist yet |
| Containerization | Docker Compose | One command brings up the whole system locally |
| Testing | Jest (unit/integration), Playwright (e2e) | Standard for this stack |

### 2.3 Core Data Model (shared across phases)

```
User            (id, email, displayName, department, role, adUsername)
Service         (id, name, description, logoUrl, category, tags[], ownerId,
                  launchType: SSO | CREDENTIAL, status: ACTIVE|INACTIVE|RETIRED,VendorName,supportContact, docsUrl, healthCheckUrl, ssoConfig JSON?)
ServiceAlias    (id, serviceId, alias)                # FR-22 search synonyms
ServiceEntitlement (id, serviceId, department?, role?, group?)  # FR-11 visibility
Favorite        (userId, serviceId)
Credential      (id, userId, serviceId, encUsername, encPassword, isDefault,
                  createdAt, updatedAt, lastRotatedAt) # Phase 3
AccessRequest   (id, userId, serviceId, status, requestedAt, decidedBy, decidedAt) # Phase 4
AuditLog        (id, userId, eventType, serviceId?, timestamp, metadata JSON)      # cross-cutting
```

Full per-phase field detail and migrations are defined in each phase's own spec (§7).

### 2.4 RBAC Roles

**Simplified (2026-08-31) to two roles** — the original five-role sketch below (Employee / Service
Owner / Catalog Admin / Help Desk / Security Admin) was never load-bearing beyond Catalog Admin:
no phase built role-gated behavior for Service Owner, Help Desk, or Security Admin. Collapsed to
avoid maintaining distinctions the product doesn't act on:

- **Employee** — default; sees only entitled services, manages own credentials/favorites.
- **Admin** — full CRUD over the catalog, entitlements, launch config (FR-09/10); the only
  privileged role in the system. Later phases that need a narrower or additional role (e.g. a
  real Help Desk support view for FR-26) reintroduce it deliberately when they actually build
  role-specific behavior, rather than carrying an unused role forward speculatively.

### 2.5 Cross-Cutting Concerns

- **Audit logging (NFR-SEC-05, FR-12):** every launch, credential reveal/update, and admin change is written to an append-only `AuditLog` table via a single `AuditService`, never written ad hoc from individual modules.
- **Accessibility (NFR-UX-01):** WCAG 2.1 AA is a build-time discipline, not a final audit pass — Radix primitives for interactive components, semantic HTML, keyboard nav and contrast checked per component as it's built.
- **Language (NFR-UX-02):** resolved to English-only, no RTL — but UI strings are centralized in one place from the start so adding a language later doesn't require touching component code.
- **Responsive layout (FR-16, NFR-UX-04):** Tailwind breakpoints, tested at desktop/tablet/mobile viewport widths.

---

## 3. Phase 1 — Core Catalog Portal

**BRD coverage:** FR-01–04, FR-09–14, FR-16, FR-20–26, NFR-UX-01/03/04/05, NFR-Maintainability

**Depends on:** nothing (foundation phase)

### Components
- `auth`: session handling, login (initially a simple seeded-user login stands in until Phase 2 wires real OIDC), RBAC guard, current-user context.
- `catalog`: list/search/filter services, aliases/synonym matching (FR-22), favorites, "no results" fallback (FR-23), first-run role-based highlight (FR-24).
- `admin`: CRUD for `Service`, `ServiceEntitlement`, `ServiceAlias`; activate/deactivate/retire.
- `audit`: launch-event logging (credential/SSO event types added in later phases).
- Frontend: catalog home (tiles/cards), search/filter bar, service detail view (FR-20), admin console, "report a problem" flow (FR-25).

### Data Flow
1. User logs in → session established with department/role claims.
2. Home page requests `/catalog` → backend filters `Service` by `ServiceEntitlement` matching the user's department/role/group → returns only entitled, active services.
3. Search queries match name, category, tag, and `ServiceAlias` (fuzzy/misspelling tolerance via trigram similarity in Postgres).
4. Empty search results return suggested next actions (browse categories / request access / help desk link) instead of a bare empty state.
5. Admin changes to a `Service` are immediately reflected in the catalog — no deploy required (NFR-Maintainability).

### Error Handling
- No entitled services for a user → friendly empty state directing to help desk, not a broken page.
- Service marked `RETIRED`/`INACTIVE` disappears from the catalog but its audit history is retained.

### Testing
- Unit: entitlement-filtering logic, alias/synonym search matching.
- Integration: `/catalog` returns correct set per role/department; admin CRUD enforces `CatalogAdmin`-only access.
- E2E (Playwright): log in as two users with different departments → confirm distinct catalogs; search misspelled service name → confirm match; admin adds a service → confirm it appears for entitled users without a restart.
- Accessibility: automated axe-core pass + manual keyboard-only walkthrough of catalog + admin console.

---

## 4. Phase 2 — SSO / IdP Federation Launch

**BRD coverage:** FR-05, FR-10, NFR-SEC-06, NFR-SEC-09, NFR Availability/Performance (SSO latency)

**Depends on:** Phase 1 (`Service.launchType`, admin config UI)

### Components
- `mock-idp`: standalone OIDC provider (`oidc-provider`), seeded with users matching `User` records (department/role as claims).
- `mock-target-apps`: two toy downstream web apps that federate with `mock-idp` via OIDC — these stand in for real SSO-enabled organizational services, so the redirect launch is demonstrably real, not simulated.
- `auth`: portal login itself becomes OIDC against `mock-idp` (replacing the Phase 1 seeded-user stand-in), satisfying NFR-SEC-06 (MFA support deferred to real IdP capability — the mock IdP exposes the same OIDC surface a real MFA-capable IdP would).
- `sso-launch`: given a `Service` with `launchType = SSO`, resolves its `ssoConfig` (issuer, client id, redirect target) and returns the redirect URL to the frontend; portal does not intercept or store credentials at any point in this path.

### Data Flow
1. Admin configures a service's `ssoConfig` (protocol, issuer, client id, target launch URL) via the Phase 1 admin console (FR-10).
2. User clicks an SSO-tagged tile → frontend calls `/sso-launch/:serviceId` → backend returns the service's federated entry URL → browser navigates there.
3. Target app's own OIDC client redirects to `mock-idp`; since the user already has a session there (portal login = IdP login), the target app authenticates them without a second prompt — a real SSO experience end to end.
4. Launch event logged in `AuditLog` (`eventType: SSO_LAUNCH`).

### Error Handling
- IdP unreachable or target service down → plain-language error (FR-19) with a help-desk link, no raw error/stack detail shown to the user.
- Misconfigured `ssoConfig` caught at admin save time with validation, not discovered at user launch time.

### Testing
- Integration: `sso-launch` resolves the correct redirect URL for a correctly configured service; rejects launch for a misconfigured one with a clear error.
- E2E: full browser flow — log in to portal (mock IdP) → click SSO tile → land authenticated inside a mock target app with no second login prompt.

---

## 5. Phase 3 — Credential Vault & Credential-Assisted Launch

**BRD coverage:** FR-06–08, FR-17–19, FR-27, NFR-SEC-01–08 (all)

This is the highest-risk phase in the BRD and is scoped, built, and tested in isolation from Phases 1/2 for that reason.

**Depends on:** Phase 1 (`Service.launchType = CREDENTIAL`), Phase 2's `auth` module (session identity)

### Components
- `vault`: `Credential` CRUD, AES-256-GCM encryption/decryption via a `KeyProvider` interface, multi-credential-per-service with one `isDefault` (FR-27), rate limiting on reveal attempts (NFR-SEC-04d).
- `ad-reauth`: mock Active Directory adapter — validates a re-entered password against seeded fake AD accounts in real time; the vault never itself stores or caches this password (NFR-SEC-04e).
- `sso-launch`-equivalent for credentials: on launch, backend decrypts server-side and returns a **single-use, short-lived injection token** the frontend uses to auto-submit a hidden login form at the target service — the raw password is never delivered to the browser as inspectable JSON, satisfying NFR-SEC-04b even in prototype form.
- `audit`: distinct event types `CREDENTIAL_REVEAL`, `CREDENTIAL_UPDATE`, `CREDENTIAL_LAUNCH` (NFR-SEC-04c), separate from `SSO_LAUNCH`.

### Data Flow — Reveal/Update (FR-08, NFR-SEC-04a)
1. User requests to view/edit a stored credential → backend requires re-entry of the Windows/AD password (existing session, however recent, is **not** sufficient).
2. Password sent to `ad-reauth` adapter, validated in real time — never persisted.
3. On success, credential is decrypted server-side and delivered once, over the authenticated session, not cached client-side or written to browser storage/history.
4. `CREDENTIAL_REVEAL` audit event logged with user, service, timestamp.
5. Repeated attempts are rate-limited per user/service; repeated failed re-auth triggers lockout/backoff (NFR-SEC-04d).

### Data Flow — Launch
1. User clicks a `CREDENTIAL`-launch tile → selects default or a specific non-default credential (FR-27).
2. Backend decrypts server-side, issues a single-use injection token.
3. Frontend uses the token to trigger an auto-submitting login at the target service; the token is invalidated immediately after use.
4. `CREDENTIAL_LAUNCH` logged; if the target service rejects the login, FR-17's failure path below fires.

### Error Handling (FR-17–19)
- Failed credential-assisted launch (e.g. target service rejects the login) is detected and the user is shown a direct path to update the stored credential, not a generic error.
- Known password-expiry data (where available) triggers an advance-notice prompt (FR-18) — stubbed as a manually-set expiry field in prototype, since no real expiry feed exists yet.
- All failure modes shown in plain language with a help-desk route (FR-19); no technical detail leaks to the end user, though full detail is preserved in the audit/log trail for support staff.

### Security Notes (NFR-SEC-01–08)
- Vault tables live in a separate Postgres schema from ordinary catalog data (NFR-SEC-01's "never stored alongside application data" applied at the schema level, since a real KMS/HSM doesn't exist yet).
- Encryption keys sourced via `KeyProvider` — local dev implementation reads from an env var explicitly marked as non-production; swapping to a real KMS is an adapter, not a schema or logic change.
- TLS termination assumed at the reverse proxy in any non-local deployment (NFR-SEC-02) — noted as a deployment requirement, not something the app layer can enforce itself.
- RBAC enforced so no role — including Catalog Admin — has standing access to plaintext (NFR-SEC-04): only the owning user, post re-auth, can trigger a reveal.
- A real security architecture review and penetration test (NFR-SEC-07) and an incident-response runbook (NFR-SEC-08) are **out of scope for the prototype build** but are called out explicitly as launch gates before any real deployment — see §8.

### Testing
- Unit: encryption/decryption round-trip; rate-limit and lockout logic; default-credential selection logic (FR-27).
- Integration: reveal endpoint rejects without valid AD re-auth; reveal endpoint enforces rate limits; audit events are written for every reveal/update/launch.
- E2E: full reveal flow requiring re-auth; launch with a non-default credential; simulate a target-service login failure and confirm the FR-17 recovery path.
- Security-focused review: confirm no code path logs, caches, or returns a plaintext credential outside the single-use delivery mechanism (manual code review checklist, since a real pen test is out of scope here).

---

## 6. Phase 4 — Access Request Workflow

**BRD coverage:** FR-15 (Could-priority — lowest priority phase, first candidate to defer if time-constrained)

**Depends on:** Phase 1 (`Service`, `User`, `AuditLog`)

### Components
- `access-requests`: create a request for a service not currently visible to the user; Catalog Admin approve/reject queue; on approval, an `ServiceEntitlement` is created for that user.

### Data Flow
1. User searches for a service they lack entitlement to (or uses an explicit "request access" action) → `AccessRequest` created with status `PENDING`.
2. Catalog Admin reviews pending requests → approves (creates a targeted `ServiceEntitlement` for that user) or rejects, with reason.
3. User is notified in-app; service appears in their catalog on next load if approved.

### Error Handling
- Duplicate pending requests for the same user/service are prevented, not silently duplicated.

### Testing
- Integration: approval creates exactly the entitlement needed and no broader access; rejection leaves catalog unchanged.
- E2E: request → approve → service appears in requester's catalog.

---

## 7. Requirements Traceability

| BRD ID | Phase | BRD ID | Phase | BRD ID | Phase |
|---|---|---|---|---|---|
| FR-01 | 1 | FR-14 | 1 | FR-27 | 3 |
| FR-02 | 1 | FR-15 | 4 | NFR-SEC-01–08 | 3 |
| FR-03 | 1 | FR-16 | 1 | NFR-SEC-09 | 2 |
| FR-04 | 1 | FR-17 | 3 | NFR-UX-01,03,04,05 | 1 |
| FR-05 | 2 | FR-18 | 3 | NFR-UX-02 | 1 (resolved: English-only) |
| FR-06 | 3 | FR-19 | 3 | Availability/Perf | 1–3 (per-phase) |
| FR-07 | 3 | FR-20 | 1 | | |
| FR-08 | 3 | FR-21 | 1 (stubbed health data) | | |
| FR-09 | 1 | FR-22 | 1 | | |
| FR-10 | 2 | FR-23 | 1 | | |
| FR-11 | 1 | FR-24 | 1 | | |
| FR-12 | 1 | FR-25 | 1 | | |
| FR-13 | (Could — deferred past Phase 4) | FR-26 | 1 (view), 3 (excludes credential values) | | |

FR-13 (admin notification on service change) is Could-priority and not scheduled in any phase above; it can be added to Phase 1's admin module cheaply once the core CRUD exists, but isn't load-bearing for any other phase.

---

## 8. Explicitly Out of Scope for This Build

Carried directly from BRD §4.2 and the prototype framing:

- Real IdP, enterprise vault, and HR system integrations (mocked behind swappable interfaces instead).
- Full Identity Governance & Administration (automated provisioning/deprovisioning).
- Native mobile apps (responsive web only).
- Real security architecture review / penetration test / incident-response runbook execution (NFR-SEC-07/08) — flagged as mandatory before any real deployment, not part of this prototype build.
- Cloud/on-prem deployment topology — local Docker Compose only until a target environment is chosen.
- Shared/departmental credential attribution model — open question in BRD §10.3, unresolved; Phase 3 assumes one identifiable individual user per credential, per NFR-SEC-05.

---

## 9. Open Questions Carried Forward

1. Shared/departmental credentials (BRD §10.3) — unresolved; affects Phase 3's audit model if answered "yes" later.
2. Service health/maintenance-window data source (FR-21) — stubbed manually in Phase 1; real source TBD.
3. Password-expiry data source (FR-18) — stubbed manually in Phase 3; real source TBD.

---

## 10. Next Steps

1. You review this plan.
2. Per-phase specs get written to `docs/specs/` (one file per phase, expanding each section above into full acceptance criteria).
3. Each phase's spec goes through the `writing-plans` process to produce a step-by-step implementation plan before any code is written, starting with Phase 1.
