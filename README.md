# Enterprise Launchpad — Phase 2 SSO Federation

Internal Service Catalog & SSO Portal. See `Plan.md` and `docs/specs/phase-1-core-catalog-portal.md` for full spec.

## Run locally (dev, hot reload)
1. `npm run db:up`
2. `cd apps/api && cp ../../.env.example .env && npm install && npx prisma migrate dev && npx prisma db seed && npm run start:dev`
3. `cd apps/web && npm install && npm run dev`
4. `cd apps/mock-idp && cp .env.example .env && npm install && npm run start:dev`
5. `cd apps/mock-target-apps/demo-app-a && cp .env.example .env && npm install && npm run start:dev`
6. `cd apps/mock-target-apps/demo-app-b && cp .env.example .env && npm install && npm run start:dev`
7. Open http://localhost:5173, click "Sign in with SSO," and pick a user (e.g. `admin@launchpad.local` for CATALOG_ADMIN, or `finance.employee@launchpad.local` / `eng.employee@launchpad.local` for EMPLOYEE) from the mock IdP's one-click picker at `localhost:4000`.

## Run via Docker Compose (full stack)
1. `docker compose up --build -d`
2. `docker compose exec api npx prisma db seed` (first run only — this also seeds the users `mock-idp` reads for the "Sign in with SSO" picker)
3. Open http://localhost:5173

**Known limitation:** the "Sign in with SSO" flow currently fails at the browser redirect step under Docker Compose — OIDC discovery resolves `mock-idp`'s endpoints to its Docker-internal hostname, which your browser (running on the host) can't reach. This is a real, unresolved gap (endpoint-URL rewriting or host-alias work that hasn't been done yet) — separate from a previously *missing*-config bug: the `api` service's `docker-compose.yml` entry didn't even declare the `OIDC_*`/`WEB_BASE_URL`/`DEMO_APP_*_URL` vars it needs, so it silently worked only via a developer's own gitignored `apps/api/.env` getting baked into the image (no `.dockerignore` existed to stop that). Those vars are now declared explicitly on the `api` service, so a genuinely clean checkout at least boots correctly — but the Docker-internal-hostname browser-redirect problem described above is still not fixed. Use the "Run locally" path above for a working SSO demo.

## Tests
- Backend unit + integration: `cd apps/api && npm test && npm run test:e2e`
- Frontend unit + a11y: `cd apps/web && npm test`
- End-to-end: `npm run test:e2e` from the repo root (re-seeds the database and runs the Playwright suite in `e2e/` — see Task 19)

## Scope
Phase 1: catalog browsing/search, favorites, admin CRUD, audit logging. Phase 2 adds real SSO/IdP federation — sign-in via a mock OIDC IdP, silent SSO launch into entitled target apps, admin control of each service's SSO target. Still no credential vault, no access-request workflow — see `Plan.md` §8 and the spec's §10.
