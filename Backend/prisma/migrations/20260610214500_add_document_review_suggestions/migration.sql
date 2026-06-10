-- Add document-level review suggestion persistence foundation.
-- Local migration file only; do not apply to production without an explicit deploy step.

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
