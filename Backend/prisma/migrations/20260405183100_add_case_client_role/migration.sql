-- Add case-level client role field for C7 groundwork
ALTER TABLE "cases"
ADD COLUMN IF NOT EXISTS "clientRole" TEXT;

