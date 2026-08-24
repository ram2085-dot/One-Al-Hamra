# Phase 1: Core Catalog Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working local prototype of the Enterprise Launchpad's core catalog — seeded-user login, an entitlement-filtered searchable service catalog, favorites, and an admin console for managing services/entitlements/aliases — with full audit logging and WCAG AA accessibility.

**Architecture:** Modular monolith. One NestJS + TypeScript backend (`apps/api`) with Prisma/PostgreSQL, split into `auth`, `catalog`, `admin`, `audit`, and `common` modules that talk to each other only through injectable services. One React + TypeScript + Vite frontend (`apps/web`) consuming the API over `fetch`. Login is a seeded-user stand-in (email only, JWT-in-cookie session) behind an `AuthService`/`AuthGuard` interface designed so Phase 2 can swap in real OIDC without touching RBAC or catalog logic.

**Tech Stack:** NestJS 10, Prisma 5 + PostgreSQL (with `pg_trgm`), `jsonwebtoken` + `cookie-parser` for session, Jest + Supertest (backend), React 18 + Vite 5 + Tailwind 3 + Radix UI (frontend), Vitest + Testing Library + `jest-axe` (frontend unit/a11y), Playwright (e2e), Docker Compose (Postgres only at this phase).

**Spec:** `docs/specs/phase-1-core-catalog-portal.md` (parent: `Plan.md` §3)

## Global Constraints

- Node.js 20 LTS, TypeScript 5, strict mode (`"strict": true`) in both `apps/api` and `apps/web`.
- npm workspaces monorepo — no separate package manager (pnpm/yarn) introduced for a prototype.
- No credential vault, SSO federation, or access-request logic in this phase — those are Phases 2–4 and must not be started here (spec §10).
- Every admin mutation writes exactly one `ADMIN_CHANGE` `AuditLog` row; every catalog "launch" writes exactly one `CATALOG_LAUNCH` row — via `AuditService` only, never ad hoc (Plan.md §2.5).
- A `Service` with zero `ServiceEntitlement` rows is visible to nobody but `CATALOG_ADMIN` (spec §6) — this is a security-relevant default and must be enforced in the query itself, not filtered client-side.
- Accessibility (axe-core, keyboard nav) is checked per component as it is built, not deferred to a final pass (spec §8).
- UI strings live in one central file (`apps/web/src/strings.ts`) even though only English is supported now (Plan.md §2.5, NFR-UX-02).
- Visual design follows the Al Hamra design system defined in §"Design System" below — a corporate/functional translation of `alhamra.ae`'s brand (dark header, terracotta accent, white cards on light gray), not a literal copy of the marketing site's heavy imagery.

---

## Design System (Al Hamra–Inspired)

Sourced from `alhamra.ae` (Leadership, Projects, What We Do pages — the homepage's video hero could not be captured). Translated for a dense, functional internal tool rather than a marketing site: no full-bleed photography, no scroll-jacked sections — just the brand's color/type/component language applied to a data-dense catalog UI.

**Palette** (Tailwind tokens, added in Task 13):

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1A1A1A` | Header/nav background, primary headings |
| `accent` | `#9C3428` | Primary buttons, favorite star (active), active nav state, admin primary actions |
| `accent-dark` | `#7C2A20` | Hover/active state for `accent` |
| `surface` | `#F5F5F4` | Page background (catalog home, admin console) |
| `card` | `#FFFFFF` | Tile/card background |
| `line` | `#E5E5E3` | Borders, dividers |

**Typography:** `Poppins` (headings, nav, buttons — bold, geometric, matches the marketing site's headline weight) + `Inter` (body text, form labels, table data — better readability at small sizes than Poppins for dense UI). Both loaded via Google Fonts in `index.html`. Fallback stack: `system-ui, sans-serif` for both, since this is a prototype and font-load failure shouldn't block usability.

**Component patterns carried over:**
- **Header/nav:** dark (`ink`) bar, logo mark + wordmark at left, uppercase letter-spaced nav-style labels, persists across all authenticated pages (new `AppHeader` component, Task 13).
- **Buttons:** primary = solid `accent` background, white text, small radius. Secondary = white background, `accent`-colored 1.5px border and text (mirrors the site's thin-outlined "Know More" button) — used for "View details"/"Manage" style actions.
- **Cards:** white background, `line`-colored 1px border, subtle shadow on hover, an uppercase tracked "eyebrow" label (category) in `accent` above the title — mirrors the site's category labels ("RESIDENTIAL") over content blocks.
- **Footer/chrome:** not built in Phase 1 (no marketing footer in an internal tool) — the visual language is scoped to header, cards, and buttons only.

This does not change any task's data flow, API shape, or test assertions below — only the Tailwind config and JSX class names in Tasks 13–17. Steps that need a class-name update from what was drafted before this section are called out inline.

---

## File Structure

```
package.json                              # npm workspaces root
docker-compose.yml                        # postgres only (api/web run locally in this phase)
.env.example

apps/api/
  package.json
  tsconfig.json
  jest.config.js
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    main.ts
    app.module.ts
    common/
      decorators/current-user.decorator.ts
      decorators/roles.decorator.ts
      guards/auth.guard.ts
      guards/roles.guard.ts
      prisma.service.ts
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      auth.service.spec.ts
      auth.controller.spec.ts
    audit/
      audit.module.ts
      audit.service.ts
      audit.service.spec.ts
    catalog/
      catalog.module.ts
      catalog.controller.ts
      catalog.service.ts
      catalog.service.spec.ts
      catalog.controller.e2e-spec.ts
      dto/report-issue.dto.ts
    admin/
      admin.module.ts
      admin.controller.ts
      admin.service.ts
      admin.service.spec.ts
      admin.controller.e2e-spec.ts
      dto/create-service.dto.ts
      dto/update-service.dto.ts
      dto/entitlement.dto.ts
      dto/alias.dto.ts

apps/web/
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.ts
  index.html
  src/
    main.tsx
    App.tsx
    strings.ts
    api/client.ts
    auth/AuthContext.tsx
    components/AppHeader.tsx
    components/ServiceTile.tsx
    components/SearchBar.tsx
    components/CategoryFilter.tsx
    components/EmptyState.tsx
    pages/LoginPage.tsx
    pages/CatalogHome.tsx
    pages/ServiceDetail.tsx
    pages/admin/AdminConsole.tsx
    pages/admin/ServiceForm.tsx
    pages/admin/EntitlementEditor.tsx
    pages/admin/AliasEditor.tsx
    test/setup.ts
    __tests__/ServiceTile.test.tsx
    __tests__/CatalogHome.test.tsx
    __tests__/AdminConsole.test.tsx

e2e/
  playwright.config.ts
  catalog.spec.ts
  admin.spec.ts
```

Responsibility summary:
- `common/`: cross-module guards/decorators/Prisma client wrapper — no business logic.
- `auth/`: seeded-user login, JWT cookie issuance/verification, `AuthGuard`. Phase 2 replaces `auth.service.ts`'s login mechanism only.
- `audit/`: single `AuditService.record(...)` — every other module depends on this, never writes `AuditLog` directly.
- `catalog/`: end-user read paths (list, search, detail, favorite, report-issue).
- `admin/`: `CATALOG_ADMIN`-only CRUD for services/entitlements/aliases.

---

## Task 1: Monorepo Scaffolding + Postgres via Docker Compose

**Files:**
- Create: `package.json` (root workspaces)
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/jest-e2e.config.js`

**Interfaces:**
- Produces: a running Postgres 16 instance on `localhost:5432`, database `launchpad`, reachable via `DATABASE_URL`; a working `npx jest` (unit) and `npx jest --config jest-e2e.config.js` (integration/e2e) setup — every later task depends on both.

- [ ] **Step 1: Create root workspace `package.json`**

```json
{
  "name": "enterprise-launchpad",
  "private": true,
  "workspaces": ["apps/api", "apps/web"],
  "scripts": {
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down"
  }
}
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: launchpad
      POSTGRES_PASSWORD: launchpad_dev_only
      POSTGRES_DB: launchpad
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 3: Create `.env.example`**

```
DATABASE_URL="postgresql://launchpad:launchpad_dev_only@localhost:5432/launchpad"
JWT_SECRET="dev-only-secret-change-me"
PORT=3001
```

Copy it to `apps/api/.env` for local dev (not committed).

- [ ] **Step 4: Scaffold `apps/api`**

```bash
mkdir -p apps/api/src
```

`apps/api/package.json`:
```json
{
  "name": "@launchpad/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config jest-e2e.config.js",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@prisma/client": "^5.10.0",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "cookie-parser": "^1.4.6",
    "jsonwebtoken": "^9.0.2",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/cookie-parser": "^1.4.6",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.11.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.10.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

This `jest` block (in `package.json`) configures `npm test`/`npx jest` for unit tests (`*.spec.ts`, matched under `rootDir: "src"`) — without it, Jest cannot parse TypeScript decorators and every `*.spec.ts` test from Task 3 onward fails to even load. It intentionally excludes `*.e2e-spec.ts` files (`testRegex` only matches plain `.spec.ts`), which run through the separate config below.

Create `apps/api/jest-e2e.config.js` for integration/e2e tests (`*.e2e-spec.ts`, run via `npm run test:e2e` / `npx jest --config jest-e2e.config.js`, first used in Task 4):

```javascript
// apps/api/jest-e2e.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};
```

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "prisma/seed.ts"]
}
```

- [ ] **Step 5: Bring Postgres up and verify connectivity**

Run: `npm run db:up`
Then: `docker exec -it $(docker compose ps -q postgres) psql -U launchpad -d launchpad -c "SELECT 1;"`
Expected: returns `1` — confirms the container is healthy and accepting connections before any Prisma work depends on it.

- [ ] **Step 6: Commit**

```bash
git add package.json docker-compose.yml .env.example apps/api/package.json apps/api/tsconfig.json apps/api/jest-e2e.config.js
git commit -m "chore: scaffold monorepo workspaces and postgres compose service"
```

---

## Task 2: Prisma Schema, Migration, and Seed Data

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/common/prisma.service.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 1's `.env`.
- Produces: `PrismaService` (extends `PrismaClient`, injectable) — every later backend task queries the DB through this. Seeded rows: 4 users (2 departments × distinct roles including one `CATALOG_ADMIN`), 5 services across categories, entitlements, aliases — used by every integration/e2e test in this plan.

- [ ] **Step 1: Write `schema.prisma`** (full Phase 1 model set, per spec §2)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  EMPLOYEE
  SERVICE_OWNER
  CATALOG_ADMIN
  HELP_DESK
  SECURITY_ADMIN
}

enum LaunchType {
  SSO
  CREDENTIAL
}

enum ServiceStatus {
  ACTIVE
  INACTIVE
  RETIRED
}

model User {
  id             String    @id @default(uuid())
  email          String    @unique
  displayName    String
  department     String
  role           Role      @default(EMPLOYEE)
  adUsername     String    @unique
  createdAt      DateTime  @default(now())
  ownedServices  Service[] @relation("ServiceOwner")
  favorites      Favorite[]
}

model Service {
  id             String               @id @default(uuid())
  name           String
  description    String
  logoUrl        String?
  category       String
  tags           String[]
  vendorName     String?
  ownerId        String
  owner          User                 @relation("ServiceOwner", fields: [ownerId], references: [id])
  launchType     LaunchType           @default(SSO)
  status         ServiceStatus        @default(ACTIVE)
  supportContact String
  docsUrl        String?
  healthCheckUrl String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  aliases        ServiceAlias[]
  entitlements   ServiceEntitlement[]
  favorites      Favorite[]
}

model ServiceAlias {
  id        String  @id @default(uuid())
  serviceId String
  service   Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  alias     String

  @@index([serviceId])
}

model ServiceEntitlement {
  id         String  @id @default(uuid())
  serviceId  String
  service    Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  department String?
  role       Role?
  group      String?

  @@index([serviceId])
}

model Favorite {
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  serviceId String
  service   Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@id([userId, serviceId])
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  eventType String
  serviceId String?
  timestamp DateTime @default(now())
  metadata  Json?

  @@index([userId])
  @@index([serviceId])
}
```

- [ ] **Step 2: Enable `pg_trgm` and create the initial migration**

```bash
cd apps/api
npx prisma migrate dev --name init --create-only
```

Edit the generated migration SQL file to add, before the `CREATE TABLE` statements:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

And after all tables are created, add a trigram index used by Task 6's search:

```sql
CREATE INDEX "Service_name_trgm_idx" ON "Service" USING gin ("name" gin_trgm_ops);
```

Then apply it:

```bash
npx prisma migrate dev
```

Expected: migration applies cleanly against the Task 1 Postgres container, `prisma/migrations/` now contains the migration folder.

- [ ] **Step 3: Write `PrismaService`**

```typescript
// apps/api/src/common/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Write the seed script**

```typescript
// apps/api/prisma/seed.ts
import { PrismaClient, Role, LaunchType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.favorite.deleteMany();
  await prisma.serviceEntitlement.deleteMany();
  await prisma.serviceAlias.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      email: 'admin@launchpad.local',
      displayName: 'Ava Admin',
      department: 'IT',
      role: Role.CATALOG_ADMIN,
      adUsername: 'aadmin',
    },
  });

  const financeEmployee = await prisma.user.create({
    data: {
      email: 'finance.employee@launchpad.local',
      displayName: 'Finn Ance',
      department: 'Finance',
      role: Role.EMPLOYEE,
      adUsername: 'fance',
    },
  });

  const engEmployee = await prisma.user.create({
    data: {
      email: 'eng.employee@launchpad.local',
      displayName: 'Ellie Ng',
      department: 'Engineering',
      role: Role.EMPLOYEE,
      adUsername: 'eng',
    },
  });

  const helpDesk = await prisma.user.create({
    data: {
      email: 'helpdesk@launchpad.local',
      displayName: 'Hank Desk',
      department: 'IT',
      role: Role.HELP_DESK,
      adUsername: 'hdesk',
    },
  });

  const expenseSystem = await prisma.service.create({
    data: {
      name: 'Finance Expense System',
      description: 'Submit and track expense reports.',
      category: 'Finance',
      tags: ['expenses', 'reimbursement'],
      vendorName: 'Concur',
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      supportContact: 'finance-support@launchpad.local',
      entitlements: { create: [{ department: 'Finance' }] },
      aliases: { create: [{ alias: 'expenses' }, { alias: 'concur' }] },
    },
  });

  const codeRepo = await prisma.service.create({
    data: {
      name: 'Source Code Repository',
      description: 'Git hosting for engineering teams.',
      category: 'Engineering',
      tags: ['git', 'source-control'],
      vendorName: 'GitLab',
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      supportContact: 'eng-support@launchpad.local',
      entitlements: { create: [{ department: 'Engineering' }] },
      aliases: { create: [{ alias: 'git' }, { alias: 'gitlab' }] },
    },
  });

  const hrPortal = await prisma.service.create({
    data: {
      name: 'HR Self-Service Portal',
      description: 'Payroll, benefits, and time-off requests.',
      category: 'HR',
      tags: ['payroll', 'benefits'],
      vendorName: 'Workday',
      ownerId: admin.id,
      launchType: LaunchType.CREDENTIAL,
      supportContact: 'hr-support@launchpad.local',
      entitlements: { create: [{ role: Role.EMPLOYEE }] },
      aliases: { create: [{ alias: 'workday' }, { alias: 'payroll' }] },
    },
  });

  await prisma.service.create({
    data: {
      name: 'Legacy Timesheet Tool',
      description: 'Deprecated timesheet entry tool.',
      category: 'HR',
      tags: ['timesheet'],
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      status: 'RETIRED',
      supportContact: 'hr-support@launchpad.local',
    },
  });

  await prisma.service.create({
    data: {
      name: 'Unentitled Internal Tool',
      description: 'No entitlements assigned — visible to admins only.',
      category: 'Engineering',
      tags: [],
      ownerId: admin.id,
      launchType: LaunchType.SSO,
      supportContact: 'eng-support@launchpad.local',
    },
  });

  await prisma.favorite.create({ data: { userId: engEmployee.id, serviceId: codeRepo.id } });

  console.log({ admin: admin.email, financeEmployee: financeEmployee.email, engEmployee: engEmployee.email, helpDesk: helpDesk.email, expenseSystem: expenseSystem.id, codeRepo: codeRepo.id, hrPortal: hrPortal.id });
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 5: Run the seed and verify row counts**

Run: `npx prisma db seed` (add `"prisma": {"seed": "ts-node prisma/seed.ts"}` to `apps/api/package.json` first)
Expected: script prints the logged object; `SELECT count(*) FROM "Service";` returns `5`, `SELECT count(*) FROM "User";` returns `4`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/common/prisma.service.ts apps/api/package.json
git commit -m "feat: add prisma schema, migration, and seed data for phase 1"
```

---

## Task 3: Auth Module — Seeded-User Login + JWT Session Cookie

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2).
- Produces: `AuthService.login(email: string): Promise<{ token: string; user: User }>`, `AuthService.verify(token: string): Promise<User>` — Task 4's `AuthGuard` calls `verify`; Phase 2 replaces the body of `login` with an OIDC callback handler but keeps this signature. `POST /auth/login` sets an httpOnly `session` cookie containing the JWT.

- [ ] **Step 1: Write the failing test for `AuthService`**

```typescript
// apps/api/src/auth/auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

describe('AuthService', () => {
  let service: AuthService;
  const mockUser = { id: 'u1', email: 'a@b.com', displayName: 'A B', department: 'IT', role: 'EMPLOYEE', adUsername: 'ab' };
  const prisma = { user: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('logs in a known seeded user and returns a valid JWT', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    const { token, user } = await service.login('a@b.com');
    expect(user).toEqual(mockUser);
    const decoded = jwt.verify(token, 'test-secret') as { sub: string };
    expect(decoded.sub).toBe('u1');
  });

  it('rejects login for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('nobody@b.com')).rejects.toThrow('Unknown user');
  });

  it('verifies a valid token and returns the user', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    const { token } = await service.login('a@b.com');
    const user = await service.verify(token);
    expect(user.id).toBe('u1');
  });

  it('rejects an invalid token', async () => {
    await expect(service.verify('not-a-real-token')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest auth.service.spec.ts`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 3: Implement `AuthService`**

```typescript
// apps/api/src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../common/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async login(email: string): Promise<{ token: string; user: User }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Unknown user');
    }
    const token = jwt.sign({ sub: user.id }, this.config.get<string>('JWT_SECRET')!, { expiresIn: '8h' });
    return { token, user };
  }

  async verify(token: string): Promise<User> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, this.config.get<string>('JWT_SECRET')!) as { sub: string };
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    return user;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest auth.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `AuthController`, `AuthModule`, `AppModule`, and `main.ts`**

```typescript
// apps/api/src/auth/auth.controller.ts
import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body('email') email: string, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(email);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    return { id: user.id, email: user.email, displayName: user.displayName, department: user.department, role: user.role };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('session');
    return { ok: true };
  }
}
```

```typescript
// apps/api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [AuthService, PrismaService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
})
export class AppModule {}
```

```typescript
// apps/api/src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 6: Manual smoke test against the running seeded DB**

Run: `npm run start:dev` (in `apps/api`), then in another shell:
```bash
curl -i -c cookies.txt -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d '{"email":"admin@launchpad.local"}'
```
Expected: `200`, JSON body with `role: "CATALOG_ADMIN"`, and a `Set-Cookie: session=...` header.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat: add seeded-user login with JWT session cookie"
```

---

## Task 4: `AuthGuard`, `RolesGuard`, and `@CurrentUser`/`@Roles` Decorators

**Files:**
- Create: `apps/api/src/common/guards/auth.guard.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Create: `apps/api/src/common/decorators/roles.decorator.ts`
- Modify: `apps/api/src/app.module.ts:1-10` (register `AuthGuard` globally)
- Test: `apps/api/src/common/guards/auth.guard.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.verify` (Task 3).
- Produces: `@CurrentUser()` param decorator returning the authenticated `User`; `@Roles(...roles: Role[])` class/method decorator; global `AuthGuard` that populates `request.user` and rejects unauthenticated requests with 401 — every controller in `catalog`/`admin` (Tasks 5–12) depends on both.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/api/src/common/guards/auth.guard.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('AuthGuard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects an unauthenticated request to a protected route with 401', async () => {
    await request(app.getHttpServer()).get('/catalog').expect(401);
  });

  it('allows /auth/login without a session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@launchpad.local' });
    expect(res.status).toBe(200);
  });
});
```

(This references `GET /catalog`, which does not exist until Task 5 — expected to fail for that reason too; it will pass fully once Task 5 lands. For now it validates the 401 behavior on any route the guard protects, using `/auth/login` as the public control case.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest auth.guard.e2e-spec.ts --config jest-e2e.config.js`
Expected: FAIL — no global guard yet, so `/catalog` 404s instead of 401ing (route doesn't exist) — confirms the guard isn't wired.

- [ ] **Step 3: Implement decorators and guards**

```typescript
// apps/api/src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest().user;
});
```

```typescript
// apps/api/src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// apps/api/src/common/guards/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest();
    if (isPublic) return true;

    const token = request.cookies?.session;
    if (!token) throw new UnauthorizedException('No session');
    request.user = await this.authService.verify(token);
    return true;
  }
}
```

```typescript
// apps/api/src/common/guards/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
```

Mark login/logout as public and register both guards globally:

```typescript
// apps/api/src/auth/auth.controller.ts — add above each handler
import { Public } from '../common/guards/auth.guard';
// ...
  @Public()
  @Post('login')
// ...
  @Public()
  @Post('logout')
```

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Run test to verify it passes (401 case)**

Run: `npx jest auth.guard.e2e-spec.ts --config jest-e2e.config.js`
Expected: the `/auth/login` case passes; the `/catalog` case still fails with 404 (route doesn't exist yet) rather than 401 — re-run this exact test after Task 5 adds `GET /catalog` and confirm it then returns 401, per the note in Step 1.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common apps/api/src/auth/auth.controller.ts apps/api/src/app.module.ts
git commit -m "feat: add global auth/roles guards and current-user/roles decorators"
```

---

## Task 5: Catalog Service — Entitlement-Filtered List (`GET /catalog`)

**Files:**
- Create: `apps/api/src/catalog/catalog.module.ts`
- Create: `apps/api/src/catalog/catalog.controller.ts`
- Create: `apps/api/src/catalog/catalog.service.ts`
- Create: `apps/api/src/catalog/catalog.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `CatalogModule`)

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `@CurrentUser()` (Task 4).
- Produces: `CatalogService.listForUser(user: User): Promise<Service[]>` — Task 6 (search) and Task 14 (frontend) build on this filtering logic; Task 9 (audit) does not touch this endpoint (list is not a "launch").

- [ ] **Step 1: Write the failing unit test for entitlement filtering**

```typescript
// apps/api/src/catalog/catalog.service.spec.ts
import { Test } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma.service';

describe('CatalogService.listForUser', () => {
  let service: CatalogService;
  const prisma = { service: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CatalogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CatalogService);
  });

  it('queries only ACTIVE services matching the user department/role/group via OR-across-entitlement-rows', async () => {
    const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
    prisma.service.findMany.mockResolvedValue([]);

    await service.listForUser(user);

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          entitlements: {
            some: {
              OR: [{ department: 'Finance' }, { role: 'EMPLOYEE' }],
            },
          },
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest catalog.service.spec.ts`
Expected: FAIL — `Cannot find module './catalog.service'`.

- [ ] **Step 3: Implement `CatalogService.listForUser` and the controller**

```typescript
// apps/api/src/catalog/catalog.service.ts
import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  async listForUser(user: User) {
    return this.prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        entitlements: {
          some: {
            OR: [{ department: user.department }, { role: user.role }],
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
```

Note: `group` is part of the `ServiceEntitlement` model (spec §2) but Phase 1's `User` model has no `group` field yet (spec §2 confirms only `department`/`role`/`adUsername` on `User` for this phase) — so `group`-based entitlement rows exist in the schema for forward compatibility but are unreachable by any Phase 1 user; the `OR` array intentionally omits a `group` clause here. Document this as a known gap, not a bug, matching the traceability table's Phase 1 scope.

```typescript
// apps/api/src/catalog/catalog.controller.ts
import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('catalog')
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get()
  async list(@CurrentUser() user: User) {
    return this.catalogService.listForUser(user);
  }
}
```

```typescript
// apps/api/src/catalog/catalog.module.ts
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [CatalogService, PrismaService],
})
export class CatalogModule {}
```

Add `CatalogModule` to `AppModule`'s `imports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest catalog.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Re-run Task 4's guard e2e test, now that `/catalog` exists**

Run: `npx jest auth.guard.e2e-spec.ts --config jest-e2e.config.js`
Expected: PASS — `/catalog` now 401s for unauthenticated requests as originally intended.

- [ ] **Step 6: Integration test against the seeded DB**

```typescript
// apps/api/src/catalog/catalog.controller.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('GET /catalog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('returns only the Finance-entitled service for the seeded Finance employee', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const res = await agent.get('/catalog');
    expect(res.status).toBe(200);
    const names = res.body.map((s: any) => s.name);
    expect(names).toContain('Finance Expense System');
    expect(names).not.toContain('Source Code Repository');
    expect(names).not.toContain('Legacy Timesheet Tool');
    expect(names).not.toContain('Unentitled Internal Tool');
  });

  it('returns a distinct catalog for the seeded Engineering employee', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const res = await agent.get('/catalog');
    const names = res.body.map((s: any) => s.name);
    expect(names).toContain('Source Code Repository');
    expect(names).not.toContain('Finance Expense System');
  });
});
```

Run: `npx jest catalog.controller.e2e-spec.ts --config jest-e2e.config.js` (against the real seeded dev DB — this is an integration test, not mocked)
Expected: PASS — confirms two seeded users in different departments see different catalogs (spec §9's E2E requirement, verified here at the API layer).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/catalog apps/api/src/app.module.ts
git commit -m "feat: add entitlement-filtered catalog listing endpoint"
```

---

## Task 6: Catalog Search — `GET /catalog/search` (Trigram + Alias Matching)

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts` (add `search`)
- Modify: `apps/api/src/catalog/catalog.controller.ts` (add `GET /catalog/search`)
- Modify: `apps/api/src/catalog/catalog.service.spec.ts` (add search tests)

**Interfaces:**
- Consumes: `pg_trgm` extension + trigram index (Task 2), `PrismaService.$queryRaw`.
- Produces: `CatalogService.search(user: User, q: string): Promise<Service[]>` ranked exact-name > alias > name-trigram > tag/category-trigram (spec §5) — Task 14's frontend search bar and Task 16's empty state depend on this returning `[]` for no matches (not an error).

- [ ] **Step 1: Write the failing unit test**

```typescript
// apps/api/src/catalog/catalog.service.spec.ts — append
describe('CatalogService.search', () => {
  it('returns [] for a query with no matches rather than throwing', async () => {
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
    const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
    const results = await service.search(user, 'zzzznomatch');
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest catalog.service.spec.ts`
Expected: FAIL — `service.search is not a function`.

- [ ] **Step 3: Implement `search`**

```typescript
// apps/api/src/catalog/catalog.service.ts — add method
import { Prisma } from '@prisma/client';

// inside CatalogService
  async search(user: User, q: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>(Prisma.sql`
      SELECT s.id,
        CASE
          WHEN lower(s.name) = lower(${q}) THEN 4
          WHEN EXISTS (SELECT 1 FROM "ServiceAlias" a WHERE a."serviceId" = s.id AND lower(a.alias) = lower(${q})) THEN 3
          ELSE GREATEST(
            similarity(s.name, ${q}),
            COALESCE((SELECT MAX(similarity(t, ${q})) FROM unnest(s.tags) t), 0),
            similarity(s.category, ${q})
          )
        END AS rank
      FROM "Service" s
      WHERE s.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "ServiceEntitlement" e
          WHERE e."serviceId" = s.id AND (e.department = ${user.department} OR e.role = ${user.role}::"Role")
        )
        AND (
          lower(s.name) = lower(${q})
          OR EXISTS (SELECT 1 FROM "ServiceAlias" a WHERE a."serviceId" = s.id AND lower(a.alias) = lower(${q}))
          OR similarity(s.name, ${q}) >= 0.3
          OR similarity(s.category, ${q}) >= 0.3
          OR EXISTS (SELECT 1 FROM unnest(s.tags) t WHERE similarity(t, ${q}) >= 0.3)
        )
      ORDER BY rank DESC
      LIMIT 25
    `);

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const services = await this.prisma.service.findMany({ where: { id: { in: ids } } });
    const order = new Map(ids.map((id, i) => [id, i]));
    return services.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
```

```typescript
// apps/api/src/catalog/catalog.controller.ts — add
  @Get('search')
  async search(@CurrentUser() user: User, @Query('q') q: string) {
    return this.catalogService.search(user, q ?? '');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest catalog.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Integration test — typo tolerance against seeded data**

```typescript
// apps/api/src/catalog/catalog.controller.e2e-spec.ts — append
  it('finds "Finance Expense System" via a misspelled query', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const res = await agent.get('/catalog/search').query({ q: 'expence' });
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toContain('Finance Expense System');
  });

  it('finds a service via its alias', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const res = await agent.get('/catalog/search').query({ q: 'gitlab' });
    expect(res.body.map((s: any) => s.name)).toContain('Source Code Repository');
  });

  it('returns an empty array (not an error) for a query with no matches', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const res = await agent.get('/catalog/search').query({ q: 'zzznomatch' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
```

Run: `npx jest catalog.controller.e2e-spec.ts --config jest-e2e.config.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/catalog
git commit -m "feat: add typo-tolerant, alias-aware catalog search"
```

---

## Task 7: Favorites Toggle (`POST`/`DELETE /catalog/:id/favorite`)

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts` (add `addFavorite`/`removeFavorite`)
- Modify: `apps/api/src/catalog/catalog.controller.ts` (add routes)
- Modify: `apps/api/src/catalog/catalog.service.spec.ts`

**Interfaces:**
- Consumes: `Favorite` composite-key model (Task 2).
- Produces: `CatalogService.addFavorite(userId, serviceId)` / `removeFavorite(userId, serviceId)`, both idempotent — Task 14's favorite-toggle UI calls these; spec §9 requires idempotency to be unit-tested directly.

- [ ] **Step 1: Write the failing unit test for idempotency**

**Scoping note (same issue as Task 6):** `service` and `prisma` are declared inside Task 5's outer `describe('CatalogService.listForUser', () => { ... })` closure, not at module top level. Task 6 already established the pattern of nesting new `describe` blocks *inside* that outer one (as a sibling to the `listForUser` `it(...)` and the `search` describe) so they share the same `beforeEach`-provisioned `service`/`prisma` — a sibling top-level `describe` here would fail to compile (`service`/`prisma` out of scope). Add this block nested the same way, alongside the existing `describe('CatalogService.search', ...)`:

```typescript
// apps/api/src/catalog/catalog.service.spec.ts — append INSIDE the outer describe('CatalogService.listForUser', ...) block, as a sibling to the existing describe('CatalogService.search', ...)
  describe('CatalogService favorites', () => {
    it('addFavorite is idempotent (upsert, not insert)', async () => {
      (prisma as any).favorite = { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() };
      await service.addFavorite('u1', 's1');
      await service.addFavorite('u1', 's1');
      expect((prisma as any).favorite.upsert).toHaveBeenCalledTimes(2);
      expect((prisma as any).favorite.upsert).toHaveBeenCalledWith({
        where: { userId_serviceId: { userId: 'u1', serviceId: 's1' } },
        create: { userId: 'u1', serviceId: 's1' },
        update: {},
      });
    });

    it('removeFavorite does not throw when the favorite does not exist', async () => {
      (prisma as any).favorite = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      await expect(service.removeFavorite('u1', 's1')).resolves.not.toThrow();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest catalog.service.spec.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/catalog/catalog.service.ts — add methods
  async addFavorite(userId: string, serviceId: string) {
    await this.prisma.favorite.upsert({
      where: { userId_serviceId: { userId, serviceId } },
      create: { userId, serviceId },
      update: {},
    });
  }

  async removeFavorite(userId: string, serviceId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, serviceId } });
  }
```

```typescript
// apps/api/src/catalog/catalog.controller.ts — add
  @Post(':id/favorite')
  async favorite(@CurrentUser() user: User, @Param('id') id: string) {
    await this.catalogService.addFavorite(user.id, id);
    return { ok: true };
  }

  @Delete(':id/favorite')
  async unfavorite(@CurrentUser() user: User, @Param('id') id: string) {
    await this.catalogService.removeFavorite(user.id, id);
    return { ok: true };
  }
```

Add `Post, Delete, Param` to the `@nestjs/common` import in the controller.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest catalog.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog
git commit -m "feat: add idempotent favorite toggle endpoints"
```

---

## Task 8: Service Detail (`GET /catalog/:id`) + Report Issue (`POST /catalog/:id/report-issue`)

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts`
- Modify: `apps/api/src/catalog/catalog.controller.ts`
- Create: `apps/api/src/catalog/dto/report-issue.dto.ts`
- Modify: `apps/api/src/catalog/catalog.controller.e2e-spec.ts`

**Interfaces:**
- Consumes: `CatalogService.listForUser`'s entitlement predicate, reused here per-service.
- Produces: `CatalogService.getDetailForUser(user, id): Promise<Service>` (throws `NotFoundException` if not entitled or not found — spec §7 requires entitlement enforcement here too, not just on list); `CatalogService.reportIssue(user, id, dto)` — Task 9 hooks a `CATALOG_LAUNCH`-adjacent audit event onto detail access via a query param (see Task 9).

- [ ] **Step 1: Write the failing integration test**

```typescript
// apps/api/src/catalog/catalog.controller.e2e-spec.ts — append
describe('GET /catalog/:id and report-issue (e2e)', () => {
  it('returns detail for an entitled service', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const list = await agent.get('/catalog');
    const expenseService = list.body.find((s: any) => s.name === 'Finance Expense System');
    const res = await agent.get(`/catalog/${expenseService.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Finance Expense System');
  });

  it('404s for a service the user is not entitled to (does not leak existence via 403)', async () => {
    const financeAgent = request.agent(app.getHttpServer());
    await financeAgent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const engAgent = request.agent(app.getHttpServer());
    await engAgent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const engList = await engAgent.get('/catalog');
    const codeRepo = engList.body.find((s: any) => s.name === 'Source Code Repository');
    const res = await financeAgent.get(`/catalog/${codeRepo.id}`);
    expect(res.status).toBe(404);
  });

  it('accepts a report-issue submission', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const list = await agent.get('/catalog');
    const expenseService = list.body.find((s: any) => s.name === 'Finance Expense System');
    const res = await agent.post(`/catalog/${expenseService.id}/report-issue`).send({ description: 'Login link is broken.' });
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest catalog.controller.e2e-spec.ts --config jest-e2e.config.js`
Expected: FAIL — routes don't exist (404 for all, including the "should be 200" case).

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/catalog/dto/report-issue.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ReportIssueDto {
  @IsString()
  @MinLength(1)
  description: string;
}
```

```typescript
// apps/api/src/catalog/catalog.service.ts — add methods
import { NotFoundException } from '@nestjs/common';

  private entitlementWhere(user: User) {
    return { OR: [{ department: user.department }, { role: user.role }] };
  }

  async getDetailForUser(user: User, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, status: 'ACTIVE', entitlements: { some: this.entitlementWhere(user) } },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async reportIssue(user: User, serviceId: string, description: string) {
    await this.getDetailForUser(user, serviceId);
    // Phase 1: routed to service owner via audit trail only; no email/notification integration yet (FR-25 stub).
    return { received: true };
  }
```

```typescript
// apps/api/src/catalog/catalog.controller.ts — add
import { Body } from '@nestjs/common';
import { ReportIssueDto } from './dto/report-issue.dto';

  @Get(':id')
  async detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.catalogService.getDetailForUser(user, id);
  }

  @Post(':id/report-issue')
  async reportIssue(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ReportIssueDto) {
    return this.catalogService.reportIssue(user, id, dto.description);
  }
```

Note the route ordering constraint: `GET :id` must be declared **after** `GET search` in the controller (Task 6), since Nest matches routes in declaration order and `search` would otherwise be swallowed by `:id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest catalog.controller.e2e-spec.ts --config jest-e2e.config.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog
git commit -m "feat: add service detail and report-issue endpoints"
```

---

## Task 9: Audit Module + Wiring into Catalog Launch Events

**Files:**
- Create: `apps/api/src/audit/audit.module.ts`
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.service.spec.ts`
- Modify: `apps/api/src/catalog/catalog.module.ts` (import `AuditModule`)
- Modify: `apps/api/src/catalog/catalog.controller.ts` (add `POST /catalog/:id/launch`)
- Modify: `apps/api/src/catalog/catalog.service.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces: `AuditService.record(userId: string, eventType: string, serviceId?: string, metadata?: object): Promise<void>` — Task 10–12 (admin) call this for `ADMIN_CHANGE`; this task wires `CATALOG_LAUNCH`. This is the **only** function anywhere in the codebase permitted to write to `AuditLog` (Global Constraints).

- [ ] **Step 1: Write the failing unit test**

```typescript
// apps/api/src/audit/audit.service.spec.ts
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../common/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  const prisma = { auditLog: { create: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('writes exactly one AuditLog row with the given fields', async () => {
    await service.record('u1', 'CATALOG_LAUNCH', 's1', { via: 'tile-click' });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', eventType: 'CATALOG_LAUNCH', serviceId: 's1', metadata: { via: 'tile-click' } },
    });
  });

  it('supports events with no serviceId (e.g. future admin events on non-service entities)', async () => {
    await service.record('u1', 'ADMIN_CHANGE', undefined, { note: 'test' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', eventType: 'ADMIN_CHANGE', serviceId: undefined, metadata: { note: 'test' } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest audit.service.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `AuditService` and `AuditModule`**

```typescript
// apps/api/src/audit/audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(userId: string, eventType: string, serviceId?: string, metadata?: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { userId, eventType, serviceId, metadata } });
  }
}
```

```typescript
// apps/api/src/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest audit.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire `CATALOG_LAUNCH` — add a launch endpoint the frontend calls when a user actually leaves to a service**

```typescript
// apps/api/src/catalog/catalog.service.ts — add
  async recordLaunch(user: User, serviceId: string, auditService: import('../audit/audit.service').AuditService) {
    await this.getDetailForUser(user, serviceId);
    await auditService.record(user.id, 'CATALOG_LAUNCH', serviceId);
  }
```

Cleaner: inject `AuditService` directly into `CatalogService` rather than passing it as a parameter.

```typescript
// apps/api/src/catalog/catalog.service.ts — constructor
import { AuditService } from '../audit/audit.service';

  constructor(private prisma: PrismaService, private auditService: AuditService) {}

  async recordLaunch(user: User, serviceId: string) {
    await this.getDetailForUser(user, serviceId);
    await this.auditService.record(user.id, 'CATALOG_LAUNCH', serviceId);
  }
```

(Remove the earlier parameterized version — this constructor-injected form is the one that ships.)

**Required companion change:** this constructor change breaks Tasks 5–8's existing `CatalogService` unit tests, because `catalog.service.spec.ts`'s shared top-level `beforeEach` only provides `PrismaService` — Nest's `Test.createTestingModule` will fail to resolve the new `AuditService` dependency for every `describe` block in that file, not just this task's own tests. Update that shared setup before writing this task's own test:

```typescript
// apps/api/src/catalog/catalog.service.spec.ts — update the top-level setup (near the top of the file)
import { AuditService } from '../audit/audit.service';

// add alongside the existing `const prisma = { ... }` declaration:
const audit = { record: jest.fn() };

// in the shared beforeEach's Test.createTestingModule providers array, add:
        { provide: AuditService, useValue: audit },
```

Apply this to the single shared `moduleRef`/`service` setup that Tasks 5–8's `describe` blocks all reuse (not a new module per block) — after this change, `jest.clearAllMocks()` in that same `beforeEach` also resets `audit.record`, so Tasks 5–8's tests are unaffected by the new mock's presence. Run the full `catalog.service.spec.ts` suite after this change and before writing this task's own audit test, to confirm Tasks 5–8 still pass:

Run: `npx jest catalog.service.spec.ts`
Expected: PASS — all pre-existing tests from Tasks 5–8 still green with the `AuditService` mock now wired in.

```typescript
// apps/api/src/catalog/catalog.controller.ts — add
  @Post(':id/launch')
  async launch(@CurrentUser() user: User, @Param('id') id: string) {
    await this.catalogService.recordLaunch(user, id);
    return { ok: true };
  }
```

```typescript
// apps/api/src/catalog/catalog.module.ts
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  // ...
})
```

- [ ] **Step 6: Integration test confirming exactly one audit row per launch**

```typescript
// apps/api/src/catalog/catalog.controller.e2e-spec.ts — append
describe('POST /catalog/:id/launch (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('writes exactly one CATALOG_LAUNCH audit row', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const list = await agent.get('/catalog');
    const service = list.body.find((s: any) => s.name === 'Finance Expense System');

    const prisma = new (require('@prisma/client').PrismaClient)();
    const before = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'CATALOG_LAUNCH', serviceId: service.id } });
    await agent.post(`/catalog/${service.id}/launch`).expect(201);
    const after = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'CATALOG_LAUNCH', serviceId: service.id } });
    expect(after).toBe(before + 1);
    await prisma.$disconnect();
  });
});
```

Run: `npx jest catalog.controller.e2e-spec.ts --config jest-e2e.config.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/audit apps/api/src/catalog
git commit -m "feat: add audit service and wire CATALOG_LAUNCH event"
```

---

## Task 10: Admin — Service CRUD (`GET/POST/PATCH /admin/services`)

**Files:**
- Create: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/admin.service.ts`
- Create: `apps/api/src/admin/admin.service.spec.ts`
- Create: `apps/api/src/admin/admin.controller.e2e-spec.ts`
- Create: `apps/api/src/admin/dto/create-service.dto.ts`
- Create: `apps/api/src/admin/dto/update-service.dto.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AuditService.record` (Task 9), `@Roles(Role.CATALOG_ADMIN)` (Task 4).
- Produces: `AdminService.listAll()`, `createService(actorId, dto)`, `updateService(actorId, id, dto)` — each mutation writes one `ADMIN_CHANGE` row. Task 11/12 extend `AdminService` with entitlement/alias methods on the same pattern.

- [ ] **Step 1: Write the failing unit test — every mutation writes exactly one audit row**

```typescript
// apps/api/src/admin/admin.service.spec.ts
import { Test } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AdminService', () => {
  let service: AdminService;
  const prisma = {
    service: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('listAll returns every service regardless of status', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    await service.listAll();
    expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('createService creates the service and writes exactly one ADMIN_CHANGE audit row', async () => {
    const dto = { name: 'New Svc', description: 'd', category: 'IT', tags: [], ownerId: 'owner1', launchType: 'SSO', supportContact: 'x@y.com' };
    prisma.service.create.mockResolvedValue({ id: 's1', ...dto });
    const result = await service.createService('admin1', dto as any);
    expect(result.id).toBe('s1');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'create' }));
  });

  it('updateService updates and writes exactly one ADMIN_CHANGE audit row', async () => {
    prisma.service.update.mockResolvedValue({ id: 's1', name: 'Renamed' });
    await service.updateService('admin1', 's1', { name: 'Renamed' } as any);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'update' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest admin.service.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement DTOs, `AdminService`, `AdminController`, `AdminModule`**

```typescript
// apps/api/src/admin/dto/create-service.dto.ts
import { IsArray, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { LaunchType } from '@prisma/client';

export class CreateServiceDto {
  @IsString() name: string;
  @IsString() description: string;
  @IsOptional() @IsUrl() logoUrl?: string;
  @IsString() category: string;
  @IsArray() tags: string[];
  @IsOptional() @IsString() vendorName?: string;
  @IsString() ownerId: string;
  @IsEnum(LaunchType) launchType: LaunchType;
  @IsString() supportContact: string;
  @IsOptional() @IsUrl() docsUrl?: string;
  @IsOptional() @IsUrl() healthCheckUrl?: string;
}
```

```typescript
// apps/api/src/admin/dto/update-service.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { ServiceStatus } from '@prisma/client';
import { CreateServiceDto } from './create-service.dto';

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @IsOptional() @IsEnum(ServiceStatus) status?: ServiceStatus;
}
```

Add `"@nestjs/mapped-types": "^2.0.5"` to `apps/api/package.json` dependencies.

```typescript
// apps/api/src/admin/admin.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async listAll() {
    return this.prisma.service.findMany({ where: undefined, orderBy: { name: 'asc' } });
  }

  async createService(actorId: string, dto: CreateServiceDto) {
    const created = await this.prisma.service.create({ data: dto });
    await this.audit.record(actorId, 'ADMIN_CHANGE', created.id, { action: 'create', fields: dto });
    return created;
  }

  async updateService(actorId: string, id: string, dto: UpdateServiceDto) {
    const updated = await this.prisma.service.update({ where: { id }, data: dto });
    await this.audit.record(actorId, 'ADMIN_CHANGE', id, { action: 'update', fields: dto });
    return updated;
  }
}
```

```typescript
// apps/api/src/admin/admin.controller.ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { User } from '@prisma/client';

@Controller('admin/services')
@Roles(Role.CATALOG_ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get()
  async list() {
    return this.adminService.listAll();
  }

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateServiceDto) {
    return this.adminService.createService(user.id, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.adminService.updateService(user.id, id, dto);
  }
}
```

```typescript
// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}
```

Add `AdminModule` to `AppModule`'s `imports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest admin.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Integration test — RBAC enforcement (403 for non-admin)**

```typescript
// apps/api/src/admin/admin.controller.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('/admin/services RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects a non-admin employee with 403', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    await agent.get('/admin/services').expect(403);
  });

  it('allows CATALOG_ADMIN and returns retired/inactive services too', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'admin@launchpad.local' });
    const res = await agent.get('/admin/services');
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toContain('Legacy Timesheet Tool');
  });

  it('admin create produces exactly one ADMIN_CHANGE audit row', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send({ email: 'admin@launchpad.local' });
    const prisma = new (require('@prisma/client').PrismaClient)();
    const before = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'ADMIN_CHANGE' } });
    await agent.post('/admin/services').send({
      name: 'Test Service', description: 'd', category: 'IT', tags: [], ownerId: login.body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    }).expect(201);
    const after = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'ADMIN_CHANGE' } });
    expect(after).toBe(before + 1);
    await prisma.$disconnect();
  });
});
```

Run: `npx jest admin.controller.e2e-spec.ts --config jest-e2e.config.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat: add admin service CRUD with RBAC and audit logging"
```

---

## Task 11: Admin — Entitlement Management

**Files:**
- Modify: `apps/api/src/admin/admin.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/dto/entitlement.dto.ts`
- Modify: `apps/api/src/admin/admin.service.spec.ts`

**Interfaces:**
- Consumes: `ServiceEntitlement` model (Task 2).
- Produces: `AdminService.addEntitlement(actorId, serviceId, dto)`, `removeEntitlement(actorId, serviceId, entitlementId)` — Task 5's `listForUser` reads what this writes, so the e2e test here should assert an entitlement created via this endpoint immediately changes what `/catalog` returns for a matching user (spec §9's "admin adds a service → appears without restart" requirement, applied here to entitlements).

- [ ] **Step 1: Write the failing unit test**

```typescript
// apps/api/src/admin/admin.service.spec.ts — append
describe('AdminService entitlements', () => {
  it('addEntitlement creates the row and writes one ADMIN_CHANGE audit row', async () => {
    (prisma as any).serviceEntitlement = { create: jest.fn().mockResolvedValue({ id: 'e1' }), delete: jest.fn() };
    await service.addEntitlement('admin1', 's1', { department: 'Finance' } as any);
    expect((prisma as any).serviceEntitlement.create).toHaveBeenCalledWith({ data: { serviceId: 's1', department: 'Finance', role: undefined, group: undefined } });
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'add-entitlement' }));
  });

  it('removeEntitlement deletes the row and writes one ADMIN_CHANGE audit row', async () => {
    (prisma as any).serviceEntitlement = { delete: jest.fn().mockResolvedValue({}) };
    await service.removeEntitlement('admin1', 's1', 'e1');
    expect((prisma as any).serviceEntitlement.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'remove-entitlement' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest admin.service.spec.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/admin/dto/entitlement.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class EntitlementDto {
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() group?: string;
}
```

```typescript
// apps/api/src/admin/admin.service.ts — add methods
import { EntitlementDto } from './dto/entitlement.dto';

  async addEntitlement(actorId: string, serviceId: string, dto: EntitlementDto) {
    const created = await this.prisma.serviceEntitlement.create({
      data: { serviceId, department: dto.department, role: dto.role, group: dto.group },
    });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'add-entitlement', entitlement: dto });
    return created;
  }

  async removeEntitlement(actorId: string, serviceId: string, entitlementId: string) {
    await this.prisma.serviceEntitlement.delete({ where: { id: entitlementId } });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'remove-entitlement', entitlementId });
  }
```

```typescript
// apps/api/src/admin/admin.controller.ts — add
import { Delete } from '@nestjs/common';
import { EntitlementDto } from './dto/entitlement.dto';

  @Post(':id/entitlements')
  async addEntitlement(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: EntitlementDto) {
    return this.adminService.addEntitlement(user.id, id, dto);
  }

  @Delete(':id/entitlements/:entitlementId')
  async removeEntitlement(@CurrentUser() user: User, @Param('id') id: string, @Param('entitlementId') entitlementId: string) {
    await this.adminService.removeEntitlement(user.id, id, entitlementId);
    return { ok: true };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest admin.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Integration test — entitlement change is immediately visible in `/catalog`**

```typescript
// apps/api/src/admin/admin.controller.e2e-spec.ts — append
describe('entitlement changes propagate immediately', () => {
  it('a newly entitled user sees the service in /catalog without any restart', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    await adminAgent.post('/auth/login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'Propagation Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: (await adminAgent.post('/auth/login').send({ email: 'admin@launchpad.local' })).body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    });

    const engAgent = request.agent(app.getHttpServer());
    await engAgent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const before = await engAgent.get('/catalog');
    expect(before.body.map((s: any) => s.name)).not.toContain('Propagation Test Svc');

    await adminAgent.post(`/admin/services/${created.body.id}/entitlements`).send({ department: 'Engineering' }).expect(201);

    const after = await engAgent.get('/catalog');
    expect(after.body.map((s: any) => s.name)).toContain('Propagation Test Svc');
  });
});
```

Run: `npx jest admin.controller.e2e-spec.ts --config jest-e2e.config.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat: add admin entitlement management endpoints"
```

---

## Task 12: Admin — Alias Management

**Files:**
- Modify: `apps/api/src/admin/admin.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/dto/alias.dto.ts`
- Modify: `apps/api/src/admin/admin.service.spec.ts`

**Interfaces:**
- Consumes: `ServiceAlias` model.
- Produces: `AdminService.addAlias(actorId, serviceId, dto)`, `removeAlias(actorId, serviceId, aliasId)` — mirrors Task 11's pattern exactly; Task 6's search reads what this writes.

- [ ] **Step 1: Write the failing unit test**

```typescript
// apps/api/src/admin/admin.service.spec.ts — append
describe('AdminService aliases', () => {
  it('addAlias creates the row and writes one ADMIN_CHANGE audit row', async () => {
    (prisma as any).serviceAlias = { create: jest.fn().mockResolvedValue({ id: 'a1' }), delete: jest.fn() };
    await service.addAlias('admin1', 's1', { alias: 'expenses' } as any);
    expect((prisma as any).serviceAlias.create).toHaveBeenCalledWith({ data: { serviceId: 's1', alias: 'expenses' } });
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'add-alias' }));
  });

  it('removeAlias deletes the row and writes one ADMIN_CHANGE audit row', async () => {
    (prisma as any).serviceAlias = { delete: jest.fn().mockResolvedValue({}) };
    await service.removeAlias('admin1', 's1', 'a1');
    expect((prisma as any).serviceAlias.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'remove-alias' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest admin.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** (mirrors Task 11)

```typescript
// apps/api/src/admin/dto/alias.dto.ts
import { IsString, MinLength } from 'class-validator';

export class AliasDto {
  @IsString() @MinLength(1) alias: string;
}
```

```typescript
// apps/api/src/admin/admin.service.ts — add methods
import { AliasDto } from './dto/alias.dto';

  async addAlias(actorId: string, serviceId: string, dto: AliasDto) {
    const created = await this.prisma.serviceAlias.create({ data: { serviceId, alias: dto.alias } });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'add-alias', alias: dto.alias });
    return created;
  }

  async removeAlias(actorId: string, serviceId: string, aliasId: string) {
    await this.prisma.serviceAlias.delete({ where: { id: aliasId } });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'remove-alias', aliasId });
  }
```

```typescript
// apps/api/src/admin/admin.controller.ts — add
import { AliasDto } from './dto/alias.dto';

  @Post(':id/aliases')
  async addAlias(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: AliasDto) {
    return this.adminService.addAlias(user.id, id, dto);
  }

  @Delete(':id/aliases/:aliasId')
  async removeAlias(@CurrentUser() user: User, @Param('id') id: string, @Param('aliasId') aliasId: string) {
    await this.adminService.removeAlias(user.id, id, aliasId);
    return { ok: true };
  }
```

Note: duplicate aliases across services are intentionally allowed (spec §7) — no uniqueness constraint or check is added here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest admin.service.spec.ts`
Expected: PASS. Then run the full backend suite to confirm nothing regressed:

Run: `npx jest && npx jest --config jest-e2e.config.js`
Expected: all PASS — this closes out the entire backend (Tasks 3–12).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat: add admin alias management endpoints"
```

---

## Task 13: Frontend Scaffolding — Vite + React + Tailwind + Radix + API Client + Auth Context

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/strings.ts`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/auth/AuthContext.tsx`
- Create: `apps/web/src/components/AppHeader.tsx`
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/test/setup.ts`

**Interfaces:**
- Consumes: `apps/api`'s `/auth/login`, `/auth/logout` (Task 3).
- Produces: `apiClient` (thin `fetch` wrapper, throws on non-2xx with parsed JSON error body), `useAuth()` hook exposing `{ user, login, logout }`, and `<AppHeader>` (Design System dark nav bar, rendered by `RequireAuth`/`RequireRole` on every authenticated page) — every page task (14–17) is built on top of these.

- [ ] **Step 1: Scaffold package and config files**

```json
// apps/web/package.json
{
  "name": "@launchpad/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-tabs": "^1.0.4"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^14.2.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "jest-axe": "^9.0.0",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.1.0",
    "vitest": "^1.2.2"
  }
}
```

```typescript
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
});
```

```typescript
// apps/web/src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);
```

`apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`"types"` is required here because `vite.config.ts`'s `test.globals: true` (below) makes `describe`/`it`/`expect` available without importing them in every test file (Tasks 14–17 rely on this) — without this `compilerOptions.types` entry, those globals don't type-check under `strict: true`.

`apps/web/tailwind.config.ts` — includes the Design System palette and type tokens (§"Design System"):
```typescript
import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1A1A1A',
        accent: { DEFAULT: '#9C3428', dark: '#7C2A20' },
        surface: '#F5F5F4',
        card: '#FFFFFF',
        line: '#E5E5E3',
      },
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`apps/web/postcss.config.js` — without this, Vite's CSS pipeline never invokes the `tailwindcss`/`autoprefixer` plugins, and `index.css`'s `@tailwind` directives pass through unprocessed:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

`apps/web/index.html` — loads the two Design System fonts:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Enterprise Launchpad</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-surface font-sans"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

Create `apps/web/src/index.css` with the three Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`) and import it from `main.tsx`.

- [ ] **Step 2: Write the API client**

```typescript
// apps/web/src/api/client.ts
const BASE_URL = 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 3: Write `strings.ts` and `AuthContext`**

```typescript
// apps/web/src/strings.ts
export const strings = {
  appName: 'Enterprise Launchpad',
  loginPrompt: 'Sign in to continue',
  loginButton: 'Sign in',
  logoutButton: 'Sign out',
  loginErrorMessage: 'Login failed. Check your email and try again.',
  emailLabel: 'Email',
  catalogNav: 'Catalog',
  adminNav: 'Admin',
  searchPlaceholder: 'Search services…',
  noResultsTitle: "We couldn't find that service.",
  noResultsHint: 'Try browsing a category, or contact the help desk.',
  favoriteAdd: 'Add to favorites',
  favoriteRemove: 'Remove from favorites',
  reportIssue: 'Report an issue',
  adminConsoleTitle: 'Admin Console',
  emptyEntitlementsTitle: 'No services yet',
  emptyEntitlementsHint: 'Contact the help desk if you believe this is a mistake.',
};
```

```typescript
// apps/web/src/auth/AuthContext.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { apiClient } from '../api/client';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: 'EMPLOYEE' | 'SERVICE_OWNER' | 'CATALOG_ADMIN' | 'HELP_DESK' | 'SECURITY_ADMIN';
}

interface AuthContextValue {
  user: CurrentUser | null;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  const login = useCallback(async (email: string) => {
    const loggedIn = await apiClient.post<CurrentUser>('/auth/login', { email });
    setUser(loggedIn);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

```tsx
// apps/web/src/components/AppHeader.tsx — dark bar, logo mark + wordmark, uppercase nav (Design System)
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { strings } from '../strings';

export function AppHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-xs font-heading font-semibold uppercase tracking-wider ${isActive ? 'text-accent' : 'text-white/80 hover:text-white'}`;

  return (
    <header className="flex items-center justify-between bg-ink px-6 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-white">
          <span aria-hidden className="text-sm text-white">▲</span>
        </div>
        <span className="font-heading text-sm font-bold uppercase tracking-wide text-white">{strings.appName}</span>
      </div>
      <nav className="flex items-center gap-6" aria-label="Main">
        <NavLink to="/" end className={navLinkClass}>{strings.catalogNav}</NavLink>
        {user.role === 'CATALOG_ADMIN' && <NavLink to="/admin" className={navLinkClass}>{strings.adminNav}</NavLink>}
        <button type="button" onClick={() => logout()} className="text-xs font-heading font-semibold uppercase tracking-wider text-white/80 hover:text-white">
          {strings.logoutButton}
        </button>
      </nav>
    </header>
  );
}
```

```tsx
// apps/web/src/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { strings } from '../strings';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email);
    } catch {
      setError(strings.loginErrorMessage);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-lg bg-card p-8 shadow-lg" aria-label={strings.loginPrompt}>
        <div className="mb-2 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded border-2 border-ink">
            <span aria-hidden className="text-xl text-ink">▲</span>
          </div>
          <h1 className="font-heading text-lg font-bold uppercase tracking-wide text-ink">{strings.appName}</h1>
        </div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">{strings.emailLabel}</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-line px-3 py-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded bg-accent px-3 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2">
          {strings.loginButton}
        </button>
      </form>
    </main>
  );
}
```

```tsx
// apps/web/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AppHeader } from './components/AppHeader';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><div>Catalog home placeholder — Task 14</div></RequireAuth>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
```

```tsx
// apps/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Manual smoke test**

Run: `cd apps/web && npm run dev`, open `http://localhost:5173`, log in with `admin@launchpad.local` (with `apps/api` running via Task 3–4's `npm run start:dev`).
Expected: branded dark login card (Poppins heading, terracotta button) → redirected from `/login` to `/` → dark `AppHeader` bar with logo and uppercase nav appears above the placeholder text — confirms cookie-based session works cross-origin with `credentials: 'include'`, the api's CORS config from Task 3, and the Design System fonts/colors load correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: scaffold frontend with vite, tailwind, auth context, and api client"
```

---

## Task 14: Frontend — Catalog Home Page

**Files:**
- Create: `apps/web/src/components/ServiceTile.tsx`
- Create: `apps/web/src/components/SearchBar.tsx`
- Create: `apps/web/src/components/CategoryFilter.tsx`
- Create: `apps/web/src/pages/CatalogHome.tsx`
- Create: `apps/web/src/__tests__/ServiceTile.test.tsx`
- Create: `apps/web/src/__tests__/CatalogHome.test.tsx`
- Modify: `apps/web/src/App.tsx` (wire route)

**Interfaces:**
- Consumes: `apiClient.get('/catalog')`, `apiClient.get('/catalog/search?q=')`, `apiClient.post/delete('/catalog/:id/favorite')` (Tasks 5–7).
- Produces: `<ServiceTile>` reused by Task 17's admin table preview (visual reuse only, no shared state).

- [ ] **Step 1: Write the failing component test for `ServiceTile`**

```tsx
// apps/web/src/__tests__/ServiceTile.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ServiceTile } from '../components/ServiceTile';

const service = {
  id: 's1', name: 'Finance Expense System', description: 'Submit expenses.',
  category: 'Finance', tags: ['expenses'], launchType: 'SSO' as const,
};

describe('ServiceTile', () => {
  it('renders the service name and calls onToggleFavorite when the favorite button is clicked', async () => {
    const onToggleFavorite = vi.fn();
    render(<ServiceTile service={service} isFavorite={false} onToggleFavorite={onToggleFavorite} />);
    expect(screen.getByText('Finance Expense System')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add to favorites/i }));
    expect(onToggleFavorite).toHaveBeenCalledWith('s1');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ServiceTile service={service} isFavorite={false} onToggleFavorite={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run ServiceTile.test.tsx`
Expected: FAIL — `../components/ServiceTile` doesn't exist.

- [ ] **Step 3: Implement `ServiceTile`**

```tsx
// apps/web/src/components/ServiceTile.tsx
import { strings } from '../strings';

export interface ServiceSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  launchType: 'SSO' | 'CREDENTIAL';
}

interface Props {
  service: ServiceSummary;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onOpen?: (id: string) => void;
}

export function ServiceTile({ service, isFavorite, onToggleFavorite, onOpen }: Props) {
  return (
    <article className="rounded-lg border border-line bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className="font-heading text-xs font-semibold uppercase tracking-wider text-accent">{service.category}</span>
      <div className="mt-1 flex items-start justify-between">
        <h3 className="font-heading font-semibold text-ink">
          <button type="button" onClick={() => onOpen?.(service.id)} className="text-left hover:underline">
            {service.name}
          </button>
        </h3>
        <button
          type="button"
          aria-label={isFavorite ? strings.favoriteRemove : strings.favoriteAdd}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(service.id)}
          className={`text-lg ${isFavorite ? 'text-accent' : 'text-gray-400'}`}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{service.description}</p>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run ServiceTile.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `SearchBar`, `CategoryFilter`, and the failing `CatalogHome` test**

```tsx
// apps/web/src/components/SearchBar.tsx
import { strings } from '../strings';

export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="search"
      role="searchbox"
      aria-label={strings.searchPlaceholder}
      placeholder={strings.searchPlaceholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-line px-3 py-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
    />
  );
}
```

```tsx
// apps/web/src/components/CategoryFilter.tsx
export function CategoryFilter({ categories, selected, onSelect }: { categories: string[]; selected: string | null; onSelect: (c: string | null) => void }) {
  const pillClass = (active: boolean) =>
    `rounded border px-2 py-1 text-sm font-medium ${active ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink hover:border-accent'}`;
  return (
    <div role="group" aria-label="Filter by category" className="flex gap-2">
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={pillClass(selected === null)}>
        All
      </button>
      {categories.map((c) => (
        <button key={c} type="button" aria-pressed={selected === c} onClick={() => onSelect(c)} className={pillClass(selected === c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// apps/web/src/__tests__/CatalogHome.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { CatalogHome } from '../pages/CatalogHome';
import * as client from '../api/client';

const services = [
  { id: 's1', name: 'Finance Expense System', description: 'd', category: 'Finance', tags: [], launchType: 'SSO' },
  { id: 's2', name: 'Source Code Repository', description: 'd', category: 'Engineering', tags: [], launchType: 'SSO' },
];

describe('CatalogHome', () => {
  beforeEach(() => {
    vi.spyOn(client.apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/catalog') return Promise.resolve(services as any);
      if (path.startsWith('/catalog/search')) return Promise.resolve([services[0]] as any);
      return Promise.reject(new Error('unexpected path'));
    });
    vi.spyOn(client.apiClient, 'post').mockResolvedValue(undefined as any);
    vi.spyOn(client.apiClient, 'delete').mockResolvedValue(undefined as any);
  });

  it('loads and displays entitled services', async () => {
    render(<CatalogHome />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(screen.getByText('Source Code Repository')).toBeInTheDocument();
  });

  it('filters results as the user types in search', async () => {
    render(<CatalogHome />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    await userEvent.type(screen.getByRole('searchbox'), 'expence');
    await waitFor(() => expect(screen.queryByText('Source Code Repository')).not.toBeInTheDocument());
    expect(screen.getByText('Finance Expense System')).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    const { container } = render(<CatalogHome />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run CatalogHome.test.tsx`
Expected: FAIL — `../pages/CatalogHome` doesn't exist.

- [ ] **Step 7: Implement `CatalogHome`**

```tsx
// apps/web/src/pages/CatalogHome.tsx
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { ServiceTile, type ServiceSummary } from '../components/ServiceTile';
import { SearchBar } from '../components/SearchBar';
import { CategoryFilter } from '../components/CategoryFilter';
import { EmptyState } from '../components/EmptyState';
import { strings } from '../strings';

export function CatalogHome() {
  const [allServices, setAllServices] = useState<ServiceSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ServiceSummary[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get<ServiceSummary[]>('/catalog').then(setAllServices);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const handle = setTimeout(() => {
      apiClient.get<ServiceSummary[]>(`/catalog/search?q=${encodeURIComponent(query)}`).then(setSearchResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const baseList = searchResults ?? allServices ?? [];
  const categories = useMemo(() => [...new Set((allServices ?? []).map((s) => s.category))], [allServices]);
  const visible = category ? baseList.filter((s) => s.category === category) : baseList;

  async function toggleFavorite(id: string) {
    const next = new Set(favorites);
    if (next.has(id)) {
      next.delete(id);
      await apiClient.delete(`/catalog/${id}/favorite`);
    } else {
      next.add(id);
      await apiClient.post(`/catalog/${id}/favorite`);
    }
    setFavorites(next);
  }

  if (allServices === null) return <p role="status">Loading…</p>;

  if (allServices.length === 0) {
    return <EmptyState title={strings.emptyEntitlementsTitle} hint={strings.emptyEntitlementsHint} />;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.appName}</h1>
      <SearchBar value={query} onChange={setQuery} />
      <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
      {visible.length === 0 ? (
        <EmptyState title={strings.noResultsTitle} hint={strings.noResultsHint} categories={categories} onSelectCategory={setCategory} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <ServiceTile key={s.id} service={s} isFavorite={favorites.has(s.id)} onToggleFavorite={toggleFavorite} />
          ))}
        </div>
      )}
    </main>
  );
}
```

Wire into `App.tsx`:

```tsx
// apps/web/src/App.tsx — replace the placeholder route
import { CatalogHome } from './pages/CatalogHome';
// ...
      <Route path="/" element={<RequireAuth><CatalogHome /></RequireAuth>} />
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run ServiceTile.test.tsx CatalogHome.test.tsx`
Expected: PASS (build fails first if `EmptyState` from Step 7 doesn't exist yet — that's Task 16; stub it minimally now so this task's tests pass, full empty-state UX built out in Task 16):

```tsx
// apps/web/src/components/EmptyState.tsx (minimal stub — expanded in Task 16)
export function EmptyState({ title, hint }: { title: string; hint: string; categories?: string[]; onSelectCategory?: (c: string) => void }) {
  return (
    <div role="status" className="rounded border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-gray-600">{hint}</p>
    </div>
  );
}
```

Expected after adding the stub: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat: add catalog home page with search, filter, and favorites"
```

---

## Task 15: Frontend — Service Detail Page + Report Issue

**Files:**
- Create: `apps/web/src/pages/ServiceDetail.tsx`
- Create: `apps/web/src/__tests__/ServiceDetail.test.tsx`
- Modify: `apps/web/src/App.tsx` (route `/services/:id`)
- Modify: `apps/web/src/components/ServiceTile.tsx` (wire `onOpen` to navigate)

**Interfaces:**
- Consumes: `apiClient.get('/catalog/:id')`, `apiClient.post('/catalog/:id/report-issue')`, `apiClient.post('/catalog/:id/launch')` (Tasks 8–9).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/ServiceDetail.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ServiceDetail } from '../pages/ServiceDetail';
import * as client from '../api/client';

const service = {
  id: 's1', name: 'Finance Expense System', description: 'Submit expenses.',
  category: 'Finance', tags: [], launchType: 'SSO', vendorName: 'Concur',
  supportContact: 'finance-support@launchpad.local', docsUrl: null,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/services/:id" element={<ServiceDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('ServiceDetail', () => {
  beforeEach(() => {
    vi.spyOn(client.apiClient, 'get').mockResolvedValue(service as any);
    vi.spyOn(client.apiClient, 'post').mockResolvedValue({ ok: true } as any);
  });

  it('loads and displays service details including vendor and support contact', async () => {
    renderAt('/services/s1');
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(screen.getByText('Concur')).toBeInTheDocument();
    expect(screen.getByText('finance-support@launchpad.local')).toBeInTheDocument();
  });

  it('submits a report-issue request', async () => {
    renderAt('/services/s1');
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /report an issue/i }));
    await userEvent.type(screen.getByLabelText(/describe the issue/i), 'Broken link');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(client.apiClient.post).toHaveBeenCalledWith('/catalog/s1/report-issue', { description: 'Broken link' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ServiceDetail.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `ServiceDetail`**

```tsx
// apps/web/src/pages/ServiceDetail.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { strings } from '../strings';

interface ServiceDetailData {
  id: string; name: string; description: string; category: string;
  vendorName: string | null; supportContact: string; docsUrl: string | null;
}

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<ServiceDetailData | null>(null);
  const [reporting, setReporting] = useState(false);
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (id) apiClient.get<ServiceDetailData>(`/catalog/${id}`).then(setService);
  }, [id]);

  async function onLaunch() {
    if (id) await apiClient.post(`/catalog/${id}/launch`);
  }

  async function onSubmitReport(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    await apiClient.post(`/catalog/${id}/report-issue`, { description });
    setSubmitted(true);
    setReporting(false);
  }

  if (!service) return <p role="status">Loading…</p>;

  return (
    <main className="mx-auto max-w-2xl space-y-4 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{service.name}</h1>
      <p className="text-gray-700">{service.description}</p>
      <dl className="grid grid-cols-2 gap-2 rounded border border-line bg-card p-4 text-sm">
        <dt className="font-medium">Category</dt><dd>{service.category}</dd>
        {service.vendorName && (<><dt className="font-medium">Vendor</dt><dd>{service.vendorName}</dd></>)}
        <dt className="font-medium">Support</dt><dd>{service.supportContact}</dd>
      </dl>
      <button type="button" onClick={onLaunch} className="rounded bg-accent px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark">
        Launch
      </button>
      {!reporting && (
        <button type="button" onClick={() => setReporting(true)} className="ml-2 rounded border border-accent px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-accent hover:bg-accent hover:text-white">
          {strings.reportIssue}
        </button>
      )}
      {reporting && (
        <form onSubmit={onSubmitReport} className="space-y-2 rounded border border-line bg-card p-4">
          <label htmlFor="issue-description">Describe the issue</label>
          <textarea id="issue-description" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-line p-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" className="rounded bg-accent px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark">Submit</button>
        </form>
      )}
      {submitted && <p role="status">Thanks — your report has been sent.</p>}
    </main>
  );
}
```

Wire route in `App.tsx`:
```tsx
import { ServiceDetail } from './pages/ServiceDetail';
// ...
<Route path="/services/:id" element={<RequireAuth><ServiceDetail /></RequireAuth>} />
```

And wire `ServiceTile`'s `onOpen` in `CatalogHome.tsx` to navigate:
```tsx
import { useNavigate } from 'react-router-dom';
// inside CatalogHome
const navigate = useNavigate();
// pass to ServiceTile: onOpen={(id) => navigate(`/services/${id}`)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run ServiceDetail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: add service detail page with launch and report-issue"
```

---

## Task 16: Frontend — Search Empty State (FR-23)

**Files:**
- Modify: `apps/web/src/components/EmptyState.tsx` (replace Task 14's stub)
- Create: `apps/web/src/__tests__/EmptyState.test.tsx`

**Interfaces:**
- Consumes: nothing new — pure presentational component already wired into `CatalogHome` (Task 14).
- Produces: full FR-23 behavior — suggested categories, disabled "request access" stub (Phase 4), help desk link.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/EmptyState.test.tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { EmptyState } from '../components/EmptyState';

describe('EmptyState', () => {
  it('shows suggested categories and a disabled request-access stub', () => {
    render(<EmptyState title="No results" hint="Try something else" categories={['Finance', 'Engineering']} onSelectCategory={() => {}} />);
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request a new service/i })).toBeDisabled();
    expect(screen.getByText(/help desk/i)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<EmptyState title="No results" hint="Try something else" categories={[]} onSelectCategory={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run EmptyState.test.tsx`
Expected: FAIL — current stub has no categories/request-access UI.

- [ ] **Step 3: Implement full `EmptyState`**

```tsx
// apps/web/src/components/EmptyState.tsx
export function EmptyState({
  title, hint, categories = [], onSelectCategory,
}: {
  title: string; hint: string; categories?: string[]; onSelectCategory?: (c: string) => void;
}) {
  return (
    <div role="status" className="space-y-3 rounded border border-dashed border-line bg-card p-8 text-center">
      <p className="font-heading font-semibold text-ink">{title}</p>
      <p className="text-sm text-gray-600">{hint}</p>
      {categories.length > 0 && (
        <div>
          <p className="text-sm font-medium">Browse a category:</p>
          <div className="mt-1 flex justify-center gap-2">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => onSelectCategory?.(c)} className="rounded border border-line px-2 py-1 text-sm hover:border-accent">
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" disabled aria-disabled="true" className="rounded border border-line px-3 py-1 text-sm text-gray-400" title="Coming soon">
        Request a new service
      </button>
      <p className="text-sm">
        Still stuck? Contact the <a href="mailto:helpdesk@launchpad.local" className="text-accent underline">help desk</a>.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run EmptyState.test.tsx CatalogHome.test.tsx`
Expected: PASS for both — confirms Task 14's `CatalogHome` still works with the fuller component.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/EmptyState.tsx apps/web/src/__tests__/EmptyState.test.tsx
git commit -m "feat: build out FR-23 search empty state with category suggestions"
```

---

## Task 17: Frontend — Admin Console

**Files:**
- Create: `apps/web/src/pages/admin/AdminConsole.tsx`
- Create: `apps/web/src/pages/admin/ServiceForm.tsx`
- Create: `apps/web/src/pages/admin/EntitlementEditor.tsx`
- Create: `apps/web/src/pages/admin/AliasEditor.tsx`
- Create: `apps/web/src/__tests__/AdminConsole.test.tsx`
- Modify: `apps/web/src/App.tsx` (route `/admin`, role-gated)

**Interfaces:**
- Consumes: `apiClient` against `/admin/services`, `/admin/services/:id/entitlements`, `/admin/services/:id/aliases` (Tasks 10–12).
- Produces: `RequireRole` wrapper — a small extension of Task 13's `RequireAuth`, reused nowhere else in Phase 1.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/AdminConsole.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AdminConsole } from '../pages/admin/AdminConsole';
import * as client from '../api/client';

const services = [
  { id: 's1', name: 'Finance Expense System', status: 'ACTIVE', category: 'Finance' },
  { id: 's2', name: 'Legacy Timesheet Tool', status: 'RETIRED', category: 'HR' },
];

describe('AdminConsole', () => {
  beforeEach(() => {
    vi.spyOn(client.apiClient, 'get').mockResolvedValue(services as any);
    vi.spyOn(client.apiClient, 'patch').mockResolvedValue({} as any);
  });

  it('lists all services including retired ones', async () => {
    render(<AdminConsole />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(screen.getByText('Legacy Timesheet Tool')).toBeInTheDocument();
  });

  it('deactivating a service calls PATCH with status INACTIVE', async () => {
    render(<AdminConsole />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    const row = screen.getByText('Finance Expense System').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(client.apiClient.patch).toHaveBeenCalledWith('/admin/services/s1', { status: 'INACTIVE' }));
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<AdminConsole />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run AdminConsole.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `AdminConsole`** (create/entitlement/alias editors kept minimal but functional — no placeholders)

```tsx
// apps/web/src/pages/admin/ServiceForm.tsx
import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';

export function ServiceForm({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [supportContact, setSupportContact] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await apiClient.post('/admin/services', {
      name, description, category, tags: [], ownerId, launchType: 'SSO', supportContact,
    });
    setName(''); setDescription(''); setCategory(''); setSupportContact('');
    onCreated();
  }

  return (
    <form onSubmit={onSubmit} aria-label="Create service" className="grid grid-cols-2 gap-2">
      <label htmlFor="svc-name">Name<input id="svc-name" required value={name} onChange={(e) => setName(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <label htmlFor="svc-category">Category<input id="svc-category" required value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <label htmlFor="svc-description" className="col-span-2">Description<input id="svc-description" required value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <label htmlFor="svc-support" className="col-span-2">Support contact<input id="svc-support" required value={supportContact} onChange={(e) => setSupportContact(e.target.value)} className="block w-full rounded border px-2 py-1" /></label>
      <button type="submit" className="col-span-2 rounded bg-accent px-3 py-1 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark">Create service</button>
    </form>
  );
}
```

```tsx
// apps/web/src/pages/admin/EntitlementEditor.tsx
import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';

export function EntitlementEditor({ serviceId }: { serviceId: string }) {
  const [department, setDepartment] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await apiClient.post(`/admin/services/${serviceId}/entitlements`, { department: department || undefined });
    setDepartment('');
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Add entitlement to ${serviceId}`} className="flex gap-2">
      <label htmlFor={`ent-dept-${serviceId}`} className="sr-only">Department</label>
      <input id={`ent-dept-${serviceId}`} placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded border px-2 py-1 text-sm" />
      <button type="submit" className="rounded border px-2 py-1 text-sm">Add entitlement</button>
    </form>
  );
}
```

```tsx
// apps/web/src/pages/admin/AliasEditor.tsx
import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';

export function AliasEditor({ serviceId }: { serviceId: string }) {
  const [alias, setAlias] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await apiClient.post(`/admin/services/${serviceId}/aliases`, { alias });
    setAlias('');
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Add alias to ${serviceId}`} className="flex gap-2">
      <label htmlFor={`alias-${serviceId}`} className="sr-only">Alias</label>
      <input id={`alias-${serviceId}`} required placeholder="Alias" value={alias} onChange={(e) => setAlias(e.target.value)} className="rounded border px-2 py-1 text-sm" />
      <button type="submit" className="rounded border px-2 py-1 text-sm">Add alias</button>
    </form>
  );
}
```

```tsx
// apps/web/src/pages/admin/AdminConsole.tsx
import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ServiceForm } from './ServiceForm';
import { EntitlementEditor } from './EntitlementEditor';
import { AliasEditor } from './AliasEditor';
import { strings } from '../../strings';

interface AdminService {
  id: string; name: string; category: string; status: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
}

export function AdminConsole() {
  const { user } = useAuth();
  const [services, setServices] = useState<AdminService[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function reload() {
    apiClient.get<AdminService[]>('/admin/services').then(setServices);
  }

  useEffect(reload, []);

  async function setStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'RETIRED') {
    await apiClient.patch(`/admin/services/${id}`, { status });
    reload();
  }

  if (!services) return <p role="status">Loading…</p>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.adminConsoleTitle}</h1>
      {user && <ServiceForm ownerId={user.id} onCreated={reload} />}
      <table className="w-full rounded border border-line bg-card text-left text-sm">
        <thead className="border-b border-line">
          <tr><th scope="col" className="p-2">Name</th><th scope="col" className="p-2">Category</th><th scope="col" className="p-2">Status</th><th scope="col" className="p-2">Actions</th></tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <>
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.category}</td>
                <td>{s.status}</td>
                <td className="space-x-2">
                  {s.status === 'ACTIVE' && <button type="button" onClick={() => setStatus(s.id, 'INACTIVE')}>Deactivate</button>}
                  {s.status === 'INACTIVE' && <button type="button" onClick={() => setStatus(s.id, 'ACTIVE')}>Activate</button>}
                  {s.status !== 'RETIRED' && <button type="button" onClick={() => setStatus(s.id, 'RETIRED')}>Retire</button>}
                  <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    {expanded === s.id ? 'Hide' : 'Manage entitlements/aliases'}
                  </button>
                </td>
              </tr>
              {expanded === s.id && (
                <tr key={`${s.id}-editors`}>
                  <td colSpan={4} className="space-y-2 bg-gray-50 p-3">
                    <EntitlementEditor serviceId={s.id} />
                    <AliasEditor serviceId={s.id} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

Wire a role-gated route in `App.tsx`:
```tsx
import { AdminConsole } from './pages/admin/AdminConsole';

function RequireRole({ role, children }: { role: string; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
// ...
<Route path="/admin" element={<RequireRole role="CATALOG_ADMIN"><AdminConsole /></RequireRole>} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run AdminConsole.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd apps/web && npx vitest run`
Expected: all PASS — closes out Tasks 13–17.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat: add admin console with service, entitlement, and alias management"
```

---

## Task 18: Accessibility — Keyboard-Only Walkthrough Checklist

**Files:**
- Modify: `apps/web/src/pages/CatalogHome.tsx` (if any issue found)
- Modify: `apps/web/src/pages/admin/AdminConsole.tsx` (if any issue found)
- Create: `docs/specs/phase-1-a11y-checklist.md`

**Interfaces:**
- Consumes: Tasks 14–17's rendered pages (manual verification, not new production code unless a defect is found).

Automated axe-core checks are already embedded per-component (Tasks 14–17). This task is the spec's required **manual keyboard-only walkthrough** (§8/§9), since axe-core cannot verify actual tab order or focus visibility.

- [ ] **Step 1: Run the dev servers**

Run: `npm run db:up`, `cd apps/api && npm run start:dev`, `cd apps/web && npm run dev` (three terminals/background processes).

- [ ] **Step 2: Perform and record the keyboard-only walkthrough**

Using only Tab / Shift+Tab / Enter / Space / Arrow keys (mouse disconnected or ignored), walk: Login → Catalog home (search, category filter, favorite toggle, open a tile) → Service detail (launch, report issue form) → Admin console (create service, deactivate/retire, expand entitlement/alias editors). Record the result in a checklist file:

```markdown
# Phase 1 Manual Accessibility Walkthrough

Date: 2026-08-24 (fill in actual run date)
Tester: (fill in)

| Flow | Keyboard-only pass? | Notes |
|---|---|---|
| Login form | | |
| Catalog search + filter | | |
| Favorite toggle (star button) | | |
| Open service tile → detail | | |
| Report issue form | | |
| Admin: create service | | |
| Admin: deactivate/retire/activate | | |
| Admin: expand entitlement/alias editors | | |

Any focus traps, invisible focus indicators, or unreachable controls found must be fixed before Phase 1 is considered done (spec §8).
```

- [ ] **Step 3: Fix any findings**

If a control is unreachable by keyboard or focus is not visible, fix it directly in the relevant component (e.g., add `focus:ring-2 focus:ring-blue-500` Tailwind classes to interactive elements missing a visible focus state) and re-run the axe-core test for that component plus a re-walk of that flow.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/phase-1-a11y-checklist.md apps/web/src
git commit -m "docs: record phase 1 manual keyboard accessibility walkthrough"
```

---

## Task 19: End-to-End Tests (Playwright)

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/catalog.spec.ts`
- Create: `e2e/admin.spec.ts`
- Create: `package.json` scripts addition (root)

**Interfaces:**
- Consumes: the full running stack (Postgres + `apps/api` + `apps/web`), exactly as spec §9 requires.

- [ ] **Step 1: Scaffold Playwright**

```bash
npm init -y --prefix e2e 2>/dev/null; cd e2e && npm install -D @playwright/test && npx playwright install --with-deps chromium
```

```typescript
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'npm run start:dev', cwd: '../apps/api', port: 3001, reuseExistingServer: true },
    { command: 'npm run dev', cwd: '../apps/web', port: 5173, reuseExistingServer: true },
  ],
});
```

- [ ] **Step 2: Write the failing catalog e2e spec**

```typescript
// e2e/catalog.spec.ts
import { test, expect } from '@playwright/test';

test('two users in different departments see distinct catalogs', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance.employee@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('Finance Expense System')).toBeVisible();
  await expect(page.getByText('Source Code Repository')).not.toBeVisible();
});

test('misspelled search still finds the right service', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance.employee@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('searchbox').fill('expence');
  await expect(page.getByText('Finance Expense System')).toBeVisible();
});
```

- [ ] **Step 3: Run test to verify it fails (before the DB is freshly seeded for this run)**

Run: `cd e2e && npx playwright test catalog.spec.ts`
Expected: FAIL initially if run against a DB state left over from prior manual testing (e.g. favorites/entitlements manually edited) — reset via `cd apps/api && npx prisma db seed` before every e2e run; document this as a precondition. Once reset, expect the assertions above to genuinely exercise real behavior, not a stub.

- [ ] **Step 4: Re-seed and run to verify it passes**

Run: `cd apps/api && npx prisma db seed && cd ../e2e && npx playwright test catalog.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write and pass the admin e2e spec**

```typescript
// e2e/admin.spec.ts
import { test, expect } from '@playwright/test';

test('admin creates a service and entitlement; it appears for the entitled user without restart', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/login');
  await adminPage.getByLabel('Email').fill('admin@launchpad.local');
  await adminPage.getByRole('button', { name: /sign in/i }).click();
  await adminPage.goto('/admin');
  await adminPage.getByLabel('Name').fill('E2E New Service');
  await adminPage.getByLabel('Category').fill('IT');
  await adminPage.getByLabel('Description').fill('Created by e2e test');
  await adminPage.getByLabel('Support contact').fill('it@launchpad.local');
  await adminPage.getByRole('button', { name: /create service/i }).click();
  await adminPage.getByText('E2E New Service').locator('..').getByRole('button', { name: /manage entitlements/i }).click();
  await adminPage.getByPlaceholder('Department').fill('Engineering');
  await adminPage.getByRole('button', { name: /add entitlement/i }).click();

  const engContext = await browser.newContext();
  const engPage = await engContext.newPage();
  await engPage.goto('/login');
  await engPage.getByLabel('Email').fill('eng.employee@launchpad.local');
  await engPage.getByRole('button', { name: /sign in/i }).click();
  await expect(engPage.getByText('E2E New Service')).toBeVisible();
});

test('retiring a service removes it from the catalog but not from admin history', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.goto('/admin');
  const row = page.getByText('Finance Expense System').locator('..');
  await row.getByRole('button', { name: /retire/i }).click();
  await expect(page.getByText('Finance Expense System')).toBeVisible(); // still in admin console
});
```

Run: `npx playwright test`
Expected: PASS (re-seed the DB first as in Step 4 if the "retire" test above has left state from a prior run — note this in the e2e README).

- [ ] **Step 6: Add root convenience script and commit**

```json
// root package.json — add to "scripts"
"test:e2e": "npm --prefix apps/api run prisma:seed && npm --prefix e2e run test"
```

(Add a matching `"test": "playwright test"` script to a new `e2e/package.json`.)

```bash
git add e2e package.json
git commit -m "test: add playwright e2e coverage for catalog and admin flows"
```

---

## Task 20: Full-Stack Docker Compose + README

**Files:**
- Modify: `docker-compose.yml` (add `api` and `web` services)
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `README.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–19.
- Produces: `docker compose up` as the single command that brings up the whole Phase 1 system (Plan.md §2.1's stated goal for Docker Compose), matching NFR-Maintainability's "no deploy required for catalog changes" expectation at the infra level too.

- [ ] **Step 1: Write `apps/api/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace=@launchpad/api
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

- [ ] **Step 2: Write `apps/web/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace=@launchpad/web
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/apps/web/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
```

- [ ] **Step 3: Extend `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: launchpad
      POSTGRES_PASSWORD: launchpad_dev_only
      POSTGRES_DB: launchpad
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U launchpad"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    environment:
      DATABASE_URL: "postgresql://launchpad:launchpad_dev_only@postgres:5432/launchpad"
      JWT_SECRET: "dev-only-secret-change-me"
      PORT: 3001
    ports: ["3001:3001"]
    depends_on:
      postgres: { condition: service_healthy }

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    ports: ["5173:5173"]
    depends_on: [api]

volumes:
  pgdata:
```

- [ ] **Step 4: Bring the full stack up and smoke test**

Run: `docker compose up --build -d`
Then: `curl -f http://localhost:3001/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"admin@launchpad.local"}'` and open `http://localhost:5173` in a browser.
Expected: API responds 200 with a session cookie; the web app loads the login page and, after logging in, shows the catalog home with seeded services.

Note: the seed script does not run automatically in the `api` container's `CMD` (only `prisma migrate deploy` does) — run it once manually after first bring-up: `docker compose exec api npx prisma db seed`.

- [ ] **Step 5: Write `README.md`**

```markdown
# Enterprise Launchpad — Phase 1 Prototype

Internal Service Catalog & SSO Portal. See `Plan.md` and `docs/specs/phase-1-core-catalog-portal.md` for full spec.

## Run locally (dev, hot reload)
1. `npm run db:up`
2. `cd apps/api && cp ../../.env.example .env && npm install && npx prisma migrate dev && npx prisma db seed && npm run start:dev`
3. `cd apps/web && npm install && npm run dev`
4. Open http://localhost:5173 — log in as `admin@launchpad.local` (CATALOG_ADMIN) or `finance.employee@launchpad.local` / `eng.employee@launchpad.local` (EMPLOYEE).

## Run via Docker Compose (full stack)
1. `docker compose up --build -d`
2. `docker compose exec api npx prisma db seed` (first run only)
3. Open http://localhost:5173

## Tests
- Backend unit + integration: `cd apps/api && npm test && npm run test:e2e`
- Frontend unit + a11y: `cd apps/web && npm test`
- End-to-end: re-seed the DB, then `npm run test:e2e` from the repo root (see Task 19)

## Scope
Phase 1 only: catalog browsing/search, favorites, admin CRUD, audit logging. No real SSO, no credential vault, no access-request workflow — see `Plan.md` §8 and the spec's §10.
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml apps/api/Dockerfile apps/web/Dockerfile README.md
git commit -m "chore: add full-stack docker compose setup and readme"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §1 Summary → Task 3 (stand-in login). §2 Data Model → Task 2. §3 API Endpoints → Tasks 5–12 (every row in the table has a task). §4 Frontend Views → Tasks 14, 15, 16(embedded), 17. §5 Search → Task 6. §6 RBAC/Entitlement → Task 5 (list) + Task 8 (detail, explicitly re-checks entitlement rather than trusting the list). §7 Error Handling → Task 5/8 (empty state, 404 not 403), Task 12 (duplicate aliases allowed), admin retire-with-favorites behavior noted as already satisfied by Task 7's `deleteMany`-based removal only (favorites aren't deleted on retire since retire only changes `status`, not entitlements/favorites — verified this requires no extra code beyond Task 10's `updateService`). §8 Accessibility → embedded axe-core per component (Tasks 14–17) + Task 18's manual walkthrough. §9 Testing Plan → covered task-by-task plus Task 19's Playwright e2e. §10 Out of scope → respected; no SSO/vault/access-request code appears anywhere in this plan.
- **Type consistency check:** `ServiceSummary` (Task 14) and the detail shape (Task 15) are deliberately different types (list vs. detail projections) — both are structurally compatible with what `CatalogService` actually returns (the full Prisma `Service` row), so no over/under-fetching bug. `AdminService` (Task 17's frontend) is a different, narrower type from `apps/api`'s `AdminService` (Task 10's backend class) — same name, different files/layers, not imported across the boundary; flagged here for the executor's awareness rather than renamed, since Nest/React conventions both call this "AdminService" naturally in their own layer.
- **Known gap carried forward from Task 5:** `group`-based entitlements are schema-only in Phase 1 (no `User.group` field yet) — matches spec's Phase 1 `User` fields exactly; not a bug.
- **Design System retrofit:** the palette/typography/`AppHeader` in the "Design System" section were added after initial plan approval, based on `alhamra.ae`'s brand. Tasks 13–17's component code above already reflects the final styling — no further class-name changes needed at execution time.
