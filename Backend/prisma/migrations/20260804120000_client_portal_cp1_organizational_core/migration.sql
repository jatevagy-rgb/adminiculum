-- CreateEnum
CREATE TYPE "ClientPortalParticipantRole" AS ENUM ('REQUESTER', 'CLIENT_OWNER', 'PARTICIPANT', 'OBSERVER');

-- CreateEnum
CREATE TYPE "ClientPortalSummaryScopeType" AS ENUM ('UNIT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ClientPortalSummaryScopeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ClientPortalIntakeUrgency" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ClientPortalIntakeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'TRIAGE_IN_PROGRESS', 'MORE_INFORMATION_REQUIRED', 'LINKED_TO_EXISTING_CASE', 'CONVERTED_TO_CASE', 'DECLINED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClientPortalCommunicationCategory" AS ENUM ('GENERAL', 'DOCUMENT_REQUEST', 'QUESTION', 'DECISION_REQUIRED', 'FEEDBACK_REQUIRED', 'DELIVERY', 'BILLING_QUESTION');

-- CreateEnum
CREATE TYPE "ClientDocumentPublicationVisibility" AS ENUM ('WORKSPACE', 'SELECTED_PARTICIPANTS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClientPortalPermission" ADD VALUE 'MESSAGE_READ';
ALTER TYPE "ClientPortalPermission" ADD VALUE 'MESSAGE_SEND';
ALTER TYPE "ClientPortalPermission" ADD VALUE 'DOCUMENT_UPLOAD';
ALTER TYPE "ClientPortalPermission" ADD VALUE 'CLIENT_TIMELINE_READ';
ALTER TYPE "ClientPortalPermission" ADD VALUE 'HOURS_READ';
ALTER TYPE "ClientPortalPermission" ADD VALUE 'BILLING_STATEMENT_READ';

-- AlterTable
ALTER TABLE "client_portal_grants" ADD COLUMN     "isRequester" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "participantRole" "ClientPortalParticipantRole";

-- AlterTable
ALTER TABLE "client_organization_groups" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "client_document_publications" ADD COLUMN     "visibility" "ClientDocumentPublicationVisibility" NOT NULL DEFAULT 'WORKSPACE',
ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "client_question_threads" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "category" "ClientPortalCommunicationCategory" NOT NULL DEFAULT 'QUESTION',
ADD COLUMN     "createdByMembershipId" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "client_portal_summary_scopes" (
    "id" TEXT NOT NULL,
    "workspaceMembershipId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationGroupId" TEXT,
    "scopeType" "ClientPortalSummaryScopeType" NOT NULL,
    "status" "ClientPortalSummaryScopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "canViewCaseCounts" BOOLEAN NOT NULL DEFAULT true,
    "canViewStageCounts" BOOLEAN NOT NULL DEFAULT true,
    "canViewDeadlineCounts" BOOLEAN NOT NULL DEFAULT true,
    "canViewPublishedHours" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "suspendedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "client_portal_summary_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_intake_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requesterMembershipId" TEXT NOT NULL,
    "organizationGroupId" TEXT,
    "subject" TEXT NOT NULL,
    "descriptionSafe" TEXT NOT NULL,
    "urgency" "ClientPortalIntakeUrgency" NOT NULL DEFAULT 'NORMAL',
    "requestedDeadline" TIMESTAMP(3),
    "status" "ClientPortalIntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "linkedCaseId" TEXT,
    "internalTriageNote" TEXT,
    "triagedByInternalUserId" TEXT,
    "customerResponseSafe" TEXT,
    "submittedAt" TIMESTAMP(3),
    "triagedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_intake_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_intake_attachments" (
    "id" TEXT NOT NULL,
    "intakeRequestId" TEXT NOT NULL,
    "originalFileNameSafe" TEXT NOT NULL,
    "declaredMimeType" TEXT,
    "detectedMimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "storageProvider" TEXT,
    "quarantineStorageReference" TEXT,
    "status" "ClientSubmissionFileStatus" NOT NULL DEFAULT 'UPLOADING',
    "scanProvider" TEXT,
    "scanCodeSafe" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_portal_intake_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_document_publication_recipients" (
    "id" TEXT NOT NULL,
    "documentPublicationId" TEXT NOT NULL,
    "workspaceMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_document_publication_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_question_thread_participants" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "workspaceMembershipId" TEXT NOT NULL,
    "participantRole" "ClientPortalParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_question_thread_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_question_thread_read_states" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "workspaceMembershipId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_question_thread_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_question_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "submissionFileId" TEXT,
    "clientFacingTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_question_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_portal_summary_scopes_workspaceId_status_idx" ON "client_portal_summary_scopes"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "client_portal_summary_scopes_organizationGroupId_status_idx" ON "client_portal_summary_scopes"("organizationGroupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_summary_scopes_workspaceMembershipId_scopeTyp_key" ON "client_portal_summary_scopes"("workspaceMembershipId", "scopeType", "organizationGroupId");

-- CreateIndex
CREATE INDEX "client_portal_intake_requests_workspaceId_status_idx" ON "client_portal_intake_requests"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "client_portal_intake_requests_requesterMembershipId_status_idx" ON "client_portal_intake_requests"("requesterMembershipId", "status");

-- CreateIndex
CREATE INDEX "client_portal_intake_requests_organizationGroupId_status_idx" ON "client_portal_intake_requests"("organizationGroupId", "status");

-- CreateIndex
CREATE INDEX "client_portal_intake_requests_linkedCaseId_idx" ON "client_portal_intake_requests"("linkedCaseId");

-- CreateIndex
CREATE INDEX "client_portal_intake_attachments_intakeRequestId_status_idx" ON "client_portal_intake_attachments"("intakeRequestId", "status");

-- CreateIndex
CREATE INDEX "client_document_publication_recipients_workspaceMembershipI_idx" ON "client_document_publication_recipients"("workspaceMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "client_document_publication_recipients_documentPublicationI_key" ON "client_document_publication_recipients"("documentPublicationId", "workspaceMembershipId");

-- CreateIndex
CREATE INDEX "client_question_thread_participants_workspaceMembershipId_idx" ON "client_question_thread_participants"("workspaceMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "client_question_thread_participants_threadId_workspaceMembe_key" ON "client_question_thread_participants"("threadId", "workspaceMembershipId");

-- CreateIndex
CREATE INDEX "client_question_thread_read_states_workspaceMembershipId_idx" ON "client_question_thread_read_states"("workspaceMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "client_question_thread_read_states_threadId_workspaceMember_key" ON "client_question_thread_read_states"("threadId", "workspaceMembershipId");

-- CreateIndex
CREATE INDEX "client_question_message_attachments_messageId_idx" ON "client_question_message_attachments"("messageId");

-- CreateIndex
CREATE INDEX "client_organization_groups_workspaceId_status_idx" ON "client_organization_groups"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "client_document_publications_workspaceId_status_idx" ON "client_document_publications"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "client_question_threads_workspaceId_status_idx" ON "client_question_threads"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "client_portal_intake_attachments" ADD CONSTRAINT "client_portal_intake_attachments_intakeRequestId_fkey" FOREIGN KEY ("intakeRequestId") REFERENCES "client_portal_intake_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_document_publication_recipients" ADD CONSTRAINT "client_document_publication_recipients_documentPublication_fkey" FOREIGN KEY ("documentPublicationId") REFERENCES "client_document_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_thread_participants" ADD CONSTRAINT "client_question_thread_participants_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "client_question_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_thread_read_states" ADD CONSTRAINT "client_question_thread_read_states_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "client_question_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_message_attachments" ADD CONSTRAINT "client_question_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "client_question_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- CP1 conservative backfill (additive, deny-by-default).
-- Existing active portal identity grants receive PARTICIPANT compatibility only.
-- No REQUESTER/CLIENT_OWNER is inferred; no permission is broadened; isRequester
-- stays false. Organization groups remain unlinked (workspaceId NULL). No summary
-- scope, intake, publication broadening, or communication participant is created.
-- ============================================================================
UPDATE "client_portal_grants"
SET "participantRole" = 'PARTICIPANT'
WHERE "participantRole" IS NULL
  AND "clientPortalIdentityId" IS NOT NULL;
