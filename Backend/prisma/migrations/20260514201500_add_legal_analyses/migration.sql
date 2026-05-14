-- CreateEnum
CREATE TYPE "public"."LegalAnalysisStatus" AS ENUM (
  'DRAFT',
  'CANDIDATE_REVIEW',
  'LAWYER_REVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'ARCHIVED'
);

-- CreateEnum
CREATE TYPE "public"."LegalAnalysisSourceType" AS ENUM (
  'PASTED_AI_OUTPUT',
  'MANUAL'
);

-- CreateEnum
CREATE TYPE "public"."LegalAnalysisSourceDocumentType" AS ENUM (
  'DOCUMENT',
  'CONTRACT_GENERATION',
  'ANONYMOUS_DOCUMENT'
);

-- CreateTable
CREATE TABLE "public"."legal_analyses" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "documentId" TEXT,
  "documentSourceType" "public"."LegalAnalysisSourceDocumentType" NOT NULL DEFAULT 'DOCUMENT',
  "title" TEXT NOT NULL,
  "analysisText" TEXT NOT NULL,
  "status" "public"."LegalAnalysisStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceType" "public"."LegalAnalysisSourceType" NOT NULL DEFAULT 'PASTED_AI_OUTPUT',
  "aiToolName" TEXT,
  "anonymizedInputSnapshot" TEXT,
  "riskMatrixDetected" BOOLEAN NOT NULL DEFAULT false,
  "missingDataDetected" BOOLEAN NOT NULL DEFAULT false,
  "suggestedChangesDetected" BOOLEAN NOT NULL DEFAULT false,
  "lawyerDecisionPointsDetected" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legal_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_analyses_caseId_updatedAt_idx" ON "public"."legal_analyses"("caseId", "updatedAt");

-- CreateIndex
CREATE INDEX "legal_analyses_documentId_updatedAt_idx" ON "public"."legal_analyses"("documentId", "updatedAt");

-- AddForeignKey
ALTER TABLE "public"."legal_analyses" ADD CONSTRAINT "legal_analyses_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
