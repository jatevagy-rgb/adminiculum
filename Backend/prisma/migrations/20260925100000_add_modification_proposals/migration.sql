-- Document Workspace Phase 2 — modification proposal + review rail backend foundation.
-- Additive only: two new tables, two new enums, one nullable DocumentVersion marker column.
-- No destructive statements, no backfill, no reinterpretation of legacy data, no
-- migration of MODIFICATION_REASON annotation rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentModificationProposalStatus') THEN
    CREATE TYPE "DocumentModificationProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentModificationProposalEventType') THEN
    CREATE TYPE "DocumentModificationProposalEventType" AS ENUM ('PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'PROPOSAL_SOFT_DELETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "document_modification_proposals" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "selectedText" TEXT NOT NULL,
  "normalizedSelectedText" TEXT,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "textPrefix" TEXT,
  "textSuffix" TEXT,
  "contentFingerprint" TEXT,
  "proposedText" TEXT NOT NULL,
  "rationale" TEXT,
  "status" "DocumentModificationProposalStatus" NOT NULL DEFAULT 'PENDING',
  "decisionReason" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "deletedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_modification_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_modification_proposal_events" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "eventType" "DocumentModificationProposalEventType" NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_modification_proposal_events_pkey" PRIMARY KEY ("id")
);

-- Ordinary (non-partial) unique index matching @@unique([documentVersionId, idempotencyKey]).
-- PostgreSQL permits multiple NULLs in a unique index, so nullable keys stay non-colliding.
CREATE UNIQUE INDEX IF NOT EXISTS "document_modification_proposals_documentVersionId_idempotencyKey_key"
  ON "document_modification_proposals"("documentVersionId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "document_modification_proposals_documentId_documentVersionId_status_idx"
  ON "document_modification_proposals"("documentId", "documentVersionId", "status");
CREATE INDEX IF NOT EXISTS "document_modification_proposals_documentVersionId_status_idx"
  ON "document_modification_proposals"("documentVersionId", "status");
CREATE INDEX IF NOT EXISTS "document_modification_proposals_decidedById_idx"
  ON "document_modification_proposals"("decidedById");
CREATE INDEX IF NOT EXISTS "document_modification_proposals_deletedAt_idx"
  ON "document_modification_proposals"("deletedAt");
CREATE INDEX IF NOT EXISTS "document_modification_proposal_events_proposalId_createdAt_idx"
  ON "document_modification_proposal_events"("proposalId", "createdAt");
CREATE INDEX IF NOT EXISTS "document_modification_proposal_events_actorId_createdAt_idx"
  ON "document_modification_proposal_events"("actorId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposals_documentId_fkey') THEN
    ALTER TABLE "document_modification_proposals" ADD CONSTRAINT "document_modification_proposals_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposals_documentVersion_fkey') THEN
    ALTER TABLE "document_modification_proposals" ADD CONSTRAINT "document_modification_proposals_documentVersion_fkey"
      FOREIGN KEY ("documentId", "documentVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposals_createdById_fkey') THEN
    ALTER TABLE "document_modification_proposals" ADD CONSTRAINT "document_modification_proposals_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposals_decidedById_fkey') THEN
    ALTER TABLE "document_modification_proposals" ADD CONSTRAINT "document_modification_proposals_decidedById_fkey"
      FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposals_deletedById_fkey') THEN
    ALTER TABLE "document_modification_proposals" ADD CONSTRAINT "document_modification_proposals_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposal_events_proposalId_fkey') THEN
    ALTER TABLE "document_modification_proposal_events" ADD CONSTRAINT "document_modification_proposal_events_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "document_modification_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposal_events_actorId_fkey') THEN
    ALTER TABLE "document_modification_proposal_events" ADD CONSTRAINT "document_modification_proposal_events_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- DB-level offset sanity: startOffset >= 0 AND endOffset > startOffset.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_modification_proposals_range_check') THEN
    ALTER TABLE "document_modification_proposals"
      ADD CONSTRAINT "document_modification_proposals_range_check"
      CHECK ("startOffset" >= 0 AND "endOffset" > "startOffset");
  END IF;
END $$;

-- Nullable per-version completion-cycle marker. Guarded so replaying against a
-- database that already has the column is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_versions'
      AND column_name = 'correctionNotifiedAt'
  ) THEN
    ALTER TABLE "document_versions" ADD COLUMN "correctionNotifiedAt" TIMESTAMP(3);
  END IF;
END $$;
