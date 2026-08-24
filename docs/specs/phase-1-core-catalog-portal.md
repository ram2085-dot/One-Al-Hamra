# Phase 1 Spec: Core Catalog Portal

Parent plan: `../../Plan.md` §3
Depends on: nothing (foundation phase)
BRD coverage: FR-01–04, FR-09–14, FR-16, FR-20–26, NFR-UX-01/03/04/05, NFR-Maintainability

---

## 1. Summary

A home page listing every service the logged-in user is entitled to, as searchable/filterable tiles, with an admin console to manage the catalog. No SSO federation, credential vault, or access-request workflow yet — those are Phases 2–4. Login in this phase is a seeded-user stand-in (real OIDC login arrives in Phase 2); the `auth` module's interface is written so swapping the login mechanism later doesn't touch RBAC or catalog logic.

---

## 2. Data Model

Prisma schema additions for this phase (fields beyond this list are added in later phases):

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  displayName  String
  department   String
  role         Role     @default(EMPLOYEE)
  adUsername   String   @unique
  createdAt    DateTime @default(now())
}

enum Role {
  EMPLOYEE
  SERVICE_OWNER
  CATALOG_ADMIN
  HELP_DESK
  SECURITY_ADMIN
}

model Service {
  id              String        @id @default(uuid())
  name            String
  description     String
  logoUrl         String?
  category        String
  tags            String[]
  vendorName      String?
  ownerId         String
  owner           User          @relation(fields: [ownerId], references: [id])
  launchType      LaunchType    @default(SSO)
  status          ServiceStatus @default(ACTIVE)
  supportContact  String
  docsUrl         String?
  healthCheckUrl  String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  aliases         ServiceAlias[]
  entitlements    ServiceEntitlement[]
}

enum LaunchType { SSO CREDENTIAL }
enum ServiceStatus { ACTIVE INACTIVE RETIRED }

model ServiceAlias {
  id        String  @id @default(uuid())
  serviceId String
  service   Service @relation(fields: [serviceId], references: [id])
  alias     String
}

model ServiceEntitlement {
  id         String  @id @default(uuid())
  serviceId  String
  service    Service @relation(fields: [serviceId], references: [id])
  department String?
  role       Role?
  group      String?
}

model Favorite {
  userId    String
  serviceId String
  @@id([userId, serviceId])
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String
  eventType  String   // this phase: CATALOG_LAUNCH, ADMIN_CHANGE
  serviceId  String?
  timestamp  DateTime @default(now())
  metadata   Json?
}
```

`vendorName` is optional free text shown on the service detail view (§5.3); it has no behavior attached to it in Phase 1.

---

## 3. API Endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/catalog` | any authenticated user | services entitled to current user, `ACTIVE` only |
| GET | `/catalog/search?q=` | any authenticated user | name/category/tag/alias match, ranked, typo-tolerant |
| GET | `/catalog/:id` | any authenticated user (must be entitled) | service detail view |
| POST | `/catalog/:id/favorite` / DELETE | any authenticated user | toggle favorite |
| POST | `/catalog/:id/report-issue` | any authenticated user | FR-25 report broken link/info, routed to service owner |
| GET | `/admin/services` | `CATALOG_ADMIN` | full unfiltered list incl. inactive/retired |
| POST | `/admin/services` | `CATALOG_ADMIN` | create service |
| PATCH | `/admin/services/:id` | `CATALOG_ADMIN` | edit service, change status |
| POST | `/admin/services/:id/entitlements` / DELETE | `CATALOG_ADMIN` | manage `ServiceEntitlement` rows |
| POST | `/admin/services/:id/aliases` / DELETE | `CATALOG_ADMIN` | manage `ServiceAlias` rows |

All admin mutations write an `ADMIN_CHANGE` `AuditLog` entry (who, what changed, when). All `/catalog/:id` visits that result in the user actually leaving to the service (a "launch") write a `CATALOG_LAUNCH` entry — for Phase 1 this is a same-tab navigation stand-in, since real SSO/credential launch lands in Phases 2–3.

---

## 4. Frontend Views

1. **Catalog home** — tile grid, search bar, category filter, favorites toggle, first-run banner highlighting role-relevant services (FR-24, shown once per user via a `firstRunSeen` flag).
2. **Service detail** — description, category/tags, vendor name, owner, support contact, docs link, "report an issue" action.
3. **Search empty state** — when a query returns nothing: suggested categories, "request a new service" link (stubbed until Phase 4 — shows a disabled/coming-soon state), help desk contact.
4. **Admin console** — table of all services (incl. inactive/retired) with create/edit/activate/deactivate/retire actions; entitlement editor (department/role/group) and alias editor per service.

---

## 5. Search & Alias Matching (FR-22)

- Match against `name`, `category`, `tags`, and `ServiceAlias.alias`.
- Typo tolerance via Postgres `pg_trgm` trigram similarity (threshold tuned during implementation, default similarity ≥ 0.3).
- Acronym matching: aliases are the mechanism — admins add acronyms as aliases (e.g., "expenses" → Finance Expense System) rather than the search engine inferring them.
- Results ranked: exact name match > alias match > trigram similarity on name > trigram similarity on tags/category.

---

## 6. RBAC / Entitlement Filtering (FR-11)

A service is visible to a user if **any** of its `ServiceEntitlement` rows match the user's `department`, `role`, or `group` (OR across rows, per-row fields are AND'd if multiple are set on one row — e.g. a row with both `department` and `role` set requires both to match). A service with zero `ServiceEntitlement` rows is visible to nobody except `CATALOG_ADMIN` in the admin console — an explicit entitlement is required before end users can see it. This prevents a newly created service from being accidentally globally visible.

---

## 7. Error Handling & Edge Cases

- User with zero entitled services → friendly empty state (not a broken/blank page), directs to help desk.
- Retired/inactive service stays in `AuditLog` history and admin console, disappears from end-user catalog and search.
- Duplicate alias across services is allowed (admin warned, not blocked) — ambiguity is resolved by the ranking rules in §5, not by hard uniqueness constraints.
- Admin attempts to retire a service that's still favorited by users — allowed; favorites of retired services are silently hidden from the user's favorites list, not deleted (so un-retiring restores them).

---

## 8. Accessibility (NFR-UX-01)

- All interactive elements (tiles, filters, admin forms) keyboard-reachable and screen-reader labeled.
- Color contrast checked against WCAG AA for tile text/background combinations, including any category color-coding.
- Automated axe-core check integrated into the component test suite, not deferred to a final pass.

---

## 9. Testing Plan

- **Unit:** entitlement-filter logic (OR-across-rows, AND-within-row); trigram search ranking; favorite toggle idempotency.
- **Integration:** `/catalog` returns only entitled+active services for a given user; `/admin/*` endpoints reject non-`CATALOG_ADMIN` callers with 403; admin mutations produce exactly one `ADMIN_CHANGE` audit row.
- **E2E (Playwright):** two seeded users in different departments see different catalogs; misspelled search still finds the right service; admin creates a service + entitlement → it appears for the right user without restart; retiring a service removes it from the catalog but not from `AuditLog`.
- **Accessibility:** axe-core automated pass on catalog home, service detail, and admin console; manual keyboard-only walkthrough of all three.

---

## 10. Explicitly Out of Scope for Phase 1

- Real OIDC login (stand-in seeded-user login only; interface designed for Phase 2 swap).
- Actual SSO or credential-assisted launch (clicking a tile in Phase 1 is a stubbed/logged navigation, not a real federated or credential-injected launch).
- Access request workflow (Phase 4) — the "request a new service" link is present but disabled/stubbed.
- FR-13 (admin change notifications) and FR-21 (real health-check data) — noted in Plan.md as deferred/stubbed, not built in Phase 1.
