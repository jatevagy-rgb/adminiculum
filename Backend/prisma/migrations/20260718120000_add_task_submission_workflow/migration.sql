-- Additive task submission workflow foundation.
-- No existing row is updated or backfilled. Existing TaskStatus values remain unchanged.

-- CreateEnum
CREATE TYPE "TaskSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewAttentionLevel" AS ENUM ('QUICK_SCAN', 'APPROVAL', 'SIGNATURE', 'EDITING', 'DETAILED_REVIEW');

-- CreateEnum
CREATE TYPE "TaskReviewDecisionType" AS ENUM ('APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "TaskSubmissionDocumentRole" AS ENUM ('PRIMARY_OUTPUT', 'SUPPORTING_DOCUMENT', 'REVIEW_REFERENCE', 'FINAL_OUTPUT');

-- CreateEnum
CREATE TYPE "ExternalActionType" AS ENUM ('CLIENT_SEND', 'SIGNATURE', 'COURT_FILING', 'AUTHORITY_SUBMISSION', 'OTHER');

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN "taskId" TEXT;

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "TaskSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "assignedReviewerId" TEXT NOT NULL,
    "workSummary" TEXT,
    "remainingIssues" TEXT,
    "reviewerNote" TEXT,
    "requestedAttention" "ReviewAttentionLevel",
    "externalActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "externalActionType" "ExternalActionType",
    "zeroTimeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "zeroTimeConfirmedById" TEXT,
    "zeroTimeConfirmedAt" TIMESTAMP(3),
    "externalCompletedById" TEXT,
    "idempotencyKey" TEXT,
    "supersedesSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "externalCompletedAt" TIMESTAMP(3),

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_submissions_revisionNumber_check" CHECK ("revisionNumber" > 0),
    CONSTRAINT "task_submissions_not_self_superseding_check" CHECK ("supersedesSubmissionId" IS NULL OR "supersedesSubmissionId" <> "id"),
    CONSTRAINT "task_submissions_not_self_reviewing_check" CHECK ("submittedById" IS NULL OR "submittedById" <> "assignedReviewerId"),
    CONSTRAINT "task_submissions_submitted_fields_check" CHECK (
        "status" IN ('DRAFT', 'CANCELLED') OR
        ("submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "requestedAttention" IS NOT NULL)
    ),
    CONSTRAINT "task_submissions_returned_timestamp_check" CHECK ("status" <> 'RETURNED' OR "returnedAt" IS NOT NULL),
    CONSTRAINT "task_submissions_approved_timestamp_check" CHECK ("status" <> 'APPROVED' OR "approvedAt" IS NOT NULL),
    CONSTRAINT "task_submissions_superseded_timestamp_check" CHECK ("status" <> 'SUPERSEDED' OR "supersededAt" IS NOT NULL),
    CONSTRAINT "task_submissions_zero_time_confirmation_check" CHECK (
        ("zeroTimeConfirmed" = false AND "zeroTimeConfirmedById" IS NULL AND "zeroTimeConfirmedAt" IS NULL) OR
        ("zeroTimeConfirmed" = true AND "zeroTimeConfirmedById" IS NOT NULL AND "zeroTimeConfirmedAt" IS NOT NULL)
    ),
    CONSTRAINT "task_submissions_external_action_check" CHECK (
        ("externalActionRequired" = false AND "externalActionType" IS NULL) OR
        ("externalActionRequired" = true AND "externalActionType" IS NOT NULL)
    ),
    CONSTRAINT "task_submissions_external_completion_check" CHECK (
        ("externalCompletedAt" IS NULL AND "externalCompletedById" IS NULL) OR
        ("externalCompletedAt" IS NOT NULL AND "externalCompletedById" IS NOT NULL AND "externalActionRequired" = true)
    )
);

-- CreateTable
CREATE TABLE "task_submission_documents" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT,
    "role" "TaskSubmissionDocumentRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "task_submission_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_review_decisions" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "TaskReviewDecisionType" NOT NULL,
    "note" TEXT,
    "requestedCorrections" TEXT,
    "requiresFullReview" BOOLEAN NOT NULL DEFAULT false,
    "correctionDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_review_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_review_decisions_return_corrections_check" CHECK (
        "decision" <> 'RETURNED' OR NULLIF(BTRIM("requestedCorrections"), '') IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "task_submission_time_entries" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_submission_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_idempotencyKey_key" ON "task_submissions"("idempotencyKey");
CREATE UNIQUE INDEX "task_submissions_supersedesSubmissionId_key" ON "task_submissions"("supersedesSubmissionId");
CREATE INDEX "task_submissions_taskId_status_idx" ON "task_submissions"("taskId", "status");
CREATE INDEX "task_submissions_assignedReviewerId_status_submittedAt_idx" ON "task_submissions"("assignedReviewerId", "status", "submittedAt");
CREATE INDEX "task_submissions_submittedById_status_submittedAt_idx" ON "task_submissions"("submittedById", "status", "submittedAt");
CREATE INDEX "task_submissions_taskId_createdAt_idx" ON "task_submissions"("taskId", "createdAt");
CREATE UNIQUE INDEX "task_submissions_taskId_revisionNumber_key" ON "task_submissions"("taskId", "revisionNumber");

-- Prisma cannot express a partial unique index. This enforces one active draft per task.
CREATE UNIQUE INDEX IF NOT EXISTS "task_submissions_one_active_draft_per_task_key"
    ON "task_submissions"("taskId")
    WHERE "status" = 'DRAFT';

CREATE INDEX "task_submission_documents_documentId_idx" ON "task_submission_documents"("documentId");
CREATE INDEX "task_submission_documents_documentVersionId_idx" ON "task_submission_documents"("documentVersionId");
CREATE UNIQUE INDEX "task_submission_documents_submissionId_documentId_role_key" ON "task_submission_documents"("submissionId", "documentId", "role");
CREATE UNIQUE INDEX "task_review_decisions_submissionId_key" ON "task_review_decisions"("submissionId");
CREATE INDEX "task_review_decisions_reviewerId_createdAt_idx" ON "task_review_decisions"("reviewerId", "createdAt");
CREATE UNIQUE INDEX "task_submission_time_entries_timeEntryId_key" ON "task_submission_time_entries"("timeEntryId");
CREATE INDEX "task_submission_time_entries_submissionId_idx" ON "task_submission_time_entries"("submissionId");
CREATE UNIQUE INDEX "task_submission_time_entries_submissionId_timeEntryId_key" ON "task_submission_time_entries"("submissionId", "timeEntryId");
CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_zeroTimeConfirmedById_fkey" FOREIGN KEY ("zeroTimeConfirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_externalCompletedById_fkey" FOREIGN KEY ("externalCompletedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_supersedesSubmissionId_fkey" FOREIGN KEY ("supersedesSubmissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_review_decisions" ADD CONSTRAINT "task_review_decisions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_review_decisions" ADD CONSTRAINT "task_review_decisions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submission_time_entries" ADD CONSTRAINT "task_submission_time_entries_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_submission_time_entries" ADD CONSTRAINT "task_submission_time_entries_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
