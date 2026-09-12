-- CreateTable
CREATE TABLE "process_observation_snapshots" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "businessProcessId" TEXT NOT NULL,
    "metricVersion" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "inputDigest" VARCHAR(64) NOT NULL,
    "snapshotDigest" VARCHAR(64) NOT NULL,
    "metrics" JSONB NOT NULL,
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_observation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_observation_snapshots_clientId_businessProcessId_observedAt_idx" ON "process_observation_snapshots"("clientId", "businessProcessId", "observedAt");

-- CreateIndex
CREATE INDEX "process_observation_snapshots_clientId_businessProcessId_inputDigest_idx" ON "process_observation_snapshots"("clientId", "businessProcessId", "inputDigest");

-- CreateIndex
CREATE UNIQUE INDEX "process_observation_snapshots_id_clientId_key" ON "process_observation_snapshots"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "process_observation_snapshots_clientId_businessProcessId_metricVersion_inputDigest_observedAt_key" ON "process_observation_snapshots"("clientId", "businessProcessId", "metricVersion", "inputDigest", "observedAt");

-- AddForeignKey
ALTER TABLE "process_observation_snapshots" ADD CONSTRAINT "process_observation_snapshots_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_observation_snapshots" ADD CONSTRAINT "process_observation_snapshots_businessProcessId_clientId_fkey" FOREIGN KEY ("businessProcessId", "clientId") REFERENCES "business_processes"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;
