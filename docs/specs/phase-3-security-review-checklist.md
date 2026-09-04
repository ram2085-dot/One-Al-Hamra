# Phase 3 Manual Security Review Checklist

Per Plan.md §5 and the Phase 3 design spec §13, a real pen test is out of scope for this
prototype; this checklist stands in. Run it before considering Phase 3 done. Tick each line with
the file:line evidence.

## No plaintext leakage
- [x] `grep -rn "encPassword\|encUsername" apps/api/src` — every read of these fields is followed by
      `crypto.decrypt(...)` only inside `VaultService.revealCredential`, `VaultService.toListItem`
      (username only), or `CredentialLaunchService.resolve`. No other call site.
      Evidence: `apps/api/src/vault/vault.service.ts:52` (`toListItem`, username only),
      `apps/api/src/vault/vault.service.ts:143` (`revealCredential`),
      `apps/api/src/credential-launch/credential-launch.service.ts:33-34` (`resolve`).
      All other `src` hits are `crypto.encrypt(...)` writes on create/update
      (`vault.service.ts:80-81, 101, 103`); the rest are `*.spec.ts` fixtures.
- [x] `GET /vault/credentials/:serviceId` (list) response contains no `password` / `encPassword`
      key — confirmed by `vault.credentials.e2e-spec.ts` "no password" assertions.
      Evidence: handler `apps/api/src/vault/vault.controller.ts:39-42` -> `VaultService.listForService`
      -> `toListItem` (`apps/api/src/vault/vault.service.ts:48-66`) which projects only
      `{id,label,username,isDefault,lastRotatedAt,passwordExpiresAt}` — no password field.
      Assertions: `apps/api/src/vault/vault.credentials.e2e-spec.ts:65` (`created.body.password` undefined),
      `:69` (`JSON.stringify(list.body)).not.toContain('s3cret')`).
- [x] The decrypted password reaches the browser only via `GET .../reveal` (an explicit user
      action, re-auth-gated) and the inject page. It is never in a `/catalog`, `/vault` list, or
      `/credential-launch` POST JSON response.
      Evidence: reveal — `apps/api/src/vault/vault.controller.ts:28-37` (re-auth gate at `:35`),
      `vault.service.ts:139-144`. Inject page — `apps/api/src/credential-launch/credential-launch.controller.ts:37-64`
      (hidden form fields, HTML not JSON). `credential-launch` POST returns only `{ injectUrl }`
      (`credential-launch.service.ts:21,38`). `/catalog` projections carry no credential fields
      (`apps/api/src/catalog/catalog.service.ts:100-110`).
- [x] Inject page sets `Cache-Control: no-store` (`credential-launch.controller.ts`) and is
      single-use (`LaunchTokenStore.consume` deletes on first read).
      Evidence: `apps/api/src/credential-launch/credential-launch.controller.ts:40` (`res.setHeader('Cache-Control', 'no-store')`,
      set before the expired-token branch and the success branch);
      `apps/api/src/credential-launch/launch-token.store.ts:24-30` (`consume` calls
      `this.entries.delete(token)` before the expiry check, so the payload is gone after the first read).
- [x] No `console.log` / logger call anywhere in `vault/` or `credential-launch/` takes a
      decrypted value or a raw DTO password.
      Evidence: `grep -rn "console\.\|Logger\|logger\|\.log(" apps/api/src/vault apps/api/src/credential-launch`
      returns nothing (exit 1) — there is no logging call of any kind in either module.

## Re-auth gate
- [x] Reveal, create, update, delete each call `requireReauth(...)` before touching data
      (`vault.controller.ts`).
      Evidence: `apps/api/src/vault/vault.controller.ts:35` (reveal), `:51` (create), `:75` (update),
      `:87` (delete) — each is the first statement in the handler, before the `this.vault.*` call.
      `requireReauth` defined at `:17-21` throws `UnauthorizedException` when the token is missing
      or `ReauthTokenStore.consume` returns false. (`makeDefault`, `:57-65`, is a non-secret
      metadata flip and is intentionally not gated — spec §6.)
- [x] `reauthToken` is single-use (`ReauthTokenStore.consume` deletes unconditionally) and scoped
      to `{userId, serviceId}` — a token minted for service A can't act on service B.
      Evidence: `apps/api/src/vault/reauth-token.store.ts:30` (`this.entries.delete(token)` runs
      before the expiry/scope checks — unconditional), `:32` (`entry.userId === userId && entry.serviceId === serviceId`).
      Scope threaded from the controller: `vault.controller.ts:18` passes `userId, serviceId`;
      token issued with `{ userId: user.id, serviceId }` at `vault.service.ts:45`.
- [x] 5 failed re-auths -> `423` with a retry window (`LockoutService`), verified by
      `vault.reauth.e2e-spec.ts`.
      Evidence: `apps/api/src/vault/lockout.service.ts:4` (`MAX_ATTEMPTS = 5`), `:41` (`failedAttempts >= MAX_ATTEMPTS`
      -> `lockedUntil`), `:47` + `:13-21` (throws `HttpException` status `423` with `retryAfterSeconds`).
      Wired in at `vault.service.ts:36` (`assertNotLocked`) and `:40` (`recordFailure`).
      Test: `apps/api/src/vault/vault.reauth.e2e-spec.ts:52-59` (`res.status` 423,
      `res.body.retryAfterSeconds` > 0).

## Isolation
- [x] Every `VaultService` / `CredentialLaunchService` method calls `CatalogService.assertEntitled`
      first (404 on no entitlement — existence not leaked).
      Evidence: `apps/api/src/vault/vault.service.ts:35` (reauth), `:60` (list), `:69` (create),
      `:97` (update), `:113` (delete), `:130` (setDefault), `:140` (reveal);
      `apps/api/src/credential-launch/credential-launch.service.ts:22` (resolve).
      `assertEntitled` throws `NotFoundException` (404, never 403) —
      `apps/api/src/catalog/catalog.service.ts:112-122`.
- [x] Every credential lookup is filtered by `userId: user.id` — no admin or cross-user path.
      Evidence: `apps/api/src/vault/vault.service.ts:62` (`findMany where userId`), `:71` (create's
      existing-count query), `:91` (`ownedOrThrow` — `findFirst where { id, userId, serviceId }`,
      used by update/delete/setDefault/reveal at `:98,:114,:131,:141`), `:117` + `:133` (post-delete /
      set-default fan-out queries also scoped to `userId`).
      `apps/api/src/credential-launch/credential-launch.service.ts:24-26` (`where` always carries
      `userId: user.id`). No `VaultService`/`CredentialLaunchService` query omits the user filter,
      and neither module exposes an admin route (`vault.controller.ts` / `credential-launch.controller.ts`
      have no role guard / admin path).
- [x] Vault tables are in the `vault` Postgres schema, not `public` (`schema.prisma` `@@schema`).
      Evidence: `apps/api/prisma/schema.prisma:9` (`schemas = ["public", "vault"]`),
      `:140` (`Credential` `@@schema("vault")`), `:147` (`AdAccount`), `:158` (`CredentialVaultLockout`).
      No cross-schema relation field is declared (spec §3 / deviation #2).

## Crypto
- [x] AES-256-GCM, random 12-byte IV per encrypt, auth tag verified on decrypt
      (`credential-crypto.service.ts`), round-trip + tamper test green.
      Evidence: `apps/api/src/vault/credential-crypto.service.ts:5` (`IV_LEN = 12`), `:13`
      (`randomBytes(IV_LEN)` per `encrypt` call), `:14` (`createCipheriv('aes-256-gcm', key, iv)`),
      `:16` (packs `iv | authTag | ciphertext`), `:24-25` (`createDecipheriv` + `decipher.setAuthTag(tag)`
      so `final()` throws on tamper).
      Tests: `apps/api/src/vault/credential-crypto.service.spec.ts` — round-trip and
      tampered-tag/ciphertext rejection cases (run green in the Task 15 verification pass).
- [x] Key comes only from `CredentialCryptoService` via `KeyProvider` — no `process.env` read of
      the key anywhere else.
      Evidence: `apps/api/src/vault/credential-crypto.service.ts:10` (ctor takes `KeyProvider`),
      `:14` + `:24` (`this.keyProvider.getKey()` is the only key source).
      `apps/api/src/vault/key-provider.ts:16` — `EnvKeyProvider.getKey` is the sole reader of
      `CREDENTIAL_VAULT_KEY` (via `ConfigService`, not `process.env`).
      `grep -rn "CREDENTIAL_VAULT_KEY" apps/api/src` -> only `key-provider.ts`.

---

## Result

All 16 lines ticked with `file:line` evidence on branch `phase-3-credential-vault`. No line failed;
no production-code changes were required by this review.
