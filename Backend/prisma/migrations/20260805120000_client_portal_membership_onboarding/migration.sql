-- Client portal membership onboarding.
--
-- Additive only. Extends the canonical membership-request domain so the
-- post-login onboarding resolver can carry the requested workspace mode and
-- mode-specific claimed profile data, and so approval/rejection can record a
-- client-safe decision message separately from an internal-only note plus the
-- provisioned workspace/membership. No existing row is altered and no access is
-- broadened: a request grants nothing until an admin approves it.

ALTER TABLE "client_organization_membership_requests"
  ADD COLUMN "requestedMode" "ClientPortalWorkspaceMode",
  ADD COLUMN "verifiedEmailSnapshot" TEXT,
  ADD COLUMN "displayNameSnapshot" TEXT,
  ADD COLUMN "phoneSafe" TEXT,
  ADD COLUMN "claimedJobTitle" TEXT,
  ADD COLUMN "noteSafe" TEXT,
  ADD COLUMN "clientSafeDecisionMessage" TEXT,
  ADD COLUMN "internalDecisionNote" TEXT,
  ADD COLUMN "approvedWorkspaceId" TEXT,
  ADD COLUMN "approvedMembershipId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- Server-side idempotency: a single identity may hold at most one request that
-- is still under review at any time. Repeated submits (double-click, second
-- tab) collapse onto the existing PENDING_REVIEW row instead of creating
-- duplicates. Enforced as a partial unique index (matching the existing
-- partial-index convention, e.g. client_matter_one_current_published_idx).
CREATE UNIQUE INDEX "client_org_membership_request_one_pending_idx"
  ON "client_organization_membership_requests"("clientPortalIdentityId")
  WHERE "status" = 'PENDING_REVIEW';
