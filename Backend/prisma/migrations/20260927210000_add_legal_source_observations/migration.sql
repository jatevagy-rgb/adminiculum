-- W2 — machine-ingested legal-source observations (internal, non-tenant).
-- Purely additive: new enum + new table. No existing table, column, enum or row
-- is altered, and the client-scoped "observations" model is untouched.
-- Idempotency is enforced by the unique idempotencyKey; payloadDigest is a
-- SHA-256 over the canonicalized semantic payload. FKs are RESTRICT so an
-- observation's provenance can never be silently cascaded away.

-- CreateEnum
CREATE TYPE "LegalSourceObservationKind" AS ENUM ('AMENDMENT_PUBLISHED', 'CONSOLIDATED_VERSION_AVAILABLE');

-- CreateTable
CREATE TABLE "legal_source_observations" (
    "id" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "payloadDigest" VARCHAR(64) NOT NULL,
    "kind" "LegalSourceObservationKind" NOT NULL,
    "source" TEXT NOT NULL,
    "identifierFamily" TEXT NOT NULL,
    "sourceIdentifier" TEXT NOT NULL,
    "relatedIdentifier" TEXT NOT NULL,
    "legalSourceId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "sourceUri" TEXT NOT NULL,
    "evidenceSha256" VARCHAR(64) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "queryProvenance" JSONB,
    "warnings" JSONB,
    "legalSourceVersionId" TEXT,
    "legalSourceCaptureId" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_source_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_source_observations_idempotencyKey_key" ON "legal_source_observations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "legal_source_observations_legalSourceId_kind_idx" ON "legal_source_observations"("legalSourceId", "kind");

-- CreateIndex
CREATE INDEX "legal_source_observations_sourceIdentifier_kind_idx" ON "legal_source_observations"("sourceIdentifier", "kind");

-- CreateIndex
CREATE INDEX "legal_source_observations_legalSourceVersionId_idx" ON "legal_source_observations"("legalSourceVersionId");

-- CreateIndex
CREATE INDEX "legal_source_observations_legalSourceCaptureId_idx" ON "legal_source_observations"("legalSourceCaptureId");

-- CreateIndex
CREATE INDEX "legal_source_observations_capturedAt_idx" ON "legal_source_observations"("capturedAt");

-- AddForeignKey
ALTER TABLE "legal_source_observations" ADD CONSTRAINT "legal_source_observations_legalSourceId_fkey" FOREIGN KEY ("legalSourceId") REFERENCES "legal_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_source_observations" ADD CONSTRAINT "legal_source_observations_legalSourceVersionId_fkey" FOREIGN KEY ("legalSourceVersionId") REFERENCES "legal_source_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_source_observations" ADD CONSTRAINT "legal_source_observations_legalSourceCaptureId_fkey" FOREIGN KEY ("legalSourceCaptureId") REFERENCES "legal_source_captures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
