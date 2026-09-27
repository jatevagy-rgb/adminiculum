-- Contract occurrence CUSTOMER PUBLICATION GATE — explicit, fail-closed.
-- An internal ClientObligationOccurrence is NEVER customer-visible merely
-- because it exists. Only a deliberate publish action sets published_at;
-- candidate confirmation (#399) writes occurrences without publication, and
-- revocation clears both columns. Purely additive: no existing column or row
-- is altered.

-- AlterTable
ALTER TABLE "client_obligation_occurrences" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "client_obligation_occurrences" ADD COLUMN "publishedById" TEXT;

-- CreateIndex
CREATE INDEX "client_obligation_occurrences_clientId_publishedAt_idx" ON "client_obligation_occurrences"("clientId", "publishedAt");

-- AddForeignKey
ALTER TABLE "client_obligation_occurrences" ADD CONSTRAINT "client_obligation_occurrences_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
