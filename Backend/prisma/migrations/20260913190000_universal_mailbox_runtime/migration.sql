-- Additive provenance for user-authorized mailbox ingestion. The existing
-- app-only Outlook reader remains separately identified as OUTLOOK.
ALTER TYPE "CommunicationSource" ADD VALUE IF NOT EXISTS 'MAILBOX';

CREATE TABLE IF NOT EXISTS "mailbox_audit_events" (
  "id" TEXT NOT NULL,
  "mailboxConnectionId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "provider" "MailboxProvider",
  "eventType" TEXT NOT NULL,
  "status" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mailbox_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mailbox_audit_events_mailboxConnectionId_createdAt_idx" ON "mailbox_audit_events"("mailboxConnectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "mailbox_audit_events_actorUserId_createdAt_idx" ON "mailbox_audit_events"("actorUserId", "createdAt");
