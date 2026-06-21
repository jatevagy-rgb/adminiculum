-- SUPERSEDED LOCAL-ONLY MIGRATION ARTIFACT
--
-- Original active migration name:
--   20260610214500_add_document_review_suggestions
--
-- Status:
--   - local-only
--   - never applied to production
--   - removed from Backend/prisma/migrations during RC1A
--   - must not be deployed or marked as applied
--   - must not be reused as a future migration name
--   - will be replaced by a new reviewed forward migration after RC1B/RC1C
--
-- This file preserves design intent only. It is outside Prisma's active
-- migrations directory and must never be executed as an operational script.

CREATE TYPE "DocumentReviewWorkspaceSource" AS ENUM ('CONTRACT_WORKSPACE', 'LITIGATION_WORKSPACE');
CREATE TYPE "DocumentReviewSuggestionType" AS ENUM ('COMMENT', 'REPLACEMENT', 'DELETION');
CREATE TYPE "DocumentReviewSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "document_review_suggestions" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT,
  "workspaceSource" "DocumentReviewWorkspaceSource" NOT NULL,
  "type" "DocumentReviewSuggestionType" NOT NULL,
  "status" "DocumentReviewSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "selectedTextPreview" TEXT NOT NULL,
  "rangeFrom" INTEGER,
  "rangeTo" INTEGER,
  "replacementText" TEXT,
  "documentTextHash" TEXT,
  "anchorMetadata" JSONB,
  "helperText" TEXT,
  "authorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "document_review_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_review_suggestions_documentId_status_idx" ON "document_review_suggestions"("documentId", "status");
CREATE INDEX "document_review_suggestions_caseId_createdAt_idx" ON "document_review_suggestions"("caseId", "createdAt");
CREATE INDEX "document_review_suggestions_documentId_workspaceSource_idx" ON "document_review_suggestions"("documentId", "workspaceSource");
CREATE INDEX "document_review_suggestions_documentVersionId_idx" ON "document_review_suggestions"("documentVersionId");
CREATE INDEX "document_review_suggestions_authorId_idx" ON "document_review_suggestions"("authorId");

ALTER TABLE "document_review_suggestions"
  ADD CONSTRAINT "document_review_suggestions_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_review_suggestions"
  ADD CONSTRAINT "document_review_suggestions_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_review_suggestions"
  ADD CONSTRAINT "document_review_suggestions_documentVersionId_fkey"
  FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_review_suggestions"
  ADD CONSTRAINT "document_review_suggestions_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
