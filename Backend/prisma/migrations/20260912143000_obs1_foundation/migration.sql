-- CreateEnum
CREATE TYPE "ExternalSourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscoveryRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('GENERIC_RECORD', 'PERSON_RECORD', 'SYSTEM_RECORD', 'PROCESS_RECORD', 'PROCESS_STEP_RECORD', 'VENDOR_RECORD', 'DOCUMENT_RECORD', 'FACT_RECORD');

-- CreateTable
CREATE TABLE "external_source_connections" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ExternalSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_source_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "DiscoveryRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "discoveryRunId" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "inputDigest" VARCHAR(64) NOT NULL,
    "observationType" "ObservationType" NOT NULL DEFAULT 'GENERIC_RECORD',
    "rawPayload" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_source_connections_clientId_status_idx" ON "external_source_connections"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "external_source_connections_id_clientId_key" ON "external_source_connections"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_runs_id_clientId_key" ON "discovery_runs"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_runs_id_clientId_connectionId_key" ON "discovery_runs"("id", "clientId", "connectionId");

-- CreateIndex
CREATE INDEX "observations_clientId_observationType_idx" ON "observations"("clientId", "observationType");

-- CreateIndex
CREATE INDEX "observations_clientId_connectionId_discoveryRunId_idx" ON "observations"("clientId", "connectionId", "discoveryRunId");

-- CreateIndex
CREATE UNIQUE INDEX "observations_id_clientId_key" ON "observations"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "observations_clientId_connectionId_idempotencyKey_key" ON "observations"("clientId", "connectionId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "external_source_connections" ADD CONSTRAINT "external_source_connections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_connectionId_clientId_fkey" FOREIGN KEY ("connectionId", "clientId") REFERENCES "external_source_connections"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_connectionId_clientId_fkey" FOREIGN KEY ("connectionId", "clientId") REFERENCES "external_source_connections"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_discoveryRunId_clientId_connectionId_fkey" FOREIGN KEY ("discoveryRunId", "clientId", "connectionId") REFERENCES "discovery_runs"("id", "clientId", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
