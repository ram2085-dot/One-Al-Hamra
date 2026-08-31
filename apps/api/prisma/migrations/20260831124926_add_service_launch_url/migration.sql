-- Adds Service.launchUrl: the plain external URL a catalog tile click redirects straight to.
-- Purely additive — no existing column touched.

ALTER TABLE "Service" ADD COLUMN "launchUrl" TEXT;
