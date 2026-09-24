-- C4D — additive, backward-compatible request provenance.
--
-- A customer request (client_requests) may now originate from exactly one
-- Compliance context so a question/request sent from Compliance returns to the
-- exact source. Three nullable, independently optional references cover the
-- three originating surfaces:
--   requirementVersionId -> requirement_versions  (Követelmények)
--   clientControlId      -> client_controls       (Bizonyítékok és kontrollok)
--   findingId            -> assessment_findings   (Megállapítások)
--
-- Additive only: no existing column, enum, index or row is altered, no backfill
-- is required, and non-Compliance requests / legacy rows stay NULL. onDelete
-- SET NULL preserves the customer-facing request history even if the source
-- context is later retired; a request is never cascade-deleted by provenance.
--
-- No destructive statement. No schema change beyond these columns/indexes/FKs.

-- AlterTable
ALTER TABLE "client_requests" ADD COLUMN "requirementVersionId" TEXT;
ALTER TABLE "client_requests" ADD COLUMN "clientControlId" TEXT;
ALTER TABLE "client_requests" ADD COLUMN "findingId" TEXT;

-- CreateIndex
CREATE INDEX "client_requests_requirementVersionId_idx" ON "client_requests"("requirementVersionId");

-- CreateIndex
CREATE INDEX "client_requests_clientControlId_idx" ON "client_requests"("clientControlId");

-- CreateIndex
CREATE INDEX "client_requests_findingId_idx" ON "client_requests"("findingId");

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_requirementVersionId_fkey" FOREIGN KEY ("requirementVersionId") REFERENCES "requirement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_clientControlId_fkey" FOREIGN KEY ("clientControlId") REFERENCES "client_controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "assessment_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
