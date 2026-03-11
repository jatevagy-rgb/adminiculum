-- Enums
CREATE TYPE "AutomationSuppressionType" AS ENUM ('ACTION_KEY', 'TEMPLATE_ID');
CREATE TYPE "AutomationEntityType" AS ENUM ('TASK', 'CASE', 'DOCUMENT');
CREATE TYPE "AutomationEventSource" AS ENUM ('HUMAN', 'AUTOMATION');
CREATE TYPE "AutomationSuggestionType" AS ENUM ('NEXT_STEP');
CREATE TYPE "AutomationSuggestionState" AS ENUM ('OFFERED', 'ACCEPTED', 'DISMISSED', 'EXPIRED');
CREATE TYPE "AutomationExecutionMode" AS ENUM ('LEVEL1', 'LEVEL2', 'LEVEL3');
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- Tables
CREATE TABLE "user_automation_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "suggestionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "level1Enabled" BOOLEAN NOT NULL DEFAULT true,
  "level2Enabled" BOOLEAN NOT NULL DEFAULT true,
  "level3Enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_automation_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_automation_suppressions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "suppressionType" "AutomationSuppressionType" NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_automation_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_trigger_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" "AutomationEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "screen" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "payloadClass" TEXT,
  "contextKey" TEXT NOT NULL,
  "source" "AutomationEventSource" NOT NULL DEFAULT 'HUMAN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_trigger_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_suggestions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" "AutomationEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "suggestionType" "AutomationSuggestionType" NOT NULL,
  "suggestedActionKey" TEXT NOT NULL,
  "suggestedPayloadClass" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL,
  "contextKey" TEXT NOT NULL,
  "state" "AutomationSuggestionState" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_execution_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" "AutomationEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "suggestionId" TEXT,
  "executionMode" "AutomationExecutionMode" NOT NULL,
  "status" "AutomationExecutionStatus" NOT NULL,
  "resultSummary" TEXT,
  "rollbackData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_execution_logs_pkey" PRIMARY KEY ("id")
);

-- Constraints
CREATE UNIQUE INDEX "user_automation_preferences_userId_key" ON "user_automation_preferences"("userId");

-- Requested indexes
CREATE INDEX "user_automation_suppressions_userId_suppressionType_value_idx"
  ON "user_automation_suppressions"("userId", "suppressionType", "value");

CREATE INDEX "automation_trigger_events_userId_entityType_entityId_idx"
  ON "automation_trigger_events"("userId", "entityType", "entityId");

CREATE INDEX "automation_trigger_events_userId_contextKey_idx"
  ON "automation_trigger_events"("userId", "contextKey");

CREATE INDEX "automation_trigger_events_createdAt_idx"
  ON "automation_trigger_events"("createdAt");

CREATE INDEX "automation_suggestions_userId_entityType_entityId_state_idx"
  ON "automation_suggestions"("userId", "entityType", "entityId", "state");

CREATE INDEX "automation_execution_logs_userId_entityType_entityId_idx"
  ON "automation_execution_logs"("userId", "entityType", "entityId");

CREATE INDEX "automation_execution_logs_createdAt_idx"
  ON "automation_execution_logs"("createdAt");

-- FKs
ALTER TABLE "user_automation_preferences"
  ADD CONSTRAINT "user_automation_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_automation_suppressions"
  ADD CONSTRAINT "user_automation_suppressions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_trigger_events"
  ADD CONSTRAINT "automation_trigger_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_suggestions"
  ADD CONSTRAINT "automation_suggestions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_execution_logs"
  ADD CONSTRAINT "automation_execution_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_execution_logs"
  ADD CONSTRAINT "automation_execution_logs_suggestionId_fkey"
  FOREIGN KEY ("suggestionId") REFERENCES "automation_suggestions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

