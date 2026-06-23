-- RC2C lawyer handoff package foundation.
-- Isolated additive migration: no adjacent persistence foundations.

CREATE TYPE "LawyerHandoffPackageType" AS ENUM (
  'STANDARD',
  'FINAL_APPROVAL'
);

CREATE TYPE "LawyerHandoffStatus" AS ENUM (
  'DRAFT',
  'PREPARED',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TYPE "LawyerHandoffDecision" AS ENUM (
  'APPROVED',
  'REJECTED_NEEDS_REVISION',
  'REJECTED_BLOCKING'
);

CREATE TABLE "lawyer_handoff_packages" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "status" "LawyerHandoffStatus" NOT NULL DEFAULT 'DRAFT',
  "packageType" "LawyerHandoffPackageType" NOT NULL DEFAULT 'STANDARD',
  "sourceDocumentId" TEXT,
  "anonymizedDocumentId" TEXT,
  "generatedContractId" TEXT,
  "legalAnalysisId" TEXT,
  "reviewNotesId" TEXT,
  "preparerSummary" TEXT,
  "preparedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewDecision" "LawyerHandoffDecision",
  "reviewComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lawyer_handoff_packages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lawyer_handoff_packages_caseId_status_idx"
  ON "lawyer_handoff_packages"("caseId", "status");

CREATE INDEX "lawyer_handoff_packages_sourceDocumentId_idx"
  ON "lawyer_handoff_packages"("sourceDocumentId");

CREATE INDEX "lawyer_handoff_packages_legalAnalysisId_idx"
  ON "lawyer_handoff_packages"("legalAnalysisId");

ALTER TABLE "lawyer_handoff_packages"
  ADD CONSTRAINT "lawyer_handoff_packages_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
