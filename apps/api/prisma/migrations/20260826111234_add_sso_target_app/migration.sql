-- CreateEnum
CREATE TYPE "SsoTargetApp" AS ENUM ('DEMO_APP_A', 'DEMO_APP_B');

-- DropIndex
DROP INDEX "Service_name_trgm_idx";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "ssoTargetApp" "SsoTargetApp",
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
