-- Pre-Level-3 hardening: normalized step logs + action policy foundation

DO $$
BEGIN
  CREATE TYPE "AutomationActionPolicy" AS ENUM (
    'SAFE_AUTOPILOT_ALLOWED',
    'USER_APPROVAL_REQUIRED',
    'NEVER_AUTOPILOT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AutomationStepRetryability" AS ENUM (
    'RETRYABLE',
    'MANUAL_RETRY_ONLY',
    'NON_RETRYABLE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AutomationCompensationReadiness" AS ENUM (
    'NONE',
    'COMPENSATION_READY',
    'MANUAL_COMPENSATION_REQUIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "automation_execution_step_logs" (
  "id" TEXT NOT NULL,
  "executionLogId" TEXT NOT NULL,
  "suggestionId" TEXT,
  "userId" TEXT NOT NULL,
  "entityType" "AutomationEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "executionMode" "AutomationExecutionMode" NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "actionKey" TEXT NOT NULL,
  "payloadClass" TEXT,
  "status" "AutomationExecutionStatus" NOT NULL,
  "actionPolicy" "AutomationActionPolicy" NOT NULL,
  "retryability" "AutomationStepRetryability" NOT NULL,
  "compensationReadiness" "AutomationCompensationReadiness" NOT NULL,
  "compensationHint" TEXT,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "resultSummary" TEXT,
  "failureCode" TEXT,
  "failureDetails" JSONB,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_execution_step_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "automation_execution_step_logs_executionLogId_stepOrder_key"
  ON "automation_execution_step_logs"("executionLogId", "stepOrder");

CREATE INDEX IF NOT EXISTS "automation_execution_step_logs_suggestionId_idx"
  ON "automation_execution_step_logs"("suggestionId");

CREATE INDEX IF NOT EXISTS "automation_execution_step_logs_userId_createdAt_idx"
  ON "automation_execution_step_logs"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "automation_execution_step_logs_status_createdAt_idx"
  ON "automation_execution_step_logs"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "automation_execution_step_logs_actionKey_createdAt_idx"
  ON "automation_execution_step_logs"("actionKey", "createdAt");

DO $$
BEGIN
  ALTER TABLE "automation_execution_step_logs"
    ADD CONSTRAINT "automation_execution_step_logs_executionLogId_fkey"
    FOREIGN KEY ("executionLogId") REFERENCES "automation_execution_logs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "automation_execution_step_logs"
    ADD CONSTRAINT "automation_execution_step_logs_suggestionId_fkey"
    FOREIGN KEY ("suggestionId") REFERENCES "automation_suggestions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "automation_execution_step_logs"
    ADD CONSTRAINT "automation_execution_step_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

