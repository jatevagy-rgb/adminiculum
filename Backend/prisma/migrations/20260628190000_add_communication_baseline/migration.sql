-- Communication baseline reconciliation.
-- Additive/idempotency-aware draft only until explicitly applied.
-- Aligns deployed DB with the current Prisma schema communication baseline:
--   - CommunicationType
--   - communications
--   - communication_attachments
--   - nullable tasks.sourceCommunicationId
--   - baseline communication indexes/FKs

DO $$
BEGIN
  CREATE TYPE "CommunicationType" AS ENUM (
    'EMAIL',
    'PHONE',
    'MEETING',
    'LETTER',
    'NOTE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "communications" (
  "id" TEXT NOT NULL,
  "type" "CommunicationType" NOT NULL,
  "subject" TEXT NOT NULL,
  "senderName" TEXT,
  "senderEmail" TEXT,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "content" TEXT,
  "summary" TEXT,
  "caseId" TEXT,
  "clientId" TEXT,
  "documentId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "communication_attachments" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT,
  "description" TEXT,
  "url" TEXT,
  "spItemId" TEXT,
  "communicationId" TEXT NOT NULL,
  "documentId" TEXT,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "sourceCommunicationId" TEXT;

CREATE INDEX IF NOT EXISTS "communications_caseId_createdAt_idx"
  ON "communications"("caseId", "createdAt");

CREATE INDEX IF NOT EXISTS "communications_clientId_createdAt_idx"
  ON "communications"("clientId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "communication_attachments"
    ADD CONSTRAINT "communication_attachments_communicationId_fkey"
    FOREIGN KEY ("communicationId")
    REFERENCES "communications"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_sourceCommunicationId_fkey"
    FOREIGN KEY ("sourceCommunicationId")
    REFERENCES "communications"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
