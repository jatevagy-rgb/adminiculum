-- Case Context V2 — additive CaseContextSource foundation.
-- Creates one enum and one table with indexes and foreign keys only.
-- No existing-row rewrite, no backfill, no destructive ALTER, no data deletion.
-- rawText is immutable at the application layer; durable state is derived from
-- anonymizedText being NULL or NOT NULL (no status column).
-- The reversible original→placeholder mapping is NEVER persisted.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaseContextOrigin') THEN
    CREATE TYPE "CaseContextOrigin" AS ENUM ('PASTED', 'COMMUNICATION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "case_context_sources" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "origin" "CaseContextOrigin" NOT NULL,
  "sourceCommunicationId" TEXT,
  "rawText" TEXT NOT NULL,
  "anonymizedText" TEXT,
  "anonymizationSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_context_sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_context_sources_caseId_createdAt_idx"
  ON "case_context_sources"("caseId", "createdAt");
CREATE INDEX IF NOT EXISTS "case_context_sources_sourceCommunicationId_idx"
  ON "case_context_sources"("sourceCommunicationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_context_sources_caseId_fkey') THEN
    ALTER TABLE "case_context_sources" ADD CONSTRAINT "case_context_sources_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_context_sources_createdById_fkey') THEN
    ALTER TABLE "case_context_sources" ADD CONSTRAINT "case_context_sources_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_context_sources_sourceCommunicationId_fkey') THEN
    ALTER TABLE "case_context_sources" ADD CONSTRAINT "case_context_sources_sourceCommunicationId_fkey"
      FOREIGN KEY ("sourceCommunicationId") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
