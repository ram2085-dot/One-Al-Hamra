-- Collapses the Role enum from 5 values to 2 (EMPLOYEE, ADMIN).
--
-- Postgres has no direct "drop enum value" operation, so this swaps in a new type rather than
-- altering the existing one: create Role_new, migrate every column's data across via an explicit
-- CASE mapping (never a blind cast, which would fail once a removed value's row is hit), then
-- drop the old type and rename the new one into its place.
--
-- Mapping: CATALOG_ADMIN -> ADMIN. SERVICE_OWNER / HELP_DESK / SECURITY_ADMIN -> EMPLOYEE (none of
-- the three had any role-gated behavior built; see docs/superpowers/... RBAC simplification note).

CREATE TYPE "Role_new" AS ENUM ('EMPLOYEE', 'ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'CATALOG_ADMIN' THEN 'ADMIN'
    WHEN 'SERVICE_OWNER' THEN 'EMPLOYEE'
    WHEN 'HELP_DESK' THEN 'EMPLOYEE'
    WHEN 'SECURITY_ADMIN' THEN 'EMPLOYEE'
    ELSE "role"::text
  END::"Role_new"
);
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

ALTER TABLE "ServiceEntitlement" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'CATALOG_ADMIN' THEN 'ADMIN'
    WHEN 'SERVICE_OWNER' THEN 'EMPLOYEE'
    WHEN 'HELP_DESK' THEN 'EMPLOYEE'
    WHEN 'SECURITY_ADMIN' THEN 'EMPLOYEE'
    ELSE "role"::text
  END::"Role_new"
);

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
