-- STRUCTURED-DOC-COMPARISON-1
-- Additive only. Creates the structured comparison tables and their enums.
-- No existing column is dropped, renamed, rewritten or backfilled; existing
-- tables gain no columns. A comparison is always between two immutable
-- DocumentVersion records and never mutates them.

-- ---------------------------------------------------------------------------
-- Enums (guarded so replay onto a partially-applied database is safe)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "ComparisonStatus" AS ENUM (
    'PENDING', 'PROCESSING', 'READY', 'IDENTICAL', 'UNSUPPORTED', 'FAILED', 'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ChangeSegmentType" AS ENUM (
    'INSERT', 'DELETE', 'REPLACE', 'MOVE_CANDIDATE', 'FORMAT_ONLY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SegmentReviewState" AS ENUM (
    'UNREVIEWED', 'ACCEPTED', 'REJECTED', 'NEEDS_DISCUSSION', 'NOT_RELEVANT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SegmentCategory" AS ENUM (
    'PARTY', 'DATE', 'AMOUNT', 'OBLIGATION', 'LIABILITY', 'TERMINATION',
    'GOVERNING_LAW', 'DEFINITION', 'OTHER', 'UNCLASSIFIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SegmentCategorySource" AS ENUM ('MANUAL', 'RULE', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- document_comparisons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "document_comparisons" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "baseVersionId" TEXT NOT NULL,
  "targetVersionId" TEXT NOT NULL,
  "status" "ComparisonStatus" NOT NULL DEFAULT 'PENDING',
  "algorithmRevision" INTEGER NOT NULL,
  "extractionRevision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessageSafe" TEXT,
  "insertCount" INTEGER NOT NULL DEFAULT 0,
  "deleteCount" INTEGER NOT NULL DEFAULT 0,
  "replaceCount" INTEGER NOT NULL DEFAULT 0,
  "formatOnlyCount" INTEGER NOT NULL DEFAULT 0,
  "moveCandidateCount" INTEGER NOT NULL DEFAULT 0,
  "totalSegmentCount" INTEGER NOT NULL DEFAULT 0,
  "reviewedSegmentCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_comparisons_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- document_change_segments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "document_change_segments" (
  "id" TEXT NOT NULL,
  "comparisonId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "changeType" "ChangeSegmentType" NOT NULL,
  "baseStart" INTEGER,
  "baseEnd" INTEGER,
  "targetStart" INTEGER,
  "targetEnd" INTEGER,
  "baseExcerpt" TEXT,
  "targetExcerpt" TEXT,
  "contextBefore" TEXT,
  "contextAfter" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reviewState" "SegmentReviewState" NOT NULL DEFAULT 'UNREVIEWED',
  "category" "SegmentCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
  "categorySource" "SegmentCategorySource" NOT NULL DEFAULT 'NONE',
  "internalRationale" TEXT,
  "linkedTaskId" TEXT,
  "linkedAnnotationId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_change_segments_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes and uniqueness
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "document_comparisons_documentId_baseVersionId_targetVersion_key"
  ON "document_comparisons" ("documentId", "baseVersionId", "targetVersionId", "algorithmRevision");
CREATE INDEX IF NOT EXISTS "document_comparisons_documentId_idx" ON "document_comparisons" ("documentId");
CREATE INDEX IF NOT EXISTS "document_comparisons_status_idx" ON "document_comparisons" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "document_change_segments_comparisonId_sequence_key"
  ON "document_change_segments" ("comparisonId", "sequence");
CREATE INDEX IF NOT EXISTS "document_change_segments_comparisonId_sequence_idx"
  ON "document_change_segments" ("comparisonId", "sequence");
CREATE INDEX IF NOT EXISTS "document_change_segments_comparisonId_reviewState_idx"
  ON "document_change_segments" ("comparisonId", "reviewState");

-- ---------------------------------------------------------------------------
-- Foreign keys (guarded for replay safety)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "document_comparisons"
    ADD CONSTRAINT "document_comparisons_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_comparisons"
    ADD CONSTRAINT "document_comparisons_baseVersionId_fkey"
    FOREIGN KEY ("baseVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_comparisons"
    ADD CONSTRAINT "document_comparisons_targetVersionId_fkey"
    FOREIGN KEY ("targetVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_comparisons"
    ADD CONSTRAINT "document_comparisons_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_change_segments"
    ADD CONSTRAINT "document_change_segments_comparisonId_fkey"
    FOREIGN KEY ("comparisonId") REFERENCES "document_comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
