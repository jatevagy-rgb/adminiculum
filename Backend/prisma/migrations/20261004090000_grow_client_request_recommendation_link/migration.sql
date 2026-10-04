-- C5D (BE-GROW-005) — additive, backward-compatible Grow information-request
-- provenance.
--
-- A customer request (client_requests) may now originate from exactly one Grow
-- recommendation (recommendation_candidates) that was explicitly reviewed with
-- the REQUEST_MORE_INFO decision, so the customer's response/submission returns
-- to the exact source recommendation and, through it, the originating run.
--
-- Additive only: no existing column, enum, index or row is altered, no backfill
-- is required, and non-Grow requests / legacy rows stay NULL. onDelete SET NULL
-- preserves the customer-facing request history even if the recommendation is
-- later retired; a request is never cascade-deleted by provenance.
--
-- No destructive statement. No schema change beyond this column/index/FK.

-- AlterTable
ALTER TABLE "client_requests" ADD COLUMN "recommendationId" TEXT;

-- CreateIndex (unique: one canonical information request per recommendation —
-- the create-or-reuse flow is idempotent and a repeated click/retry cannot
-- create duplicates)
CREATE UNIQUE INDEX "client_requests_recommendationId_key" ON "client_requests"("recommendationId");

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendation_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
