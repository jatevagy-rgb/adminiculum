-- ============================================================================
-- Client Workload Tracking Module
-- ============================================================================
-- Creates ClientWorkgroup and WorkloadRecord tables for workload transparency
-- ============================================================================

-- Create ClientWorkgroups table
CREATE TABLE IF NOT EXISTS "client_workgroups" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "clientId" UUID NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE
);

-- Create unique constraint on (clientId, name)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_workgroups_clientId_name_unique"
ON "client_workgroups"("clientId", "name");

-- Create index on clientId
CREATE INDEX IF NOT EXISTS "idx_client_workgroups_clientId"
ON "client_workgroups"("clientId");

-- Create WorkloadRecords table
CREATE TABLE IF NOT EXISTS "workload_records" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "period" VARCHAR(7) NOT NULL, -- YYYY-MM format
    "reportedHours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "workgroupId" UUID NOT NULL REFERENCES "client_workgroups"("id") ON DELETE CASCADE
);

-- Create unique constraint on (workgroupId, period)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_workload_records_workgroupId_period_unique"
ON "workload_records"("workgroupId", "period");

-- Create index on workgroupId
CREATE INDEX IF NOT EXISTS "idx_workload_records_workgroupId"
ON "workload_records"("workgroupId");
