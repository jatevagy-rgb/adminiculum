-- DOC-REVIEW-WORKFLOW-1
-- Additive internal document-review workflow persistence.
-- No document body, storage key, portal grant, publication snapshot or client
-- publication state is created or modified by this migration.

-- Extend the legacy DocumentReviewStatus enum in place for the internal workflow.
ALTER TYPE "DocumentReviewStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "DocumentReviewStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE "DocumentReviewStatus" ADD VALUE IF NOT EXISTS 'RESUBMITTED';
ALTER TYPE "DocumentReviewStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

DO $$ BEGIN
  CREATE TYPE "ReviewPointType" AS ENUM ('ANNOTATION', 'COMPARISON_CHANGE', 'WHOLE_DOCUMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewPointStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED', 'REJECTED', 'DEFERRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewPointSeverity" AS ENUM ('INFO', 'NORMAL', 'IMPORTANT', 'BLOCKING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewDecisionAction" AS ENUM (
    'CREATED', 'ASSIGNED', 'STARTED', 'POINT_ADDED', 'POINT_UPDATED',
    'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'CANCELLED', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "document_reviews" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "document_reviews" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "document_reviews" ADD COLUMN IF NOT EXISTS "currentRoundNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "document_reviews" ADD COLUMN IF NOT EXISTS "currentRoundId" TEXT;
ALTER TABLE "document_reviews" ADD COLUMN IF NOT EXISTS "approvedVersionId" TEXT;
ALTER TABLE "document_reviews" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "document_review_rounds" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "reviewVersionId" TEXT NOT NULL,
  "status" "DocumentReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "document_review_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "review_points" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "reviewRoundId" TEXT NOT NULL,
  "type" "ReviewPointType" NOT NULL,
  "status" "ReviewPointStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "ReviewPointSeverity" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "internalRationale" TEXT,
  "ownerId" TEXT,
  "dueAt" TIMESTAMP(3),
  "annotationId" TEXT,
  "comparisonSegmentId" TEXT,
  "linkedTaskId" TEXT,
  "carriedFromPointId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "review_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_points_title_len" CHECK (char_length("title") BETWEEN 1 AND 240),
  CONSTRAINT "review_points_rationale_len" CHECK ("internalRationale" IS NULL OR char_length("internalRationale") <= 2000),
  CONSTRAINT "review_points_source_shape" CHECK (
    ("type" = 'ANNOTATION' AND "annotationId" IS NOT NULL AND "comparisonSegmentId" IS NULL) OR
    ("type" = 'COMPARISON_CHANGE' AND "comparisonSegmentId" IS NOT NULL AND "annotationId" IS NULL) OR
    ("type" = 'WHOLE_DOCUMENT' AND "annotationId" IS NULL AND "comparisonSegmentId" IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS "review_decisions" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "reviewRoundId" TEXT,
  "action" "ReviewDecisionAction" NOT NULL,
  "actorId" TEXT NOT NULL,
  "versionId" TEXT,
  "safeRationale" TEXT,
  "metadataSafe" JSONB,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_decisions_rationale_len" CHECK ("safeRationale" IS NULL OR char_length("safeRationale") <= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_reviews_currentRoundId_key" ON "document_reviews"("currentRoundId") WHERE "currentRoundId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "document_reviews_ownerId_idx" ON "document_reviews"("ownerId");
CREATE INDEX IF NOT EXISTS "document_reviews_assignedReviewerId_status_idx" ON "document_reviews"("assignedReviewerId", "status");
CREATE INDEX IF NOT EXISTS "document_reviews_approvedVersionId_idx" ON "document_reviews"("approvedVersionId");

CREATE UNIQUE INDEX IF NOT EXISTS "document_review_rounds_reviewId_roundNumber_key" ON "document_review_rounds"("reviewId", "roundNumber");
CREATE INDEX IF NOT EXISTS "document_review_rounds_reviewId_status_idx" ON "document_review_rounds"("reviewId", "status");
CREATE INDEX IF NOT EXISTS "document_review_rounds_reviewVersionId_idx" ON "document_review_rounds"("reviewVersionId");

CREATE INDEX IF NOT EXISTS "review_points_reviewId_status_severity_idx" ON "review_points"("reviewId", "status", "severity");
CREATE INDEX IF NOT EXISTS "review_points_reviewRoundId_status_idx" ON "review_points"("reviewRoundId", "status");
CREATE INDEX IF NOT EXISTS "review_points_annotationId_idx" ON "review_points"("annotationId");
CREATE INDEX IF NOT EXISTS "review_points_comparisonSegmentId_idx" ON "review_points"("comparisonSegmentId");
CREATE INDEX IF NOT EXISTS "review_points_linkedTaskId_idx" ON "review_points"("linkedTaskId");
CREATE INDEX IF NOT EXISTS "review_points_carriedFromPointId_idx" ON "review_points"("carriedFromPointId");

CREATE UNIQUE INDEX IF NOT EXISTS "review_decisions_idempotencyKey_key" ON "review_decisions"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "review_decisions_reviewId_createdAt_idx" ON "review_decisions"("reviewId", "createdAt");
CREATE INDEX IF NOT EXISTS "review_decisions_reviewRoundId_createdAt_idx" ON "review_decisions"("reviewRoundId", "createdAt");
CREATE INDEX IF NOT EXISTS "review_decisions_actorId_createdAt_idx" ON "review_decisions"("actorId", "createdAt");

DO $$ BEGIN ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "document_review_rounds" ADD CONSTRAINT "document_review_rounds_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "document_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "document_review_rounds" ADD CONSTRAINT "document_review_rounds_reviewVersionId_fkey" FOREIGN KEY ("reviewVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "document_review_rounds" ADD CONSTRAINT "document_review_rounds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_currentRoundId_fkey" FOREIGN KEY ("currentRoundId") REFERENCES "document_review_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "document_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "document_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "document_annotations"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_comparisonSegmentId_fkey" FOREIGN KEY ("comparisonSegmentId") REFERENCES "document_change_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_carriedFromPointId_fkey" FOREIGN KEY ("carriedFromPointId") REFERENCES "review_points"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_points" ADD CONSTRAINT "review_points_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "document_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "document_review_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "document_review_rounds" ("id", "reviewId", "roundNumber", "reviewVersionId", "status", "startedAt", "submittedAt", "completedAt", "createdById", "createdAt", "updatedAt", "revision")
SELECT concat('round-', dr."id"), dr."id", 1, dr."documentVersionId", dr."status", NULL, dr."createdAt", dr."completedAt", dr."createdById", dr."createdAt", dr."updatedAt", 0
FROM "document_reviews" dr
WHERE NOT EXISTS (SELECT 1 FROM "document_review_rounds" rr WHERE rr."reviewId" = dr."id" AND rr."roundNumber" = 1);

UPDATE "document_reviews" dr
SET "currentRoundId" = rr."id",
    "currentRoundNumber" = rr."roundNumber",
    "ownerId" = COALESCE(dr."ownerId", dr."createdById"),
    "approvedVersionId" = CASE WHEN dr."status" = 'APPROVED' THEN dr."documentVersionId" ELSE dr."approvedVersionId" END
FROM "document_review_rounds" rr
WHERE rr."reviewId" = dr."id" AND rr."roundNumber" = 1 AND dr."currentRoundId" IS NULL;
