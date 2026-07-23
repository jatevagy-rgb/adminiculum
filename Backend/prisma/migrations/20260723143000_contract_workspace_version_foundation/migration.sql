-- Contract Workspace — immutable document version foundation.
-- Additive and nullable where historical rows may already exist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentVersionReviewStatus') THEN
    CREATE TYPE "DocumentVersionReviewStatus" AS ENUM ('NOT_IN_REVIEW', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentVersionPublicationStatus') THEN
    CREATE TYPE "DocumentVersionPublicationStatus" AS ENUM ('INTERNAL_ONLY', 'CLIENT_READY', 'PUBLISHED', 'WITHDRAWN', 'SIGNED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentVersionUploadSource') THEN
    CREATE TYPE "DocumentVersionUploadSource" AS ENUM ('CLIENT_UPLOAD', 'LAWYER_UPLOAD', 'EMAIL_IMPORT', 'SHAREPOINT', 'CLIENT_PORTAL', 'GENERATED', 'EXTERNAL', 'WORKSPACE_SAVE', 'IMPORT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentVersionType') THEN
    CREATE TYPE "DocumentVersionType" AS ENUM ('ORIGINAL', 'WORKING_COPY', 'REVIEW_DRAFT', 'CLIENT_DRAFT', 'FINAL', 'SIGNED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentReviewStatus') THEN
    CREATE TYPE "DocumentReviewStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'READY_FOR_CLIENT', 'PUBLISHED', 'CLOSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "document_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "size" INTEGER;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "storageReference" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "currentVersion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "reviewStatus" "DocumentVersionReviewStatus" NOT NULL DEFAULT 'NOT_IN_REVIEW';
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "publicationStatus" "DocumentVersionPublicationStatus" NOT NULL DEFAULT 'INTERNAL_ONLY';
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "uploadSource" "DocumentVersionUploadSource" NOT NULL DEFAULT 'LAWYER_UPLOAD';
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "versionType" "DocumentVersionType" NOT NULL DEFAULT 'WORKING_COPY';
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "spVersionLabel" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "spVersionId" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "spAuthorId" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "spItemId" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "spWebUrl" TEXT;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "previousVersionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_documentId_version_key" ON "document_versions"("documentId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_documentId_id_key" ON "document_versions"("documentId", "id");
CREATE INDEX IF NOT EXISTS "document_versions_documentId_currentVersion_idx" ON "document_versions"("documentId", "currentVersion");
CREATE INDEX IF NOT EXISTS "document_versions_previousVersionId_idx" ON "document_versions"("previousVersionId");
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_one_current_per_document_key"
    ON "document_versions"("documentId")
    WHERE "currentVersion" = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_documentId_fkey'
  ) THEN
    ALTER TABLE "document_versions"
      ADD CONSTRAINT "document_versions_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_uploadedById_fkey'
  ) THEN
    ALTER TABLE "document_versions"
      ADD CONSTRAINT "document_versions_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_previousVersionId_fkey'
  ) THEN
    ALTER TABLE "document_versions"
      ADD CONSTRAINT "document_versions_previousVersionId_fkey"
      FOREIGN KEY ("previousVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_same_document_previous_fkey'
  ) THEN
    ALTER TABLE "document_versions"
      ADD CONSTRAINT "document_versions_same_document_previous_fkey"
      FOREIGN KEY ("documentId", "previousVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_not_self_previous_check'
  ) THEN
    ALTER TABLE "document_versions"
      ADD CONSTRAINT "document_versions_not_self_previous_check"
      CHECK ("previousVersionId" IS NULL OR "previousVersionId" <> "id");
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_document_version_identity_update()
RETURNS trigger AS $$
BEGIN
  IF NEW."documentId" <> OLD."documentId"
    OR NEW."version" <> OLD."version"
    OR NEW."previousVersionId" IS DISTINCT FROM OLD."previousVersionId"
    OR NEW."originalFileName" IS DISTINCT FROM OLD."originalFileName"
    OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
    OR NEW."size" IS DISTINCT FROM OLD."size"
    OR NEW."storageReference" IS DISTINCT FROM OLD."storageReference"
    OR NEW."spItemId" IS DISTINCT FROM OLD."spItemId"
    OR NEW."spWebUrl" IS DISTINCT FROM OLD."spWebUrl"
    OR NEW."uploadedById" <> OLD."uploadedById"
    OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'DocumentVersion immutable identity fields cannot be updated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "document_versions_identity_immutable_trigger" ON "document_versions";
CREATE TRIGGER "document_versions_identity_immutable_trigger"
BEFORE UPDATE ON "document_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_document_version_identity_update();

INSERT INTO "document_versions" (
  "id",
  "documentId",
  "version",
  "name",
  "originalFileName",
  "mimeType",
  "size",
  "storageReference",
  "currentVersion",
  "reviewStatus",
  "publicationStatus",
  "uploadSource",
  "versionType",
  "spVersionLabel",
  "spVersionId",
  "spItemId",
  "spWebUrl",
  "uploadedById",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  d."id",
  COALESCE(
    d."currentVersionInt",
    d."currentVersion",
    CASE WHEN d."version" ~ '^[0-9]+$' THEN d."version"::integer ELSE NULL END,
    1
  ),
  COALESCE(d."fileName", d."name", 'document'),
  d."fileName",
  d."mimeType",
  d."size",
  d."spItemId",
  true,
  'NOT_IN_REVIEW'::"DocumentVersionReviewStatus",
  'INTERNAL_ONLY'::"DocumentVersionPublicationStatus",
  CASE
    WHEN d."documentType" = 'MODIFIED_WORKING_COPY' THEN 'WORKSPACE_SAVE'::"DocumentVersionUploadSource"
    WHEN d."documentType" IN ('CONTRACT', 'AGREEMENT') THEN 'LAWYER_UPLOAD'::"DocumentVersionUploadSource"
    WHEN d."documentType" = 'CLIENT_INPUT' THEN 'CLIENT_UPLOAD'::"DocumentVersionUploadSource"
    ELSE 'LAWYER_UPLOAD'::"DocumentVersionUploadSource"
  END,
  CASE
    WHEN d."currentVersionInt" = 1 OR d."currentVersion" = 1 THEN 'ORIGINAL'::"DocumentVersionType"
    WHEN d."documentType" = 'MODIFIED_WORKING_COPY' THEN 'WORKING_COPY'::"DocumentVersionType"
    ELSE 'WORKING_COPY'::"DocumentVersionType"
  END,
  d."version",
  d."spVersionId",
  d."spItemId",
  COALESCE(d."spWebUrl", d."spPath"),
  COALESCE(
    (
      SELECT t."userId"
      FROM "timeline_events" t
      WHERE t."documentId" = d."id" AND t."userId" IS NOT NULL
      ORDER BY t."createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT u."id"
      FROM "users" u
      ORDER BY u."createdAt" ASC
      LIMIT 1
    )
  ),
  d."createdAt"
FROM "documents" d
WHERE NOT EXISTS (
  SELECT 1 FROM "document_versions" existing WHERE existing."documentId" = d."id"
)
AND COALESCE(
  (
    SELECT t."userId"
    FROM "timeline_events" t
    WHERE t."documentId" = d."id" AND t."userId" IS NOT NULL
    ORDER BY t."createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT u."id"
    FROM "users" u
    ORDER BY u."createdAt" ASC
    LIMIT 1
  )
) IS NOT NULL;

CREATE TABLE IF NOT EXISTS "document_reviews" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "status" "DocumentReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "assignedReviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "document_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "review_snapshots" (
    "id" TEXT NOT NULL,
    "documentReviewId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_reviews_documentId_status_idx" ON "document_reviews"("documentId", "status");
CREATE INDEX IF NOT EXISTS "document_reviews_documentVersionId_status_idx" ON "document_reviews"("documentVersionId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "document_reviews_id_documentVersionId_key" ON "document_reviews"("id", "documentVersionId");
CREATE INDEX IF NOT EXISTS "review_snapshots_documentReviewId_createdAt_idx" ON "review_snapshots"("documentReviewId", "createdAt");
CREATE INDEX IF NOT EXISTS "review_snapshots_documentVersionId_createdAt_idx" ON "review_snapshots"("documentVersionId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_reviews_documentId_fkey') THEN
    ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_reviews_documentVersionId_fkey') THEN
    ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_documentVersionId_fkey"
      FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_reviews_same_document_version_fkey') THEN
    ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_same_document_version_fkey"
      FOREIGN KEY ("documentId", "documentVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_reviews_createdById_fkey') THEN
    ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_reviews_assignedReviewerId_fkey') THEN
    ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_assignedReviewerId_fkey"
      FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_snapshots_documentReviewId_fkey') THEN
    ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_documentReviewId_fkey"
      FOREIGN KEY ("documentReviewId") REFERENCES "document_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_snapshots_documentVersionId_fkey') THEN
    ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_documentVersionId_fkey"
      FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_snapshots_same_review_version_fkey') THEN
    ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_same_review_version_fkey"
      FOREIGN KEY ("documentReviewId", "documentVersionId") REFERENCES "document_reviews"("id", "documentVersionId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_snapshots_createdById_fkey') THEN
    ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
