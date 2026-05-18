-- Patch 3F: comparison snapshot foundation
ALTER TABLE "contract_generations"
ADD COLUMN IF NOT EXISTS "comparisonSnapshot" JSONB;

