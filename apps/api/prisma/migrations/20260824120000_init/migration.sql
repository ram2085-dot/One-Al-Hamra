-- Enable trigram support (used by Task 6's fuzzy search index below)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'SERVICE_OWNER', 'CATALOG_ADMIN', 'HELP_DESK', 'SECURITY_ADMIN');

-- CreateEnum
CREATE TYPE "LaunchType" AS ENUM ('SSO', 'CREDENTIAL');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "adUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "category" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL,
    "vendorName" TEXT,
    "ownerId" TEXT NOT NULL,
    "launchType" "LaunchType" NOT NULL DEFAULT 'SSO',
    "status" "ServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "supportContact" TEXT NOT NULL,
    "docsUrl" TEXT,
    "healthCheckUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "ServiceAlias" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "alias" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceEntitlement" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "department" TEXT,
    "role" "Role",
    "group" TEXT
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "serviceId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "metadata" JSONB
);

-- AddPrimaryKey
ALTER TABLE "User" ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- AddPrimaryKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_pkey" PRIMARY KEY ("id");

-- AddPrimaryKey
ALTER TABLE "ServiceAlias" ADD CONSTRAINT "ServiceAlias_pkey" PRIMARY KEY ("id");

-- AddPrimaryKey
ALTER TABLE "ServiceEntitlement" ADD CONSTRAINT "ServiceEntitlement_pkey" PRIMARY KEY ("id");

-- AddPrimaryKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId", "serviceId");

-- AddPrimaryKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id");

-- CreateIndex (unique constraints)
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex (unique constraints)
CREATE UNIQUE INDEX "User_adUsername_key" ON "User"("adUsername");

-- CreateIndex (plain indexes)
CREATE INDEX "ServiceAlias_serviceId_idx" ON "ServiceAlias"("serviceId");

-- CreateIndex (plain indexes)
CREATE INDEX "ServiceEntitlement_serviceId_idx" ON "ServiceEntitlement"("serviceId");

-- CreateIndex (plain indexes)
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex (plain indexes)
CREATE INDEX "AuditLog_serviceId_idx" ON "AuditLog"("serviceId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAlias" ADD CONSTRAINT "ServiceAlias_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntitlement" ADD CONSTRAINT "ServiceEntitlement_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (trigram search index used by Task 6)
CREATE INDEX "Service_name_trgm_idx" ON "Service" USING gin ("name" gin_trgm_ops);
