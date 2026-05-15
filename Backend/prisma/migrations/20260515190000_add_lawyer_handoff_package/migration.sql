-- Migration: add_lawyer_handoff_package
-- Created: 2026-05-15
-- Description: Lawyer handoff package v1A — minimal persisted container for lawyer review packages

-- Create enums
CREATE TYPE "LawyerHandoffPackageType" AS ENUM ('STANDARD', 'FINAL_APPROVAL');
CREATE TYPE "LawyerHandoffStatus" AS ENUM ('DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "LawyerHandoffDecision" AS ENUM ('APPROVED', 'REJECTED_NEEDS_REVISION', 'REJECTED_BLOCKING');

-- Create table
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lawyer_handoff_packages_pkey" PRIMARY KEY ("id")
);

-- Add foreign key to Case
ALTER TABLE "lawyer_handoff_packages"
    ADD CONSTRAINT "lawyer_handoff_packages_caseId_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "cases"("id")
    ON DELETE CASCADE;

-- Create indexes
CREATE INDEX "lawyer_handoff_packages_caseId_status_idx" ON "lawyer_handoff_packages" ("caseId", "status");
CREATE INDEX "lawyer_handoff_packages_sourceDocumentId_idx" ON "lawyer_handoff_packages" ("sourceDocumentId");
CREATE INDEX "lawyer_handoff_packages_legalAnalysisId_idx" ON "lawyer_handoff_packages" ("legalAnalysisId");

-- Apply updatedAt trigger (matching project pattern)
CREATE OR REPLACE FUNCTION "update_updatedAt_row"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "update_lawyer_handoff_packages_updatedAt"
    BEFORE UPDATE ON "lawyer_handoff_packages"
    FOR EACH ROW
    EXECUTE FUNCTION "update_updatedAt_row"();