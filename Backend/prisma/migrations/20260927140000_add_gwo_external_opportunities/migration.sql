-- GWO-3A — company-scoped external opportunity current projection.
-- Additive only: one new table + indexes + foreign keys. No destructive SQL,
-- no data migration, no renames. Immutable history remains in observations.

-- CreateTable
CREATE TABLE "external_opportunities" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "businessKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "publicationAt" TIMESTAMP(3),
    "openingAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "sourceMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastRevisionIdentifier" TEXT,
    "lastContentHash" VARCHAR(64) NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "currentObservationId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_opportunities_id_clientId_key" ON "external_opportunities"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "external_opportunities_clientId_sourceType_businessKey_scopeKey_key" ON "external_opportunities"("clientId", "sourceType", "businessKey", "scopeKey");

-- CreateIndex
CREATE INDEX "external_opportunities_clientId_status_idx" ON "external_opportunities"("clientId", "status");

-- CreateIndex
CREATE INDEX "external_opportunities_clientId_sourceType_idx" ON "external_opportunities"("clientId", "sourceType");

-- CreateIndex
CREATE INDEX "external_opportunities_clientId_deadlineAt_idx" ON "external_opportunities"("clientId", "deadlineAt");

-- AddForeignKey
ALTER TABLE "external_opportunities" ADD CONSTRAINT "external_opportunities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_opportunities" ADD CONSTRAINT "external_opportunities_connectionId_clientId_fkey" FOREIGN KEY ("connectionId", "clientId") REFERENCES "external_source_connections"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_opportunities" ADD CONSTRAINT "external_opportunities_currentObservationId_clientId_fkey" FOREIGN KEY ("currentObservationId", "clientId") REFERENCES "observations"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
