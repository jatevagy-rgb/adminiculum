-- W2B: Case-first time attribution + nullable matter compatibility
-- ================================================================
--
-- 1. DROP NOT NULL on time_entries.matterId
-- 2. ADD nullable caseId column
-- 3. ADD foreign key constraint for caseId -> cases(id) with RESTRICT on delete
-- 4. ADD index on caseId
-- 5. Deterministic, idempotent backfill

-- Step 1: Make matterId nullable
ALTER TABLE "time_entries" ALTER COLUMN "matterId" DROP NOT NULL;

-- Step 2: Add nullable caseId column
ALTER TABLE "time_entries" ADD COLUMN "caseId" TEXT;

-- Step 3: Add foreign key constraint (RESTRICT on delete to preserve history)
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 4: Add index for caseId lookups
CREATE INDEX "time_entries_caseId_idx" ON "time_entries"("caseId");

-- ================================================================
-- Step 5: Deterministic, idempotent backfill
-- ================================================================
--
-- Rule A: Task-linked rows — derive caseId from Task.caseId
-- Only where TimeEntry.caseId is currently NULL.
-- ================================================================

UPDATE "time_entries" te
SET "caseId" = t."caseId"
FROM "tasks" t
WHERE te."taskId" = t."id"
  AND te."caseId" IS NULL
  AND t."caseId" IS NOT NULL;

-- ================================================================
-- Rule B: Matter-only rows — populate caseId only when that Matter
-- maps to exactly one Case.
-- ================================================================

UPDATE "time_entries" te
SET "caseId" = sub."single_case_id"
FROM (
  SELECT c."matterId", MIN(c."id") AS "single_case_id"
  FROM "cases" c
  WHERE c."matterId" IS NOT NULL
  GROUP BY c."matterId"
  HAVING COUNT(*) = 1
) sub
WHERE te."matterId" = sub."matterId"
  AND te."caseId" IS NULL
  AND te."taskId" IS NULL;

-- Rule C: Ambiguous rows (Matter maps to multiple Cases, no Task link)
-- are left with caseId = NULL. No action needed — this is the default.
