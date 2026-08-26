-- CreateEnum
CREATE TYPE "SsoTargetApp" AS ENUM ('DEMO_APP_A', 'DEMO_APP_B');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "ssoTargetApp" "SsoTargetApp";
