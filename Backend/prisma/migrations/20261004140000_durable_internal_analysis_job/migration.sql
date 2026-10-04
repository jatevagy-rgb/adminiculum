-- BE_COMP_006: additive persistence for durable INTERNAL_ANALYSIS processing.
-- One row = one processing job for one EXACT document_versions row that was
-- eligible for internal analysis extraction. Upload/link success stays separate:
-- this table records the ANALYSIS job only, so a restart can recover PENDING
-- work (startup sweep) and a retry re-runs the same version against the same
-- digest-idempotent ingest without re-uploading the source file.
--
-- Additive only: no existing column is rewritten, no backfill, no deletion, and
-- no publication / finding / legal-acceptance semantics are touched.
--
-- CLIENT BOUNDARY: internal processing state, never projected through any
-- customer DTO. CLIENT_POLICY documents never enqueue a job.

-- CreateEnum
CREATE TYPE "ComplianceAnalysisJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "compliance_analysis_jobs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "status" "ComplianceAnalysisJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastIngestStatus" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorDetail" VARCHAR(300),
    "lockedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_analysis_jobs_documentVersionId_key" ON "compliance_analysis_jobs"("documentVersionId");

-- CreateIndex
CREATE INDEX "compliance_analysis_jobs_status_enqueuedAt_idx" ON "compliance_analysis_jobs"("status", "enqueuedAt");

-- AddForeignKey
ALTER TABLE "compliance_analysis_jobs" ADD CONSTRAINT "compliance_analysis_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_analysis_jobs" ADD CONSTRAINT "compliance_analysis_jobs_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
