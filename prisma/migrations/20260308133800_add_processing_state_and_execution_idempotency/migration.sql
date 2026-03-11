-- Add explicit processing state for automation suggestion lifecycle
ALTER TYPE "AutomationSuggestionState" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- Suggestion lifecycle metadata
ALTER TABLE "automation_suggestions"
  ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);

-- Execution reliability metadata
ALTER TABLE "automation_execution_logs"
  ADD COLUMN IF NOT EXISTS "operationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureCode" TEXT,
  ADD COLUMN IF NOT EXISTS "failureDetails" JSONB;

-- Idempotency uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "automation_execution_logs_operationToken_key"
  ON "automation_execution_logs"("operationToken");

