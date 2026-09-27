-- Contract Date Extraction — candidate persistence foundation.
-- Additive only: one new enum, one new table. No destructive statements, no
-- backfill, no reinterpretation of legacy data, no change to any existing table.
-- Extraction output is a CANDIDATE bound to one immutable DocumentVersion;
-- canonical ContractRecord / ClientObligationOccurrence rows are only ever
-- written by an explicit lawyer Confirm through the existing canonical service.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractDateCandidateStatus') THEN
    CREATE TYPE "ContractDateCandidateStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "contract_date_candidates" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "dateType" TEXT NOT NULL,
  "proposedDate" TIMESTAMP(3) NOT NULL,
  "sourceExcerpt" TEXT NOT NULL,
  "excerptStartOffset" INTEGER,
  "excerptEndOffset" INTEGER,
  "excerptHash" TEXT,
  "provenance" TEXT NOT NULL,
  "aiPromptDraftId" TEXT,
  "status" "ContractDateCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "targetContractId" TEXT,
  "targetOccurrenceId" TEXT,
  "decisionReason" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_date_candidates_pkey" PRIMARY KEY ("id")
);

-- Dedupe identity: a rejected/pending/confirmed candidate for the same exact
-- (version, type, date, excerpt) identity cannot be created twice. PostgreSQL
-- permits multiple NULLs in a unique index, but the service always writes a
-- non-null excerptHash.
CREATE UNIQUE INDEX IF NOT EXISTS "contract_date_candidates_documentVersionId_dateType_proposedDate_excerptHash_key"
  ON "contract_date_candidates"("documentVersionId", "dateType", "proposedDate", "excerptHash");
CREATE INDEX IF NOT EXISTS "contract_date_candidates_documentId_status_idx"
  ON "contract_date_candidates"("documentId", "status");
CREATE INDEX IF NOT EXISTS "contract_date_candidates_documentVersionId_status_idx"
  ON "contract_date_candidates"("documentVersionId", "status");
CREATE INDEX IF NOT EXISTS "contract_date_candidates_targetContractId_idx"
  ON "contract_date_candidates"("targetContractId");
CREATE INDEX IF NOT EXISTS "contract_date_candidates_decidedById_idx"
  ON "contract_date_candidates"("decidedById");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_date_candidates_documentId_fkey') THEN
    ALTER TABLE "contract_date_candidates" ADD CONSTRAINT "contract_date_candidates_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_date_candidates_documentVersion_fkey') THEN
    ALTER TABLE "contract_date_candidates" ADD CONSTRAINT "contract_date_candidates_documentVersion_fkey"
      FOREIGN KEY ("documentId", "documentVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_date_candidates_createdById_fkey') THEN
    ALTER TABLE "contract_date_candidates" ADD CONSTRAINT "contract_date_candidates_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_date_candidates_decidedById_fkey') THEN
    ALTER TABLE "contract_date_candidates" ADD CONSTRAINT "contract_date_candidates_decidedById_fkey"
      FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_date_candidates_targetContractId_fkey') THEN
    ALTER TABLE "contract_date_candidates" ADD CONSTRAINT "contract_date_candidates_targetContractId_fkey"
      FOREIGN KEY ("targetContractId") REFERENCES "contract_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- DB-level offset sanity when both offsets are present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_date_candidates_range_check') THEN
    ALTER TABLE "contract_date_candidates"
      ADD CONSTRAINT "contract_date_candidates_range_check"
      CHECK ("excerptStartOffset" IS NULL OR "excerptEndOffset" IS NULL OR ("excerptStartOffset" >= 0 AND "excerptEndOffset" > "excerptStartOffset"));
  END IF;
END $$;
