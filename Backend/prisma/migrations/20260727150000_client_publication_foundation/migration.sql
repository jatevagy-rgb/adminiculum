-- Client Publication Foundation: additive portal boundary only.

CREATE TYPE "ClientPortalGrantStatus" AS ENUM ('INVITED','ACTIVE','SUSPENDED','REVOKED','EXPIRED');
CREATE TYPE "ClientPortalGrantRole" AS ENUM ('VIEWER','APPROVER','REPRESENTATIVE');
CREATE TYPE "ClientPortalPermission" AS ENUM ('MATTER_READ','DOCUMENT_READ','DOCUMENT_DOWNLOAD','ACTION_REQUEST_READ','ACTION_REQUEST_COMPLETE','UPDATE_READ');
CREATE TYPE "ClientPublicationStatus" AS ENUM ('DRAFT','READY_FOR_APPROVAL','APPROVED','PUBLISHED','REVOKED','SUPERSEDED');
CREATE TYPE "ClientActionRequestType" AS ENUM ('DOCUMENT_UPLOAD','INFORMATION_REQUEST','APPROVAL_REQUEST','CONFIRMATION_REQUEST','QUESTION');
CREATE TYPE "ClientActionRequestStatus" AS ENUM ('DRAFT','PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED');
CREATE TYPE "ClientSafeUpdateCategory" AS ENUM ('STATUS','DEADLINE','DOCUMENT','ACTION_REQUIRED','GENERAL');
CREATE TYPE "ClientSafeUpdateStatus" AS ENUM ('DRAFT','APPROVED','PUBLISHED','REVOKED');
CREATE TYPE "ClientPublicationEventAction" AS ENUM ('GRANT_INVITED','GRANT_ACTIVATED','GRANT_SUSPENDED','GRANT_REVOKED','GRANT_EXPIRED','DRAFT_CREATED','DRAFT_UPDATED','SUBMITTED_FOR_APPROVAL','APPROVED','PUBLISHED','REVOKED','SUPERSEDED','ACTION_REQUEST_PUBLISHED','ACTION_REQUEST_CANCELLED');

CREATE TABLE "client_portal_grants" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientUserId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "role" "ClientPortalGrantRole" NOT NULL DEFAULT 'VIEWER',
  "status" "ClientPortalGrantStatus" NOT NULL DEFAULT 'INVITED',
  "permissions" "ClientPortalPermission"[] NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "invitedById" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "suspendedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revocationReasonSafe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_portal_grants_permissions_not_empty" CHECK (cardinality("permissions") > 0),
  CONSTRAINT "client_portal_grants_reason_len" CHECK (char_length(coalesce("revocationReasonSafe", '')) <= 500)
);

CREATE TABLE "client_matter_publications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "status" "ClientPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "currentRevisionId" TEXT,
  "preparedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "publishedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "supersededAt" TIMESTAMP(3),
  "supersededById" TEXT,
  "supersedesId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "client_matter_publication_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicationId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "clientSafeTitle" TEXT NOT NULL,
  "clientSafeStatus" TEXT NOT NULL,
  "clientSafeNextStep" TEXT,
  "responsibleLawyerDisplay" TEXT,
  "publishedDeadlinesSnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "safeUpdatesSnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "actionRequestsSnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sourceCaseRevision" INTEGER,
  "sourceFingerprint" TEXT NOT NULL,
  "audienceSnapshot" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_matter_revision_title_len" CHECK (char_length("clientSafeTitle") BETWEEN 1 AND 240),
  CONSTRAINT "client_matter_revision_status_len" CHECK (char_length("clientSafeStatus") BETWEEN 1 AND 240),
  CONSTRAINT "client_matter_revision_next_len" CHECK (char_length(coalesce("clientSafeNextStep", '')) <= 1000)
);

CREATE TABLE "client_document_publications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "status" "ClientPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "clientFacingTitle" TEXT NOT NULL,
  "clientFacingExplanation" TEXT,
  "preparedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "publishedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revocationReasonSafe" TEXT,
  "supersededAt" TIMESTAMP(3),
  "supersededById" TEXT,
  "supersedesId" TEXT,
  "audienceSnapshot" JSONB NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "approvalReviewId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_document_title_len" CHECK (char_length("clientFacingTitle") BETWEEN 1 AND 240),
  CONSTRAINT "client_document_explanation_len" CHECK (char_length(coalesce("clientFacingExplanation", '')) <= 2000),
  CONSTRAINT "client_document_revoke_reason_len" CHECK (char_length(coalesce("revocationReasonSafe", '')) <= 500)
);

CREATE TABLE "client_action_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "type" "ClientActionRequestType" NOT NULL,
  "clientSafeTitle" TEXT NOT NULL,
  "clientSafeInstructions" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" "ClientActionRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "linkedInternalTaskId" TEXT,
  "audienceSnapshot" JSONB NOT NULL,
  "preparedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "publishedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "completionSummarySafe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_action_title_len" CHECK (char_length("clientSafeTitle") BETWEEN 1 AND 240),
  CONSTRAINT "client_action_instructions_len" CHECK (char_length(coalesce("clientSafeInstructions", '')) <= 2000),
  CONSTRAINT "client_action_completion_len" CHECK (char_length(coalesce("completionSummarySafe", '')) <= 1000)
);

CREATE TABLE "client_safe_updates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" "ClientSafeUpdateCategory" NOT NULL,
  "status" "ClientSafeUpdateStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceInternalEventType" TEXT,
  "sourceInternalEventId" TEXT,
  "audienceSnapshot" JSONB NOT NULL,
  "preparedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_update_title_len" CHECK (char_length("title") BETWEEN 1 AND 240),
  CONSTRAINT "client_update_body_len" CHECK (char_length("body") BETWEEN 1 AND 3000)
);

CREATE TABLE "client_publication_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "action" "ClientPublicationEventAction" NOT NULL,
  "actorId" TEXT NOT NULL,
  "caseId" TEXT,
  "clientId" TEXT,
  "grantId" TEXT,
  "matterPublicationId" TEXT,
  "documentPublicationId" TEXT,
  "actionRequestId" TEXT,
  "safeUpdateId" TEXT,
  "documentVersionId" TEXT,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "metadataSafe" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_matter_publications" ADD CONSTRAINT "client_matter_publications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_document_publications" ADD CONSTRAINT "client_document_publications_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_document_publications" ADD CONSTRAINT "client_document_publications_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_action_requests" ADD CONSTRAINT "client_action_requests_task_fkey" FOREIGN KEY ("linkedInternalTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "client_portal_one_active_grant_idx" ON "client_portal_grants" ("clientUserId", "clientId", "caseId") WHERE "status" = 'ACTIVE';
CREATE INDEX "client_portal_grants_client_case_status_idx" ON "client_portal_grants" ("clientId", "caseId", "status");
CREATE INDEX "client_portal_grants_user_status_idx" ON "client_portal_grants" ("clientUserId", "status");
CREATE UNIQUE INDEX "client_matter_revision_unique_idx" ON "client_matter_publication_revisions" ("publicationId", "revisionNumber");
CREATE INDEX "client_matter_publications_case_status_idx" ON "client_matter_publications" ("caseId", "status");
CREATE INDEX "client_matter_publications_client_status_idx" ON "client_matter_publications" ("clientId", "status");
CREATE UNIQUE INDEX "client_matter_one_current_published_idx" ON "client_matter_publications" ("caseId", "clientId") WHERE "status" = 'PUBLISHED';
CREATE INDEX "client_document_publications_case_status_idx" ON "client_document_publications" ("caseId", "status");
CREATE INDEX "client_document_publications_doc_status_idx" ON "client_document_publications" ("documentId", "status");
CREATE INDEX "client_document_publications_version_idx" ON "client_document_publications" ("documentVersionId");
CREATE UNIQUE INDEX "client_document_one_current_published_idx" ON "client_document_publications" ("documentId", "clientId") WHERE "status" = 'PUBLISHED';
CREATE INDEX "client_action_requests_case_status_idx" ON "client_action_requests" ("caseId", "status");
CREATE INDEX "client_action_requests_client_status_idx" ON "client_action_requests" ("clientId", "status");
CREATE INDEX "client_safe_updates_case_status_idx" ON "client_safe_updates" ("caseId", "status");
CREATE INDEX "client_publication_events_case_created_idx" ON "client_publication_events" ("caseId", "createdAt");
CREATE INDEX "client_publication_events_grant_idx" ON "client_publication_events" ("grantId");
CREATE INDEX "client_publication_events_matter_idx" ON "client_publication_events" ("matterPublicationId");
CREATE INDEX "client_publication_events_document_idx" ON "client_publication_events" ("documentPublicationId");

CREATE OR REPLACE FUNCTION client_publication_validate_case_client() RETURNS trigger AS $$
DECLARE expected_client TEXT;
BEGIN
  SELECT "clientId" INTO expected_client FROM "cases" WHERE "id" = NEW."caseId";
  IF expected_client IS NULL OR expected_client <> NEW."clientId" THEN
    RAISE EXCEPTION 'client publication case/client mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION client_document_publication_validate() RETURNS trigger AS $$
DECLARE expected_client TEXT;
DECLARE expected_doc_case TEXT;
DECLARE expected_version_doc TEXT;
BEGIN
  SELECT "clientId" INTO expected_client FROM "cases" WHERE "id" = NEW."caseId";
  SELECT "caseId" INTO expected_doc_case FROM "documents" WHERE "id" = NEW."documentId";
  SELECT "documentId" INTO expected_version_doc FROM "document_versions" WHERE "id" = NEW."documentVersionId";
  IF expected_client IS NULL OR expected_client <> NEW."clientId" THEN
    RAISE EXCEPTION 'client publication case/client mismatch';
  END IF;
  IF expected_doc_case IS NULL OR expected_doc_case <> NEW."caseId" OR expected_version_doc IS NULL OR expected_version_doc <> NEW."documentId" THEN
    RAISE EXCEPTION 'client document publication source mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION client_action_request_validate() RETURNS trigger AS $$
DECLARE expected_client TEXT;
DECLARE expected_task_case TEXT;
BEGIN
  SELECT "clientId" INTO expected_client FROM "cases" WHERE "id" = NEW."caseId";
  IF expected_client IS NULL OR expected_client <> NEW."clientId" THEN
    RAISE EXCEPTION 'client publication case/client mismatch';
  END IF;
  IF NEW."linkedInternalTaskId" IS NOT NULL THEN
    SELECT "caseId" INTO expected_task_case FROM "tasks" WHERE "id" = NEW."linkedInternalTaskId";
    IF expected_task_case IS NULL OR expected_task_case <> NEW."caseId" THEN
      RAISE EXCEPTION 'client action request task scope mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION client_portal_validate_grant() RETURNS trigger AS $$
DECLARE expected_client TEXT;
DECLARE user_role TEXT;
BEGIN
  SELECT "clientId" INTO expected_client FROM "cases" WHERE "id" = NEW."caseId";
  SELECT "role"::text INTO user_role FROM "users" WHERE "id" = NEW."clientUserId";
  IF expected_client IS NULL OR expected_client <> NEW."clientId" THEN
    RAISE EXCEPTION 'client portal grant case/client mismatch';
  END IF;
  IF user_role <> 'CLIENT' THEN
    RAISE EXCEPTION 'client portal grant user must be CLIENT role';
  END IF;
  IF NEW."validUntil" IS NOT NULL AND NEW."validUntil" <= NEW."validFrom" THEN
    RAISE EXCEPTION 'client portal grant invalid validity window';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION client_publication_revision_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION 'client publication revisions are immutable';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_portal_grants_validate BEFORE INSERT OR UPDATE ON "client_portal_grants" FOR EACH ROW EXECUTE FUNCTION client_portal_validate_grant();
CREATE TRIGGER client_matter_publications_validate BEFORE INSERT OR UPDATE ON "client_matter_publications" FOR EACH ROW EXECUTE FUNCTION client_publication_validate_case_client();
CREATE TRIGGER client_document_publications_validate BEFORE INSERT OR UPDATE ON "client_document_publications" FOR EACH ROW EXECUTE FUNCTION client_document_publication_validate();
CREATE TRIGGER client_action_requests_validate BEFORE INSERT OR UPDATE ON "client_action_requests" FOR EACH ROW EXECUTE FUNCTION client_action_request_validate();
CREATE TRIGGER client_safe_updates_validate BEFORE INSERT OR UPDATE ON "client_safe_updates" FOR EACH ROW EXECUTE FUNCTION client_publication_validate_case_client();
CREATE TRIGGER client_matter_revisions_immutable BEFORE UPDATE ON "client_matter_publication_revisions" FOR EACH ROW EXECUTE FUNCTION client_publication_revision_immutable();
