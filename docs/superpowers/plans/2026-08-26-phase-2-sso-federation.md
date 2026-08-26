# Phase 2: SSO / IdP Federation Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's seeded-email login with real OIDC federation against a mock IdP, and make `SSO`-launchType service tiles perform a genuine federated redirect into one of two mock downstream apps with no second login prompt.

**Architecture:** Two new standalone Node/Express processes (`apps/mock-idp` wrapping `oidc-provider`, `apps/mock-target-apps/demo-app-a` + `demo-app-b` as OIDC relying parties) plus three additions to the existing NestJS API (`auth`'s login flow swapped to OIDC, a new `sso-launch` module, `admin`'s update DTO extended) and matching frontend/e2e changes.

**Tech Stack:** `oidc-provider` (mock IdP), `openid-client` (both the portal API and the two demo apps act as RP), `pg` (mock-idp's read-only DB access — no separate Prisma schema), Express (mock-idp + demo apps), existing NestJS/Prisma/React stack unchanged otherwise.

**Spec:** `docs/superpowers/specs/2026-08-26-phase-2-sso-federation-design.md`

## Global Constraints

- Node.js 20 LTS, TypeScript 5, strict mode — same as Phase 1, applies to all new packages (`mock-idp`, `demo-app-a`, `demo-app-b`) too.
- No Docker required to develop locally — this repo's dev environment runs Postgres/api/web as plain local processes (see `apps/api/.env`, `apps/web` `npm run dev`); the two new mock services follow the same plain-process pattern. `docker-compose.yml` is updated too, for parity, but is not the primary dev path here.
- Ports: `mock-idp` = 4000, `demo-app-a` = 4001, `demo-app-b` = 4002. Portal API stays 3001, web stays 5173.
- `CREDENTIAL`-launchType services and anything vault-related are explicitly out of scope (Phase 3).
- Every `SSO_LAUNCH` audit row goes through the existing `AuditService.record(...)` — never written ad hoc (same rule Phase 1 established for `ADMIN_CHANGE`/`CATALOG_LAUNCH`).
- UI strings continue to live in `apps/web/src/strings.ts` only.

### Deviation from the design spec (flagged for the record)

The design spec (§4/§5) says the seeded `POST /auth/login` is removed outright. Once actually enumerating every place that used it, that endpoint's exact request shape (`POST /auth/login` with `{ email }`) is depended on by **~19 call sites** across `catalog.controller.e2e-spec.ts`, `admin.controller.e2e-spec.ts`, and `auth.guard.e2e-spec.ts` as the standard "log in as a seeded user" test setup step — none of those tests can drive a real browser-redirect OIDC flow, since they run the Nest app in-process via `Test.createTestingModule`, not through an HTTP browser.

Rather than rewrite ~19 call sites to construct session cookies programmatically (higher risk, larger diff, harder to review), Task 6 below replaces the endpoint with `POST /auth/dev-login` — byte-for-byte the same request/response shape, gated to throw 404 when `NODE_ENV=production`, existing only as backend test infrastructure. Every existing e2e spec file gets a one-line path rename (`/auth/login` → `/auth/dev-login`) rather than a logic rewrite. This does not weaken production security (the seeded login mechanism is inert in production) and keeps the diff reviewable. Flagged here per this plan's "no silent scope changes" expectation — mention this to the user when the plan is presented.

---

## Task 1: Prisma — `SsoTargetApp` enum + `Service.ssoTargetApp` field

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration under `apps/api/prisma/migrations/`

**Interfaces:**
- Produces: `Prisma.SsoTargetApp` enum (`DEMO_APP_A` | `DEMO_APP_B`) and `Service.ssoTargetApp: SsoTargetApp | null` — every later backend task that reads/writes this field depends on the generated Prisma Client types from this task.

- [ ] **Step 1: Add the enum and field**

In `apps/api/prisma/schema.prisma`, add after the existing `enum ServiceStatus { ... }` block:

```prisma
enum SsoTargetApp {
  DEMO_APP_A
  DEMO_APP_B
}
```

And add one field to `model Service`, directly under the existing `healthCheckUrl String?` line:

```prisma
  ssoTargetApp   SsoTargetApp?
```

- [ ] **Step 2: Create and apply the migration**

Run:
```bash
cd apps/api
npx prisma migrate dev --name add_sso_target_app
```

Expected: a new folder appears under `apps/api/prisma/migrations/`, the migration applies cleanly against the running dev Postgres, and `npx prisma generate` (run automatically by `migrate dev`) regenerates `@prisma/client` with the new field/enum.

- [ ] **Step 3: Verify the generated client has the new field**

Run:
```bash
node -e "const {PrismaClient}=require('@prisma/client'); console.log(Object.keys(require('@prisma/client').Prisma).includes('SsoTargetApp'))"
```
(run from `apps/api`)
Expected: prints `true`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(db): add SsoTargetApp enum and Service.ssoTargetApp field"
```

---

## Task 2: `mock-idp` — scaffold + read-only user lookup

**Files:**
- Create: `apps/mock-idp/package.json`
- Create: `apps/mock-idp/tsconfig.json`
- Create: `apps/mock-idp/.env.example`
- Create: `apps/mock-idp/src/users.ts`
- Test: `apps/mock-idp/src/users.spec.ts`

**Interfaces:**
- Consumes: the same Postgres `User` table Phase 1's `apps/api` writes to, via `DATABASE_URL`.
- Produces: `listUsers(): Promise<MockUser[]>`, `findUserById(id: string): Promise<MockUser | null>` where `MockUser = { id: string; email: string; displayName: string; department: string; role: string }` — Task 3's interaction routes and Task 4's `findAccount` both depend on these two functions' exact names/shapes.

- [ ] **Step 1: Scaffold the package**

```bash
mkdir -p apps/mock-idp/src
```

`apps/mock-idp/package.json`:
```json
{
  "name": "@launchpad/mock-idp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start:dev": "ts-node-dev --respawn src/index.ts",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "oidc-provider": "^8.5.1",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "@types/pg": "^8.11.6",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "ts-node-dev": "^2.0.0",
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

`apps/mock-idp/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

`apps/mock-idp/.env.example`:
```
DATABASE_URL="postgresql://launchpad:launchpad_dev_only@localhost:5432/launchpad"
PORT=4000
ISSUER="http://localhost:4000"
COOKIE_SECRET="dev-only-mock-idp-cookie-secret"
PORTAL_REDIRECT_URI="http://localhost:3001/auth/oidc/callback"
DEMO_APP_A_REDIRECT_URI="http://localhost:4001/callback"
DEMO_APP_B_REDIRECT_URI="http://localhost:4002/callback"
```
Copy to `apps/mock-idp/.env` for local dev (not committed).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/mock-idp/src/users.spec.ts
import { Pool } from 'pg';
import { listUsers, findUserById } from './users';

jest.mock('pg', () => {
  const query = jest.fn();
  return { Pool: jest.fn(() => ({ query })) };
});

describe('users', () => {
  const mockRow = { id: 'u1', email: 'a@b.com', displayName: 'A B', department: 'IT', role: 'EMPLOYEE' };

  it('listUsers returns all seeded users ordered by display name', async () => {
    const pool = new Pool() as any;
    pool.query.mockResolvedValue({ rows: [mockRow] });
    const users = await listUsers();
    expect(users).toEqual([mockRow]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY "displayName"'));
  });

  it('findUserById returns null when no row matches', async () => {
    const pool = new Pool() as any;
    pool.query.mockResolvedValue({ rows: [] });
    expect(await findUserById('missing')).toBeNull();
  });

  it('findUserById returns the matching user', async () => {
    const pool = new Pool() as any;
    pool.query.mockResolvedValue({ rows: [mockRow] });
    expect(await findUserById('u1')).toEqual(mockRow);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mock-idp && npx jest users.spec.ts`
Expected: FAIL — `Cannot find module './users'`.

- [ ] **Step 4: Implement `users.ts`**

```typescript
// apps/mock-idp/src/users.ts
import { Pool } from 'pg';

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: string;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SELECT_COLUMNS = `id, email, "displayName", department, role`;

export async function listUsers(): Promise<MockUser[]> {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM "User" ORDER BY "displayName"`);
  return rows;
}

export async function findUserById(id: string): Promise<MockUser | null> {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM "User" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest users.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Install dependencies and commit**

```bash
cd apps/mock-idp && npm install
cd ../..
git add apps/mock-idp
git commit -m "feat(mock-idp): scaffold package with read-only user lookup"
```

---

## Task 3: `mock-idp` — `oidc-provider` config + Express app + interaction routes

**Files:**
- Create: `apps/mock-idp/src/provider.ts`
- Create: `apps/mock-idp/src/index.ts`

**Interfaces:**
- Consumes: `listUsers`/`findUserById` from Task 2.
- Produces: a running OIDC provider on `PORT` (default 4000) with clients `portal`, `demo-app-a`, `demo-app-b` pre-registered — Task 5 (portal's `openid-client` RP) and Tasks 7–8 (demo apps) all depend on this issuer being reachable and these exact `client_id`/`client_secret`/`redirect_uris` values.

- [ ] **Step 1: Write `provider.ts`**

```typescript
// apps/mock-idp/src/provider.ts
import Provider, { type Configuration, type Account, type FindAccount } from 'oidc-provider';

const PORTAL_REDIRECT = process.env.PORTAL_REDIRECT_URI ?? 'http://localhost:3001/auth/oidc/callback';
const DEMO_APP_A_REDIRECT = process.env.DEMO_APP_A_REDIRECT_URI ?? 'http://localhost:4001/callback';
const DEMO_APP_B_REDIRECT = process.env.DEMO_APP_B_REDIRECT_URI ?? 'http://localhost:4002/callback';

/**
 * Three statically-registered clients, matching the "2 fixed demo apps" scope decision
 * (see design spec §9) — no dynamic client registration for a prototype mock IdP.
 */
const clients: Configuration['clients'] = [
  {
    client_id: 'portal',
    client_secret: 'portal-dev-secret',
    redirect_uris: [PORTAL_REDIRECT],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
  {
    client_id: 'demo-app-a',
    client_secret: 'demo-app-a-secret',
    redirect_uris: [DEMO_APP_A_REDIRECT],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
  {
    client_id: 'demo-app-b',
    client_secret: 'demo-app-b-secret',
    redirect_uris: [DEMO_APP_B_REDIRECT],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
];

export function buildProvider(issuer: string, findAccount: FindAccount): Provider {
  return new Provider(issuer, {
    clients,
    claims: { openid: ['sub'], email: ['email'], profile: ['department', 'role'] },
    findAccount,
    features: { devInteractions: { enabled: false } },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    cookies: { keys: [process.env.COOKIE_SECRET ?? 'dev-only-mock-idp-cookie-secret'] },
  });
}
```

- [ ] **Step 2: Write `index.ts`**

```typescript
// apps/mock-idp/src/index.ts
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { buildProvider } from './provider';
import { listUsers, findUserById, type MockUser } from './users';

const PORT = Number(process.env.PORT ?? 4000);
const ISSUER = process.env.ISSUER ?? `http://localhost:${PORT}`;

const findAccount = async (_ctx: unknown, id: string) => {
  const user = await findUserById(id);
  if (!user) return undefined;
  return {
    accountId: id,
    claims: async () => ({ sub: id, email: user.email, department: user.department, role: user.role }),
  };
};

const oidc = buildProvider(ISSUER, findAccount);
const app = express();
app.use(express.urlencoded({ extended: false }));

// GET is only ever hit for the `login` prompt — a session that already exists at this IdP
// completes the authorization request without ever reaching an interaction route at all,
// which is exactly the mechanism that makes a later SSO *launch* silent (design spec §5 step 3).
app.get('/interaction/:uid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, prompt } = await (oidc as any).interactionDetails(req, res);
    if (prompt.name !== 'login') {
      return next(new Error(`mock-idp: unsupported prompt "${prompt.name}"`));
    }
    const users = await listUsers();
    res.type('html').send(renderPicker(uid, users));
  } catch (err) {
    next(err);
  }
});

app.post('/interaction/:uid/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = { login: { accountId: req.body.accountId } };
    await (oidc as any).interactionFinished(req, res, result, { mergeWithLastSubmission: false });
  } catch (err) {
    next(err);
  }
});

app.use(oidc.callback());

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`mock-idp listening on ${PORT}, issuer ${ISSUER}`);
});

function renderPicker(uid: string, users: MockUser[]): string {
  const rows = users
    .map(
      (u) => `
    <form method="post" action="/interaction/${uid}/login" style="margin-bottom: 0.5rem;">
      <input type="hidden" name="accountId" value="${u.id}" />
      <button type="submit">${u.displayName} (${u.email})</button>
    </form>`,
    )
    .join('');
  return `<!doctype html><html><body><h1>Mock IdP — choose a user</h1>${rows}</body></html>`;
}
```

**Note for the implementer:** `oidc-provider` also requires a `consent` prompt by default before it will issue tokens for a client/scope combination it hasn't seen granted before. If, when manually testing (Step 3 below), the browser gets stuck on an "unsupported prompt: consent" error instead of reaching the target app, add a second branch to the `GET /interaction/:uid` handler above, immediately after the `login` branch:

```typescript
    if (prompt.name === 'consent') {
      const { session, params } = await (oidc as any).interactionDetails(req, res);
      const grant = new (oidc as any).Grant({ accountId: session.accountId, clientId: params.client_id as string });
      grant.addOIDCScope(params.scope as string);
      const grantId = await grant.save();
      return (oidc as any).interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
    }
```
This is `oidc-provider`'s own documented pattern for auto-granting consent (see `node_modules/oidc-provider/example/routes/express.js` in the installed package for the current version's exact shape if the above doesn't match).

- [ ] **Step 3: Manual smoke test**

Run: `cd apps/mock-idp && npm run start:dev` (with Postgres from Phase 1 already running and seeded)
Then in a browser, visit:
```
http://localhost:4000/auth?client_id=portal&response_type=code&scope=openid%20email&redirect_uri=http://localhost:3001/auth/oidc/callback
```
Expected: the picker page renders with 4 buttons (one per seeded user from `apps/api/prisma/seed.ts`). Clicking one redirects toward `http://localhost:3001/auth/oidc/callback?code=...` (this 404s for now since Task 6 hasn't built that route yet — a 404 with a `code` query param present confirms the IdP side is working correctly).

- [ ] **Step 4: Commit**

```bash
git add apps/mock-idp/src
git commit -m "feat(mock-idp): wire oidc-provider with 3 static clients and a one-click user picker"
```

---

## Task 4: Root workspace — register `mock-idp` and prep for the two demo apps

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `apps/mock-idp` (and, once Tasks 7–8 create them, `apps/mock-target-apps/demo-app-a`/`demo-app-b`) installable via a single root `npm install`.

- [ ] **Step 1: Add the new workspace**

In root `package.json`, change:
```json
  "workspaces": ["apps/api", "apps/web"],
```
to:
```json
  "workspaces": ["apps/api", "apps/web", "apps/mock-idp", "apps/mock-target-apps/demo-app-a", "apps/mock-target-apps/demo-app-b"],
```

(The two demo-app paths are added now so Step 2 below installs them too, even though Tasks 7–8 haven't created their `package.json` yet — `npm install` simply skips workspace paths that don't exist yet at this point, and will pick them up once Tasks 7–8 add them without needing this file touched again.)

- [ ] **Step 2: Reinstall from root**

Run: `npm install` (from repo root)
Expected: completes without error; `apps/mock-idp` is now hoisted into the root `node_modules` alongside `apps/api`/`apps/web`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: register mock-idp and demo-app workspaces"
```

---

## Task 5: `apps/api` — `OidcService` (RP-side OIDC client wrapper)

**Files:**
- Create: `apps/api/src/auth/oidc.service.ts`
- Test: `apps/api/src/auth/oidc.service.spec.ts`
- Modify: `apps/api/.env.example` (create if it doesn't already track one — check first; if only `.env` exists undocumented, add the new vars there and note them in the task)

**Interfaces:**
- Consumes: `openid-client`, env vars `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`.
- Produces: `OidcService.getAuthorizationUrl(): Promise<string>`, `OidcService.handleCallback(callbackParams: Record<string, string>): Promise<{ email: string }>` — Task 6's `AuthController` depends on both exact method names/signatures.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/auth/oidc.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OidcService } from './oidc.service';

const mockClient = {
  authorizationUrl: jest.fn(),
  callbackParams: jest.fn(),
  callback: jest.fn(),
  userinfo: jest.fn(),
};

jest.mock('openid-client', () => ({
  Issuer: { discover: jest.fn(() => Promise.resolve({ Client: jest.fn(() => mockClient) })) },
  generators: { state: () => 'mock-state' },
}));

describe('OidcService', () => {
  let service: OidcService;
  const config = {
    get: (key: string) =>
      ({
        OIDC_ISSUER_URL: 'http://localhost:4000',
        OIDC_CLIENT_ID: 'portal',
        OIDC_CLIENT_SECRET: 'portal-dev-secret',
        OIDC_REDIRECT_URI: 'http://localhost:3001/auth/oidc/callback',
      }[key]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [OidcService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = moduleRef.get(OidcService);
  });

  it('builds an authorization URL requesting openid+email scope', async () => {
    mockClient.authorizationUrl.mockReturnValue('http://localhost:4000/auth?mock=1');
    const url = await service.getAuthorizationUrl();
    expect(url).toBe('http://localhost:4000/auth?mock=1');
    expect(mockClient.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ scope: 'openid email' }));
  });

  it('exchanges the callback and returns the email from userinfo', async () => {
    mockClient.callbackParams.mockReturnValue({ code: 'abc' });
    mockClient.callback.mockResolvedValue({ access_token: 'tok' });
    mockClient.userinfo.mockResolvedValue({ email: 'admin@launchpad.local' });
    const result = await service.handleCallback({ code: 'abc' });
    expect(result).toEqual({ email: 'admin@launchpad.local' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest oidc.service.spec.ts`
Expected: FAIL — `Cannot find module './oidc.service'`.

- [ ] **Step 3: Implement `OidcService`**

```typescript
// apps/api/src/auth/oidc.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Issuer, generators, type Client } from 'openid-client';

@Injectable()
export class OidcService {
  private clientPromise: Promise<Client> | null = null;

  constructor(private config: ConfigService) {}

  private async getClient(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = Issuer.discover(this.config.get<string>('OIDC_ISSUER_URL')!).then(
        (issuer) =>
          new issuer.Client({
            client_id: this.config.get<string>('OIDC_CLIENT_ID')!,
            client_secret: this.config.get<string>('OIDC_CLIENT_SECRET')!,
            redirect_uris: [this.config.get<string>('OIDC_REDIRECT_URI')!],
            response_types: ['code'],
          }),
      );
    }
    return this.clientPromise;
  }

  async getAuthorizationUrl(): Promise<string> {
    const client = await this.getClient();
    return client.authorizationUrl({
      scope: 'openid email',
      state: generators.state(),
    });
  }

  async handleCallback(callbackParams: Record<string, string>): Promise<{ email: string }> {
    const client = await this.getClient();
    const params = client.callbackParams({ query: callbackParams } as any);
    const tokenSet = await client.callback(this.config.get<string>('OIDC_REDIRECT_URI')!, params);
    const userinfo = await client.userinfo(tokenSet);
    return { email: userinfo.email as string };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest oidc.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add env vars and install `openid-client`**

Run: `cd apps/api && npm install openid-client@^5`

Add to `apps/api/.env` (create alongside the existing `.env` if not already tracked as `.env.example` at repo root — check `.env.example` at repo root first and add these there too):
```
OIDC_ISSUER_URL="http://localhost:4000"
OIDC_CLIENT_ID="portal"
OIDC_CLIENT_SECRET="portal-dev-secret"
OIDC_REDIRECT_URI="http://localhost:3001/auth/oidc/callback"
WEB_BASE_URL="http://localhost:5173"
DEMO_APP_A_URL="http://localhost:4001/login"
DEMO_APP_B_URL="http://localhost:4002/login"
```
(`WEB_BASE_URL` and the two `DEMO_APP_*_URL` vars are used by Tasks 6 and 10 respectively — added here so one env-file edit covers the whole phase.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/oidc.service.ts apps/api/src/auth/oidc.service.spec.ts apps/api/package.json apps/api/package-lock.json .env.example
git commit -m "feat(api): add OidcService wrapping openid-client for the portal's RP flow"
```

---

## Task 6: `apps/api` — swap `AuthController`'s login for OIDC; add gated `/auth/dev-login` for tests

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/common/guards/auth.guard.e2e-spec.ts`
- Modify: `apps/api/src/catalog/catalog.controller.e2e-spec.ts`
- Modify: `apps/api/src/admin/admin.controller.e2e-spec.ts`

**Interfaces:**
- Consumes: `OidcService` (Task 5), `AuthService.login(email)` (unchanged, Phase 1).
- Produces: `GET /auth/oidc/login`, `GET /auth/oidc/callback`, `POST /auth/dev-login` (test-only, see Global Constraints deviation note) — every later e2e test task in this plan logs in via `POST /auth/dev-login`.

- [ ] **Step 1: Update `AuthController`**

Replace the `@Public() @Post('login')` handler in `apps/api/src/auth/auth.controller.ts` with:

```typescript
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { Public } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';

/** The only user fields the client is ever given — no adUsername, no internal timestamps. */
function safeUser(user: User) {
  return { id: user.id, email: user.email, displayName: user.displayName, department: user.department, role: user.role };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private oidcService: OidcService, private config: ConfigService) {}

  @Public()
  @Get('oidc/login')
  async oidcLogin(@Res() res: Response) {
    const url = await this.oidcService.getAuthorizationUrl();
    res.redirect(url);
  }

  @Public()
  @Get('oidc/callback')
  async oidcCallback(@Query() query: Record<string, string>, @Res() res: Response) {
    const { email } = await this.oidcService.handleCallback(query);
    let token: string;
    try {
      ({ token } = await this.authService.login(email));
    } catch {
      // Every mock-idp account should always match a Phase 1 User by email — this only fires on
      // drift between the two seed sources, not as a normal user-facing case. Per design spec §8,
      // shown as a plain-language page (not raw JSON) with a help-desk route, same tone as the
      // frontend's ErrorState/EmptyState components.
      res.status(401).type('html').send(
        `<!doctype html><html><body><h1>We couldn't sign you in.</h1><p>No account matches ${email}. Contact the help desk at helpdesk@launchpad.local.</p></body></html>`,
      );
      return;
    }
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    res.redirect(this.config.get<string>('WEB_BASE_URL')!);
  }

  /**
   * Test-only stand-in for a full browser OIDC round trip, which none of this backend's
   * in-process e2e tests (Test.createTestingModule, no real browser) can drive. Inert outside
   * NODE_ENV=production is never set in this dev/test environment. See the plan's "Deviation
   * from the design spec" note for why this exists instead of removing seeded login entirely.
   */
  @Public()
  @Post('dev-login')
  async devLogin(@Body('email') email: string, @Res({ passthrough: true }) res: Response) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      res.status(404);
      return { message: 'Not found' };
    }
    const { token, user } = await this.authService.login(email);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    return safeUser(user);
  }

  @Get('me')
  async me(@CurrentUser() user: User) {
    return safeUser(user);
  }

  @Public()
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('session');
    return { ok: true };
  }
}
```

- [ ] **Step 2: Register `OidcService` in `AuthModule`**

In `apps/api/src/auth/auth.module.ts`, add `OidcService` to `providers`:
```typescript
import { OidcService } from './oidc.service';
// ...
@Module({
  providers: [AuthService, OidcService, PrismaService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 3: Rename every `/auth/login` call site to `/auth/dev-login`**

In `apps/api/src/common/guards/auth.guard.e2e-spec.ts`, `apps/api/src/catalog/catalog.controller.e2e-spec.ts`, and `apps/api/src/admin/admin.controller.e2e-spec.ts`, replace every occurrence of the string `'/auth/login'` with `'/auth/dev-login'` (path only — request bodies/assertions are unchanged). This is a mechanical find-and-replace; there is no other logic change in these three files for this task.

Also update the one assertion in `auth.guard.e2e-spec.ts` that names the old route in its test title:
```typescript
  it('allows /auth/dev-login without a session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ email: 'admin@launchpad.local' });
    expect(res.status).toBe(201);
  });
```

- [ ] **Step 4: Run the full backend test suite**

Run: `cd apps/api && npx jest && npx jest --config jest-e2e.config.js`
Expected: all unit tests still PASS (unaffected — `AuthService.login` didn't change); all e2e tests PASS using the renamed `/auth/dev-login` path.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth apps/api/src/common/guards/auth.guard.e2e-spec.ts apps/api/src/catalog/catalog.controller.e2e-spec.ts apps/api/src/admin/admin.controller.e2e-spec.ts
git commit -m "feat(api): replace seeded login with OIDC callback flow; gate old path as /auth/dev-login for tests"
```

---

## Task 7: `mock-target-apps/demo-app-a` — minimal OIDC relying party

**Files:**
- Create: `apps/mock-target-apps/demo-app-a/package.json`
- Create: `apps/mock-target-apps/demo-app-a/tsconfig.json`
- Create: `apps/mock-target-apps/demo-app-a/.env.example`
- Create: `apps/mock-target-apps/demo-app-a/src/index.ts`

**Interfaces:**
- Consumes: `mock-idp` (Task 3) via `openid-client`, client `demo-app-a` / secret `demo-app-a-secret` / redirect `http://localhost:4001/callback` (must match Task 3's static client registration exactly).
- Produces: `GET /login` (starts the federated login), `GET /callback` (completes it, renders a landing page) — Task 10's `sso-launch` module returns `http://localhost:4001/login` as this app's federated entry URL.

- [ ] **Step 1: Scaffold**

```bash
mkdir -p apps/mock-target-apps/demo-app-a/src
```

`apps/mock-target-apps/demo-app-a/package.json`:
```json
{
  "name": "@launchpad/demo-app-a",
  "version": "0.1.0",
  "private": true,
  "scripts": { "start:dev": "ts-node-dev --respawn src/index.ts" },
  "dependencies": {
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "openid-client": "^5.6.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/node": "^20.11.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3"
  }
}
```

`apps/mock-target-apps/demo-app-a/tsconfig.json`: identical to `apps/mock-idp/tsconfig.json` (copy it).

`apps/mock-target-apps/demo-app-a/.env.example`:
```
PORT=4001
APP_NAME="Demo App A"
OIDC_ISSUER_URL="http://localhost:4000"
CLIENT_ID="demo-app-a"
CLIENT_SECRET="demo-app-a-secret"
REDIRECT_URI="http://localhost:4001/callback"
SESSION_SECRET="dev-only-demo-app-a-session-secret"
```
Copy to `.env` for local dev.

- [ ] **Step 2: Implement the RP**

```typescript
// apps/mock-target-apps/demo-app-a/src/index.ts
import express from 'express';
import session from 'express-session';
import { Issuer, generators } from 'openid-client';

const PORT = Number(process.env.PORT ?? 4001);
const APP_NAME = process.env.APP_NAME ?? 'Demo App A';

async function main() {
  const issuer = await Issuer.discover(process.env.OIDC_ISSUER_URL!);
  const client = new issuer.Client({
    client_id: process.env.CLIENT_ID!,
    client_secret: process.env.CLIENT_SECRET!,
    redirect_uris: [process.env.REDIRECT_URI!],
    response_types: ['code'],
  });

  const app = express();
  app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));

  app.get('/login', (req, res) => {
    const state = generators.state();
    (req.session as any).oidcState = state;
    res.redirect(client.authorizationUrl({ scope: 'openid email profile', state }));
  });

  app.get('/callback', async (req, res, next) => {
    try {
      const params = client.callbackParams(req);
      const expectedState = (req.session as any).oidcState;
      const tokenSet = await client.callback(process.env.REDIRECT_URI!, params, { state: expectedState });
      const userinfo = await client.userinfo(tokenSet);
      (req.session as any).user = userinfo;
      res.type('html').send(
        `<!doctype html><html><body><h1>${APP_NAME}</h1><p>You're logged in as ${userinfo.email} (${userinfo.department}/${userinfo.role}) — no second login prompt.</p></body></html>`,
      );
    } catch (err) {
      next(err);
    }
  });

  app.get('/', (req, res) => {
    const user = (req.session as any).user;
    if (!user) return res.redirect('/login');
    res.type('html').send(`<!doctype html><html><body><h1>${APP_NAME}</h1><p>Logged in as ${user.email}</p></body></html>`);
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`${APP_NAME} listening on ${PORT}`);
  });
}

main();
```

- [ ] **Step 3: Install and manual smoke test**

```bash
cd apps/mock-target-apps/demo-app-a && npm install
npm run start:dev
```
With `mock-idp` (Task 3) also running, visit `http://localhost:4001/login` in a browser. Expected: redirected to `mock-idp`'s picker, clicking a user lands back on `/callback` showing "You're logged in as `<email>` (`<department>`/`<role>`)".

- [ ] **Step 4: Commit**

```bash
git add apps/mock-target-apps/demo-app-a
git commit -m "feat(demo-app-a): minimal OIDC relying party for SSO demo"
```

---

## Task 8: `mock-target-apps/demo-app-b` — second instance

**Files:**
- Create: `apps/mock-target-apps/demo-app-b/package.json`
- Create: `apps/mock-target-apps/demo-app-b/tsconfig.json`
- Create: `apps/mock-target-apps/demo-app-b/.env.example`
- Create: `apps/mock-target-apps/demo-app-b/src/index.ts`

**Interfaces:**
- Same shape as Task 7, parameterized for the second demo app. Produces `http://localhost:4002/login` as its federated entry URL, matching client `demo-app-b` from Task 3.

- [ ] **Step 1: Scaffold**

Copy every file from `apps/mock-target-apps/demo-app-a` (Task 7) into `apps/mock-target-apps/demo-app-b`, then apply these exact replacements:

`apps/mock-target-apps/demo-app-b/package.json` — change `"name": "@launchpad/demo-app-a"` to `"name": "@launchpad/demo-app-b"`.

`apps/mock-target-apps/demo-app-b/.env.example`:
```
PORT=4002
APP_NAME="Demo App B"
OIDC_ISSUER_URL="http://localhost:4000"
CLIENT_ID="demo-app-b"
CLIENT_SECRET="demo-app-b-secret"
REDIRECT_URI="http://localhost:4002/callback"
SESSION_SECRET="dev-only-demo-app-b-session-secret"
```
Copy to `.env` for local dev.

`apps/mock-target-apps/demo-app-b/src/index.ts` — identical to Task 7's, only the default port fallback differs: `Number(process.env.PORT ?? 4002)` and `process.env.APP_NAME ?? 'Demo App B'`.

- [ ] **Step 2: Install and manual smoke test**

```bash
cd apps/mock-target-apps/demo-app-b && npm install
npm run start:dev
```
Visit `http://localhost:4002/login`, confirm the same flow as Task 7 Step 3 works for Demo App B.

- [ ] **Step 3: Commit**

```bash
git add apps/mock-target-apps/demo-app-b
git commit -m "feat(demo-app-b): second OIDC relying party for SSO demo"
```

---

## Task 9: `apps/api` — expose `CatalogService.assertEntitled` for reuse

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts:116` (the `private async assertEntitled` method)
- Modify: `apps/api/src/catalog/catalog.module.ts`

**Interfaces:**
- Produces: `CatalogService.assertEntitled(user: User, id: string): Promise<Service>` (now public, was private) — Task 10's `SsoLaunchService` depends on this exact signature, imported rather than re-derived (design spec §6).

- [ ] **Step 1: Drop the `private` modifier**

In `apps/api/src/catalog/catalog.service.ts`, change:
```typescript
  private async assertEntitled(user: User, id: string) {
```
to:
```typescript
  async assertEntitled(user: User, id: string) {
```
No other change to the method body.

- [ ] **Step 2: Export `CatalogService` from `CatalogModule`**

In `apps/api/src/catalog/catalog.module.ts`, add an `exports` array:
```typescript
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CatalogController],
  providers: [CatalogService, PrismaService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

- [ ] **Step 3: Run existing catalog tests to confirm nothing broke**

Run: `cd apps/api && npx jest catalog.service.spec.ts && npx jest --config jest-e2e.config.js catalog.controller.e2e-spec.ts`
Expected: PASS — this task only changes visibility, not behavior.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/catalog/catalog.service.ts apps/api/src/catalog/catalog.module.ts
git commit -m "refactor(api): export CatalogService.assertEntitled for reuse by sso-launch"
```

---

## Task 10: `apps/api` — `sso-launch` module

**Files:**
- Create: `apps/api/src/sso-launch/sso-launch.module.ts`
- Create: `apps/api/src/sso-launch/sso-launch.controller.ts`
- Create: `apps/api/src/sso-launch/sso-launch.service.ts`
- Test: `apps/api/src/sso-launch/sso-launch.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CatalogService.assertEntitled` (Task 9), `AuditService.record` (Phase 1, unchanged), env vars `DEMO_APP_A_URL`/`DEMO_APP_B_URL` (Task 5).
- Produces: `GET /sso-launch/:serviceId` → `{ redirectUrl: string }` — Task 14's frontend `ServiceDetail` depends on this exact response shape.

- [ ] **Step 1: Write the failing unit test**

```typescript
// apps/api/src/sso-launch/sso-launch.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { SsoLaunchService } from './sso-launch.service';
import { CatalogService } from '../catalog/catalog.service';
import { AuditService } from '../audit/audit.service';

describe('SsoLaunchService', () => {
  let service: SsoLaunchService;
  const catalogService = { assertEntitled: jest.fn() };
  const auditService = { record: jest.fn() };
  const config = {
    get: (key: string) =>
      ({ DEMO_APP_A_URL: 'http://localhost:4001/login', DEMO_APP_B_URL: 'http://localhost:4002/login' }[key]),
  };
  const user = { id: 'u1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SsoLaunchService,
        { provide: CatalogService, useValue: catalogService },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(SsoLaunchService);
  });

  it('resolves DEMO_APP_A to its configured URL and writes an SSO_LAUNCH audit row', async () => {
    catalogService.assertEntitled.mockResolvedValue({ id: 's1', ssoTargetApp: 'DEMO_APP_A' });
    const result = await service.resolve(user, 's1');
    expect(result).toEqual({ redirectUrl: 'http://localhost:4001/login' });
    expect(auditService.record).toHaveBeenCalledWith('u1', 'SSO_LAUNCH', 's1');
  });

  it('resolves DEMO_APP_B to its configured URL', async () => {
    catalogService.assertEntitled.mockResolvedValue({ id: 's2', ssoTargetApp: 'DEMO_APP_B' });
    const result = await service.resolve(user, 's2');
    expect(result).toEqual({ redirectUrl: 'http://localhost:4002/login' });
  });

  it('throws a clear error when the service has no ssoTargetApp configured', async () => {
    catalogService.assertEntitled.mockResolvedValue({ id: 's3', ssoTargetApp: null });
    await expect(service.resolve(user, 's3')).rejects.toThrow(BadRequestException);
    expect(auditService.record).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest sso-launch.service.spec.ts`
Expected: FAIL — `Cannot find module './sso-launch.service'`.

- [ ] **Step 3: Implement the service, controller, and module**

```typescript
// apps/api/src/sso-launch/sso-launch.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SsoLaunchService {
  constructor(private catalogService: CatalogService, private auditService: AuditService, private config: ConfigService) {}

  async resolve(user: User, serviceId: string): Promise<{ redirectUrl: string }> {
    const service = await this.catalogService.assertEntitled(user, serviceId);
    const redirectUrl = this.resolveTargetUrl(service.ssoTargetApp);
    await this.auditService.record(user.id, 'SSO_LAUNCH', serviceId);
    return { redirectUrl };
  }

  private resolveTargetUrl(ssoTargetApp: string | null): string {
    if (ssoTargetApp === 'DEMO_APP_A') return this.config.get<string>('DEMO_APP_A_URL')!;
    if (ssoTargetApp === 'DEMO_APP_B') return this.config.get<string>('DEMO_APP_B_URL')!;
    throw new BadRequestException("This service isn't configured for SSO launch yet — contact the help desk.");
  }
}
```

```typescript
// apps/api/src/sso-launch/sso-launch.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SsoLaunchService } from './sso-launch.service';

@Controller('sso-launch')
export class SsoLaunchController {
  constructor(private ssoLaunchService: SsoLaunchService) {}

  @Get(':serviceId')
  async launch(@CurrentUser() user: User, @Param('serviceId') serviceId: string) {
    return this.ssoLaunchService.resolve(user, serviceId);
  }
}
```

```typescript
// apps/api/src/sso-launch/sso-launch.module.ts
import { Module } from '@nestjs/common';
import { SsoLaunchController } from './sso-launch.controller';
import { SsoLaunchService } from './sso-launch.service';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, CatalogModule, AuditModule],
  controllers: [SsoLaunchController],
  providers: [SsoLaunchService],
})
export class SsoLaunchModule {}
```

Register it in `apps/api/src/app.module.ts`:
```typescript
import { SsoLaunchModule } from './sso-launch/sso-launch.module';
// ...
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, CatalogModule, AdminModule, SsoLaunchModule],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest sso-launch.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sso-launch apps/api/src/app.module.ts
git commit -m "feat(api): add sso-launch module resolving ssoTargetApp to a redirect URL"
```

---

## Task 11: `apps/api` — `sso-launch` integration test

**Files:**
- Create: `apps/api/src/sso-launch/sso-launch.controller.e2e-spec.ts`

**Interfaces:**
- Consumes: `POST /auth/dev-login` (Task 6), `PATCH /admin/services/:id` (Phase 1, extended by Task 12), `GET /sso-launch/:serviceId` (Task 10).

- [ ] **Step 1: Write the test**

```typescript
// apps/api/src/sso-launch/sso-launch.controller.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('GET /sso-launch/:serviceId (e2e)', () => {
  let app: INestApplication;
  const createdServiceIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (createdServiceIds.length > 0) {
      const prisma = new (require('@prisma/client').PrismaClient)();
      await prisma.auditLog.deleteMany({ where: { serviceId: { in: createdServiceIds } } });
      await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
      await prisma.$disconnect();
    }
    await app.close();
  });

  it('returns the demo app A URL for an entitled SSO service configured for it', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'SSO Launch Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id, launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);
    await adminAgent.post(`/admin/services/${created.body.id}/entitlements`).send({ role: 'EMPLOYEE' });
    await adminAgent.patch(`/admin/services/${created.body.id}`).send({ ssoTargetApp: 'DEMO_APP_A' }).expect(200);

    const empAgent = request.agent(app.getHttpServer());
    await empAgent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    const res = await empAgent.get(`/sso-launch/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ redirectUrl: 'http://localhost:4001/login' });
  });

  it('404s for a service the user is not entitled to (same as /catalog/:id)', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'SSO Entitlement Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id, launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);
    await adminAgent.patch(`/admin/services/${created.body.id}`).send({ ssoTargetApp: 'DEMO_APP_A' });
    // deliberately no entitlement added — zero entitlements means invisible to non-admins

    const empAgent = request.agent(app.getHttpServer());
    await empAgent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    await empAgent.get(`/sso-launch/${created.body.id}`).expect(404);
  });

  it('400s with a clear message for an SSO service with no ssoTargetApp set', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'Unconfigured SSO Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id, launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);
    await adminAgent.post(`/admin/services/${created.body.id}/entitlements`).send({ role: 'EMPLOYEE' });

    const empAgent = request.agent(app.getHttpServer());
    await empAgent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    const res = await empAgent.get(`/sso-launch/${created.body.id}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not configured for SSO launch/i);
  });
});
```

- [ ] **Step 2: Run test — expect it to fail on the `ssoTargetApp` PATCH until Task 12 lands**

Run: `npx jest --config jest-e2e.config.js sso-launch.controller.e2e-spec.ts`
Expected: FAIL on the first test (`PATCH .../ssoTargetApp` doesn't yet persist the field — `UpdateServiceDto` doesn't accept it until Task 12). This is expected at this point in the plan; do not treat as a bug in Task 10's code.

- [ ] **Step 3: Commit** (test file only — it stays red until Task 12)

```bash
git add apps/api/src/sso-launch/sso-launch.controller.e2e-spec.ts
git commit -m "test(api): add sso-launch integration test (red until Task 12 adds ssoTargetApp to admin DTO)"
```

---

## Task 12: `apps/api` — admin `UpdateServiceDto` accepts `ssoTargetApp`

**Files:**
- Modify: `apps/api/src/admin/dto/update-service.dto.ts`

**Interfaces:**
- Produces: `PATCH /admin/services/:id` now accepts `ssoTargetApp: 'DEMO_APP_A' | 'DEMO_APP_B' | null` — Task 11's integration test and Task 15's frontend `SsoTargetEditor` both depend on this exact field name/values.

- [ ] **Step 1: Add the field**

```typescript
// apps/api/src/admin/dto/update-service.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { ServiceStatus, SsoTargetApp } from '@prisma/client';
import { CreateServiceDto } from './create-service.dto';

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @IsOptional() @IsEnum(ServiceStatus) status?: ServiceStatus;
  @IsOptional() @IsEnum(SsoTargetApp) ssoTargetApp?: SsoTargetApp | null;
}
```

No change needed to `admin.service.ts`'s `updateService` — it already passes the whole validated `dto` straight to `prisma.service.update({ data: dto })`, so the new field flows through automatically.

- [ ] **Step 2: Re-run Task 11's integration test — now expect it to pass**

Run: `cd apps/api && npx jest --config jest-e2e.config.js sso-launch.controller.e2e-spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Run the full admin test suite to confirm no regression**

Run: `npx jest admin.service.spec.ts && npx jest --config jest-e2e.config.js admin.controller.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/admin/dto/update-service.dto.ts
git commit -m "feat(api): admin PATCH /services/:id accepts ssoTargetApp"
```

---

## Task 13: `apps/web` — `LoginPage` becomes a single "Sign in with SSO" button

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/auth/AuthContext.tsx`
- Modify: `apps/web/src/strings.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `LoginPage` with no `login()` dependency on `AuthContext` — `AuthContextValue` drops the `login` method entirely (nothing else in the codebase calls it, per Phase 1's final state).

- [ ] **Step 1: Update `strings.ts`**

Remove these three now-unused entries: `loginPrompt`, `loginButton`, `loginErrorMessage`, `emailLabel`. Add one new entry in their place:
```typescript
  signInWithSsoButton: 'Sign in with SSO',
```

- [ ] **Step 2: Rewrite `LoginPage.tsx`**

```typescript
// apps/web/src/pages/LoginPage.tsx
import { strings } from '../strings';

const API_BASE_URL = 'http://localhost:3001';

export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <div className="w-80 space-y-4 rounded-lg bg-card p-8 text-center shadow-lg">
        <div className="mb-2 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded border-2 border-ink">
            <span aria-hidden className="text-xl text-ink">▲</span>
          </div>
          <h1 className="font-heading text-lg font-bold uppercase tracking-wide text-ink">{strings.appName}</h1>
        </div>
        <a
          href={`${API_BASE_URL}/auth/oidc/login`}
          className="block w-full rounded bg-accent px-3 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          {strings.signInWithSsoButton}
        </a>
      </div>
    </main>
  );
}
```

A real `<a href>` (not a button + `window.location.href` handler) so it's a native, keyboard-reachable link with a real destination — a full-page navigation is exactly right here since this is leaving the SPA to start an OIDC redirect chain.

- [ ] **Step 3: Drop `login` from `AuthContext`**

In `apps/web/src/auth/AuthContext.tsx`, remove the `login` method from `AuthContextValue`, from `AuthProvider`'s implementation, and from the value passed to `AuthContext.Provider`:

```typescript
export interface AuthContextValue {
  user: CurrentUser | null;
  initializing: boolean;
  logout: () => Promise<void>;
}
```
Remove the `login = useCallback(...)` block entirely, and change the provider's return to:
```typescript
  return <AuthContext.Provider value={{ user, initializing, logout }}>{children}</AuthContext.Provider>;
```
Remove the now-unused `useCallback` import if `logout` no longer needs it — check: `logout` still uses `useCallback`, so keep the import.

- [ ] **Step 4: Update `apiClient.ts`'s `NO_REDIRECT_ON_401` list**

`/auth/login` no longer exists as a route; remove it from the list:
```typescript
const NO_REDIRECT_ON_401 = ['/auth/me'];
```

- [ ] **Step 5: Manual smoke test**

With `apps/api`, `apps/web`, and `apps/mock-idp` all running, visit `http://localhost:5173/login`. Expected: a single "Sign in with SSO" button. Clicking it redirects to `mock-idp`'s picker; picking a user lands back on the catalog home, logged in.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/LoginPage.tsx apps/web/src/auth/AuthContext.tsx apps/web/src/strings.ts apps/web/src/api/client.ts
git commit -m "feat(web): replace seeded-email login form with Sign in with SSO"
```

---

## Task 14: `apps/web` — `ServiceDetail` Launch button branches by `launchType`

**Files:**
- Modify: `apps/web/src/pages/ServiceDetail.tsx`
- Modify: `apps/web/src/__tests__/ServiceDetail.test.tsx`

**Interfaces:**
- Consumes: `GET /sso-launch/:id` (Task 10) → `{ redirectUrl: string }`.
- Produces: `ServiceDetailData` gains a `launchType: 'SSO' | 'CREDENTIAL'` field.

- [ ] **Step 1: Add the failing test for the SSO branch**

In `apps/web/src/__tests__/ServiceDetail.test.tsx`, add `launchType: 'SSO'` to the existing `service` fixture object, then add a new test:

```typescript
  it('SSO launch navigates the browser to the resolved redirect URL', async () => {
    const originalLocation = window.location;
    // @ts-expect-error -- jsdom's window.location isn't directly assignable; this is the
    // standard workaround for asserting on a full-page navigation in a jsdom test.
    delete window.location;
    window.location = { ...originalLocation, href: '' } as Location;

    vi.spyOn(client.apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/catalog/s1') return Promise.resolve(service as any);
      if (path === '/sso-launch/s1') return Promise.resolve({ redirectUrl: 'http://localhost:4001/login' } as any);
      return Promise.reject(new Error('unexpected path'));
    });

    renderAt('/services/s1');
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /launch/i }));
    await waitFor(() => expect(window.location.href).toBe('http://localhost:4001/login'));

    window.location = originalLocation;
  });
```

Also update the `beforeEach`'s existing `vi.spyOn(client.apiClient, 'get')` from a flat `mockResolvedValue(service as any)` to the same path-based `mockImplementation` shape shown above (returning `service` for `/catalog/s1` and rejecting for anything unexpected), so the existing tests and the new one can coexist without one clobbering the other's mock.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run ServiceDetail.test.tsx`
Expected: FAIL — `onLaunch` doesn't call `/sso-launch/:id` yet.

- [ ] **Step 3: Implement the branch**

In `apps/web/src/pages/ServiceDetail.tsx`, add `launchType: 'SSO' | 'CREDENTIAL';` to the `ServiceDetailData` interface, and replace `onLaunch`:

```typescript
  async function onLaunch() {
    if (!id || !service) return;
    setActionFailed(false);
    try {
      if (service.launchType === 'SSO') {
        const { redirectUrl } = await apiClient.get<{ redirectUrl: string }>(`/sso-launch/${id}`);
        window.location.href = redirectUrl;
      } else {
        await apiClient.post(`/catalog/${id}/launch`);
      }
    } catch {
      setActionFailed(true);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run ServiceDetail.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/ServiceDetail.tsx apps/web/src/__tests__/ServiceDetail.test.tsx
git commit -m "feat(web): Launch button performs a real SSO redirect for SSO-launchType services"
```

---

## Task 15: `apps/web` — admin `SsoTargetEditor`

**Files:**
- Create: `apps/web/src/pages/admin/SsoTargetEditor.tsx`
- Modify: `apps/web/src/pages/admin/AdminConsole.tsx`
- Modify: `apps/web/src/strings.ts`

**Interfaces:**
- Consumes: `PATCH /admin/services/:id` with `{ ssoTargetApp }` (Task 12).
- Produces: rendered only when a service's `launchType === 'SSO'`, alongside the existing `EntitlementEditor`/`AliasEditor` in the same expand-row.

- [ ] **Step 1: Add strings**

In `apps/web/src/strings.ts`, add:
```typescript
  ssoTargetLabel: 'SSO Target',
  ssoTargetNone: 'None',
  ssoTargetDemoAppA: 'Demo App A',
  ssoTargetDemoAppB: 'Demo App B',
```

- [ ] **Step 2: Write `SsoTargetEditor.tsx`**

```typescript
// apps/web/src/pages/admin/SsoTargetEditor.tsx
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export function SsoTargetEditor({
  serviceId,
  ssoTargetApp,
  onChanged,
}: {
  serviceId: string;
  ssoTargetApp: 'DEMO_APP_A' | 'DEMO_APP_B' | null;
  onChanged?: () => void;
}) {
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    try {
      await apiClient.patch(`/admin/services/${serviceId}`, { ssoTargetApp: value });
    } finally {
      onChanged?.();
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor={`sso-target-${serviceId}`} className="font-heading text-xs font-semibold uppercase tracking-wider text-gray-600">
        {strings.ssoTargetLabel}
      </label>
      <select
        id={`sso-target-${serviceId}`}
        value={ssoTargetApp ?? ''}
        onChange={onChange}
        className="block rounded border px-2 py-1 text-sm"
      >
        <option value="">{strings.ssoTargetNone}</option>
        <option value="DEMO_APP_A">{strings.ssoTargetDemoAppA}</option>
        <option value="DEMO_APP_B">{strings.ssoTargetDemoAppB}</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `AdminConsole.tsx`**

Add `launchType` and `ssoTargetApp` to the local `AdminService` interface:
```typescript
interface AdminService {
  id: string; name: string; category: string; status: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
  launchType: 'SSO' | 'CREDENTIAL';
  ssoTargetApp: 'DEMO_APP_A' | 'DEMO_APP_B' | null;
  entitlements?: AdminEntitlement[];
  aliases?: AdminAlias[];
}
```

Import and render `SsoTargetEditor` conditionally, right after the existing `EntitlementEditor`/`AliasEditor` pair in the expand-row `<td>`:
```typescript
import { SsoTargetEditor } from './SsoTargetEditor';
// ...
                    <EntitlementEditor serviceId={s.id} entitlements={s.entitlements} onChanged={reload} />
                    <AliasEditor serviceId={s.id} aliases={s.aliases} onChanged={reload} />
                    {s.launchType === 'SSO' && (
                      <SsoTargetEditor serviceId={s.id} ssoTargetApp={s.ssoTargetApp} onChanged={reload} />
                    )}
```

- [ ] **Step 4: Update `AdminConsole.test.tsx`'s fixture**

The `services` fixture in `apps/web/src/__tests__/AdminConsole.test.tsx` needs `launchType` and `ssoTargetApp` on each entry so the new conditional doesn't crash on `undefined`:
```typescript
const services = [
  { id: 's1', name: 'Finance Expense System', status: 'ACTIVE', category: 'Finance', launchType: 'SSO', ssoTargetApp: null },
  { id: 's2', name: 'Legacy Timesheet Tool', status: 'RETIRED', category: 'HR', launchType: 'SSO', ssoTargetApp: null },
];
```

- [ ] **Step 5: Run the frontend suite**

Run: `cd apps/web && npx vitest run`
Expected: all 5 test files still PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/admin/SsoTargetEditor.tsx apps/web/src/pages/admin/AdminConsole.tsx apps/web/src/strings.ts apps/web/src/__tests__/AdminConsole.test.tsx
git commit -m "feat(web): admin console can set a service's SSO target app"
```

---

## Task 16: Playwright e2e — shared OIDC login helper; update existing specs; extend `playwright.config.ts`

**Files:**
- Create: `e2e/helpers.ts`
- Modify: `e2e/catalog.spec.ts`
- Modify: `e2e/admin.spec.ts`
- Modify: `e2e/playwright.config.ts`

**Interfaces:**
- Produces: `loginAs(page: Page, email: string): Promise<void>` — drives the real browser through `LoginPage` → `mock-idp`'s picker → back to the portal, logged in. Every e2e spec (existing and Task 17's new one) uses this instead of the old form-fill pattern.

- [ ] **Step 1: Write the helper**

```typescript
// e2e/helpers.ts
import type { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: /sign in with sso/i }).click();
  await page.getByRole('button', { name: new RegExp(email.replace('.', '\\.')) }).click();
}
```

- [ ] **Step 2: Update `catalog.spec.ts`**

Replace both occurrences of:
```typescript
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance.employee@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
```
with:
```typescript
  await loginAs(page, 'finance.employee@launchpad.local');
```
and add `import { loginAs } from './helpers';` at the top.

- [ ] **Step 3: Update `admin.spec.ts`**

Same replacement pattern for all four login blocks (`adminPage`/`engPage` in the first test, `page` in the second), e.g.:
```typescript
  await loginAs(adminPage, 'admin@launchpad.local');
```
Add `import { loginAs } from './helpers';` at the top.

- [ ] **Step 4: Extend `playwright.config.ts`'s `webServer` array**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'npm run start:dev', cwd: '../apps/api', port: 3001, reuseExistingServer: true },
    { command: 'npm run dev', cwd: '../apps/web', port: 5173, reuseExistingServer: true },
    { command: 'npm run start:dev', cwd: '../apps/mock-idp', port: 4000, reuseExistingServer: true },
    { command: 'npm run start:dev', cwd: '../apps/mock-target-apps/demo-app-a', port: 4001, reuseExistingServer: true },
    { command: 'npm run start:dev', cwd: '../apps/mock-target-apps/demo-app-b', port: 4002, reuseExistingServer: true },
  ],
});
```

- [ ] **Step 5: Run the existing e2e suite end to end**

Run (from repo root, with Postgres up and seeded): `npm run test:e2e`
Expected: PASS — `catalog.spec.ts` and `admin.spec.ts` both pass using the new OIDC login flow through a real mock-idp.

- [ ] **Step 6: Commit**

```bash
git add e2e/helpers.ts e2e/catalog.spec.ts e2e/admin.spec.ts e2e/playwright.config.ts
git commit -m "test(e2e): drive login through the real mock-idp OIDC flow instead of the removed form"
```

---

## Task 17: Playwright e2e — full SSO launch flow (no second login prompt)

**Files:**
- Create: `e2e/sso-launch.spec.ts`

**Interfaces:**
- Consumes: `loginAs` (Task 16), an `SSO`-launchType service configured with a `ssoTargetApp` — the seed data doesn't have one, so this test creates it via the admin console first (same pattern `admin.spec.ts` already uses).

- [ ] **Step 1: Write the test**

```typescript
// e2e/sso-launch.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test('SSO tile launch lands authenticated in the demo app with no second login prompt', async ({ page }) => {
  await loginAs(page, 'admin@launchpad.local');
  await page.getByRole('link', { name: /admin/i }).click();
  await page.getByLabel('Name').fill('E2E SSO Demo Service');
  await page.getByLabel('Category').fill('IT');
  await page.getByLabel('Description').fill('Created by sso-launch e2e test');
  await page.getByLabel('Support contact').fill('it@launchpad.local');
  await page.getByRole('button', { name: /create service/i }).click();
  const row = page.getByText('E2E SSO Demo Service').locator('..');
  await row.getByRole('button', { name: /manage entitlements/i }).click();
  await page.getByPlaceholder('Department').fill('Finance');
  await page.getByRole('button', { name: /add entitlement/i }).click();
  await page.getByLabel('SSO Target').selectOption('DEMO_APP_A');

  await page.getByRole('link', { name: /sign out/i }).click();
  await loginAs(page, 'finance.employee@launchpad.local');
  await page.getByText('E2E SSO Demo Service').click();
  await page.getByRole('button', { name: /launch/i }).click();

  // No second login prompt: the browser lands straight on Demo App A's callback page.
  await expect(page).toHaveURL(/localhost:4001\/callback/);
  await expect(page.getByText(/logged in as finance\.employee@launchpad\.local/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e` (from repo root)
Expected: PASS. This is the literal end-to-end scenario Plan.md §4 and the design spec's §10 ask for.

- [ ] **Step 3: Commit**

```bash
git add e2e/sso-launch.spec.ts
git commit -m "test(e2e): full SSO launch flow lands authenticated with no second prompt"
```

---

## Task 18: `docker-compose.yml` + README — Phase 2 run instructions

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- None — documentation/ops parity only.

- [ ] **Step 1: Add `mock-idp` and both demo apps to `docker-compose.yml`**

Following the existing `api`/`web` service pattern in `docker-compose.yml` (each needs its own `Dockerfile` — write minimal ones matching `apps/api/Dockerfile`'s shape, adjusted for these being plain Node/Express apps with no build step beyond `tsc`):

```yaml
  mock-idp:
    build:
      context: .
      dockerfile: apps/mock-idp/Dockerfile
    environment:
      DATABASE_URL: "postgresql://launchpad:launchpad_dev_only@postgres:5432/launchpad"
      PORT: 4000
      ISSUER: "http://localhost:4000"
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy

  demo-app-a:
    build:
      context: .
      dockerfile: apps/mock-target-apps/demo-app-a/Dockerfile
    environment:
      PORT: 4001
      APP_NAME: "Demo App A"
      OIDC_ISSUER_URL: "http://mock-idp:4000"
      CLIENT_ID: "demo-app-a"
      CLIENT_SECRET: "demo-app-a-secret"
      REDIRECT_URI: "http://localhost:4001/callback"
      SESSION_SECRET: "dev-only-demo-app-a-session-secret"
    ports:
      - "4001:4001"
    depends_on:
      - mock-idp

  demo-app-b:
    build:
      context: .
      dockerfile: apps/mock-target-apps/demo-app-b/Dockerfile
    environment:
      PORT: 4002
      APP_NAME: "Demo App B"
      OIDC_ISSUER_URL: "http://mock-idp:4000"
      CLIENT_ID: "demo-app-b"
      CLIENT_SECRET: "demo-app-b-secret"
      REDIRECT_URI: "http://localhost:4002/callback"
      SESSION_SECRET: "dev-only-demo-app-b-session-secret"
    ports:
      - "4002:4002"
    depends_on:
      - mock-idp
```

Add matching `Dockerfile`s at `apps/mock-idp/Dockerfile`, `apps/mock-target-apps/demo-app-a/Dockerfile`, `apps/mock-target-apps/demo-app-b/Dockerfile` — copy `apps/api/Dockerfile`'s structure, adjusting the start command to `npm run start:dev`'s underlying `ts-node-dev` entrypoint (or add a `"start": "ts-node src/index.ts"` script to each `package.json` for the container's production-ish command, since `ts-node-dev`'s watch mode isn't needed inside a container). Add `"start": "ts-node src/index.ts"` to all three new `package.json`s alongside the existing `start:dev` script.

- [ ] **Step 2: Update `README.md`**

Add a new subsection under "Run locally (dev, hot reload)":
```markdown
5. `cd apps/mock-idp && cp .env.example .env && npm install && npm run start:dev`
6. `cd apps/mock-target-apps/demo-app-a && cp .env.example .env && npm install && npm run start:dev`
7. `cd apps/mock-target-apps/demo-app-b && cp .env.example .env && npm install && npm run start:dev`
8. Click "Sign in with SSO" on the login page — you'll land on a one-click user picker at `localhost:4000`.
```
And note in the "Docker Compose" section that step 2 (seeding) now also seeds the users `mock-idp` reads.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml apps/mock-idp/Dockerfile apps/mock-target-apps/demo-app-a/Dockerfile apps/mock-target-apps/demo-app-b/Dockerfile apps/mock-idp/package.json apps/mock-target-apps/demo-app-a/package.json apps/mock-target-apps/demo-app-b/package.json README.md
git commit -m "chore: add mock-idp and demo apps to docker-compose and README"
```

---

## Task 19: Accessibility pass — new UI surfaces

**Files:**
- Modify: `apps/web/src/__tests__/ServiceDetail.test.tsx` (axe check, if not already covered)
- Create: `apps/web/src/__tests__/LoginPage.test.tsx`

**Interfaces:**
- None new — verification only, per design spec §10's lower bar for `mock-idp`/demo-app throwaway surfaces vs. a full axe pass on the portal's own new `LoginPage` button.

- [ ] **Step 1: Write `LoginPage.test.tsx`**

```typescript
// apps/web/src/__tests__/LoginPage.test.tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { LoginPage } from '../pages/LoginPage';

describe('LoginPage', () => {
  it('renders a Sign in with SSO link pointing at the backend OIDC login route', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /sign in with sso/i });
    expect(link).toHaveAttribute('href', 'http://localhost:3001/auth/oidc/login');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<LoginPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && npx vitest run LoginPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the full frontend suite one more time**

Run: `npx vitest run`
Expected: all test files PASS (6 files now, including the new `LoginPage.test.tsx`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/__tests__/LoginPage.test.tsx
git commit -m "test(web): a11y + link-target coverage for the new SSO login button"
```

---

## Task 20: Full-suite verification

**Files:** none — verification only.

- [ ] **Step 1: Backend — unit + e2e**

Run:
```bash
cd apps/api
npx jest
npx jest --config jest-e2e.config.js
```
Expected: all PASS, including the new `oidc.service.spec.ts` and `sso-launch.service.spec.ts`/`sso-launch.controller.e2e-spec.ts`.

- [ ] **Step 2: Frontend — unit + a11y**

Run:
```bash
cd apps/web
npx vitest run
```
Expected: all 6 files PASS.

- [ ] **Step 3: Full Playwright e2e (all 5 processes)**

Run: `npm run test:e2e` (from repo root)
Expected: `catalog.spec.ts`, `admin.spec.ts`, and `sso-launch.spec.ts` all PASS.

- [ ] **Step 4: Manual walkthrough**

With all 5 processes running locally: log in via "Sign in with SSO" as `finance.employee@launchpad.local`, admin-configure a service's SSO target as Demo App A (as `admin@launchpad.local`), then launch it as the employee and confirm the landing page shows the right email/department/role with no second login prompt.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git status
# commit anything still outstanding, or confirm clean
```
