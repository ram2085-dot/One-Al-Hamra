-- Phase 3 Credential Vault: adds the separate `vault` Postgres schema and its three tables.
-- The Prisma-generated diff also wanted to DROP "public"."Service_name_trgm_idx" and normalise a
-- few CURRENT_TIMESTAMP(3) defaults — unrelated pre-existing drift (see commit 204da0a for the same
-- clean-up on the SsoTargetApp migration). Those lines are intentionally removed; this migration is
-- purely additive to the `vault` schema.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "vault";

-- CreateTable
CREATE TABLE "vault"."Credential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "label" TEXT,
    "encUsername" TEXT NOT NULL,
    "encPassword" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastRotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordExpiresAt" TIMESTAMP(3),

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault"."AdAccount" (
    "adUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("adUsername")
);

-- CreateTable
CREATE TABLE "vault"."CredentialVaultLockout" (
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialVaultLockout_pkey" PRIMARY KEY ("userId","serviceId")
);

-- CreateIndex
CREATE INDEX "Credential_userId_serviceId_idx" ON "vault"."Credential"("userId", "serviceId");
