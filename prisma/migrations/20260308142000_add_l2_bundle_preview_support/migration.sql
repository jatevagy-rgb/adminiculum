-- L2 preview support on automation suggestions
ALTER TYPE "AutomationSuggestionType" ADD VALUE IF NOT EXISTS 'ACTION_BUNDLE';

ALTER TABLE "automation_suggestions"
  ADD COLUMN IF NOT EXISTS "bundlePreview" JSONB;
