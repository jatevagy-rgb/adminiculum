-- CreateEnum
CREATE TYPE "ClientPortalUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ClientPortalMembershipRole" AS ENUM ('REQUESTER', 'TEAM_LEAD', 'CLIENT_MANAGER', 'CLIENT_ADMIN');

-- CreateEnum
CREATE TYPE "ClientPortalMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ClientVisibleArtifactType" AS ENUM ('REQUEST', 'STATUS', 'TIMELINE_ITEM', 'TODO', 'DOCUMENT_REQUEST', 'DOCUMENT_VERSION', 'MESSAGE', 'DEADLINE', 'REPORT_SNAPSHOT', 'CONNECTOR_LINK', 'INTEGRATION_AUDIT_ITEM');

-- CreateEnum
CREATE TYPE "ClientVisibleArtifactStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REVOKED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ClientVisibleSourceType" AS ENUM ('CASE', 'TASK', 'DOCUMENT', 'DOCUMENT_VERSION', 'COMMUNICATION', 'TIME_REPORT', 'CONNECTOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClientPortalGrantAction" AS ENUM ('READ', 'DOWNLOAD', 'UPLOAD', 'COMMENT', 'MANAGE', 'VIEW_REPORT', 'VIEW_INTEGRATION');

-- CreateEnum
CREATE TYPE "ClientPortalGrantScope" AS ENUM ('CLIENT', 'TEAM', 'ROLE', 'MEMBERSHIP', 'REQUESTER_OWN');

-- CreateEnum
CREATE TYPE "ClientPortalGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClientSubmissionType" AS ENUM ('NEW_REQUEST', 'MESSAGE', 'DOCUMENT_UPLOAD', 'CLARIFICATION', 'PROFILE_ADMIN', 'INTEGRATION_ADMIN');

-- CreateEnum
CREATE TYPE "ClientSubmissionStatus" AS ENUM ('SUBMITTED', 'IN_TRIAGE', 'ACCEPTED_INTERNAL', 'NEEDS_CLARIFICATION', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClientSubmissionAttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClientSubmissionAttachmentStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientPortalActorType" AS ENUM ('CLIENT_PORTAL_USER', 'INTERNAL_USER', 'SYSTEM', 'CONNECTOR');

-- CreateEnum
CREATE TYPE "ClientPortalAuditAction" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'WORKSPACE_SELECTED', 'ARTIFACT_READ', 'ARTIFACT_DOWNLOADED', 'SUBMISSION_CREATED', 'ATTACHMENT_UPLOADED', 'ARTIFACT_PROPOSED', 'ARTIFACT_APPROVED', 'ARTIFACT_PUBLISHED', 'ARTIFACT_REVOKED', 'GRANT_CREATED', 'GRANT_REVOKED', 'MEMBERSHIP_INVITED', 'MEMBERSHIP_UPDATED', 'MEMBERSHIP_REVOKED');

-- CreateEnum
CREATE TYPE "ClientPortalAuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- CreateTable
CREATE TABLE "client_portal_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'password',
    "externalSubjectId" TEXT,
    "status" "ClientPortalUserStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMP(3),
    "acceptedTermsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_memberships" (
    "id" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "ClientPortalMembershipRole" NOT NULL,
    "status" "ClientPortalMembershipStatus" NOT NULL DEFAULT 'INVITED',
    "teamScopeType" TEXT,
    "teamScopeId" TEXT,
    "teamDisplayName" TEXT,
    "invitedByInternalUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_visible_artifacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "artifactType" "ClientVisibleArtifactType" NOT NULL,
    "status" "ClientVisibleArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceType" "ClientVisibleSourceType",
    "sourceId" TEXT,
    "sourceCaseId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceTaskId" TEXT,
    "sourceCommunicationId" TEXT,
    "proposedByInternalUserId" TEXT,
    "approvedByInternalUserId" TEXT,
    "publishedByInternalUserId" TEXT,
    "proposedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_visible_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_grants" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "action" "ClientPortalGrantAction" NOT NULL DEFAULT 'READ',
    "scopeType" "ClientPortalGrantScope" NOT NULL,
    "status" "ClientPortalGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "ClientPortalMembershipRole",
    "membershipId" TEXT,
    "teamScopeType" TEXT,
    "teamScopeId" TEXT,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "grantedByInternalUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submissions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "submissionType" "ClientSubmissionType" NOT NULL,
    "status" "ClientSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT,
    "body" TEXT,
    "payload" JSONB,
    "targetArtifactId" TEXT,
    "targetRequestArtifactId" TEXT,
    "idempotencyKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "triagedByInternalUserId" TEXT,
    "triagedAt" TIMESTAMP(3),
    "linkedCaseId" TEXT,
    "linkedTaskId" TEXT,
    "linkedDocumentId" TEXT,
    "linkedCommunicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submission_attachments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "safeFileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "storageRef" TEXT,
    "scanStatus" "ClientSubmissionAttachmentScanStatus" NOT NULL DEFAULT 'PENDING',
    "status" "ClientSubmissionAttachmentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedDocumentId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_audit_events" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "actorType" "ClientPortalActorType" NOT NULL,
    "actorClientPortalUserId" TEXT,
    "actorMembershipId" TEXT,
    "actorInternalUserId" TEXT,
    "action" "ClientPortalAuditAction" NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "artifactId" TEXT,
    "submissionId" TEXT,
    "outcome" "ClientPortalAuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_portal_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_portal_users_status_idx" ON "client_portal_users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_users_email_provider_key" ON "client_portal_users"("emailNormalized", "authProvider");

-- CreateIndex
CREATE INDEX "client_portal_memberships_user_status_idx" ON "client_portal_memberships"("clientPortalUserId", "status");

-- CreateIndex
CREATE INDEX "client_portal_memberships_client_status_idx" ON "client_portal_memberships"("clientId", "status");

-- CreateIndex
CREATE INDEX "client_portal_memberships_client_role_idx" ON "client_portal_memberships"("clientId", "role");

-- CreateIndex
CREATE INDEX "client_portal_memberships_team_scope_idx" ON "client_portal_memberships"("clientId", "teamScopeType", "teamScopeId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_client_type_status_idx" ON "client_visible_artifacts"("clientId", "artifactType", "status");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_client_status_published_idx" ON "client_visible_artifacts"("clientId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_idx" ON "client_visible_artifacts"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_case_idx" ON "client_visible_artifacts"("sourceCaseId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_document_idx" ON "client_visible_artifacts"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_task_idx" ON "client_visible_artifacts"("sourceTaskId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_communication_idx" ON "client_visible_artifacts"("sourceCommunicationId");

-- CreateIndex
CREATE INDEX "client_portal_grants_client_artifact_action_idx" ON "client_portal_grants"("clientId", "artifactId", "action");

-- CreateIndex
CREATE INDEX "client_portal_grants_client_scope_action_idx" ON "client_portal_grants"("clientId", "scopeType", "action");

-- CreateIndex
CREATE INDEX "client_portal_grants_membership_action_idx" ON "client_portal_grants"("membershipId", "action");

-- CreateIndex
CREATE INDEX "client_portal_grants_team_scope_idx" ON "client_portal_grants"("clientId", "teamScopeType", "teamScopeId");

-- CreateIndex
CREATE INDEX "client_submissions_client_status_created_idx" ON "client_submissions"("clientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_user_created_idx" ON "client_submissions"("clientPortalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_membership_created_idx" ON "client_submissions"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_target_artifact_idx" ON "client_submissions"("targetArtifactId");

-- CreateIndex
CREATE INDEX "client_submissions_target_request_artifact_idx" ON "client_submissions"("targetRequestArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "client_submissions_client_idempotency_key" ON "client_submissions"("clientId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "client_submission_attachments_client_uploaded_idx" ON "client_submission_attachments"("clientId", "uploadedAt");

-- CreateIndex
CREATE INDEX "client_submission_attachments_submission_idx" ON "client_submission_attachments"("submissionId");

-- CreateIndex
CREATE INDEX "client_submission_attachments_document_idx" ON "client_submission_attachments"("acceptedDocumentId");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_client_created_idx" ON "client_portal_audit_events"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_portal_actor_idx" ON "client_portal_audit_events"("actorType", "actorClientPortalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_internal_actor_idx" ON "client_portal_audit_events"("actorInternalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_resource_idx" ON "client_portal_audit_events"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_artifact_idx" ON "client_portal_audit_events"("artifactId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_submission_idx" ON "client_portal_audit_events"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "client_portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visible_artifacts" ADD CONSTRAINT "client_visible_artifacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "client_portal_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "client_portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "client_portal_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_targetArtifactId_fkey" FOREIGN KEY ("targetArtifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_targetRequestArtifactId_fkey" FOREIGN KEY ("targetRequestArtifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_attachments" ADD CONSTRAINT "client_submission_attachments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_attachments" ADD CONSTRAINT "client_submission_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "client_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_actorClientPortalUserId_fkey" FOREIGN KEY ("actorClientPortalUserId") REFERENCES "client_portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "client_portal_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "client_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
