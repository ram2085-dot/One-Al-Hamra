# Enterprise Launchpad — Phase 1 Prototype

Internal Service Catalog & SSO Portal. See `Plan.md` and `docs/specs/phase-1-core-catalog-portal.md` for full spec.

## Run locally (dev, hot reload)
1. `npm run db:up`
2. `cd apps/api && cp ../../.env.example .env && npm install && npx prisma migrate dev && npx prisma db seed && npm run start:dev`
3. `cd apps/web && npm install && npm run dev`
4. Open http://localhost:5173 — log in as `admin@launchpad.local` (CATALOG_ADMIN) or `finance.employee@launchpad.local` / `eng.employee@launchpad.local` (EMPLOYEE).
5. `cd apps/mock-idp && cp .env.example .env && npm install && npm run start:dev`
6. `cd apps/mock-target-apps/demo-app-a && cp .env.example .env && npm install && npm run start:dev`
7. `cd apps/mock-target-apps/demo-app-b && cp .env.example .env && npm install && npm run start:dev`
8. Click "Sign in with SSO" on the login page — you'll land on a one-click user picker at `localhost:4000`.

## Run via Docker Compose (full stack)
1. `docker compose up --build -d`
2. `docker compose exec api npx prisma db seed` (first run only — this also seeds the users `mock-idp` reads for the "Sign in with SSO" picker)
3. Open http://localhost:5173

## Tests
- Backend unit + integration: `cd apps/api && npm test && npm run test:e2e`
- Frontend unit + a11y: `cd apps/web && npm test`
- End-to-end: `npm run test:e2e` from the repo root (re-seeds the database and runs the Playwright suite in `e2e/` — see Task 19)

## Scope
Phase 1 only: catalog browsing/search, favorites, admin CRUD, audit logging. No real SSO, no credential vault, no access-request workflow — see `Plan.md` §8 and the spec's §10.
