-- Add richer client identity fields for legal/business workflows
ALTER TABLE "clients"
ADD COLUMN IF NOT EXISTS "taxNumber" TEXT,
ADD COLUMN IF NOT EXISTS "companyRegistrationNumber" TEXT,
ADD COLUMN IF NOT EXISTS "authorizedRepresentative" TEXT;

-- Backfill newly introduced taxNumber from legacy vatNumber when available
UPDATE "clients"
SET "taxNumber" = "vatNumber"
WHERE "taxNumber" IS NULL
  AND "vatNumber" IS NOT NULL;
