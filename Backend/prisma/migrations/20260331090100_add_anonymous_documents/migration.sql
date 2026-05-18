-- Create anonymous_documents table for storing anonymized documents with redaction mappings
CREATE TABLE "anonymous_documents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source document reference
    "sourceDocId" VARCHAR(255) NOT NULL,
    "originalDocId" VARCHAR(255),
    "caseId" VARCHAR(255),
    
    -- Anonymized content
    "content" TEXT NOT NULL,
    "redactedItems" JSONB NOT NULL DEFAULT '[]',
    
    -- AI task metadata
    "aiTask" VARCHAR(100),
    "customPrompt" TEXT,
    
    -- Timestamps
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX "idx_anonymous_documents_caseId_createdAt" ON "anonymous_documents"("caseId", "createdAt");
CREATE INDEX "idx_anonymous_documents_sourceDocId" ON "anonymous_documents"("sourceDocId");

-- Add comment for documentation
COMMENT ON TABLE "anonymous_documents" IS 'Stores anonymized documents with token mappings for rehydration';
COMMENT ON COLUMN "anonymous_documents"."redactedItems" IS 'JSON array of {type, original, replacement, position} for reversing anonymization';
