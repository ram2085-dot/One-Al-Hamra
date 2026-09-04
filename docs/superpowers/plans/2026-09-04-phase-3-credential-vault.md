# Phase 3: Credential Vault & Credential-Assisted Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each employee store their own encrypted credentials for non-SSO services and launch into them one-click, with every reveal/edit gated behind a real Active Directory re-authentication.

**Architecture:** Three new NestJS modules in the existing modular monolith — `vault` (credential CRUD, AES-256-GCM encryption, AD re-auth gate, lockout), `vault/ad-reauth` (mock AD password check), and `credential-launch` (server-side decrypt + single-use injection token). Vault tables live in a separate Postgres `vault` schema via Prisma `multiSchema`. A new `legacy-demo-app` workspace is a plain form-POST login target (no OIDC). The frontend gets one new route, `/services/:id/credentials` (`VaultManager`), which is where CREDENTIAL catalog tiles now navigate instead of opening a URL.

**Tech Stack:** NestJS 10, Prisma 5.22 (`multiSchema` preview), PostgreSQL 16, Node built-in `crypto` (AES-256-GCM + scrypt — no new crypto dependency), React 18 + Vite + Tailwind, `@radix-ui/react-dialog` (already a dependency), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-phase-3-credential-vault-design.md` — read it alongside this plan. This plan implements that spec with two recorded deviations (see Global Constraints).

## Global Constraints

- **Prototype / local demo build.** Every external integration sits behind a swappable interface seeded with mock data. No real KMS, no real AD/LDAP.
- **English only**, no RTL. All user-facing copy goes through `apps/web/src/strings.ts` (frontend) or is defined inline in the controller (backend HTML error pages), never hard-coded ad hoc in components.
- **No new runtime dependency for cryptography.** AES-256-GCM and scrypt come from Node's built-in `crypto`. (Spec §3 says AD hashes are "bcrypt"; this plan uses `crypto.scryptSync` instead — same intent, no native build on Windows, consistent with Phase 2 using built-in `crypto` for its OIDC-adjacent needs. Recorded deviation #1.)
- **No DB-level foreign keys from `vault` schema to `public` schema.** `Credential.userId` / `Credential.serviceId` are plain columns; referential integrity is enforced in application code via explicit `User` / `Service` lookups. (Spec §11 flagged cross-schema FK support as unverified; this is the documented fallback. Recorded deviation #2.)
- **RBAC:** no admin surface for the vault. Every vault and credential-launch route is scoped to `@CurrentUser()`'s own rows. No `@Roles(...)` — an employee manages only their own credentials; an admin has no standing access to anyone's plaintext (NFR-SEC-04).
- **Re-auth is per-action, not per-session.** A `reauthToken` is single-use, scoped to `{userId, serviceId}`, 2-minute TTL, held in an in-memory `Map` (does not survive an API restart — acceptable per spec §11, matches Phase 2's in-process OIDC `state`/PKCE precedent).
- **Audit every secret-touching action.** `CREDENTIAL_REVEAL`, `CREDENTIAL_UPDATE`, `CREDENTIAL_LAUNCH` via `AuditService.record(userId, eventType, serviceId?, metadata?)` — exactly one row per action, never written ad hoc.
- **Plain-language errors only.** Wrong password → 401 "That password wasn't recognized." Locked out → 423 with remaining time. Missing/expired/used token → 401 or an HTML help-desk page, never a raw stack trace or 500.
- **Commit after every green test cycle.** TDD: failing test → run it red → minimal implementation → run it green → commit.
- Ports in use: api 3001, web 5173, mock-idp 4000, demo-app-a 4001, demo-app-b 4002. **`legacy-demo-app` takes 4003.**
- New env vars (exact names): `CREDENTIAL_VAULT_KEY` (64 hex chars = 32 bytes), `AD_DEV_PASSWORD`, `LEGACY_APP_LOGIN_URL`, `API_BASE_URL`. Dev-only values live in `.env.example` and `docker-compose.yml`, documented as non-production exactly like Phase 2's OIDC secrets.

---

## File Structure

### Backend — `apps/api/src/`

| Path | Responsibility |
|---|---|
| `vault/vault.module.ts` | Wires the vault module; imports `AuthModule`, `CatalogModule`, `AuditModule`; provides everything below. |
| `vault/vault.controller.ts` | All `/vault/credentials/:serviceId*` routes. Reads `X-Reauth-Token` header on gated routes, consumes it, delegates to `VaultService`. |
| `vault/vault.service.ts` | Credential list / create / update / delete / set-default / reveal. Owns the one-default-per-service invariant. Calls `CatalogService.assertEntitled` first on every call. |
| `vault/credential-crypto.service.ts` | `encrypt(plaintext)` / `decrypt(blob)` — AES-256-GCM, `base64(iv[12] + authTag[16] + ciphertext)`. |
| `vault/key-provider.ts` | `KeyProvider` abstract class (DI token) + `EnvKeyProvider` reading `CREDENTIAL_VAULT_KEY`. The swap seam for a real KMS. |
| `vault/lockout.service.ts` | `assertNotLocked` / `recordFailure` / `reset` against `CredentialVaultLockout`. 5 fails → 5-min lock. |
| `vault/reauth-token.store.ts` | In-memory single-use step-up token map. `issue({userId, serviceId})` / `consume(token, userId, serviceId)`. |
| `vault/dto/create-credential.dto.ts` | `label?`, `username`, `password`, `passwordExpiresAt?` — `class-validator` decorated. |
| `vault/dto/update-credential.dto.ts` | All fields optional (`PartialType`). |
| `vault/dto/reauth.dto.ts` | `adPassword: string`. |
| `vault/ad-reauth/ad-reauth.service.ts` | `verify(adUsername, password): Promise<boolean>` against seeded `AdAccount` rows. |
| `vault/ad-reauth/password-hash.ts` | `hashPassword(plain)` / `verifyPassword(plain, stored)` — `crypto.scryptSync` + `timingSafeEqual`, format `salt:hash` hex. |
| `credential-launch/credential-launch.module.ts` | Wires the launch module; imports `AuthModule`, `CatalogModule`, `AuditModule`, `VaultModule` (for `CredentialCryptoService`). |
| `credential-launch/credential-launch.controller.ts` | `POST /credential-launch/:serviceId` (guarded) + `GET /credential-launch/inject/:token` (`@Public()`, `Cache-Control: no-store`, auto-submit HTML). |
| `credential-launch/credential-launch.service.ts` | Resolve credential (given id or default) → decrypt → mint launch token → `CREDENTIAL_LAUNCH` audit → `{ injectUrl }`. |
| `credential-launch/launch-token.store.ts` | In-memory single-use launch token map, ~60s TTL. `mint({username, password, failureRedirect})` / `consume(token)`. |
| `app.module.ts` | MODIFIED — register `VaultModule` and `CredentialLaunchModule`. |

### Backend — `apps/api/prisma/`

| Path | Responsibility |
|---|---|
| `schema.prisma` | MODIFIED — `previewFeatures = ["multiSchema"]`, `schemas = ["public", "vault"]`, `@@schema` on every model/enum, 3 new `vault` models. |
| `prisma/migrations/<ts>_phase3_credential_vault/migration.sql` | Generated — creates `vault` schema + 3 tables. |
| `seed.ts` | MODIFIED — seed `AdAccount` rows; add one CREDENTIAL demo service pointed at `legacy-demo-app`. |

### New workspace — `apps/mock-target-apps/legacy-demo-app/`

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `.env.example` | Copied from `demo-app-a`, OIDC deps removed. |
| `src/index.ts` | Plain Express: `GET /login` (HTML form), `POST /login` (check fixed creds → session + landing, or redirect to `failureRedirect`), `GET /` (landing). Port 4003. |

### Frontend — `apps/web/src/`

| Path | Responsibility |
|---|---|
| `pages/VaultManager.tsx` | NEW — route `/services/:id/credentials`. Credential table, Launch + "Launch with…", FR-17 + expiry banners. Opens `ReauthModal` before Add/Edit/Delete/Reveal. |
| `components/ReauthModal.tsx` | NEW — Radix Dialog, one password field, `POST .../reauth`, hands `reauthToken` to `onSuccess`, renders 423 lockout copy. |
| `api/client.ts` | MODIFIED — per-call `headers` option; skip the global 401→/login redirect for any `/vault/` path. |
| `App.tsx` | MODIFIED — add the `/services/:id/credentials` route under `RequireAuth`. |
| `pages/CatalogHome.tsx` | MODIFIED — `launchService()` navigates CREDENTIAL services to the vault route instead of `window.open`. |
| `strings.ts` | MODIFIED — vault UI copy. |

### Infra / docs

| Path | Responsibility |
|---|---|
| `package.json` (root) | MODIFIED — add `legacy-demo-app` workspace. |
| `docker-compose.yml` | MODIFIED — `legacy-demo-app` service + 4 new `api` env vars. |
| `apps/api/.env.example`, `apps/api/.env` | MODIFIED — 4 new vars. |
| `README.md` | MODIFIED — Phase 3 run steps, the new dev-only secrets, the 6-process local layout. |
| `e2e/playwright.config.ts` | MODIFIED — add `legacy-demo-app` to `webServer`. |
| `e2e/vault.spec.ts` | NEW — reveal-with-reauth, non-default launch, FR-17 banner. |

---

## Task 1: Prisma multi-schema + vault tables

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_phase3_credential_vault/migration.sql` (generated by `prisma migrate dev`)
- Test: `apps/api/src/vault/vault.schema.e2e-spec.ts`

**Interfaces:**
- Consumes: existing `DATABASE_URL`, existing `PrismaService` (`apps/api/src/common/prisma.service.ts`).
- Produces: Prisma client models `Credential`, `AdAccount`, `CredentialVaultLockout` (all in the `vault` schema); every later task imports these types from `@prisma/client`. Exact shapes:
  - `Credential { id: string; userId: string; serviceId: string; label: string | null; encUsername: string; encPassword: string; isDefault: boolean; createdAt: Date; updatedAt: Date; lastRotatedAt: Date; passwordExpiresAt: Date | null }`
  - `AdAccount { adUsername: string; passwordHash: string }`
  - `CredentialVaultLockout { userId: string; serviceId: string; failedAttempts: number; lockedUntil: Date | null; updatedAt: Date }` — composite id `@@id([userId, serviceId])`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/vault/vault.schema.e2e-spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(() => prisma.$disconnect());

describe('Phase 3 vault schema', () => {
  it('can round-trip a Credential row in the vault schema', async () => {
    const row = await prisma.credential.create({
      data: {
        userId: 'test-user-schema',
        serviceId: 'test-service-schema',
        label: 'unit',
        encUsername: 'enc-u',
        encPassword: 'enc-p',
        isDefault: true,
      },
    });
    expect(row.id).toEqual(expect.any(String));
    expect(row.lastRotatedAt).toBeInstanceOf(Date);
    expect(row.passwordExpiresAt).toBeNull();
    await prisma.credential.delete({ where: { id: row.id } });
  });

  it('enforces one CredentialVaultLockout per user+service composite key', async () => {
    await prisma.credentialVaultLockout.create({
      data: { userId: 'u-lock', serviceId: 's-lock', failedAttempts: 1 },
    });
    await expect(
      prisma.credentialVaultLockout.create({
        data: { userId: 'u-lock', serviceId: 's-lock', failedAttempts: 2 },
      }),
    ).rejects.toThrow();
    await prisma.credentialVaultLockout.delete({
      where: { userId_serviceId: { userId: 'u-lock', serviceId: 's-lock' } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --config jest-e2e.config.js src/vault/vault.schema.e2e-spec.ts`
Expected: FAIL — `prisma.credential` is undefined (model does not exist yet).

- [ ] **Step 3: Edit `schema.prisma`**

In `apps/api/prisma/schema.prisma`, change the generator and datasource blocks:

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
```

Add `@@schema("public")` as the last line inside every existing `model` block (`User`, `Service`, `ServiceAlias`, `ServiceEntitlement`, `Favorite`, `AuditLog`) and append `@@schema("public")` to every `enum` block (`Role`, `LaunchType`, `ServiceStatus`, `SsoTargetApp`). Example for `Role`:

```prisma
enum Role {
  EMPLOYEE
  ADMIN

  @@schema("public")
}
```

Then add the three new models at the end of the file:

```prisma
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

- [ ] **Step 4: Generate and apply the migration**

Run:
```bash
cd apps/api
npx prisma migrate dev --name phase3_credential_vault
```
Expected: a new folder under `prisma/migrations/`; its `migration.sql` starts with `CREATE SCHEMA IF NOT EXISTS "vault";` followed by the three `CREATE TABLE "vault".*` statements. Prisma client regenerates automatically.

If `migrate dev` errors that the `vault` schema can't be created, open the generated `migration.sql`, confirm the `CREATE SCHEMA IF NOT EXISTS "vault";` line is present as the first statement, and re-run `npx prisma migrate dev`. The `launchpad` role already has `CREATEDB`; schema creation within its own database is permitted.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest --config jest-e2e.config.js src/vault/vault.schema.e2e-spec.ts`
Expected: PASS — both round-trip and composite-key tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/vault/vault.schema.e2e-spec.ts
git commit -m "feat(db): add Phase 3 vault schema (Credential, AdAccount, CredentialVaultLockout)"
```

---

## Task 2: `CredentialCryptoService` + `KeyProvider`

**Files:**
- Create: `apps/api/src/vault/key-provider.ts`
- Create: `apps/api/src/vault/credential-crypto.service.ts`
- Test: `apps/api/src/vault/credential-crypto.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (global, from `@nestjs/config`), env var `CREDENTIAL_VAULT_KEY` (64 hex chars).
- Produces:
  - `abstract class KeyProvider { abstract getKey(): Buffer }` — DI token, 32-byte key.
  - `class EnvKeyProvider extends KeyProvider` — reads `CREDENTIAL_VAULT_KEY`.
  - `class CredentialCryptoService { encrypt(plaintext: string): string; decrypt(blob: string): string }` — `blob` is `base64(iv[12] + authTag[16] + ciphertext)`. Later tasks (`VaultService`, `CredentialLaunchService`) depend on these two method names/signatures.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/vault/credential-crypto.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { CredentialCryptoService } from './credential-crypto.service';
import { KeyProvider } from './key-provider';
import { randomBytes } from 'crypto';

describe('CredentialCryptoService', () => {
  let service: CredentialCryptoService;
  const key = randomBytes(32);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialCryptoService,
        { provide: KeyProvider, useValue: { getKey: () => key } },
      ],
    }).compile();
    service = moduleRef.get(CredentialCryptoService);
  });

  it('round-trips a value', () => {
    const blob = service.encrypt('hunter2');
    expect(blob).not.toContain('hunter2');
    expect(service.decrypt(blob)).toBe('hunter2');
  });

  it('produces a different blob each call (random IV) but both decrypt equal', () => {
    const a = service.encrypt('same');
    const b = service.encrypt('same');
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe('same');
    expect(service.decrypt(b)).toBe('same');
  });

  it('rejects a tampered blob (auth tag failure)', () => {
    const blob = Buffer.from(service.encrypt('secret'), 'base64');
    blob[blob.length - 1] ^= 0xff;
    expect(() => service.decrypt(blob.toString('base64'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/vault/credential-crypto.service.spec.ts`
Expected: FAIL — `Cannot find module './credential-crypto.service'`.

- [ ] **Step 3: Implement `key-provider.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Swap seam for a real KMS: a KMS-backed implementation replaces EnvKeyProvider, nothing else. */
export abstract class KeyProvider {
  abstract getKey(): Buffer;
}

@Injectable()
export class EnvKeyProvider extends KeyProvider {
  constructor(private config: ConfigService) {
    super();
  }

  getKey(): Buffer {
    const hex = this.config.get<string>('CREDENTIAL_VAULT_KEY');
    if (!hex || hex.length !== 64) {
      throw new Error('CREDENTIAL_VAULT_KEY must be set to 64 hex characters (32 bytes)');
    }
    return Buffer.from(hex, 'hex');
  }
}
```

- [ ] **Step 4: Implement `credential-crypto.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { KeyProvider } from './key-provider';

const IV_LEN = 12;
const TAG_LEN = 16;

@Injectable()
export class CredentialCryptoService {
  constructor(private keyProvider: KeyProvider) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.keyProvider.getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  decrypt(blob: string): string {
    const raw = Buffer.from(blob, 'base64');
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.keyProvider.getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/vault/credential-crypto.service.spec.ts`
Expected: PASS — all three cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/vault/key-provider.ts apps/api/src/vault/credential-crypto.service.ts apps/api/src/vault/credential-crypto.service.spec.ts
git commit -m "feat(vault): AES-256-GCM CredentialCryptoService with KeyProvider seam"
```

---

## Task 3: AD re-auth — password hashing + `AdReauthService` + seed

**Files:**
- Create: `apps/api/src/vault/ad-reauth/password-hash.ts`
- Create: `apps/api/src/vault/ad-reauth/ad-reauth.service.ts`
- Test: `apps/api/src/vault/ad-reauth/password-hash.spec.ts`
- Test: `apps/api/src/vault/ad-reauth/ad-reauth.service.spec.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/.env.example`, `apps/api/.env`

**Interfaces:**
- Consumes: `PrismaService`, env var `AD_DEV_PASSWORD`.
- Produces:
  - `hashPassword(plain: string): string` → `"<saltHex>:<hashHex>"`.
  - `verifyPassword(plain: string, stored: string): boolean` — constant-time.
  - `class AdReauthService { verify(adUsername: string, password: string): Promise<boolean> }` — Task 4's `VaultService.reauth` depends on this exact signature.
  - Seed writes one `AdAccount` per seeded `User.adUsername` (`aadmin`, `fance`, `eng`), `passwordHash = hashPassword(AD_DEV_PASSWORD)`.

- [ ] **Step 1: Write the failing test for `password-hash.ts`**

Create `apps/api/src/vault/ad-reauth/password-hash.spec.ts`:

```ts
import { hashPassword, verifyPassword } from './password-hash';

describe('password-hash', () => {
  it('verifies a correct password against its own hash', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('battery staple', stored)).toBe(false);
  });

  it('salts: two hashes of the same password differ', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('rejects a malformed stored value without throwing', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/vault/ad-reauth/password-hash.spec.ts`
Expected: FAIL — `Cannot find module './password-hash'`.

- [ ] **Step 3: Implement `password-hash.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEYLEN) return false;
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), KEYLEN);
  return timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/vault/ad-reauth/password-hash.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `AdReauthService`**

Create `apps/api/src/vault/ad-reauth/ad-reauth.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AdReauthService } from './ad-reauth.service';
import { PrismaService } from '../../common/prisma.service';
import { hashPassword } from './password-hash';

describe('AdReauthService', () => {
  let service: AdReauthService;
  const prisma = { adAccount: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdReauthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdReauthService);
  });

  it('returns true when the password matches the stored AD hash', async () => {
    prisma.adAccount.findUnique.mockResolvedValue({ adUsername: 'fance', passwordHash: hashPassword('pw') });
    expect(await service.verify('fance', 'pw')).toBe(true);
  });

  it('returns false when the password is wrong', async () => {
    prisma.adAccount.findUnique.mockResolvedValue({ adUsername: 'fance', passwordHash: hashPassword('pw') });
    expect(await service.verify('fance', 'nope')).toBe(false);
  });

  it('returns false when the AD account does not exist', async () => {
    prisma.adAccount.findUnique.mockResolvedValue(null);
    expect(await service.verify('ghost', 'pw')).toBe(false);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/api && npx jest src/vault/ad-reauth/ad-reauth.service.spec.ts`
Expected: FAIL — `Cannot find module './ad-reauth.service'`.

- [ ] **Step 7: Implement `ad-reauth.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { verifyPassword } from './password-hash';

@Injectable()
export class AdReauthService {
  constructor(private prisma: PrismaService) {}

  /** Mock AD adapter: the real one would bind against LDAP. Same signature either way. */
  async verify(adUsername: string, password: string): Promise<boolean> {
    const account = await this.prisma.adAccount.findUnique({ where: { adUsername } });
    if (!account) return false;
    return verifyPassword(password, account.passwordHash);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/api && npx jest src/vault/ad-reauth/ad-reauth.service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Seed `AdAccount` rows + add env vars**

In `apps/api/prisma/seed.ts`, add an import at the top:

```ts
import { hashPassword } from '../src/vault/ad-reauth/password-hash';
```

After `prisma.user.deleteMany();` add `await prisma.adAccount.deleteMany();` to the delete block. After the three `prisma.user.create(...)` calls (`admin`, `financeEmployee`, `engEmployee`), add:

```ts
const adPassword = process.env.AD_DEV_PASSWORD ?? 'dev-ad-password';
for (const adUsername of [admin.adUsername, financeEmployee.adUsername, engEmployee.adUsername]) {
  await prisma.adAccount.create({ data: { adUsername, passwordHash: hashPassword(adPassword) } });
}
```

Append to `apps/api/.env.example` **and** `apps/api/.env`:

```
CREDENTIAL_VAULT_KEY="0000000000000000000000000000000000000000000000000000000000000000"
AD_DEV_PASSWORD="dev-ad-password"
LEGACY_APP_LOGIN_URL="http://localhost:4003/login"
API_BASE_URL="http://localhost:3001"
```

(The all-zero key is a deliberately obvious non-production placeholder — same convention as Phase 2's `dev-only-*` secrets. Generate a real one for any shared environment with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)

- [ ] **Step 10: Re-seed and verify**

Run:
```bash
cd apps/api && npx prisma db seed
npx prisma studio  # optional: confirm 3 AdAccount rows — or:
node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().adAccount.count().then(c=>{console.log('AdAccount rows:',c);process.exit()})"
```
Expected: `AdAccount rows: 3`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/vault/ad-reauth apps/api/prisma/seed.ts apps/api/.env.example
git commit -m "feat(vault): mock AD re-auth adapter with scrypt-hashed seeded accounts"
```

---

## Task 4: Lockout service + re-auth token store + `POST /vault/credentials/:serviceId/reauth`

This task delivers the first working vault endpoint end to end: the re-auth step-up. It creates the `VaultModule` skeleton (controller + module) so the endpoint is reachable, plus the two pieces of state it needs.

**Files:**
- Create: `apps/api/src/vault/reauth-token.store.ts`
- Create: `apps/api/src/vault/reauth-token.store.spec.ts`
- Create: `apps/api/src/vault/lockout.service.ts`
- Create: `apps/api/src/vault/lockout.service.spec.ts`
- Create: `apps/api/src/vault/dto/reauth.dto.ts`
- Create: `apps/api/src/vault/vault.service.ts` (partial — `reauth` only; later tasks add credential methods)
- Create: `apps/api/src/vault/vault.controller.ts` (partial — `reauth` route only)
- Create: `apps/api/src/vault/vault.module.ts`
- Create: `apps/api/src/vault/vault.reauth.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AdReauthService.verify` (Task 3), `CatalogService.assertEntitled(user, id)` (existing, from `CatalogModule`), `PrismaService`, `@CurrentUser()` decorator, `@nestjs/config` `ConfigService`.
- Produces:
  - `class ReauthTokenStore { issue(scope: { userId: string; serviceId: string }): string; consume(token: string, userId: string, serviceId: string): boolean }` — Tasks 5–7 call `consume`.
  - `class LockoutService { assertNotLocked(userId, serviceId): Promise<void>; recordFailure(userId, serviceId): Promise<void>; reset(userId, serviceId): Promise<void> }` — throws `HttpException` 423 from `assertNotLocked` / `recordFailure` when locked.
  - `class VaultService { reauth(user: User, serviceId: string, adPassword: string): Promise<{ reauthToken: string }> }` — Task 5–7 add more methods to this same class.
  - Route: `POST /vault/credentials/:serviceId/reauth` body `{ adPassword: string }` → `200 { reauthToken }` | `401` wrong password | `423 { message, retryAfterSeconds }` locked.
  - `VaultModule` exported providers: `ReauthTokenStore`, `CredentialCryptoService` (re-exported for Task 8).

- [ ] **Step 1: Write the failing test for `ReauthTokenStore`**

Create `apps/api/src/vault/reauth-token.store.spec.ts`:

```ts
import { ReauthTokenStore } from './reauth-token.store';

describe('ReauthTokenStore', () => {
  let store: ReauthTokenStore;
  beforeEach(() => { store = new ReauthTokenStore(); });

  it('issues a token that consume() accepts exactly once for the matching scope', () => {
    const t = store.issue({ userId: 'u1', serviceId: 's1' });
    expect(store.consume(t, 'u1', 's1')).toBe(true);
    expect(store.consume(t, 'u1', 's1')).toBe(false); // single-use
  });

  it('rejects a token used for a different user or service', () => {
    const t = store.issue({ userId: 'u1', serviceId: 's1' });
    expect(store.consume(t, 'u2', 's1')).toBe(false);
    expect(store.consume(t, 'u1', 's2')).toBe(false);
  });

  it('rejects an expired token', () => {
    jest.useFakeTimers();
    const t = store.issue({ userId: 'u1', serviceId: 's1' });
    jest.advanceTimersByTime(2 * 60 * 1000 + 1);
    expect(store.consume(t, 'u1', 's1')).toBe(false);
    jest.useRealTimers();
  });

  it('rejects an unknown token', () => {
    expect(store.consume('never-issued', 'u1', 's1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/vault/reauth-token.store.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reauth-token.store.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const TTL_MS = 2 * 60 * 1000;

interface Entry {
  userId: string;
  serviceId: string;
  expiresAt: number;
}

/**
 * In-memory, single-use step-up tokens. Not persisted — an API restart invalidates all
 * outstanding tokens, which is acceptable for this prototype (spec §11) and matches Phase 2's
 * in-process handling of short-lived OIDC state/PKCE values.
 */
@Injectable()
export class ReauthTokenStore {
  private entries = new Map<string, Entry>();

  issue(scope: { userId: string; serviceId: string }): string {
    const token = randomBytes(32).toString('hex');
    this.entries.set(token, { ...scope, expiresAt: Date.now() + TTL_MS });
    return token;
  }

  consume(token: string, userId: string, serviceId: string): boolean {
    const entry = this.entries.get(token);
    if (!entry) return false;
    this.entries.delete(token); // single-use: gone whether or not it matched
    if (entry.expiresAt < Date.now()) return false;
    return entry.userId === userId && entry.serviceId === serviceId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/vault/reauth-token.store.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `LockoutService`**

Create `apps/api/src/vault/lockout.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { LockoutService } from './lockout.service';
import { PrismaService } from '../common/prisma.service';

describe('LockoutService', () => {
  let service: LockoutService;
  const prisma = { credentialVaultLockout: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LockoutService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LockoutService);
  });

  it('assertNotLocked passes when there is no lockout row', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue(null);
    await expect(service.assertNotLocked('u1', 's1')).resolves.toBeUndefined();
  });

  it('assertNotLocked throws 423 with retryAfterSeconds while lockedUntil is in the future', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue({
      userId: 'u1', serviceId: 's1', failedAttempts: 5, lockedUntil: new Date(Date.now() + 60_000),
    });
    await expect(service.assertNotLocked('u1', 's1')).rejects.toMatchObject({
      constructor: HttpException, status: 423,
    });
  });

  it('recordFailure sets lockedUntil once failedAttempts reaches 5', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue({ userId: 'u1', serviceId: 's1', failedAttempts: 4, lockedUntil: null });
    await service.recordFailure('u1', 's1');
    const arg = prisma.credentialVaultLockout.upsert.mock.calls[0][0];
    expect(arg.update.failedAttempts).toBe(5);
    expect(arg.update.lockedUntil).toBeInstanceOf(Date);
  });

  it('reset deletes the lockout row (ignoring a missing row)', async () => {
    prisma.credentialVaultLockout.delete.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }));
    await expect(service.reset('u1', 's1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/api && npx jest src/vault/lockout.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `lockout.service.ts`**

```ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

@Injectable()
export class LockoutService {
  constructor(private prisma: PrismaService) {}

  private lockedError(retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        message: `Too many failed attempts. Try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds,
      },
      HttpStatus.LOCKED, // 423
    );
  }

  async assertNotLocked(userId: string, serviceId: string): Promise<void> {
    const row = await this.prisma.credentialVaultLockout.findUnique({
      where: { userId_serviceId: { userId, serviceId } },
    });
    if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
      throw this.lockedError(Math.round((row.lockedUntil.getTime() - Date.now()) / 1000));
    }
  }

  async recordFailure(userId: string, serviceId: string): Promise<void> {
    const row = await this.prisma.credentialVaultLockout.findUnique({
      where: { userId_serviceId: { userId, serviceId } },
    });
    const failedAttempts = (row?.failedAttempts ?? 0) + 1;
    const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
    await this.prisma.credentialVaultLockout.upsert({
      where: { userId_serviceId: { userId, serviceId } },
      create: { userId, serviceId, failedAttempts, lockedUntil },
      update: { failedAttempts, lockedUntil },
    });
    if (lockedUntil) throw this.lockedError(Math.round(LOCK_MS / 1000));
  }

  async reset(userId: string, serviceId: string): Promise<void> {
    try {
      await this.prisma.credentialVaultLockout.delete({
        where: { userId_serviceId: { userId, serviceId } },
      });
    } catch (e: any) {
      if (e?.code !== 'P2025') throw e; // P2025 = row didn't exist, which is fine
    }
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/api && npx jest src/vault/lockout.service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Implement the DTO, service, controller, and module**

Create `apps/api/src/vault/dto/reauth.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class ReauthDto {
  @IsString()
  @MinLength(1)
  adPassword!: string;
}
```

Create `apps/api/src/vault/vault.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AdReauthService } from './ad-reauth/ad-reauth.service';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';

@Injectable()
export class VaultService {
  constructor(
    private catalog: CatalogService,
    private adReauth: AdReauthService,
    private lockout: LockoutService,
    private reauthTokens: ReauthTokenStore,
  ) {}

  async reauth(user: User, serviceId: string, adPassword: string): Promise<{ reauthToken: string }> {
    await this.catalog.assertEntitled(user, serviceId); // 404 if not entitled — existence must not leak
    await this.lockout.assertNotLocked(user.id, serviceId);

    const ok = await this.adReauth.verify(user.adUsername, adPassword);
    if (!ok) {
      await this.lockout.recordFailure(user.id, serviceId); // may itself throw 423 on the 5th failure
      throw new UnauthorizedException("That password wasn't recognized.");
    }

    await this.lockout.reset(user.id, serviceId);
    return { reauthToken: this.reauthTokens.issue({ userId: user.id, serviceId }) };
  }
}
```

Create `apps/api/src/vault/vault.controller.ts`:

```ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReauthDto } from './dto/reauth.dto';
import { VaultService } from './vault.service';

@Controller('vault/credentials')
export class VaultController {
  constructor(private vault: VaultService) {}

  @Post(':serviceId/reauth')
  reauth(@CurrentUser() user: User, @Param('serviceId') serviceId: string, @Body() dto: ReauthDto) {
    return this.vault.reauth(user, serviceId, dto.adPassword);
  }
}
```

Create `apps/api/src/vault/vault.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../common/prisma.service';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { CredentialCryptoService } from './credential-crypto.service';
import { KeyProvider, EnvKeyProvider } from './key-provider';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';
import { AdReauthService } from './ad-reauth/ad-reauth.service';

@Module({
  imports: [AuthModule, CatalogModule, AuditModule],
  controllers: [VaultController],
  providers: [
    VaultService,
    CredentialCryptoService,
    { provide: KeyProvider, useClass: EnvKeyProvider },
    LockoutService,
    ReauthTokenStore,
    AdReauthService,
    PrismaService,
  ],
  exports: [CredentialCryptoService, ReauthTokenStore],
})
export class VaultModule {}
```

In `apps/api/src/app.module.ts`, add `import { VaultModule } from './vault/vault.module';` and put `VaultModule` in the `imports` array.

- [ ] **Step 10: Write the failing e2e test**

Create `apps/api/src/vault/vault.reauth.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

// Uses the seeded CREDENTIAL service "HR Self-Service Portal" (entitled to every EMPLOYEE)
// and the seeded AD password (AD_DEV_PASSWORD, default "dev-ad-password").
describe('POST /vault/credentials/:serviceId/reauth (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let hrServiceId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = new (require('@prisma/client').PrismaClient)();
    const svc = await prisma.service.findFirst({ where: { name: 'HR Self-Service Portal' } });
    hrServiceId = svc.id;
  });

  afterEach(async () => {
    const emp = await prisma.user.findUnique({ where: { email: 'finance.employee@launchpad.local' } });
    await prisma.credentialVaultLockout.deleteMany({ where: { userId: emp.id } });
  });

  afterAll(async () => { await prisma.$disconnect(); await app.close(); });

  const login = async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    return agent;
  };

  it('returns a reauthToken for the correct AD password', async () => {
    const agent = await login();
    const res = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'dev-ad-password' });
    expect(res.status).toBe(201);
    expect(res.body.reauthToken).toEqual(expect.any(String));
  });

  it('401s for a wrong AD password', async () => {
    const agent = await login();
    const res = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/wasn't recognized/i);
  });

  it('423s after 5 consecutive wrong passwords, with retryAfterSeconds', async () => {
    const agent = await login();
    let res: any;
    for (let i = 0; i < 5; i++) {
      res = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'wrong' });
    }
    expect(res.status).toBe(423);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });
});
```

Note on the expected status: NestJS `@Post` handlers default to **201** on success — the test asserts `201`, and the frontend (Task 13) treats any 2xx as success.

- [ ] **Step 11: Run the e2e test**

Run: `cd apps/api && npx prisma db seed && npx jest --config jest-e2e.config.js src/vault/vault.reauth.e2e-spec.ts`
Expected: PASS — all three cases.

- [ ] **Step 12: Run the full backend unit + e2e suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: everything green — no existing spec broke from the `app.module.ts` change or the `schema.prisma` `@@schema` additions.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/vault apps/api/src/app.module.ts
git commit -m "feat(vault): AD re-auth step-up endpoint with lockout and single-use tokens"
```

---

## Task 5: Credential list + create (`GET` / `POST /vault/credentials/:serviceId`)

**Files:**
- Create: `apps/api/src/vault/dto/create-credential.dto.ts`
- Modify: `apps/api/src/vault/vault.service.ts`
- Modify: `apps/api/src/vault/vault.controller.ts`
- Modify: `apps/api/src/vault/vault.module.ts` (add `AuditService`, `PrismaService` already present)
- Create: `apps/api/src/vault/vault.service.spec.ts`
- Modify: `apps/api/src/vault/vault.reauth.e2e-spec.ts` → rename concept covered by a new `apps/api/src/vault/vault.credentials.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReauthTokenStore.consume` (Task 4), `CredentialCryptoService.encrypt/decrypt` (Task 2), `AuditService.record` (existing), `CatalogService.assertEntitled` (existing), `PrismaService`.
- Produces on `VaultService`:
  - `listForService(user: User, serviceId: string): Promise<CredentialListItem[]>` where `CredentialListItem = { id: string; label: string | null; username: string; isDefault: boolean; lastRotatedAt: Date; passwordExpiresAt: Date | null }` — **no password**. `username` is decrypted.
  - `createCredential(user: User, serviceId: string, dto: CreateCredentialDto): Promise<CredentialListItem>`
- Route shapes:
  - `GET /vault/credentials/:serviceId` → `200 CredentialListItem[]` — **no re-auth token required** (FR-07 gates the password, not the username list).
  - `POST /vault/credentials/:serviceId` header `X-Reauth-Token` → `201 CredentialListItem` | `401` missing/invalid token.
- `CreateCredentialDto = { label?: string; username: string; password: string; passwordExpiresAt?: string /* ISO date */ }`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/api/src/vault/vault.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { VaultService } from './vault.service';
import { CatalogService } from '../catalog/catalog.service';
import { AdReauthService } from './ad-reauth/ad-reauth.service';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';
import { CredentialCryptoService } from './credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';

describe('VaultService — credentials', () => {
  let service: VaultService;
  const user = { id: 'u1', adUsername: 'fance' } as any;

  const prisma = {
    credential: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (fns: any) => (Array.isArray(fns) ? Promise.all(fns) : fns(prisma))),
  };
  const catalog = { assertEntitled: jest.fn().mockResolvedValue({ id: 's1' }) };
  const crypto = {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v.replace(/^enc\((.*)\)$/, '$1')),
  };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: CatalogService, useValue: catalog },
        { provide: AdReauthService, useValue: { verify: jest.fn() } },
        { provide: LockoutService, useValue: { assertNotLocked: jest.fn(), recordFailure: jest.fn(), reset: jest.fn() } },
        { provide: ReauthTokenStore, useValue: { issue: jest.fn(), consume: jest.fn() } },
        { provide: CredentialCryptoService, useValue: crypto },
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(VaultService);
  });

  it('listForService returns decrypted usernames and never a password field', async () => {
    prisma.credential.findMany.mockResolvedValue([
      { id: 'c1', label: 'main', encUsername: 'enc(jdoe)', encPassword: 'enc(secret)', isDefault: true, lastRotatedAt: new Date(0), passwordExpiresAt: null },
    ]);
    const list = await service.listForService(user, 's1');
    expect(list).toEqual([
      { id: 'c1', label: 'main', username: 'jdoe', isDefault: true, lastRotatedAt: new Date(0), passwordExpiresAt: null },
    ]);
    expect(JSON.stringify(list)).not.toContain('secret');
    expect(catalog.assertEntitled).toHaveBeenCalledWith(user, 's1');
  });

  it('createCredential encrypts both fields, makes the first credential default, and writes a CREDENTIAL_UPDATE audit row', async () => {
    prisma.credential.findMany.mockResolvedValue([]); // no existing credentials
    prisma.credential.create.mockResolvedValue({
      id: 'c1', label: null, encUsername: 'enc(jdoe)', encPassword: 'enc(pw)', isDefault: true, lastRotatedAt: new Date(0), passwordExpiresAt: null,
    });
    const item = await service.createCredential(user, 's1', { username: 'jdoe', password: 'pw' });
    expect(crypto.encrypt).toHaveBeenCalledWith('jdoe');
    expect(crypto.encrypt).toHaveBeenCalledWith('pw');
    expect(prisma.credential.create.mock.calls[0][0].data.isDefault).toBe(true);
    expect(item.username).toBe('jdoe');
    expect(audit.record).toHaveBeenCalledWith('u1', 'CREDENTIAL_UPDATE', 's1', expect.objectContaining({ action: 'create' }));
  });

  it('createCredential does not force default when the user already has a credential', async () => {
    prisma.credential.findMany.mockResolvedValue([{ id: 'existing' }]);
    prisma.credential.create.mockResolvedValue({
      id: 'c2', label: null, encUsername: 'enc(x)', encPassword: 'enc(y)', isDefault: false, lastRotatedAt: new Date(0), passwordExpiresAt: null,
    });
    await service.createCredential(user, 's1', { username: 'x', password: 'y' });
    expect(prisma.credential.create.mock.calls[0][0].data.isDefault).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/vault/vault.service.spec.ts`
Expected: FAIL — `service.listForService is not a function`.

- [ ] **Step 3: Create the DTO**

Create `apps/api/src/vault/dto/create-credential.dto.ts`:

```ts
import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsISO8601()
  passwordExpiresAt?: string;
}
```

- [ ] **Step 4: Extend `VaultService`**

Add to `apps/api/src/vault/vault.service.ts` — new imports and a shared projection helper, plus the two methods. Add to the constructor: `private crypto: CredentialCryptoService`, `private audit: AuditService`, `private prisma: PrismaService`.

```ts
// add imports
import { CredentialCryptoService } from './credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import type { Credential } from '@prisma/client';
import { CreateCredentialDto } from './dto/create-credential.dto';

export interface CredentialListItem {
  id: string;
  label: string | null;
  username: string;
  isDefault: boolean;
  lastRotatedAt: Date;
  passwordExpiresAt: Date | null;
}

// inside the class:

  private toListItem(row: Credential): CredentialListItem {
    return {
      id: row.id,
      label: row.label,
      username: this.crypto.decrypt(row.encUsername),
      isDefault: row.isDefault,
      lastRotatedAt: row.lastRotatedAt,
      passwordExpiresAt: row.passwordExpiresAt,
    };
  }

  async listForService(user: User, serviceId: string): Promise<CredentialListItem[]> {
    await this.catalog.assertEntitled(user, serviceId);
    const rows = await this.prisma.credential.findMany({
      where: { userId: user.id, serviceId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toListItem(r));
  }

  async createCredential(user: User, serviceId: string, dto: CreateCredentialDto): Promise<CredentialListItem> {
    await this.catalog.assertEntitled(user, serviceId);
    const existing = await this.prisma.credential.findMany({ where: { userId: user.id, serviceId }, select: { id: true } });
    const isDefault = existing.length === 0;
    const row = await this.prisma.credential.create({
      data: {
        userId: user.id,
        serviceId,
        label: dto.label ?? null,
        encUsername: this.crypto.encrypt(dto.username),
        encPassword: this.crypto.encrypt(dto.password),
        isDefault,
        passwordExpiresAt: dto.passwordExpiresAt ? new Date(dto.passwordExpiresAt) : null,
      },
    });
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'create', credentialId: row.id });
    return this.toListItem(row);
  }
```

- [ ] **Step 5: Extend `VaultController`**

Add a private helper that pulls and consumes the re-auth token, and the two routes:

```ts
import { BadRequestException, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { ReauthTokenStore } from './reauth-token.store';

// constructor: add `private reauthTokens: ReauthTokenStore`

  private requireReauth(token: string | undefined, userId: string, serviceId: string): void {
    if (!token || !this.reauthTokens.consume(token, userId, serviceId)) {
      throw new UnauthorizedException('Re-authentication required. Enter your Windows password to continue.');
    }
  }

  @Get(':serviceId')
  list(@CurrentUser() user: User, @Param('serviceId') serviceId: string) {
    return this.vault.listForService(user, serviceId);
  }

  @Post(':serviceId')
  create(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
    @Body() dto: CreateCredentialDto,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    return this.vault.createCredential(user, serviceId, dto);
  }
```

Note: `POST :serviceId/reauth` (Task 4) and `POST :serviceId` (this task) are distinct routes — Nest matches the more specific `:serviceId/reauth` first. Keep the `reauth` handler above `create` in the file for readability.

Add `AuditService` to `vault.module.ts` providers (import from `../audit/audit.service`).

- [ ] **Step 6: Run the unit test**

Run: `cd apps/api && npx jest src/vault/vault.service.spec.ts`
Expected: PASS.

- [ ] **Step 7: Write the e2e test**

Create `apps/api/src/vault/vault.credentials.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('Credential CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let hrServiceId: string;
  let empId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = new (require('@prisma/client').PrismaClient)();
    hrServiceId = (await prisma.service.findFirst({ where: { name: 'HR Self-Service Portal' } })).id;
    empId = (await prisma.user.findUnique({ where: { email: 'finance.employee@launchpad.local' } })).id;
  });

  afterEach(async () => {
    await prisma.credential.deleteMany({ where: { userId: empId } });
    await prisma.credentialVaultLockout.deleteMany({ where: { userId: empId } });
    await prisma.auditLog.deleteMany({ where: { userId: empId, eventType: { startsWith: 'CREDENTIAL_' } } });
  });
  afterAll(async () => { await prisma.$disconnect(); await app.close(); });

  const session = async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    return agent;
  };
  const reauth = async (agent: any) => {
    const r = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'dev-ad-password' });
    return r.body.reauthToken as string;
  };

  it('GET returns [] with no re-auth token', async () => {
    const agent = await session();
    await agent.get(`/vault/credentials/${hrServiceId}`).expect(200).expect([]);
  });

  it('POST requires a re-auth token', async () => {
    const agent = await session();
    await agent.post(`/vault/credentials/${hrServiceId}`).send({ username: 'jdoe', password: 'pw' }).expect(401);
  });

  it('POST with a token creates a credential (first one is default), and it shows in GET without a password', async () => {
    const agent = await session();
    const token = await reauth(agent);
    const created = await agent
      .post(`/vault/credentials/${hrServiceId}`)
      .set('X-Reauth-Token', token)
      .send({ label: 'Personal', username: 'jdoe', password: 's3cret' })
      .expect(201);
    expect(created.body).toMatchObject({ label: 'Personal', username: 'jdoe', isDefault: true });
    expect(created.body.password).toBeUndefined();

    const list = await agent.get(`/vault/credentials/${hrServiceId}`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('s3cret');

    const audit = await prisma.auditLog.count({ where: { userId: empId, eventType: 'CREDENTIAL_UPDATE', serviceId: hrServiceId } });
    expect(audit).toBe(1);
  });

  it('a re-auth token is single-use: a second POST with the same token is 401', async () => {
    const agent = await session();
    const token = await reauth(agent);
    await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'a', password: 'b' }).expect(201);
    await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'c', password: 'd' }).expect(401);
  });
});
```

- [ ] **Step 8: Run the e2e test**

Run: `cd apps/api && npx prisma db seed && npx jest --config jest-e2e.config.js src/vault/vault.credentials.e2e-spec.ts`
Expected: PASS — all four cases.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/vault
git commit -m "feat(vault): list and create credentials, re-auth-gated writes, encrypted at rest"
```

---

## Task 6: Credential update, delete, and set-default

**Files:**
- Create: `apps/api/src/vault/dto/update-credential.dto.ts`
- Modify: `apps/api/src/vault/vault.service.ts`
- Modify: `apps/api/src/vault/vault.controller.ts`
- Modify: `apps/api/src/vault/vault.service.spec.ts` (add cases)
- Modify: `apps/api/src/vault/vault.credentials.e2e-spec.ts` (add cases)

**Interfaces:**
- Produces on `VaultService`:
  - `updateCredential(user, serviceId, credentialId, dto: UpdateCredentialDto): Promise<CredentialListItem>` — re-encrypts only the fields present; bumps `lastRotatedAt` only when `password` is present.
  - `deleteCredential(user, serviceId, credentialId): Promise<void>` — if the deleted row was `isDefault` and other credentials remain, the oldest remaining becomes default.
  - `setDefault(user, serviceId, credentialId): Promise<void>` — one transaction: unset all others, set this one.
- Route shapes:
  - `PATCH /vault/credentials/:serviceId/:credentialId` header `X-Reauth-Token` → `200 CredentialListItem`
  - `DELETE /vault/credentials/:serviceId/:credentialId` header `X-Reauth-Token` → `204`
  - `PATCH /vault/credentials/:serviceId/:credentialId/default` → `204` — **no re-auth** (no secret value touched; spec §6).
- All three write a `CREDENTIAL_UPDATE` audit row (`action: 'update' | 'delete' | 'set-default'`).
- Ownership: every method loads the credential by `{ id: credentialId, userId: user.id, serviceId }` and throws `NotFoundException` if absent — a user can never touch another user's row, and IDs don't leak across services.
- `UpdateCredentialDto` = all `CreateCredentialDto` fields optional.

- [ ] **Step 1: Add failing unit-test cases**

Append to `apps/api/src/vault/vault.service.spec.ts` inside the same `describe`:

```ts
  it('updateCredential re-encrypts only provided fields and bumps lastRotatedAt when password changes', async () => {
    prisma.credential.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', serviceId: 's1', isDefault: true });
    prisma.credential.update.mockResolvedValue({
      id: 'c1', label: 'new', encUsername: 'enc(jdoe)', encPassword: 'enc(new-pw)', isDefault: true, lastRotatedAt: new Date(1), passwordExpiresAt: null,
    });
    await service.updateCredential(user, 's1', 'c1', { label: 'new', password: 'new-pw' });
    const data = prisma.credential.update.mock.calls[0][0].data;
    expect(data.label).toBe('new');
    expect(data.encPassword).toBe('enc(new-pw)');
    expect(data.encUsername).toBeUndefined(); // username not provided → not touched
    expect(data.lastRotatedAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith('u1', 'CREDENTIAL_UPDATE', 's1', expect.objectContaining({ action: 'update' }));
  });

  it('updateCredential 404s for a credential the user does not own', async () => {
    prisma.credential.findFirst.mockResolvedValue(null);
    await expect(service.updateCredential(user, 's1', 'nope', { label: 'x' })).rejects.toThrow();
  });

  it('setDefault runs one transaction: unset others, set this one', async () => {
    prisma.credential.findFirst.mockResolvedValue({ id: 'c2', userId: 'u1', serviceId: 's1', isDefault: false });
    await service.setDefault(user, 's1', 'c2');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.credential.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', serviceId: 's1' }, data: { isDefault: false } });
    expect(prisma.credential.update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { isDefault: true } });
  });

  it('deleteCredential promotes the oldest remaining credential when the default is removed', async () => {
    prisma.credential.findFirst.mockResolvedValueOnce({ id: 'c1', userId: 'u1', serviceId: 's1', isDefault: true });
    prisma.credential.findMany.mockResolvedValueOnce([{ id: 'c2', createdAt: new Date(2) }, { id: 'c3', createdAt: new Date(3) }]);
    await service.deleteCredential(user, 's1', 'c1');
    expect(prisma.credential.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(prisma.credential.update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { isDefault: true } });
  });
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `cd apps/api && npx jest src/vault/vault.service.spec.ts`
Expected: FAIL — `updateCredential` / `setDefault` / `deleteCredential` are not functions.

- [ ] **Step 3: Create `update-credential.dto.ts`**

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCredentialDto } from './create-credential.dto';

export class UpdateCredentialDto extends PartialType(CreateCredentialDto) {}
```

- [ ] **Step 4: Extend `VaultService`**

```ts
import { NotFoundException } from '@nestjs/common';
import { UpdateCredentialDto } from './dto/update-credential.dto';

  private async ownedOrThrow(userId: string, serviceId: string, credentialId: string) {
    const row = await this.prisma.credential.findFirst({ where: { id: credentialId, userId, serviceId } });
    if (!row) throw new NotFoundException('Credential not found');
    return row;
  }

  async updateCredential(user: User, serviceId: string, credentialId: string, dto: UpdateCredentialDto): Promise<CredentialListItem> {
    await this.catalog.assertEntitled(user, serviceId);
    await this.ownedOrThrow(user.id, serviceId, credentialId);
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.username !== undefined) data.encUsername = this.crypto.encrypt(dto.username);
    if (dto.password !== undefined) {
      data.encPassword = this.crypto.encrypt(dto.password);
      data.lastRotatedAt = new Date();
    }
    if (dto.passwordExpiresAt !== undefined) data.passwordExpiresAt = dto.passwordExpiresAt ? new Date(dto.passwordExpiresAt) : null;
    const row = await this.prisma.credential.update({ where: { id: credentialId }, data });
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'update', credentialId });
    return this.toListItem(row);
  }

  async deleteCredential(user: User, serviceId: string, credentialId: string): Promise<void> {
    await this.catalog.assertEntitled(user, serviceId);
    const row = await this.ownedOrThrow(user.id, serviceId, credentialId);
    await this.prisma.credential.delete({ where: { id: credentialId } });
    if (row.isDefault) {
      const remaining = await this.prisma.credential.findMany({
        where: { userId: user.id, serviceId },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });
      if (remaining[0]) {
        await this.prisma.credential.update({ where: { id: remaining[0].id }, data: { isDefault: true } });
      }
    }
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'delete', credentialId });
  }

  async setDefault(user: User, serviceId: string, credentialId: string): Promise<void> {
    await this.catalog.assertEntitled(user, serviceId);
    await this.ownedOrThrow(user.id, serviceId, credentialId);
    await this.prisma.$transaction([
      this.prisma.credential.updateMany({ where: { userId: user.id, serviceId }, data: { isDefault: false } }),
      this.prisma.credential.update({ where: { id: credentialId }, data: { isDefault: true } }),
    ]);
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'set-default', credentialId });
  }
```

- [ ] **Step 5: Extend `VaultController`**

```ts
import { Delete, HttpCode, Patch } from '@nestjs/common';
import { UpdateCredentialDto } from './dto/update-credential.dto';

  @Patch(':serviceId/:credentialId')
  update(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
    @Body() dto: UpdateCredentialDto,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    return this.vault.updateCredential(user, serviceId, credentialId, dto);
  }

  @Delete(':serviceId/:credentialId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    await this.vault.deleteCredential(user, serviceId, credentialId);
  }

  @Patch(':serviceId/:credentialId/default')
  @HttpCode(204)
  async makeDefault(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
  ) {
    await this.vault.setDefault(user, serviceId, credentialId);
  }
```

Route ordering caution: declare `@Patch(':serviceId/:credentialId/default')` **before** `@Patch(':serviceId/:credentialId')` in the controller file so the literal `default` segment wins over the `:credentialId` param.

- [ ] **Step 6: Run the unit test**

Run: `cd apps/api && npx jest src/vault/vault.service.spec.ts`
Expected: PASS — all cases.

- [ ] **Step 7: Add e2e cases**

Append to `apps/api/src/vault/vault.credentials.e2e-spec.ts`:

```ts
  it('PATCH updates a credential and DELETE removes it, both requiring a fresh token each', async () => {
    const agent = await session();
    let token = await reauth(agent);
    const c = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'u', password: 'p' }).expect(201);

    token = await reauth(agent);
    await agent.patch(`/vault/credentials/${hrServiceId}/${c.body.id}`).set('X-Reauth-Token', token).send({ label: 'Renamed' }).expect(200);

    token = await reauth(agent);
    await agent.delete(`/vault/credentials/${hrServiceId}/${c.body.id}`).set('X-Reauth-Token', token).expect(204);
    await agent.get(`/vault/credentials/${hrServiceId}`).expect(200).expect([]);
  });

  it('PATCH .../default needs no re-auth token and moves the default flag', async () => {
    const agent = await session();
    let token = await reauth(agent);
    const a = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ label: 'A', username: 'a', password: 'a' }).expect(201);
    token = await reauth(agent);
    const b = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ label: 'B', username: 'b', password: 'b' }).expect(201);
    expect(a.body.isDefault).toBe(true);
    expect(b.body.isDefault).toBe(false);

    await agent.patch(`/vault/credentials/${hrServiceId}/${b.body.id}/default`).expect(204);
    const list = await agent.get(`/vault/credentials/${hrServiceId}`).expect(200);
    expect(list.body.find((x: any) => x.id === b.body.id).isDefault).toBe(true);
    expect(list.body.find((x: any) => x.id === a.body.id).isDefault).toBe(false);
  });
```

- [ ] **Step 8: Run the e2e test**

Run: `cd apps/api && npx jest --config jest-e2e.config.js src/vault/vault.credentials.e2e-spec.ts`
Expected: PASS — all six cases.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/vault
git commit -m "feat(vault): update/delete/set-default credential endpoints"
```

---

## Task 7: Credential reveal (`GET /vault/credentials/:serviceId/:credentialId/reveal`)

**Files:**
- Modify: `apps/api/src/vault/vault.service.ts`
- Modify: `apps/api/src/vault/vault.controller.ts`
- Modify: `apps/api/src/vault/vault.service.spec.ts`
- Modify: `apps/api/src/vault/vault.credentials.e2e-spec.ts`

**Interfaces:**
- Produces on `VaultService`: `revealCredential(user, serviceId, credentialId): Promise<{ username: string; password: string }>` — decrypts both, writes a `CREDENTIAL_REVEAL` audit row (`action: 'reveal'`). Ownership-checked via `ownedOrThrow`.
- Route: `GET /vault/credentials/:serviceId/:credentialId/reveal` header `X-Reauth-Token` → `200 { username, password }` | `401` missing/invalid token.
- Route ordering: declare this `@Get(':serviceId/:credentialId/reveal')` **before** the bare `@Get(':serviceId')` list route.

- [ ] **Step 1: Add the failing unit-test case**

Append to `apps/api/src/vault/vault.service.spec.ts`:

```ts
  it('revealCredential decrypts both fields and writes a CREDENTIAL_REVEAL audit row', async () => {
    prisma.credential.findFirst.mockResolvedValue({
      id: 'c1', userId: 'u1', serviceId: 's1', encUsername: 'enc(jdoe)', encPassword: 'enc(s3cret)',
    });
    const out = await service.revealCredential(user, 's1', 'c1');
    expect(out).toEqual({ username: 'jdoe', password: 's3cret' });
    expect(audit.record).toHaveBeenCalledWith('u1', 'CREDENTIAL_REVEAL', 's1', expect.objectContaining({ credentialId: 'c1' }));
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/vault/vault.service.spec.ts -t revealCredential`
Expected: FAIL — `service.revealCredential is not a function`.

- [ ] **Step 3: Implement `revealCredential`**

Add to `apps/api/src/vault/vault.service.ts`:

```ts
  async revealCredential(user: User, serviceId: string, credentialId: string): Promise<{ username: string; password: string }> {
    await this.catalog.assertEntitled(user, serviceId);
    const row = await this.ownedOrThrow(user.id, serviceId, credentialId);
    await this.audit.record(user.id, 'CREDENTIAL_REVEAL', serviceId, { credentialId });
    return { username: this.crypto.decrypt(row.encUsername), password: this.crypto.decrypt(row.encPassword) };
  }
```

- [ ] **Step 4: Add the route**

In `apps/api/src/vault/vault.controller.ts`, above the `@Get(':serviceId')` list route:

```ts
  @Get(':serviceId/:credentialId/reveal')
  reveal(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    return this.vault.revealCredential(user, serviceId, credentialId);
  }
```

- [ ] **Step 5: Run the unit test**

Run: `cd apps/api && npx jest src/vault/vault.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add the e2e case**

Append to `apps/api/src/vault/vault.credentials.e2e-spec.ts`:

```ts
  it('reveal returns the plaintext only with a valid token, and logs CREDENTIAL_REVEAL', async () => {
    const agent = await session();
    let token = await reauth(agent);
    const c = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'jdoe', password: 'p@ss' }).expect(201);

    await agent.get(`/vault/credentials/${hrServiceId}/${c.body.id}/reveal`).expect(401); // no token

    token = await reauth(agent);
    const revealed = await agent.get(`/vault/credentials/${hrServiceId}/${c.body.id}/reveal`).set('X-Reauth-Token', token).expect(200);
    expect(revealed.body).toEqual({ username: 'jdoe', password: 'p@ss' });

    const count = await prisma.auditLog.count({ where: { userId: empId, eventType: 'CREDENTIAL_REVEAL', serviceId: hrServiceId } });
    expect(count).toBe(1);
  });
```

- [ ] **Step 7: Run the e2e test + full suite**

Run: `cd apps/api && npx jest --config jest-e2e.config.js src/vault/vault.credentials.e2e-spec.ts && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/vault
git commit -m "feat(vault): re-auth-gated credential reveal with CREDENTIAL_REVEAL audit"
```

---

## Task 8: `credential-launch` — resolve + mint token (`POST /credential-launch/:serviceId`)

**Files:**
- Create: `apps/api/src/credential-launch/launch-token.store.ts`
- Create: `apps/api/src/credential-launch/launch-token.store.spec.ts`
- Create: `apps/api/src/credential-launch/credential-launch.service.ts`
- Create: `apps/api/src/credential-launch/credential-launch.service.spec.ts`
- Create: `apps/api/src/credential-launch/credential-launch.controller.ts`
- Create: `apps/api/src/credential-launch/credential-launch.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CatalogService.assertEntitled`, `CredentialCryptoService.decrypt` (re-exported by `VaultModule`), `AuditService.record`, `PrismaService`, `ConfigService` (`API_BASE_URL`, `LEGACY_APP_LOGIN_URL`, `WEB_BASE_URL`).
- Produces:
  - `class LaunchTokenStore { mint(payload: { username: string; password: string; failureRedirect: string }): string; consume(token: string): { username: string; password: string; failureRedirect: string } | null }` — Task 9 calls `consume`. TTL 60s, single-use.
  - `class CredentialLaunchService { resolve(user: User, serviceId: string, credentialId?: string): Promise<{ injectUrl: string }> }`
  - Route: `POST /credential-launch/:serviceId` body `{ credentialId?: string }` → `200 { injectUrl }` | `400` when the user has no credential for the service (and none specified) | `404` not entitled.
  - `injectUrl` = `${API_BASE_URL}/credential-launch/inject/${token}`.

- [ ] **Step 1: Write the failing test for `LaunchTokenStore`**

Create `apps/api/src/credential-launch/launch-token.store.spec.ts`:

```ts
import { LaunchTokenStore } from './launch-token.store';

describe('LaunchTokenStore', () => {
  let store: LaunchTokenStore;
  const payload = { username: 'u', password: 'p', failureRedirect: 'http://localhost:5173/x' };
  beforeEach(() => { store = new LaunchTokenStore(); });

  it('consume returns the payload exactly once', () => {
    const t = store.mint(payload);
    expect(store.consume(t)).toEqual(payload);
    expect(store.consume(t)).toBeNull();
  });

  it('consume returns null after the 60s TTL', () => {
    jest.useFakeTimers();
    const t = store.mint(payload);
    jest.advanceTimersByTime(60_000 + 1);
    expect(store.consume(t)).toBeNull();
    jest.useRealTimers();
  });

  it('consume returns null for an unknown token', () => {
    expect(store.consume('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/credential-launch/launch-token.store.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `launch-token.store.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const TTL_MS = 60 * 1000;

interface Payload {
  username: string;
  password: string;
  failureRedirect: string;
}

/** In-memory, single-use, ~60s. Holds a decrypted credential only for the moment between the
 *  launch POST and the browser fetching the inject page. Not persisted (spec §11). */
@Injectable()
export class LaunchTokenStore {
  private entries = new Map<string, { payload: Payload; expiresAt: number }>();

  mint(payload: Payload): string {
    const token = randomBytes(32).toString('hex');
    this.entries.set(token, { payload, expiresAt: Date.now() + TTL_MS });
    return token;
  }

  consume(token: string): Payload | null {
    const entry = this.entries.get(token);
    if (!entry) return null;
    this.entries.delete(token);
    if (entry.expiresAt < Date.now()) return null;
    return entry.payload;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/credential-launch/launch-token.store.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `CredentialLaunchService`**

Create `apps/api/src/credential-launch/credential-launch.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialLaunchService } from './credential-launch.service';
import { CatalogService } from '../catalog/catalog.service';
import { CredentialCryptoService } from '../vault/credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { LaunchTokenStore } from './launch-token.store';

describe('CredentialLaunchService', () => {
  let service: CredentialLaunchService;
  const user = { id: 'u1' } as any;
  const prisma = { credential: { findFirst: jest.fn() } };
  const catalog = { assertEntitled: jest.fn().mockResolvedValue({ id: 's1' }) };
  const crypto = { decrypt: jest.fn((v: string) => v.replace(/^enc\((.*)\)$/, '$1')) };
  const audit = { record: jest.fn() };
  const config = { get: (k: string) => ({ API_BASE_URL: 'http://localhost:3001', WEB_BASE_URL: 'http://localhost:5173' } as any)[k] };
  let store: LaunchTokenStore;

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new LaunchTokenStore();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialLaunchService,
        { provide: CatalogService, useValue: catalog },
        { provide: CredentialCryptoService, useValue: crypto },
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
        { provide: LaunchTokenStore, useValue: store },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(CredentialLaunchService);
  });

  it('uses the default credential when no id is given, mints a token, logs CREDENTIAL_LAUNCH', async () => {
    prisma.credential.findFirst.mockResolvedValue({ id: 'c1', encUsername: 'enc(jdoe)', encPassword: 'enc(pw)', isDefault: true });
    const { injectUrl } = await service.resolve(user, 's1');
    const token = injectUrl.split('/').pop()!;
    expect(injectUrl.startsWith('http://localhost:3001/credential-launch/inject/')).toBe(true);
    expect(store.consume(token)).toEqual({
      username: 'jdoe', password: 'pw',
      failureRedirect: 'http://localhost:5173/services/s1/credentials?credentialLaunchFailed=1',
    });
    expect(audit.record).toHaveBeenCalledWith('u1', 'CREDENTIAL_LAUNCH', 's1', expect.objectContaining({ credentialId: 'c1' }));
  });

  it('uses the specified credential id when given', async () => {
    prisma.credential.findFirst.mockResolvedValue({ id: 'c2', encUsername: 'enc(x)', encPassword: 'enc(y)', isDefault: false });
    await service.resolve(user, 's1', 'c2');
    expect(prisma.credential.findFirst).toHaveBeenCalledWith({ where: { id: 'c2', userId: 'u1', serviceId: 's1' } });
  });

  it('400s when the user has no credential for the service', async () => {
    prisma.credential.findFirst.mockResolvedValue(null);
    await expect(service.resolve(user, 's1')).rejects.toThrow(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/api && npx jest src/credential-launch/credential-launch.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the service, controller, and module**

Create `apps/api/src/credential-launch/credential-launch.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { CredentialCryptoService } from '../vault/credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { LaunchTokenStore } from './launch-token.store';

@Injectable()
export class CredentialLaunchService {
  constructor(
    private catalog: CatalogService,
    private crypto: CredentialCryptoService,
    private audit: AuditService,
    private prisma: PrismaService,
    private tokens: LaunchTokenStore,
    private config: ConfigService,
  ) {}

  async resolve(user: User, serviceId: string, credentialId?: string): Promise<{ injectUrl: string }> {
    await this.catalog.assertEntitled(user, serviceId);
    const where = credentialId
      ? { id: credentialId, userId: user.id, serviceId }
      : { userId: user.id, serviceId, isDefault: true };
    const credential = await this.prisma.credential.findFirst({ where });
    if (!credential) {
      throw new BadRequestException("You don't have a saved credential for this service yet.");
    }
    const failureRedirect =
      `${this.config.get<string>('WEB_BASE_URL')}/services/${serviceId}/credentials?credentialLaunchFailed=1`;
    const token = this.tokens.mint({
      username: this.crypto.decrypt(credential.encUsername),
      password: this.crypto.decrypt(credential.encPassword),
      failureRedirect,
    });
    await this.audit.record(user.id, 'CREDENTIAL_LAUNCH', serviceId, { credentialId: credential.id });
    return { injectUrl: `${this.config.get<string>('API_BASE_URL')}/credential-launch/inject/${token}` };
  }
}
```

Create `apps/api/src/credential-launch/credential-launch.controller.ts`:

```ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CredentialLaunchService } from './credential-launch.service';

@Controller('credential-launch')
export class CredentialLaunchController {
  constructor(private launch: CredentialLaunchService) {}

  @Post(':serviceId')
  resolve(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Body('credentialId') credentialId: string | undefined,
  ) {
    return this.launch.resolve(user, serviceId, credentialId);
  }
}
```

Create `apps/api/src/credential-launch/credential-launch.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { VaultModule } from '../vault/vault.module';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CredentialLaunchController } from './credential-launch.controller';
import { CredentialLaunchService } from './credential-launch.service';
import { LaunchTokenStore } from './launch-token.store';

@Module({
  imports: [AuthModule, CatalogModule, AuditModule, VaultModule],
  controllers: [CredentialLaunchController],
  providers: [CredentialLaunchService, LaunchTokenStore, PrismaService, AuditService],
})
export class CredentialLaunchModule {}
```

In `apps/api/src/app.module.ts`, import and register `CredentialLaunchModule`.

- [ ] **Step 8: Run the unit tests**

Run: `cd apps/api && npx jest src/credential-launch`
Expected: PASS — both spec files.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/credential-launch apps/api/src/app.module.ts
git commit -m "feat(credential-launch): resolve default/selected credential to a single-use inject token"
```

---

## Task 9: `credential-launch` — the inject page (`GET /credential-launch/inject/:token`)

**Files:**
- Modify: `apps/api/src/credential-launch/credential-launch.controller.ts`
- Modify: `apps/api/src/credential-launch/credential-launch.service.ts` (add `renderInjectPage` helper) — or keep rendering in the controller; this plan puts it in the controller.
- Create: `apps/api/src/credential-launch/credential-launch.e2e-spec.ts`
- Modify: `apps/api/src/credential-launch/credential-launch.module.ts` (no change if `LaunchTokenStore` already provided — it is)

**Interfaces:**
- Consumes: `LaunchTokenStore.consume`, `ConfigService` (`LEGACY_APP_LOGIN_URL`).
- Produces: `GET /credential-launch/inject/:token` — `@Public()` (no session; the token *is* the authorization). Responses:
  - Valid token → `200 text/html`, header `Cache-Control: no-store`, body = a self-submitting form POSTing `username`, `password`, `failureRedirect` to `LEGACY_APP_LOGIN_URL`.
  - Missing/expired/used token → `410 text/html` plain-language page with a help-desk link (same tone as `auth.controller.ts`'s OIDC-failure page).
- HTML-escapes every interpolated value (`username`, `password`, `failureRedirect`) to keep a credential containing `"` or `<` from breaking the form or injecting markup.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/src/credential-launch/credential-launch.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('credential-launch inject page (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let hrServiceId: string;
  let empId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = new (require('@prisma/client').PrismaClient)();
    hrServiceId = (await prisma.service.findFirst({ where: { name: 'HR Self-Service Portal' } })).id;
    empId = (await prisma.user.findUnique({ where: { email: 'finance.employee@launchpad.local' } })).id;
  });
  afterEach(async () => {
    await prisma.credential.deleteMany({ where: { userId: empId } });
    await prisma.auditLog.deleteMany({ where: { userId: empId, eventType: { startsWith: 'CREDENTIAL_' } } });
    await prisma.credentialVaultLockout.deleteMany({ where: { userId: empId } });
  });
  afterAll(async () => { await prisma.$disconnect(); await app.close(); });

  it('POST launch → GET inject returns an auto-submit form, no-store, once', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    const token = (await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'dev-ad-password' })).body.reauthToken;
    await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'hruser', password: 'hr-pw-123' }).expect(201);

    const launch = await agent.post(`/credential-launch/${hrServiceId}`).send({}).expect(201);
    const injectPath = launch.body.injectUrl.replace(/^https?:\/\/[^/]+/, '');

    const page = await request(app.getHttpServer()).get(injectPath).expect(200);
    expect(page.headers['cache-control']).toContain('no-store');
    expect(page.text).toContain('<form');
    expect(page.text).toContain('method="post"');
    expect(page.text).toContain('name="username"');
    expect(page.text).toContain('hruser');

    await request(app.getHttpServer()).get(injectPath).expect(410); // single-use
  });

  it('an unknown token yields a 410 plain-language page', async () => {
    const res = await request(app.getHttpServer()).get('/credential-launch/inject/deadbeef').expect(410);
    expect(res.text).toMatch(/help desk/i);
    expect(res.text).not.toMatch(/stack|Error:/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx prisma db seed && npx jest --config jest-e2e.config.js src/credential-launch/credential-launch.e2e-spec.ts`
Expected: FAIL — `GET /credential-launch/inject/:token` returns 404 (route not defined).

- [ ] **Step 3: Add the inject route + renderer to the controller**

In `apps/api/src/credential-launch/credential-launch.controller.ts`:

```ts
import { Get, Header, HttpCode, Param as P, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../common/guards/auth.guard';
import { LaunchTokenStore } from './launch-token.store';

// constructor: add `private tokens: LaunchTokenStore, private config: ConfigService`

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  @Public()
  @Get('inject/:token')
  inject(@P('token') token: string, @Res() res: Response) {
    const payload = this.tokens.consume(token);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html');
    if (!payload) {
      res.status(410).send(
        `<!doctype html><html><body><h1>This launch link has expired.</h1>` +
        `<p>Go back to the portal and click Launch again. If it keeps happening, contact the help desk at helpdesk@launchpad.local.</p></body></html>`,
      );
      return;
    }
    const action = this.config.get<string>('LEGACY_APP_LOGIN_URL')!;
    res.status(200).send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Signing you in…</title></head>` +
      `<body onload="document.forms[0].submit()">` +
      `<p>Signing you in…</p>` +
      `<form method="post" action="${escapeHtml(action)}">` +
      `<input type="hidden" name="username" value="${escapeHtml(payload.username)}">` +
      `<input type="hidden" name="password" value="${escapeHtml(payload.password)}">` +
      `<input type="hidden" name="failureRedirect" value="${escapeHtml(payload.failureRedirect)}">` +
      `<noscript><button type="submit">Continue</button></noscript>` +
      `</form></body></html>`,
    );
  }
```

Keep `@Public()` importable: it is exported from `apps/api/src/common/guards/auth.guard.ts` (`export const Public = ...`).

- [ ] **Step 4: Run the e2e test**

Run: `cd apps/api && npx jest --config jest-e2e.config.js src/credential-launch/credential-launch.e2e-spec.ts`
Expected: PASS — both cases.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/credential-launch
git commit -m "feat(credential-launch): single-use auto-submit inject page, no-store, HTML-escaped"
```

---

## Task 10: `legacy-demo-app` workspace

A plain form-POST login target (no OIDC), on port 4003. Stands in for a real legacy app with native username/password login (FR-06).

**Files:**
- Create: `apps/mock-target-apps/legacy-demo-app/package.json`
- Create: `apps/mock-target-apps/legacy-demo-app/tsconfig.json`
- Create: `apps/mock-target-apps/legacy-demo-app/.env.example`
- Create: `apps/mock-target-apps/legacy-demo-app/src/index.ts`
- Modify: `package.json` (root — add workspace)

**Interfaces:**
- Consumes: env `PORT` (4003), `APP_NAME`, `WEB_BASE_URL`, `LEGACY_EXPECTED_USERNAME`, `LEGACY_EXPECTED_PASSWORD`, `SESSION_SECRET`.
- Produces: `GET /login` (visible HTML form for manual testing), `POST /login` (body `username`, `password`, `failureRedirect`) → on match: session set + `200` landing page "You're signed in to <APP_NAME>"; on mismatch: `302` to `failureRedirect` **only if** it starts with `WEB_BASE_URL`, else `400`. `GET /` → landing if session, else redirect to `/login`.

- [ ] **Step 1: Scaffold the package files**

`apps/mock-target-apps/legacy-demo-app/package.json`:

```json
{
  "name": "@launchpad/legacy-demo-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start:dev": "ts-node-dev --respawn src/index.ts",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "dotenv": "^17.4.2",
    "express": "^4.19.2",
    "express-session": "^1.18.0"
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

`apps/mock-target-apps/legacy-demo-app/tsconfig.json` — copy `apps/mock-target-apps/demo-app-a/tsconfig.json` verbatim:

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

`apps/mock-target-apps/legacy-demo-app/.env.example`:

```
PORT=4003
APP_NAME="Legacy HR App"
WEB_BASE_URL="http://localhost:5173"
LEGACY_EXPECTED_USERNAME="hruser"
LEGACY_EXPECTED_PASSWORD="hr-pw-123"
SESSION_SECRET="dev-only-legacy-demo-app-session-secret"
```

- [ ] **Step 2: Implement `src/index.ts`**

```ts
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';

dotenv.config();

const PORT = Number(process.env.PORT ?? 4003);
const APP_NAME = process.env.APP_NAME ?? 'Legacy HR App';
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:5173';
const EXPECTED_USER = process.env.LEGACY_EXPECTED_USERNAME ?? 'hruser';
const EXPECTED_PASS = process.env.LEGACY_EXPECTED_PASSWORD ?? 'hr-pw-123';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: process.env.SESSION_SECRET ?? 'dev', resave: false, saveUninitialized: false }));

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title></head><body>${body}</body></html>`;

app.get('/login', (_req, res) => {
  res.type('html').send(
    page(
      `<h1>${APP_NAME} — sign in</h1><form method="post" action="/login">` +
        `<label>Username <input name="username"></label><br>` +
        `<label>Password <input name="password" type="password"></label><br>` +
        `<button type="submit">Sign in</button></form>`,
    ),
  );
});

app.post('/login', (req, res) => {
  const { username, password, failureRedirect } = req.body as Record<string, string>;
  if (username === EXPECTED_USER && password === EXPECTED_PASS) {
    (req.session as any).user = username;
    res.type('html').send(page(`<h1>${APP_NAME}</h1><p>You're signed in as ${username}. No second login prompt.</p>`));
    return;
  }
  // Failed native login → hand control back to the portal's FR-17 recovery flow, but only to a
  // trusted portal URL (guards against an open redirect if this field were ever attacker-set).
  if (failureRedirect && failureRedirect.startsWith(WEB_BASE_URL)) {
    res.redirect(failureRedirect);
    return;
  }
  res.status(400).type('html').send(page(`<h1>${APP_NAME}</h1><p>Sign-in failed.</p>`));
});

app.get('/', (req, res) => {
  const user = (req.session as any).user;
  if (!user) return res.redirect('/login');
  res.type('html').send(page(`<h1>${APP_NAME}</h1><p>Signed in as ${user}</p>`));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`${APP_NAME} listening on ${PORT}`);
});
```

- [ ] **Step 3: Register the workspace and install**

In the root `package.json`, add `"apps/mock-target-apps/legacy-demo-app"` to the `workspaces` array (after `demo-app-b`).

Run:
```bash
npm install
cp apps/mock-target-apps/legacy-demo-app/.env.example apps/mock-target-apps/legacy-demo-app/.env
```

- [ ] **Step 4: Manual smoke test**

Run in one terminal: `cd apps/mock-target-apps/legacy-demo-app && npm run start:dev`
Then:
```bash
curl -i -s -X POST http://localhost:4003/login -d 'username=hruser&password=hr-pw-123' | head -20
curl -i -s -X POST http://localhost:4003/login -d 'username=hruser&password=wrong&failureRedirect=http://localhost:5173/services/abc/credentials?credentialLaunchFailed=1' | grep -i location
```
Expected: first call → `200` with "You're signed in as hruser"; second call → `302` with `Location: http://localhost:5173/services/abc/credentials?credentialLaunchFailed=1`.

- [ ] **Step 5: Commit**

```bash
git add apps/mock-target-apps/legacy-demo-app package.json package-lock.json
git commit -m "feat(legacy-demo-app): plain form-POST login target for credential-assisted launch"
```

---

## Task 11: Wire config — env, docker-compose, seed demo service, README

Folds all the remaining non-code plumbing into one reviewable unit.

**Files:**
- Modify: `docker-compose.yml`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `README.md`
- Modify: `apps/api/.env` (already got the 4 vars in Task 3 — verify)

**Interfaces:**
- Produces: a running full stack via `docker compose up` that includes `legacy-demo-app`; the `api` service declares `CREDENTIAL_VAULT_KEY`, `AD_DEV_PASSWORD`, `LEGACY_APP_LOGIN_URL`, `API_BASE_URL`. Seed keeps "HR Self-Service Portal" as the entitled CREDENTIAL service used by every test in Tasks 4–9.

- [ ] **Step 1: Add the 4 env vars to the `api` service in `docker-compose.yml`**

Under `services.api.environment`, add:

```yaml
      CREDENTIAL_VAULT_KEY: "0000000000000000000000000000000000000000000000000000000000000000"
      AD_DEV_PASSWORD: "dev-ad-password"
      LEGACY_APP_LOGIN_URL: "http://localhost:4003/login"
      API_BASE_URL: "http://localhost:3001"
```

- [ ] **Step 2: Add the `legacy-demo-app` service to `docker-compose.yml`**

After the `demo-app-b` service block:

```yaml
  legacy-demo-app:
    build:
      context: .
      dockerfile: apps/mock-target-apps/legacy-demo-app/Dockerfile
    environment:
      PORT: 4003
      APP_NAME: "Legacy HR App"
      WEB_BASE_URL: "http://localhost:5173"
      LEGACY_EXPECTED_USERNAME: "hruser"
      LEGACY_EXPECTED_PASSWORD: "hr-pw-123"
      SESSION_SECRET: "dev-only-legacy-demo-app-session-secret"
    ports:
      - "4003:4003"
```

Create `apps/mock-target-apps/legacy-demo-app/Dockerfile` by copying `apps/mock-target-apps/demo-app-b/Dockerfile` and changing every `demo-app-b` path segment to `legacy-demo-app`. (If `demo-app-b` has no Dockerfile, skip this step and the compose block above — note in the commit message that `legacy-demo-app` is local-run only, matching whatever `demo-app-b`'s state is.)

- [ ] **Step 3: Confirm the seed's CREDENTIAL service is entitled to all employees**

Open `apps/api/prisma/seed.ts`. The `hrPortal` service already has `launchType: LaunchType.CREDENTIAL` and `entitlements: { create: [{ role: Role.EMPLOYEE }] }` — no change needed. Confirm its `launchUrl` value is irrelevant to credential launch (credential launch uses `LEGACY_APP_LOGIN_URL`, not the service's `launchUrl`). Leave `launchUrl` as-is; it is only used by the catalog tile's SSO/other path, which CREDENTIAL services no longer take (Task 12).

- [ ] **Step 4: Update `README.md`**

In the "Run locally" list, add after the demo-app-b step:

```
7. `cd apps/mock-target-apps/legacy-demo-app && cp .env.example .env && npm install && npm run start:dev`
```

Renumber the "Open http://localhost:5173" step. Add a short subsection:

```markdown
### Phase 3 — Credential vault (dev-only secrets)

- `CREDENTIAL_VAULT_KEY` — 32-byte hex, AES-256-GCM key for credentials at rest. The committed value is all-zeros: replace it in any shared environment (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `AD_DEV_PASSWORD` — the single password every seeded mock-AD account accepts for the re-auth step (default `dev-ad-password`).
- `legacy-demo-app` (port 4003) is the credential-assisted launch target; it accepts `hruser` / `hr-pw-123`. Store exactly those as your credential for "HR Self-Service Portal" to see a successful launch; store anything else to see the FR-17 "this credential didn't work" recovery banner.
```

- [ ] **Step 5: Full-stack manual verification**

With the whole stack running locally (all 6 services + Postgres), and re-seeded:
```bash
cd apps/api && npx prisma migrate deploy && npx prisma db seed
```
Log in at http://localhost:5173 as `finance.employee@launchpad.local`, click the "HR Self-Service Portal" tile → lands on `/services/<id>/credentials` (this route arrives in Task 14; until then, expect a blank route — that's fine for this task, which is infra only).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml apps/api/prisma/seed.ts README.md apps/mock-target-apps/legacy-demo-app/Dockerfile
git commit -m "chore: wire legacy-demo-app + vault env vars into compose, seed, and README"
```

---

## Task 12: Frontend plumbing — API client headers, 401 handling, route, strings, tile routing

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/strings.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/CatalogHome.tsx`
- Modify: `apps/web/src/components/ServiceTile.tsx` (only if needed — see Step 4)
- Test: `apps/web/src/__tests__/CatalogHome.test.tsx` (add a case)

**Interfaces:**
- Produces:
  - `apiClient.get/post/patch/delete` gain an optional final `headers?: Record<string, string>` argument. Signatures:
    - `get: <T>(path: string, headers?: Record<string, string>) => Promise<T>`
    - `post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>`
    - `patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>`
    - `delete: <T>(path: string, headers?: Record<string, string>) => Promise<T>`
  - Any path starting with `/vault/` is exempt from the global 401→`/login` redirect (a 401 there means "re-auth needed", handled in-component).
  - New route: `/services/:id/credentials` → `<RequireAuth><VaultManager /></RequireAuth>` (component created in Task 14; this task adds the route with a temporary import).
  - `ApiError` already carries `.status` — Task 13/14 branch on `err.status === 423` vs `401`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/__tests__/CatalogHome.test.tsx` (a new `it` in the existing suite; mirror the file's existing render/mock setup):

```tsx
it('clicking a CREDENTIAL service navigates to its credentials page instead of opening a URL', async () => {
  // arrange: /catalog returns one CREDENTIAL service
  mockGet.mockResolvedValueOnce([
    { id: 'hr1', name: 'HR Self-Service Portal', description: 'x', category: 'HR', tags: [], launchType: 'CREDENTIAL', launchUrl: 'https://example.com', isFavorite: false },
  ]);
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(<AppWithRouter initialEntries={['/']} />); // helper that mounts <App/> routes with a MemoryRouter

  await screen.findByText('HR Self-Service Portal');
  await userEvent.click(screen.getByRole('button', { name: 'HR Self-Service Portal' }));

  expect(openSpy).not.toHaveBeenCalled();
  expect(screen.getByTestId('vault-manager-route')).toBeInTheDocument(); // VaultManager stub renders this in test
});
```

If the existing `CatalogHome.test.tsx` renders `<CatalogHome/>` directly without a router, instead assert on a passed-in `navigate` mock: wrap the render in `<MemoryRouter>` and stub `useNavigate` via `vi.mock('react-router-dom', ...)` returning a `navigateSpy`, then `expect(navigateSpy).toHaveBeenCalledWith('/services/hr1/credentials')`. Pick whichever matches the file's current style; the assertion that matters is **`window.open` not called, navigation to `/services/hr1/credentials` triggered**.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/__tests__/CatalogHome.test.tsx`
Expected: FAIL — currently `launchService` calls `window.open` for every type.

- [ ] **Step 3: Update `api/client.ts`**

```ts
const BASE_URL = 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// /auth/me is the logged-out probe; /vault/* legitimately 401s to signal "re-auth required" and
// must be handled in-component, never bounce the whole app to /login.
const NO_REDIRECT_ON_401 = ['/auth/me'];
const noRedirect = (path: string) => NO_REDIRECT_ON_401.includes(path) || path.startsWith('/vault/');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 401 && !noRedirect(path) && typeof window !== 'undefined') {
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers }),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined, headers }),
  delete: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: 'DELETE', headers }),
};
```

(Note: `patch` body is now guarded with `body ?` — previously it always `JSON.stringify`'d. The one existing caller, `AdminConsole`, always passes a body, so behaviour is unchanged.)

- [ ] **Step 4: Update `CatalogHome.tsx`'s `launchService`**

Add `import { useNavigate } from 'react-router-dom';` and `const navigate = useNavigate();` inside the component. Change `launchService`:

```tsx
  async function launchService(service: ServiceSummary) {
    if (service.launchType === 'CREDENTIAL') {
      navigate(`/services/${service.id}/credentials`);
      return;
    }
    if (!service.launchUrl) {
      setLaunchError(strings.launchNotConfiguredHint);
      return;
    }
    setLaunchError(null);
    try {
      await apiClient.post(`/catalog/${service.id}/launch`);
    } catch {
      // best-effort audit
    }
    window.open(service.launchUrl, '_blank', 'noopener,noreferrer');
  }
```

`ServiceTile.tsx` needs no change — it already calls `onLaunch?.(service)` with the full object.

- [ ] **Step 5: Add the route in `App.tsx`**

```tsx
import { VaultManager } from './pages/VaultManager';
// ...
      <Route path="/services/:id/credentials" element={<RequireAuth><VaultManager /></RequireAuth>} />
```

Until Task 14 lands, create a one-line stub so the app compiles: `apps/web/src/pages/VaultManager.tsx` →

```tsx
export function VaultManager() {
  return <div data-testid="vault-manager-route" />;
}
```

- [ ] **Step 6: Add the vault strings**

Append to the `strings` object in `apps/web/src/strings.ts`:

```ts
  // Phase 3 — credential vault
  vaultTitle: 'Your credentials',
  vaultLaunchButton: 'Launch',
  vaultLaunchWithLabel: 'Launch with…',
  vaultAddButton: 'Add credential',
  vaultEditButton: 'Edit',
  vaultDeleteButton: 'Delete',
  vaultRevealButton: 'Reveal',
  vaultHideButton: 'Hide',
  vaultSetDefaultButton: 'Set as default',
  vaultDefaultBadge: 'Default',
  vaultNoCredentialsTitle: 'No stored credential yet',
  vaultNoCredentialsHint: 'Add your username and password for this service to launch it in one click.',
  vaultColLabel: 'Label',
  vaultColUsername: 'Username',
  vaultColRotated: 'Last updated',
  vaultLabelField: 'Label (optional)',
  vaultUsernameField: 'Username',
  vaultPasswordField: 'Password',
  vaultExpiryField: 'Password expires (optional)',
  vaultSaveButton: 'Save',
  vaultCancelButton: 'Cancel',
  vaultLaunchFailedBanner: "That credential didn't work. Update it and try again.",
  vaultExpiryWarningPrefix: 'This password is set to expire on',
  reauthTitle: 'Confirm your identity',
  reauthPrompt: 'Enter your Windows password to continue.',
  reauthPasswordField: 'Windows password',
  reauthSubmitButton: 'Continue',
  reauthWrongPassword: "That password wasn't recognized.",
  reauthGenericError: 'Something went wrong. Try again.',
```

- [ ] **Step 7: Run the frontend suite**

Run: `cd apps/web && npm test`
Expected: PASS — the new CatalogHome case and every existing test.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/strings.ts apps/web/src/App.tsx apps/web/src/pages/CatalogHome.tsx apps/web/src/pages/VaultManager.tsx apps/web/src/__tests__/CatalogHome.test.tsx
git commit -m "feat(web): route CREDENTIAL tiles to /services/:id/credentials; api client headers + vault 401 handling"
```

---

## Task 13: `ReauthModal` component

**Files:**
- Create: `apps/web/src/components/ReauthModal.tsx`
- Test: `apps/web/src/__tests__/ReauthModal.test.tsx`

**Interfaces:**
- Consumes: `apiClient.post`, `ApiError`, `strings`, `@radix-ui/react-dialog` (already a dependency).
- Produces:
  ```tsx
  interface ReauthModalProps {
    serviceId: string;
    open: boolean;
    onClose: () => void;
    onSuccess: (reauthToken: string) => void;
  }
  export function ReauthModal(props: ReauthModalProps): JSX.Element
  ```
  - Submits `POST /vault/credentials/${serviceId}/reauth` with `{ adPassword }`.
  - `2xx` → calls `onSuccess(res.reauthToken)` then `onClose()`; clears the field.
  - `ApiError` `status === 401` → inline error `strings.reauthWrongPassword`, field stays, modal open.
  - `ApiError` `status === 423` → inline error = the server message (`err.message`, which carries the "try again in ~N minutes" text), submit button disabled.
  - any other error → `strings.reauthGenericError`.
  - Password field is `type="password"`, autofocused, `aria-describedby` the error node when present.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/ReauthModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReauthModal } from '../components/ReauthModal';
import { apiClient, ApiError } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<any>('../api/client');
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function setup() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(<ReauthModal serviceId="s1" open onClose={onClose} onSuccess={onSuccess} />);
  return { onSuccess, onClose };
}

beforeEach(() => vi.clearAllMocks());

it('hands the reauthToken to onSuccess on a correct password', async () => {
  mockPost.mockResolvedValueOnce({ reauthToken: 'tok-123' });
  const { onSuccess } = setup();
  await userEvent.type(screen.getByLabelText(/windows password/i), 'pw');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(mockPost).toHaveBeenCalledWith('/vault/credentials/s1/reauth', { adPassword: 'pw' });
  expect(onSuccess).toHaveBeenCalledWith('tok-123');
});

it('shows "wasn\'t recognized" on a 401 and keeps the modal open', async () => {
  mockPost.mockRejectedValueOnce(new ApiError(401, 'nope'));
  const { onSuccess, onClose } = setup();
  await userEvent.type(screen.getByLabelText(/windows password/i), 'bad');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(await screen.findByText(/wasn't recognized/i)).toBeInTheDocument();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it('shows the server lockout message on a 423 and disables submit', async () => {
  mockPost.mockRejectedValueOnce(new ApiError(423, 'Too many failed attempts. Try again in about 5 minute(s).'));
  setup();
  await userEvent.type(screen.getByLabelText(/windows password/i), 'bad');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(await screen.findByText(/too many failed attempts/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/__tests__/ReauthModal.test.tsx`
Expected: FAIL — `Cannot find module '../components/ReauthModal'`.

- [ ] **Step 3: Implement `ReauthModal.tsx`**

```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { apiClient, ApiError } from '../api/client';
import { strings } from '../strings';

interface ReauthModalProps {
  serviceId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (reauthToken: string) => void;
}

export function ReauthModal({ serviceId, open, onClose, onSuccess }: ReauthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPassword('');
    setError(null);
    setLockedOut(false);
    setSubmitting(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { reauthToken } = await apiClient.post<{ reauthToken: string }>(
        `/vault/credentials/${serviceId}/reauth`,
        { adPassword: password },
      );
      reset();
      onSuccess(reauthToken);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(strings.reauthWrongPassword);
      else if (err instanceof ApiError && err.status === 423) {
        setError(err.message);
        setLockedOut(true);
      } else setError(strings.reauthGenericError);
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 shadow-lg">
          <Dialog.Title className="font-heading text-lg font-semibold text-ink">{strings.reauthTitle}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-gray-600">{strings.reauthPrompt}</Dialog.Description>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm">
              {strings.reauthPasswordField}
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={error ? 'reauth-error' : undefined}
                className="mt-1 w-full rounded border border-line p-2"
              />
            </label>
            {error && <p id="reauth-error" role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { reset(); onClose(); }} className="px-3 py-1.5 text-sm">
                {strings.vaultCancelButton}
              </button>
              <button
                type="submit"
                disabled={submitting || lockedOut || password.length === 0}
                className="rounded bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {strings.reauthSubmitButton}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run src/__tests__/ReauthModal.test.tsx`
Expected: PASS — all three cases.

- [ ] **Step 5: Accessibility check**

Run: `cd apps/web && npx vitest run src/__tests__/ReauthModal.test.tsx` with an added `jest-axe` assertion (mirror how other `*.test.tsx` files in this repo call `axe`):

```tsx
import { axe } from 'jest-axe';
it('has no axe violations', async () => {
  const { container } = render(<ReauthModal serviceId="s1" open onClose={() => {}} onSuccess={() => {}} />);
  expect(await axe(container)).toHaveNoViolations();
});
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ReauthModal.tsx apps/web/src/__tests__/ReauthModal.test.tsx
git commit -m "feat(web): ReauthModal — AD password step-up with 401/423 handling"
```

---

## Task 14: `VaultManager` page

Replaces the Task 12 stub with the real page: credential table, Launch + "Launch with…", Add/Edit/Delete/Reveal (each gated by `ReauthModal`), Set-default, the FR-17 failure banner, and the FR-18 expiry warning.

**Files:**
- Modify (replace stub): `apps/web/src/pages/VaultManager.tsx`
- Create: `apps/web/src/__tests__/VaultManager.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (with the Task 12 `headers` arg), `ApiError`, `ReauthModal` (Task 13), `useParams` / `useSearchParams` from `react-router-dom`, `strings`, `AppHeader` is already rendered by `RequireAuth`.
- Data types (local to the file):
  ```ts
  interface CredentialItem {
    id: string; label: string | null; username: string; isDefault: boolean;
    lastRotatedAt: string; passwordExpiresAt: string | null;
  }
  ```
- Behaviour:
  - On mount: `GET /vault/credentials/${id}` → render table (or the empty state).
  - `?credentialLaunchFailed=1` present → render `strings.vaultLaunchFailedBanner` (role="alert") above the table; clear the param from the URL on dismiss.
  - `passwordExpiresAt` within 14 days → an inline warning row (`strings.vaultExpiryWarningPrefix` + formatted date).
  - **Launch**: `POST /credential-launch/${id}` (no body) → `window.location.href = res.injectUrl`. On `ApiError` 400 → show `strings.vaultNoCredentialsHint` inline (shouldn't happen when a credential exists, but handle it).
  - **Launch with…**: a `<select>` of non-default credentials by label/username → `POST /credential-launch/${id}` with `{ credentialId }`.
  - **Add / Edit / Delete / Reveal**: set a pending action, open `ReauthModal`; its `onSuccess(token)` runs the action with header `{ 'X-Reauth-Token': token }`:
    - Add → `POST /vault/credentials/${id}` with the form body.
    - Edit → `PATCH /vault/credentials/${id}/${credId}` with changed fields.
    - Delete → `DELETE /vault/credentials/${id}/${credId}`.
    - Reveal → `GET /vault/credentials/${id}/${credId}/reveal` → show `username` / `password` inline for that row until "Hide" or navigation; never written to state that persists across route changes, never logged.
  - **Set as default**: `PATCH /vault/credentials/${id}/${credId}/default` (no modal) → refetch list.
  - Every mutating action refetches the list on success.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/VaultManager.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VaultManager } from '../pages/VaultManager';
import { apiClient } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<any>('../api/client');
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
const api = apiClient as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/services/:id/credentials" element={<VaultManager />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

it('lists stored credentials and marks the default', async () => {
  api.get.mockResolvedValueOnce([
    { id: 'c1', label: 'Personal', username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null },
  ]);
  renderAt('/services/hr1/credentials');
  const row = await screen.findByRole('row', { name: /jdoe/i });
  expect(within(row).getByText(/default/i)).toBeInTheDocument();
});

it('shows the empty state when there are no credentials', async () => {
  api.get.mockResolvedValueOnce([]);
  renderAt('/services/hr1/credentials');
  expect(await screen.findByText(/no stored credential yet/i)).toBeInTheDocument();
});

it('shows the FR-17 failure banner when ?credentialLaunchFailed=1', async () => {
  api.get.mockResolvedValueOnce([{ id: 'c1', label: null, username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null }]);
  renderAt('/services/hr1/credentials?credentialLaunchFailed=1');
  expect(await screen.findByRole('alert')).toHaveTextContent(/didn't work/i);
});

it('Launch posts to credential-launch and navigates to the inject URL', async () => {
  api.get.mockResolvedValueOnce([{ id: 'c1', label: null, username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null }]);
  api.post.mockResolvedValueOnce({ injectUrl: 'http://localhost:3001/credential-launch/inject/tok' });
  // jsdom: stub the navigation sink
  const hrefSetter = vi.fn();
  Object.defineProperty(window, 'location', { value: { ...window.location, set href(v: string) { hrefSetter(v); } }, writable: true });
  renderAt('/services/hr1/credentials');
  await screen.findByRole('button', { name: /^launch$/i });
  await userEvent.click(screen.getByRole('button', { name: /^launch$/i }));
  expect(api.post).toHaveBeenCalledWith('/credential-launch/hr1', undefined);
  expect(hrefSetter).toHaveBeenCalledWith('http://localhost:3001/credential-launch/inject/tok');
});

it('Reveal requires re-auth: opens the modal, then calls reveal with the returned token', async () => {
  api.get.mockResolvedValueOnce([{ id: 'c1', label: null, username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null }]);
  api.post.mockResolvedValueOnce({ reauthToken: 'tok-9' });      // the modal's reauth POST
  api.get.mockResolvedValueOnce({ username: 'jdoe', password: 's3cret' }); // the reveal GET
  renderAt('/services/hr1/credentials');
  await userEvent.click(await screen.findByRole('button', { name: /reveal/i }));
  await userEvent.type(screen.getByLabelText(/windows password/i), 'pw');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(api.get).toHaveBeenLastCalledWith('/vault/credentials/hr1/c1/reveal', { 'X-Reauth-Token': 'tok-9' });
  expect(await screen.findByText('s3cret')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/__tests__/VaultManager.test.tsx`
Expected: FAIL — the stub renders only an empty `<div data-testid="vault-manager-route" />`.

- [ ] **Step 3: Implement `VaultManager.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import { ReauthModal } from '../components/ReauthModal';
import { strings } from '../strings';

interface CredentialItem {
  id: string;
  label: string | null;
  username: string;
  isDefault: boolean;
  lastRotatedAt: string;
  passwordExpiresAt: string | null;
}

type PendingAction =
  | { kind: 'add'; body: { label?: string; username: string; password: string; passwordExpiresAt?: string } }
  | { kind: 'edit'; credentialId: string; body: Record<string, string> }
  | { kind: 'delete'; credentialId: string }
  | { kind: 'reveal'; credentialId: string };

const EXPIRY_WARN_DAYS = 14;

export function VaultManager() {
  const { id: serviceId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<CredentialItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(searchParams.get('credentialLaunchFailed') === '1');

  const refetch = useCallback(() => {
    setLoadFailed(false);
    apiClient
      .get<CredentialItem[]>(`/vault/credentials/${serviceId}`)
      .then(setItems)
      .catch(() => setLoadFailed(true));
  }, [serviceId]);

  useEffect(refetch, [refetch]);

  function dismissBanner() {
    setLaunchFailed(false);
    searchParams.delete('credentialLaunchFailed');
    setSearchParams(searchParams, { replace: true });
  }

  async function runLaunch(credentialId?: string) {
    setInlineError(null);
    try {
      const { injectUrl } = await apiClient.post<{ injectUrl: string }>(
        `/credential-launch/${serviceId}`,
        credentialId ? { credentialId } : undefined,
      );
      window.location.href = injectUrl;
    } catch (err) {
      setInlineError(err instanceof ApiError ? err.message : strings.reauthGenericError);
    }
  }

  async function runPending(reauthToken: string) {
    const headers = { 'X-Reauth-Token': reauthToken };
    try {
      if (!pending) return;
      if (pending.kind === 'add') await apiClient.post(`/vault/credentials/${serviceId}`, pending.body, headers);
      else if (pending.kind === 'edit')
        await apiClient.patch(`/vault/credentials/${serviceId}/${pending.credentialId}`, pending.body, headers);
      else if (pending.kind === 'delete')
        await apiClient.delete(`/vault/credentials/${serviceId}/${pending.credentialId}`, headers);
      else if (pending.kind === 'reveal') {
        const secret = await apiClient.get<{ username: string; password: string }>(
          `/vault/credentials/${serviceId}/${pending.credentialId}/reveal`,
          headers,
        );
        setRevealed((r) => ({ ...r, [pending.credentialId]: secret }));
      }
      if (pending.kind !== 'reveal') {
        setShowAddForm(false);
        refetch();
      }
    } catch (err) {
      setInlineError(err instanceof ApiError ? err.message : strings.reauthGenericError);
    } finally {
      setPending(null);
    }
  }

  async function setDefault(credentialId: string) {
    await apiClient.patch(`/vault/credentials/${serviceId}/${credentialId}/default`, undefined);
    refetch();
  }

  const nonDefault = useMemo(() => (items ?? []).filter((c) => !c.isDefault), [items]);
  const expirySoon = (items ?? []).find(
    (c) => c.passwordExpiresAt && new Date(c.passwordExpiresAt).getTime() - Date.now() < EXPIRY_WARN_DAYS * 86_400_000,
  );

  if (loadFailed) return <main className="mx-auto max-w-3xl p-6"><p role="alert">{strings.loadErrorTitle}</p></main>;
  if (items === null) return <p role="status">{strings.loadingLabel}</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.vaultTitle}</h1>

      {launchFailed && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {strings.vaultLaunchFailedBanner}{' '}
          <button type="button" onClick={dismissBanner} className="underline">×</button>
        </p>
      )}
      {expirySoon && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {strings.vaultExpiryWarningPrefix} {new Date(expirySoon.passwordExpiresAt!).toLocaleDateString()}.
        </p>
      )}
      {inlineError && <p role="alert" className="text-sm text-red-600">{inlineError}</p>}

      {items.length === 0 ? (
        <section>
          <h2 className="font-heading font-semibold text-ink">{strings.vaultNoCredentialsTitle}</h2>
          <p className="text-sm text-gray-600">{strings.vaultNoCredentialsHint}</p>
          <button type="button" onClick={() => setShowAddForm(true)} className="mt-3 rounded bg-ink px-3 py-1.5 text-sm text-white">
            {strings.vaultAddButton}
          </button>
        </section>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => runLaunch()} className="rounded bg-ink px-4 py-2 text-sm text-white">
              {strings.vaultLaunchButton}
            </button>
            {nonDefault.length > 0 && (
              <label className="text-sm">
                {strings.vaultLaunchWithLabel}{' '}
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && runLaunch(e.target.value)}
                  className="rounded border border-line p-1"
                >
                  <option value="" disabled>—</option>
                  {nonDefault.map((c) => (
                    <option key={c.id} value={c.id}>{c.label || c.username}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2">{strings.vaultColLabel}</th>
                <th>{strings.vaultColUsername}</th>
                <th>{strings.vaultColRotated}</th>
                <th>{strings.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-line/50">
                  <td className="py-2">
                    {c.label || '—'} {c.isDefault && <span className="ml-1 rounded bg-accent/10 px-1 text-xs text-accent">{strings.vaultDefaultBadge}</span>}
                  </td>
                  <td>
                    {revealed[c.id] ? (
                      <span>
                        {revealed[c.id].username} / <code>{revealed[c.id].password}</code>{' '}
                        <button type="button" onClick={() => setRevealed((r) => { const n = { ...r }; delete n[c.id]; return n; })} className="underline">
                          {strings.vaultHideButton}
                        </button>
                      </span>
                    ) : (
                      c.username
                    )}
                  </td>
                  <td>{new Date(c.lastRotatedAt).toLocaleDateString()}</td>
                  <td className="space-x-2">
                    <button type="button" onClick={() => setPending({ kind: 'reveal', credentialId: c.id })} className="underline">{strings.vaultRevealButton}</button>
                    <button type="button" onClick={() => setPending({ kind: 'edit', credentialId: c.id, body: {} })} className="underline">{strings.vaultEditButton}</button>
                    <button type="button" onClick={() => setPending({ kind: 'delete', credentialId: c.id })} className="underline text-red-600">{strings.vaultDeleteButton}</button>
                    {!c.isDefault && <button type="button" onClick={() => setDefault(c.id)} className="underline">{strings.vaultSetDefaultButton}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" onClick={() => setShowAddForm(true)} className="rounded border border-line px-3 py-1.5 text-sm">
            {strings.vaultAddButton}
          </button>
        </>
      )}

      {showAddForm && (
        <AddCredentialForm
          onCancel={() => setShowAddForm(false)}
          onSubmit={(body) => setPending({ kind: 'add', body })}
        />
      )}

      <ReauthModal
        serviceId={serviceId}
        open={pending !== null}
        onClose={() => setPending(null)}
        onSuccess={runPending}
      />
    </main>
  );
}

function AddCredentialForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: { label?: string; username: string; password: string; passwordExpiresAt?: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          label: label || undefined,
          username,
          password,
          passwordExpiresAt: expiry ? new Date(expiry).toISOString() : undefined,
        });
      }}
      className="space-y-2 rounded border border-line p-4"
    >
      <label className="block text-sm">{strings.vaultLabelField}
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded border border-line p-2" />
      </label>
      <label className="block text-sm">{strings.vaultUsernameField}
        <input required value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded border border-line p-2" />
      </label>
      <label className="block text-sm">{strings.vaultPasswordField}
        <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border border-line p-2" />
      </label>
      <label className="block text-sm">{strings.vaultExpiryField}
        <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-1 rounded border border-line p-2" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm">{strings.vaultCancelButton}</button>
        <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm text-white">{strings.vaultSaveButton}</button>
      </div>
    </form>
  );
}
```

Note on Edit: the test only asserts the reveal path; a full edit form is out of scope for the minimum. The `edit` pending action with an empty `body` is a valid no-op PATCH (200, changes nothing) — a follow-up can add an inline edit form mirroring `AddCredentialForm`. Leaving `body: {}` keeps the modal wiring proven without a second form in this task. If the reviewer wants the edit form now, add it as `EditCredentialForm` alongside `AddCredentialForm` and set `body` from its fields.

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run src/__tests__/VaultManager.test.tsx`
Expected: PASS — all five cases.

- [ ] **Step 5: Full frontend suite + a11y**

Run: `cd apps/web && npm test`
Expected: all green, including a `jest-axe` check on `VaultManager` (add one mirroring the repo's other a11y tests: render at a route with one credential, `expect(await axe(container)).toHaveNoViolations()`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/VaultManager.tsx apps/web/src/__tests__/VaultManager.test.tsx
git commit -m "feat(web): VaultManager — credential table, launch, re-auth-gated reveal/add/delete, FR-17 banner"
```

---

## Task 15: End-to-end Playwright coverage + manual security-review checklist

**Files:**
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/vault.spec.ts`
- Modify: `e2e/helpers.ts` (add a `storeCredential` helper)
- Create: `docs/specs/phase-3-security-review-checklist.md`

**Interfaces:**
- Consumes: the running full stack (api, web, mock-idp, legacy-demo-app) via `webServer`; seeded users and the seeded "HR Self-Service Portal" CREDENTIAL service; `AD_DEV_PASSWORD=dev-ad-password`; `legacy-demo-app` accepts `hruser` / `hr-pw-123`.
- Produces: three e2e scenarios — successful reveal-after-reauth, launch with a non-default credential, and the FR-17 recovery banner from a deliberately wrong stored credential.

- [ ] **Step 1: Add `legacy-demo-app` to the Playwright `webServer` array**

In `e2e/playwright.config.ts`, add to the `webServer` array:

```ts
    { command: 'npm run start:dev', cwd: '../apps/mock-target-apps/legacy-demo-app', port: 4003, reuseExistingServer: true },
```

- [ ] **Step 2: Add a `storeCredential` helper**

Append to `e2e/helpers.ts`:

```ts
export async function openHrCredentials(page: Page) {
  await page.getByRole('button', { name: 'HR Self-Service Portal' }).click();
  await page.waitForURL(/\/services\/[^/]+\/credentials/);
}

export async function addCredential(page: Page, username: string, password: string, label = 'Test') {
  await page.getByRole('button', { name: /add credential/i }).click();
  await page.getByLabel(/label/i).fill(label);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^save$/i }).click();
  // ReauthModal
  await page.getByLabel(/windows password/i).fill('dev-ad-password');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('row', { name: new RegExp(username) }).waitFor();
}
```

- [ ] **Step 3: Write `e2e/vault.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { loginAs, openHrCredentials, addCredential } from './helpers';

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'finance.employee@launchpad.local');
  await openHrCredentials(page);
  // clean slate: delete any credential rows left by a prior run
  for (;;) {
    const del = page.getByRole('button', { name: /^delete$/i }).first();
    if (!(await del.isVisible().catch(() => false))) break;
    await del.click();
    await page.getByLabel(/windows password/i).fill('dev-ad-password');
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForTimeout(200);
  }
});

test('reveal requires the AD password and then shows the stored secret', async ({ page }) => {
  await addCredential(page, 'hruser', 'hr-pw-123', 'Primary');
  await page.getByRole('button', { name: /reveal/i }).click();
  await page.getByLabel(/windows password/i).fill('dev-ad-password');
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText('hr-pw-123')).toBeVisible();
});

test('launch with a non-default credential signs into the legacy app with no second prompt', async ({ page }) => {
  await addCredential(page, 'wrong', 'wrong', 'Default');          // first = default, deliberately bad
  await addCredential(page, 'hruser', 'hr-pw-123', 'Real');        // second = non-default, correct
  await page.getByLabel(/launch with/i).selectOption({ label: 'Real' });
  await expect(page.getByText(/no second login prompt/i)).toBeVisible();
});

test('a wrong stored credential shows the FR-17 recovery banner back in the portal', async ({ page }) => {
  await addCredential(page, 'hruser', 'definitely-wrong', 'Primary');
  await page.getByRole('button', { name: /^launch$/i }).click();
  await page.waitForURL(/credentialLaunchFailed=1/);
  await expect(page.getByRole('alert')).toContainText(/didn't work/i);
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e` (from repo root — re-seeds, then runs Playwright). Ensure the local stack isn't already occupying the ports, or that `reuseExistingServer` picks it up.
Expected: `catalog.spec.ts`, `admin.spec.ts`, and the three new `vault.spec.ts` tests all pass.

- [ ] **Step 5: Write the manual security-review checklist**

Create `docs/specs/phase-3-security-review-checklist.md`:

```markdown
# Phase 3 Manual Security Review Checklist

Per Plan.md §5 and the Phase 3 design spec §13, a real pen test is out of scope for this
prototype; this checklist stands in. Run it before considering Phase 3 done. Tick each line with
the file:line evidence.

## No plaintext leakage
- [ ] `grep -rn "encPassword\|encUsername" apps/api/src` — every read of these fields is followed by
      `crypto.decrypt(...)` only inside `VaultService.revealCredential`, `VaultService.toListItem`
      (username only), or `CredentialLaunchService.resolve`. No other call site.
- [ ] `GET /vault/credentials/:serviceId` (list) response contains no `password` / `encPassword`
      key — confirmed by `vault.credentials.e2e-spec.ts` "no password" assertions.
- [ ] The decrypted password reaches the browser only via `GET .../reveal` (an explicit user
      action, re-auth-gated) and the inject page. It is never in a `/catalog`, `/vault` list, or
      `/credential-launch` POST JSON response.
- [ ] Inject page sets `Cache-Control: no-store` (`credential-launch.controller.ts`) and is
      single-use (`LaunchTokenStore.consume` deletes on first read).
- [ ] No `console.log` / logger call anywhere in `vault/` or `credential-launch/` takes a
      decrypted value or a raw DTO password.

## Re-auth gate
- [ ] Reveal, create, update, delete each call `requireReauth(...)` before touching data
      (`vault.controller.ts`).
- [ ] `reauthToken` is single-use (`ReauthTokenStore.consume` deletes unconditionally) and scoped
      to `{userId, serviceId}` — a token minted for service A can't act on service B.
- [ ] 5 failed re-auths → `423` with a retry window (`LockoutService`), verified by
      `vault.reauth.e2e-spec.ts`.

## Isolation
- [ ] Every `VaultService` / `CredentialLaunchService` method calls `CatalogService.assertEntitled`
      first (404 on no entitlement — existence not leaked).
- [ ] Every credential lookup is filtered by `userId: user.id` — no admin or cross-user path.
- [ ] Vault tables are in the `vault` Postgres schema, not `public` (`schema.prisma` `@@schema`).

## Crypto
- [ ] AES-256-GCM, random 12-byte IV per encrypt, auth tag verified on decrypt
      (`credential-crypto.service.ts`), round-trip + tamper test green.
- [ ] Key comes only from `CredentialCryptoService` via `KeyProvider` — no `process.env` read of
      the key anywhere else.
```

- [ ] **Step 6: Run the checklist**

Work through `docs/specs/phase-3-security-review-checklist.md`, ticking each line with real
`file:line` evidence. Any line that can't be ticked is a bug — fix it (with a test) before
committing.

- [ ] **Step 7: Full verification pass**

Run, from repo root:
```bash
cd apps/api && npm test && npm run test:e2e && cd ../apps/web && npm test && cd ../.. && npm run test:e2e
```
Expected: every suite green. Record the actual output in the commit body.

- [ ] **Step 8: Commit**

```bash
git add e2e docs/specs/phase-3-security-review-checklist.md
git commit -m "test(e2e): Phase 3 vault flows + manual security-review checklist"
```

---

## Self-Review (completed by the plan author)

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2 Architecture (`vault`, `ad-reauth`, `credential-launch`, `legacy-demo-app`) | 2–4, 8–10 |
| §3 Data model (`Credential`, `AdAccount`, `CredentialVaultLockout`, 3 audit event types, no cross-schema FK) | 1, plus audit strings used in 5–9 |
| §4 Encryption (`CredentialCryptoService`, `KeyProvider`) | 2 |
| §5 Re-auth flow (two-call, step-up token, lockout) | 4 |
| §6 Credential CRUD endpoints table | 5 (list, create), 6 (update, delete, set-default), 7 (reveal) |
| §7 Launch flow (default/selected, single-use token, inject page) | 8, 9 |
| §8 Failure path (FR-17 banner, legacy app redirects back to a trusted portal URL) | 9 (failureRedirect minting), 10 (redirect guard), 14 (banner) |
| §9 Frontend (`VaultManager`, `ReauthModal`, credential picker, expiry banner) — **re-homed off the deleted `ServiceDetail` onto the `/services/:id/credentials` route per the user's decision** | 12–14 |
| §9.1 flagged choices (no admin field, no Security Admin UI) | Honoured — no admin surface added (Global Constraints, Task 5–7 route scoping) |
| §10 Error handling (401 / 423 / 400 / expired-token HTML) | 4, 5, 9, 13, 14 |
| §11 Risks (in-memory tokens, cross-schema refs) | Addressed explicitly — deviation #2 (no FK), in-memory stores documented in Tasks 4 & 8 |
| §12 Out of scope | Nothing in the plan builds these |
| §13 Testing plan (unit, integration, e2e 6 processes, manual security checklist, a11y) | Unit/integration in every task; e2e + checklist in Task 15; a11y in Tasks 13 & 14 |

No gaps found.

**2. Placeholder scan** — no "TBD"/"handle edge cases"/"similar to Task N"/code-free code steps. Task 6's `edit` form is explicitly deferred with a stated reason and a working no-op path, not a placeholder. Task 11 Step 2's Dockerfile step is conditional on `demo-app-b`'s own Dockerfile existing — stated, not hand-waved.

**3. Type consistency** — checked across tasks:
- `CredentialListItem` shape identical in Task 5 (definition), 6, 7 (consumers).
- `reauthToken` header name `X-Reauth-Token` consistent: controller `@Headers('x-reauth-token')` (Task 5), client `{ 'X-Reauth-Token': token }` (Task 12, 14), tests (Task 5–7). Express lowercases header names, so `'x-reauth-token'` on the server matches `'X-Reauth-Token'` sent by the client.
- `injectUrl` / `failureRedirect` field names identical in Task 8 (service), 9 (consumer), 14 (frontend).
- `ReauthModalProps` identical in Task 13 (definition) and Task 14 (usage: `serviceId`, `open`, `onClose`, `onSuccess`).
- `apiClient` method signatures with the optional `headers` arg match between Task 12 (definition) and Task 14 (all four verbs used with a headers arg).
- `AuditService.record(userId, eventType, serviceId?, metadata?)` — every call in Tasks 5–9 passes `(user.id, 'CREDENTIAL_*', serviceId, {...})`, matching the existing signature.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-04-phase-3-credential-vault.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
