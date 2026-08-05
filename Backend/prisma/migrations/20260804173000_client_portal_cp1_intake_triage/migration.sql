-- CP1 intake/triage follow-up. Existing rows remain unchanged and no access is
-- broadened. Nullable Case linkage lets the existing request/submission/outbox
-- domains serve pre-conversion intake without creating a placeholder Case.

ALTER TABLE "client_portal_intake_requests"
  ADD COLUMN "submittedSnapshot" JSONB,
  ADD COLUMN "conversionFingerprint" TEXT;

ALTER TABLE "client_requests"
  ALTER COLUMN "caseId" DROP NOT NULL,
  ADD COLUMN "intakeRequestId" TEXT;

ALTER TABLE "client_submissions"
  ALTER COLUMN "caseId" DROP NOT NULL;

ALTER TABLE "client_notification_deliveries"
  ALTER COLUMN "caseId" DROP NOT NULL,
  ADD COLUMN "intakeRequestId" TEXT;

ALTER TABLE "client_matter_publications"
  ADD COLUMN "workspaceId" TEXT;

ALTER TABLE "client_matter_publication_revisions"
  ADD COLUMN "clientSafeCurrentPosition" TEXT,
  ADD COLUMN "clientSafeWaitingOn" TEXT,
  ADD COLUMN "publicTargetDate" TIMESTAMP(3);

CREATE INDEX "client_requests_intakeRequestId_status_idx"
  ON "client_requests"("intakeRequestId", "status");

CREATE INDEX "client_notification_deliveries_intakeRequestId_idx"
  ON "client_notification_deliveries"("intakeRequestId");

CREATE INDEX "client_matter_publications_workspaceId_status_idx"
  ON "client_matter_publications"("workspaceId", "status");

-- Preserve the original one-published-snapshot invariant for legacy rows while
-- allowing one explicit published snapshot per workspace. Existing rows all
-- have workspaceId NULL at this point, so this does not broaden legacy access.
DROP INDEX "client_matter_one_current_published_idx";

CREATE UNIQUE INDEX "client_matter_one_current_published_idx"
  ON "client_matter_publications"("caseId", "clientId")
  WHERE "status" = 'PUBLISHED' AND "workspaceId" IS NULL;

CREATE UNIQUE INDEX "client_matter_one_published_workspace_idx"
  ON "client_matter_publications"("caseId", "workspaceId")
  WHERE "status" = 'PUBLISHED' AND "workspaceId" IS NOT NULL;

ALTER TABLE "client_requests"
  ADD CONSTRAINT "client_requests_intakeRequestId_fkey"
  FOREIGN KEY ("intakeRequestId") REFERENCES "client_portal_intake_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
