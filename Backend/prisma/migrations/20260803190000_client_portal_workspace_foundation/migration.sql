-- CP0 client portal workspace foundation.
-- Additive and deny-by-default: new memberships are never activated by this migration.

CREATE TYPE "ClientPortalWorkspaceMode" AS ENUM ('INDIVIDUAL', 'ORGANIZATION', 'CASE_RELAY');
CREATE TYPE "ClientPortalWorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "ClientPortalCommunicationMode" AS ENUM ('PORTAL_PRIMARY', 'EMAIL_LINKED', 'EXTERNAL_ONLY');
CREATE TYPE "ClientPortalConnectedSystemState" AS ENUM ('NOT_CONFIGURED', 'CONFIGURATION_REQUIRED', 'READY', 'DISABLED');
CREATE TYPE "ClientPortalWorkspaceMembershipStatus" AS ENUM ('INVITED', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ClientPortalWorkspaceMembershipRole" AS ENUM ('MEMBER', 'REPRESENTATIVE', 'APPROVER');

CREATE TABLE "client_portal_workspaces" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mode" "ClientPortalWorkspaceMode" NOT NULL,
  "status" "ClientPortalWorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  "communicationMode" "ClientPortalCommunicationMode" NOT NULL DEFAULT 'PORTAL_PRIMARY',
  "connectedSystemState" "ClientPortalConnectedSystemState" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "publicReference" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_portal_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_portal_workspace_memberships" (
  "id" TEXT NOT NULL,
  "clientPortalIdentityId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "status" "ClientPortalWorkspaceMembershipStatus" NOT NULL DEFAULT 'INVITED',
  "role" "ClientPortalWorkspaceMembershipRole" NOT NULL DEFAULT 'MEMBER',
  "invitedAt" TIMESTAMP(3),
  "invitedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "suspendedAt" TIMESTAMP(3),
  "suspendedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_portal_workspace_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_portal_workspace_events" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "membershipId" TEXT,
  "actorId" TEXT NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "fromStatus" VARCHAR(40),
  "toStatus" VARCHAR(40),
  "metadataSafe" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_portal_workspace_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "client_portal_grants" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "client_portal_invitations" ADD COLUMN "workspaceId" TEXT;

CREATE UNIQUE INDEX "client_portal_workspaces_publicReference_key" ON "client_portal_workspaces"("publicReference");
CREATE INDEX "client_portal_workspaces_clientId_idx" ON "client_portal_workspaces"("clientId");
CREATE INDEX "client_portal_workspaces_status_idx" ON "client_portal_workspaces"("status");
CREATE INDEX "client_portal_workspaces_mode_idx" ON "client_portal_workspaces"("mode");
CREATE INDEX "client_portal_workspaces_clientId_status_idx" ON "client_portal_workspaces"("clientId", "status");
CREATE UNIQUE INDEX "client_portal_workspace_memberships_clientPortalIdentityId_workspaceId_key" ON "client_portal_workspace_memberships"("clientPortalIdentityId", "workspaceId");
CREATE INDEX "client_portal_workspace_memberships_clientPortalIdentityId_status_idx" ON "client_portal_workspace_memberships"("clientPortalIdentityId", "status");
CREATE INDEX "client_portal_workspace_memberships_workspaceId_status_idx" ON "client_portal_workspace_memberships"("workspaceId", "status");
CREATE INDEX "client_portal_workspace_events_workspaceId_createdAt_idx" ON "client_portal_workspace_events"("workspaceId", "createdAt");
CREATE INDEX "client_portal_workspace_events_membershipId_createdAt_idx" ON "client_portal_workspace_events"("membershipId", "createdAt");
CREATE INDEX "client_portal_grants_workspaceId_status_idx" ON "client_portal_grants"("workspaceId", "status");
CREATE INDEX "client_portal_invitations_workspaceId_status_idx" ON "client_portal_invitations"("workspaceId", "status");

-- Compatibility is limited to identities that already have both an ACTIVE,
-- unexpired case grant and an ACTIVE organization membership for that Client.
INSERT INTO "client_portal_workspaces" (
  "id", "clientId", "name", "mode", "status", "communicationMode",
  "connectedSystemState", "publicReference", "createdById", "createdAt", "updatedAt"
)
SELECT
  'cp0-compat-' || md5(g."clientId"),
  g."clientId",
  c."name" || ' ügyfélmunkatér',
  CASE WHEN c."relationshipMode" = 'CONNECTED_SYSTEM' THEN 'CASE_RELAY'::"ClientPortalWorkspaceMode"
       ELSE 'ORGANIZATION'::"ClientPortalWorkspaceMode" END,
  'ACTIVE'::"ClientPortalWorkspaceStatus",
  CASE WHEN c."relationshipMode" = 'EMAIL_CENTRIC' THEN 'EMAIL_LINKED'::"ClientPortalCommunicationMode"
       WHEN c."relationshipMode" = 'CONNECTED_SYSTEM' THEN 'EXTERNAL_ONLY'::"ClientPortalCommunicationMode"
       ELSE 'PORTAL_PRIMARY'::"ClientPortalCommunicationMode" END,
  CASE WHEN c."relationshipMode" = 'CONNECTED_SYSTEM' THEN 'CONFIGURATION_REQUIRED'::"ClientPortalConnectedSystemState"
       ELSE 'NOT_CONFIGURED'::"ClientPortalConnectedSystemState" END,
  'cp0-' || md5(g."clientId"),
  MIN(g."invitedById"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "client_portal_grants" g
JOIN "clients" c ON c."id" = g."clientId"
WHERE g."status" = 'ACTIVE'
  AND g."clientPortalIdentityId" IS NOT NULL
  AND (g."validUntil" IS NULL OR g."validUntil" > CURRENT_TIMESTAMP)
  AND EXISTS (
    SELECT 1 FROM "client_organization_memberships" m
    WHERE m."clientPortalIdentityId" = g."clientPortalIdentityId"
      AND m."clientId" = g."clientId"
      AND m."status" = 'ACTIVE'
  )
GROUP BY g."clientId", c."name", c."relationshipMode"
ON CONFLICT ("publicReference") DO NOTHING;

INSERT INTO "client_portal_workspace_memberships" (
  "id", "clientPortalIdentityId", "workspaceId", "status", "role",
  "approvedAt", "approvedById", "createdAt", "updatedAt"
)
SELECT
  'cp0-compat-' || md5(m."clientPortalIdentityId" || ':' || m."clientId"),
  m."clientPortalIdentityId",
  'cp0-compat-' || md5(m."clientId"),
  'ACTIVE'::"ClientPortalWorkspaceMembershipStatus",
  'MEMBER'::"ClientPortalWorkspaceMembershipRole",
  m."approvedAt",
  m."approvedById",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "client_organization_memberships" m
WHERE m."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "client_portal_grants" g
    WHERE g."clientPortalIdentityId" = m."clientPortalIdentityId"
      AND g."clientId" = m."clientId"
      AND g."status" = 'ACTIVE'
      AND (g."validUntil" IS NULL OR g."validUntil" > CURRENT_TIMESTAMP)
  )
ON CONFLICT ("clientPortalIdentityId", "workspaceId") DO NOTHING;

UPDATE "client_portal_grants" g
SET "workspaceId" = 'cp0-compat-' || md5(g."clientId")
WHERE g."clientPortalIdentityId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "client_portal_workspace_memberships" m
    WHERE m."clientPortalIdentityId" = g."clientPortalIdentityId"
      AND m."workspaceId" = 'cp0-compat-' || md5(g."clientId")
      AND m."status" = 'ACTIVE'
  );

DROP INDEX "client_portal_one_active_identity_grant_idx";
CREATE UNIQUE INDEX "client_portal_one_active_identity_workspace_grant_idx"
  ON "client_portal_grants"("clientPortalIdentityId", "workspaceId", "caseId")
  WHERE "status" = 'ACTIVE' AND "clientPortalIdentityId" IS NOT NULL AND "workspaceId" IS NOT NULL;

CREATE OR REPLACE FUNCTION client_portal_validate_grant() RETURNS trigger AS $$
DECLARE expected_client TEXT;
DECLARE workspace_client TEXT;
DECLARE user_role TEXT;
BEGIN
  SELECT "clientId" INTO expected_client FROM "cases" WHERE "id" = NEW."caseId";
  IF NEW."clientPortalIdentityId" IS NULL THEN
    SELECT "role"::text INTO user_role FROM "users" WHERE "id" = NEW."clientUserId";
    IF user_role <> 'CLIENT' THEN
      RAISE EXCEPTION 'client portal grant user must be CLIENT role';
    END IF;
  ELSIF NEW."clientUserId" IS NOT NULL THEN
    RAISE EXCEPTION 'identity grant cannot include legacy client user';
  END IF;
  IF expected_client IS NULL OR expected_client <> NEW."clientId" THEN
    RAISE EXCEPTION 'client portal grant case/client mismatch';
  END IF;
  IF NEW."workspaceId" IS NOT NULL THEN
    SELECT "clientId" INTO workspace_client FROM "client_portal_workspaces" WHERE id = NEW."workspaceId";
    IF workspace_client IS NULL OR workspace_client <> NEW."clientId" THEN
      RAISE EXCEPTION 'client portal grant workspace/client mismatch';
    END IF;
  END IF;
  IF NEW."validUntil" IS NOT NULL AND NEW."validUntil" <= NEW."validFrom" THEN
    RAISE EXCEPTION 'client portal grant invalid validity window';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "client_portal_workspace_memberships"
  ADD CONSTRAINT "client_portal_workspace_memberships_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "client_portal_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_portal_workspace_events"
  ADD CONSTRAINT "client_portal_workspace_events_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "client_portal_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_portal_grants"
  ADD CONSTRAINT "client_portal_grants_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "client_portal_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_portal_invitations"
  ADD CONSTRAINT "client_portal_invitations_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "client_portal_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
