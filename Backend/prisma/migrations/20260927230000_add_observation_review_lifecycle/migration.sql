-- W3A — human review lifecycle for machine-ingested legal-source observations.
-- Purely additive: one new enum + nullable review/decision columns on
-- legal_source_observations. Existing W2 rows safely become reviewStatus='NEW'
-- through the column default; no existing table, column, enum or row is
-- altered, rewritten or dropped. This migration deliberately does NOT touch
-- LegalSource, LegalSourceVersion (status/reviewStatus) or LegalSourceCapture,
-- and creates no finding/task/case/client data of any kind.

-- CreateEnum
CREATE TYPE "LegalSourceObservationReviewStatus" AS ENUM ('NEW', 'IN_REVIEW', 'NO_IMPACT', 'IMPACT_CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "legal_source_observations" ADD COLUMN "reviewStatus" "LegalSourceObservationReviewStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN "reviewStartedAt" TIMESTAMP(3),
ADD COLUMN "reviewStartedById" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "decisionNote" TEXT;

-- CreateIndex
CREATE INDEX "legal_source_observations_reviewStatus_ingestedAt_idx" ON "legal_source_observations"("reviewStatus", "ingestedAt");

-- AddForeignKey
ALTER TABLE "legal_source_observations" ADD CONSTRAINT "legal_source_observations_reviewStartedById_fkey" FOREIGN KEY ("reviewStartedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_source_observations" ADD CONSTRAINT "legal_source_observations_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
