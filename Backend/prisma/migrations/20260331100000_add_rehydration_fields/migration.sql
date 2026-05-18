-- Migration: Add rehydration fields to anonymous_documents
-- Previous migration 20260331090100_add_anonymous_documents created the base table

-- Add new rehydration-related columns
ALTER TABLE "anonymous_documents" 
  ADD COLUMN IF NOT EXISTS "aiResponseText" TEXT,
  ADD COLUMN IF NOT EXISTS "rehydratedContent" TEXT,
  ADD COLUMN IF NOT EXISTS "rehydrationStatus" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "rehydrationWarnings" JSONB,
  ADD COLUMN IF NOT EXISTS "rehydratedAt" TIMESTAMPTZ;

-- Add index for rehydration status queries
CREATE INDEX IF NOT EXISTS "idx_anonymous_documents_rehydrationStatus" 
  ON "anonymous_documents"("rehydrationStatus");

-- Add index for finding documents by source for rehydration
CREATE INDEX IF NOT EXISTS "idx_anonymous_documents_originalDocId" 
  ON "anonymous_documents"("originalDocId");

-- Add comment for documentation
COMMENT ON COLUMN "anonymous_documents"."aiResponseText" IS 'Raw AI response text imported from external AI';
COMMENT ON COLUMN "anonymous_documents"."rehydratedContent" IS 'Rehydrated result with real names restored';
COMMENT ON COLUMN "anonymous_documents"."rehydrationStatus" IS 'PENDING | COMPLETE | PARTIAL | FAILED';
COMMENT ON COLUMN "anonymous_documents"."rehydrationWarnings" IS 'Array of unresolved token warnings';
COMMENT ON COLUMN "anonymous_documents"."rehydratedAt" IS 'When rehydration was performed';