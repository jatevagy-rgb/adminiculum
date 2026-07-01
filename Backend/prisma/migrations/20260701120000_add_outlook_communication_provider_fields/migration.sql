-- Outlook / Microsoft Graph provider-sourced communications foundation.
-- Additive, idempotency-aware, backward-compatible. No ingestion is implemented.
-- Existing manually-logged communication rows remain valid (all new columns
-- nullable; source defaults to MANUAL). Adds:
--   - enums CommunicationDirection / CommunicationSource / CommunicationSyncStatus
--   - provider columns on communications (external id, conversation id, mailbox,
--     direction, received/sent/imported timestamps, source, sync status,
--     metadata, recipients)
--   - provider columns on communication_attachments (provider id, size)
--   - partial UNIQUE index on communications.externalMessageId (NOT NULL only)
--   - index on communications.providerConversationId
--   - partial UNIQUE index on (communicationId, providerAttachmentId) NOT NULL

-- ---------------------------------------------------------------------------
-- Enums (guarded)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CommunicationSource" AS ENUM ('MANUAL', 'OUTLOOK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CommunicationSyncStatus" AS ENUM ('IMPORTED', 'PENDING', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- communications: additive provider columns
-- ---------------------------------------------------------------------------
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "externalMessageId" TEXT;
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "providerConversationId" TEXT;
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "mailboxAddress" TEXT;
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "direction" "CommunicationDirection";
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "source" "CommunicationSource" DEFAULT 'MANUAL';
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "syncStatus" "CommunicationSyncStatus";
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3);
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "recipients" JSONB;

-- ---------------------------------------------------------------------------
-- communication_attachments: additive provider columns
-- ---------------------------------------------------------------------------
ALTER TABLE "communication_attachments" ADD COLUMN IF NOT EXISTS "providerAttachmentId" TEXT;
ALTER TABLE "communication_attachments" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Partial UNIQUE: dedupe provider messages while allowing many NULLs (manual rows).
CREATE UNIQUE INDEX IF NOT EXISTS "communications_externalMessageId_key"
  ON "communications"("externalMessageId")
  WHERE "externalMessageId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "communications_providerConversationId_idx"
  ON "communications"("providerConversationId");

-- Partial UNIQUE: idempotent attachment re-import while allowing NULL provider ids.
CREATE UNIQUE INDEX IF NOT EXISTS "communication_attachments_provider_unique_idx"
  ON "communication_attachments"("communicationId", "providerAttachmentId")
  WHERE "providerAttachmentId" IS NOT NULL;
