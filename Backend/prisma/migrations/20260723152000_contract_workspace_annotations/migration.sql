-- Contract Workspace — anchored annotation foundation.
-- Additive only: no document/document_version mutation and no annotation backfill.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentAnnotationType') THEN
    CREATE TYPE "DocumentAnnotationType" AS ENUM ('INTERNAL_NOTE', 'REVIEW_COMMENT', 'MODIFICATION_REASON', 'CLIENT_EXPLANATION_DRAFT', 'QUESTION', 'DECISION', 'TASK_NOTE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentAnnotationAnchorType') THEN
    CREATE TYPE "DocumentAnnotationAnchorType" AS ENUM ('TEXT_RANGE', 'PAGE_RECTANGLE', 'PAGE_ELLIPSE', 'PAGE_POINT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentAnnotationStatus') THEN
    CREATE TYPE "DocumentAnnotationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REOPENED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentAnnotationVisibility') THEN
    CREATE TYPE "DocumentAnnotationVisibility" AS ENUM ('INTERNAL', 'CLIENT_CANDIDATE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentAnnotationEventType') THEN
    CREATE TYPE "DocumentAnnotationEventType" AS ENUM ('CREATED', 'CONTENT_UPDATED', 'ASSIGNED', 'STATUS_CHANGED', 'RESOLVED', 'REOPENED', 'COMMENT_ADDED', 'SOFT_DELETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "document_annotations" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "annotationType" "DocumentAnnotationType" NOT NULL,
  "anchorType" "DocumentAnnotationAnchorType" NOT NULL,
  "status" "DocumentAnnotationStatus" NOT NULL DEFAULT 'OPEN',
  "visibility" "DocumentAnnotationVisibility" NOT NULL DEFAULT 'INTERNAL',
  "headline" TEXT,
  "internalNote" TEXT,
  "reviewComment" TEXT,
  "modificationReason" TEXT,
  "clientExplanationDraft" TEXT,
  "legalRisk" TEXT,
  "openQuestion" TEXT,
  "decisionText" TEXT,
  "resolutionNote" TEXT,
  "selectedText" TEXT,
  "normalizedSelectedText" TEXT,
  "textPrefix" TEXT,
  "textSuffix" TEXT,
  "startOffset" INTEGER,
  "endOffset" INTEGER,
  "pageNumber" INTEGER,
  "pageIndex" INTEGER,
  "rectX" DECIMAL(8,6),
  "rectY" DECIMAL(8,6),
  "rectWidth" DECIMAL(8,6),
  "rectHeight" DECIMAL(8,6),
  "pointX" DECIMAL(8,6),
  "pointY" DECIMAL(8,6),
  "pageRotation" INTEGER,
  "structuralPath" TEXT,
  "rendererVersion" TEXT,
  "contentFingerprint" TEXT,
  "idempotencyKey" TEXT,
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "resolvedById" TEXT,
  "deletedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "document_annotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_annotation_comments" (
  "id" TEXT NOT NULL,
  "annotationId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "document_annotation_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_annotation_events" (
  "id" TEXT NOT NULL,
  "annotationId" TEXT NOT NULL,
  "eventType" "DocumentAnnotationEventType" NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" "DocumentAnnotationStatus",
  "toStatus" "DocumentAnnotationStatus",
  "assignedToId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_annotation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_annotations_documentVersionId_idempotencyKey_key"
  ON "document_annotations"("documentVersionId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "document_annotations_documentId_documentVersionId_status_idx" ON "document_annotations"("documentId", "documentVersionId", "status");
CREATE INDEX IF NOT EXISTS "document_annotations_documentVersionId_annotationType_idx" ON "document_annotations"("documentVersionId", "annotationType");
CREATE INDEX IF NOT EXISTS "document_annotations_documentVersionId_anchorType_idx" ON "document_annotations"("documentVersionId", "anchorType");
CREATE INDEX IF NOT EXISTS "document_annotations_assignedToId_status_idx" ON "document_annotations"("assignedToId", "status");
CREATE INDEX IF NOT EXISTS "document_annotations_createdById_status_idx" ON "document_annotations"("createdById", "status");
CREATE INDEX IF NOT EXISTS "document_annotations_deletedAt_idx" ON "document_annotations"("deletedAt");
CREATE INDEX IF NOT EXISTS "document_annotation_comments_annotationId_createdAt_idx" ON "document_annotation_comments"("annotationId", "createdAt");
CREATE INDEX IF NOT EXISTS "document_annotation_comments_createdById_idx" ON "document_annotation_comments"("createdById");
CREATE INDEX IF NOT EXISTS "document_annotation_events_annotationId_createdAt_idx" ON "document_annotation_events"("annotationId", "createdAt");
CREATE INDEX IF NOT EXISTS "document_annotation_events_actorId_createdAt_idx" ON "document_annotation_events"("actorId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_documentId_fkey') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_documentVersion_fkey') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_documentVersion_fkey"
      FOREIGN KEY ("documentId", "documentVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_createdById_fkey') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_assignedToId_fkey') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_resolvedById_fkey') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_resolvedById_fkey"
      FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_deletedById_fkey') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_text_offsets_check') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_text_offsets_check"
      CHECK ("startOffset" IS NULL OR "endOffset" IS NULL OR ("startOffset" >= 0 AND "endOffset" > "startOffset"));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_page_index_check') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_page_index_check"
      CHECK ("pageIndex" IS NULL OR "pageIndex" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_rect_bounds_check') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_rect_bounds_check"
      CHECK (
        ("rectX" IS NULL AND "rectY" IS NULL AND "rectWidth" IS NULL AND "rectHeight" IS NULL)
        OR (
          "rectX" >= 0 AND "rectX" <= 1 AND "rectY" >= 0 AND "rectY" <= 1
          AND "rectWidth" > 0 AND "rectHeight" > 0
          AND "rectX" + "rectWidth" <= 1
          AND "rectY" + "rectHeight" <= 1
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotations_point_bounds_check') THEN
    ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_point_bounds_check"
      CHECK (
        ("pointX" IS NULL AND "pointY" IS NULL)
        OR ("pointX" >= 0 AND "pointX" <= 1 AND "pointY" >= 0 AND "pointY" <= 1)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotation_comments_annotationId_fkey') THEN
    ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_annotationId_fkey"
      FOREIGN KEY ("annotationId") REFERENCES "document_annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotation_comments_createdById_fkey') THEN
    ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotation_comments_deletedById_fkey') THEN
    ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotation_events_annotationId_fkey') THEN
    ALTER TABLE "document_annotation_events" ADD CONSTRAINT "document_annotation_events_annotationId_fkey"
      FOREIGN KEY ("annotationId") REFERENCES "document_annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotation_events_actorId_fkey') THEN
    ALTER TABLE "document_annotation_events" ADD CONSTRAINT "document_annotation_events_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_annotation_events_assignedToId_fkey') THEN
    ALTER TABLE "document_annotation_events" ADD CONSTRAINT "document_annotation_events_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;