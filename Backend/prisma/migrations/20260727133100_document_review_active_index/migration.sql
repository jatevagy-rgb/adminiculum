-- DOC-REVIEW-WORKFLOW-1: enforce one active review series per document after enum values are committed.

DROP INDEX IF EXISTS "document_reviews_one_active_per_document_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "document_reviews_one_active_per_document_idx"
  ON "document_reviews"("documentId")
  WHERE "status" IN ('DRAFT','ASSIGNED','IN_REVIEW','CHANGES_REQUESTED','RESUBMITTED','READY_FOR_REVIEW');
