-- CreateEnum
CREATE TYPE "ClientRequestType" AS ENUM ('DOCUMENT_UPLOAD', 'INFORMATION_REQUEST', 'DATA_FORM', 'QUESTION_RESPONSE', 'CORRECTION_REQUEST', 'MISSING_DOCUMENT_REQUEST');

-- CreateEnum
CREATE TYPE "ClientRequestStatus" AS ENUM ('DRAFT', 'READY_TO_PUBLISH', 'PUBLISHED', 'PARTIALLY_SUBMITTED', 'SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClientFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'DATE', 'NUMBER', 'EMAIL', 'PHONE', 'ADDRESS', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO');

-- CreateEnum
CREATE TYPE "ClientQuestionThreadStatus" AS ENUM ('OPEN', 'INTERNAL_REVIEW', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClientQuestionAuthorType" AS ENUM ('CLIENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ClientSubmissionStatus" AS ENUM ('DRAFT', 'UPLOADING', 'SUBMITTED', 'SCANNING', 'RECEIVED', 'UNDER_INTERNAL_REVIEW', 'ACCEPTED_INTO_MATTER', 'CORRECTION_REQUESTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClientSubmissionFileStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'SCANNING', 'CLEAN', 'UNSUPPORTED', 'INFECTED', 'SCAN_FAILED', 'REJECTED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ClientNotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED');

-- CreateTable
CREATE TABLE "client_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assignedInternalUserId" TEXT,
    "type" "ClientRequestType" NOT NULL,
    "status" "ClientRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "clientSafeTitle" TEXT NOT NULL,
    "clientSafeInstructions" TEXT,
    "dueAt" TIMESTAMP(3),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "documentSpec" JSONB,
    "audienceSnapshot" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_request_fields" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientSafeLabel" TEXT NOT NULL,
    "helpTextSafe" TEXT,
    "type" "ClientFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxLength" INTEGER,
    "options" JSONB,
    "dataCategory" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_request_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_question_threads" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientPortalIdentityId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ClientQuestionThreadStatus" NOT NULL DEFAULT 'OPEN',
    "assignedInternalUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_question_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_question_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorType" "ClientQuestionAuthorType" NOT NULL,
    "clientPortalIdentityId" TEXT,
    "internalUserId" TEXT,
    "bodySafe" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_question_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submissions" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientPortalIdentityId" TEXT NOT NULL,
    "status" "ClientSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "customerNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "correctionReasonSafe" TEXT,
    "rejectionReasonSafe" TEXT,
    "acceptedDocumentId" TEXT,
    "acceptedDocumentVersionId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submission_files" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "originalFileNameSafe" TEXT NOT NULL,
    "declaredMimeType" TEXT,
    "detectedMimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "storageProvider" TEXT,
    "quarantineStorageReference" TEXT,
    "status" "ClientSubmissionFileStatus" NOT NULL DEFAULT 'UPLOADING',
    "pageOrSideLabel" TEXT,
    "previewDerivativeReference" TEXT,
    "scanProvider" TEXT,
    "scanCodeSafe" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_submission_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submission_fields" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fieldId" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "valueSafe" TEXT,
    "dataCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_submission_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_notification_deliveries" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recipientSnapshot" JSONB NOT NULL,
    "subjectSafe" TEXT NOT NULL,
    "templateId" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ClientNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCodeSafe" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_requests_caseId_status_idx" ON "client_requests"("caseId", "status");

-- CreateIndex
CREATE INDEX "client_requests_clientId_status_idx" ON "client_requests"("clientId", "status");

-- CreateIndex
CREATE INDEX "client_requests_status_dueAt_idx" ON "client_requests"("status", "dueAt");

-- CreateIndex
CREATE INDEX "client_request_fields_requestId_displayOrder_idx" ON "client_request_fields"("requestId", "displayOrder");

-- CreateIndex
CREATE INDEX "client_question_threads_caseId_status_idx" ON "client_question_threads"("caseId", "status");

-- CreateIndex
CREATE INDEX "client_question_threads_clientPortalIdentityId_status_idx" ON "client_question_threads"("clientPortalIdentityId", "status");

-- CreateIndex
CREATE INDEX "client_question_messages_threadId_createdAt_idx" ON "client_question_messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_clientRequestId_status_idx" ON "client_submissions"("clientRequestId", "status");

-- CreateIndex
CREATE INDEX "client_submissions_caseId_status_idx" ON "client_submissions"("caseId", "status");

-- CreateIndex
CREATE INDEX "client_submissions_clientPortalIdentityId_status_idx" ON "client_submissions"("clientPortalIdentityId", "status");

-- CreateIndex
CREATE INDEX "client_submission_files_submissionId_status_idx" ON "client_submission_files"("submissionId", "status");

-- CreateIndex
CREATE INDEX "client_submission_files_status_idx" ON "client_submission_files"("status");

-- CreateIndex
CREATE INDEX "client_submission_fields_submissionId_idx" ON "client_submission_fields"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "client_notification_deliveries_idempotencyKey_key" ON "client_notification_deliveries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "client_notification_deliveries_status_nextAttemptAt_idx" ON "client_notification_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "client_notification_deliveries_caseId_idx" ON "client_notification_deliveries"("caseId");

-- CreateIndex
CREATE INDEX "client_notification_deliveries_clientId_idx" ON "client_notification_deliveries"("clientId");

-- AddForeignKey
ALTER TABLE "client_request_fields" ADD CONSTRAINT "client_request_fields_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "client_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_messages" ADD CONSTRAINT "client_question_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "client_question_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "client_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_files" ADD CONSTRAINT "client_submission_files_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "client_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_fields" ADD CONSTRAINT "client_submission_fields_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "client_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_assignedInternalUserId_fkey" FOREIGN KEY ("assignedInternalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_threads" ADD CONSTRAINT "client_question_threads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_threads" ADD CONSTRAINT "client_question_threads_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_threads" ADD CONSTRAINT "client_question_threads_clientPortalIdentityId_fkey" FOREIGN KEY ("clientPortalIdentityId") REFERENCES "client_portal_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_threads" ADD CONSTRAINT "client_question_threads_assignedInternalUserId_fkey" FOREIGN KEY ("assignedInternalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_messages" ADD CONSTRAINT "client_question_messages_clientPortalIdentityId_fkey" FOREIGN KEY ("clientPortalIdentityId") REFERENCES "client_portal_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question_messages" ADD CONSTRAINT "client_question_messages_internalUserId_fkey" FOREIGN KEY ("internalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientPortalIdentityId_fkey" FOREIGN KEY ("clientPortalIdentityId") REFERENCES "client_portal_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_acceptedDocumentId_fkey" FOREIGN KEY ("acceptedDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_acceptedDocumentVersionId_fkey" FOREIGN KEY ("acceptedDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_fields" ADD CONSTRAINT "client_submission_fields_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "client_request_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notification_deliveries" ADD CONSTRAINT "client_notification_deliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notification_deliveries" ADD CONSTRAINT "client_notification_deliveries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
