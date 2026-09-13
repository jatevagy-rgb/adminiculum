-- ============================================================================
-- UNIVERSAL MAILBOX CONNECTION (additive only)
-- Per-user, user-authorized mailbox connections layered on the existing
-- Communication model. Owner-only by default. Secrets are referenced opaquely
-- via secretReference; no tokens/credentials are stored here.
-- Legacy Communication rows remain valid (all new columns nullable).
-- ============================================================================

-- CreateEnum
CREATE TYPE "MailboxProvider" AS ENUM ('MICROSOFT_GRAPH', 'GOOGLE_GMAIL', 'IMAP_SMTP');

-- CreateEnum
CREATE TYPE "MailboxConnectionStatus" AS ENUM ('EMAIL_UNVERIFIED', 'EMAIL_VERIFIED', 'AUTHORIZATION_REQUIRED', 'CONNECTED', 'CONNECTED_READ_ONLY', 'SYNCING', 'PAUSED', 'REVOKED', 'ERROR');

-- AlterTable (additive nullable columns on communications)
ALTER TABLE "communications"
  ADD COLUMN "mailboxConnectionId" TEXT,
  ADD COLUMN "mailboxProviderMessageId" TEXT,
  ADD COLUMN "internetMessageId" TEXT,
  ADD COLUMN "inReplyTo" TEXT,
  ADD COLUMN "references" TEXT,
  ADD COLUMN "bodyPreview" TEXT,
  ADD COLUMN "bodyHtmlSanitized" TEXT;

-- CreateTable
CREATE TABLE "communication_mailbox_connections" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "mailboxAddress" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL,
    "status" "MailboxConnectionStatus" NOT NULL DEFAULT 'EMAIL_UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "readCapability" BOOLEAN NOT NULL DEFAULT false,
    "sendCapability" BOOLEAN NOT NULL DEFAULT false,
    "providerAccountId" TEXT,
    "providerTenantId" TEXT,
    "secretReference" TEXT,
    "syncCursor" TEXT,
    "syncCursorUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_mailbox_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_mailbox_connections_ownerUserId_status_idx" ON "communication_mailbox_connections"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "communication_mailbox_connections_ownerUserId_mailboxAddress_provider_key" ON "communication_mailbox_connections"("ownerUserId", "mailboxAddress", "provider");

-- CreateIndex
CREATE INDEX "email_verification_challenges_userId_emailAddress_createdAt_idx" ON "email_verification_challenges"("userId", "emailAddress", "createdAt");

-- CreateIndex
CREATE INDEX "email_verification_challenges_emailAddress_createdAt_idx" ON "email_verification_challenges"("emailAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "communications_mailbox_message_unique" ON "communications"("mailboxConnectionId", "mailboxProviderMessageId");

-- CreateIndex
CREATE INDEX "communications_mailboxConnectionId_receivedAt_idx" ON "communications"("mailboxConnectionId", "receivedAt");

-- AddForeignKey
ALTER TABLE "communication_mailbox_connections" ADD CONSTRAINT "communication_mailbox_connections_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_mailboxConnectionId_fkey" FOREIGN KEY ("mailboxConnectionId") REFERENCES "communication_mailbox_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
