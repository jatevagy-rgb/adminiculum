-- CASE-INTAKE-REDESIGN-1
-- Additive only. Adds structured intake starting-context columns to cases, a
-- primary-thread marker on communications, and two new tables for external
-- participants and typed intake deadlines.
--
-- No existing column is dropped, renamed or rewritten. No data is backfilled.
-- Every statement is guarded so an accidental re-run cannot corrupt state.

-- ---------------------------------------------------------------------------
-- cases: structured intake starting context (all nullable, no default)
-- ---------------------------------------------------------------------------
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "intakeOriginReason" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "intakeCurrentSituation" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "intakeClientExpectation" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "intakeUrgentAction" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "intakeNextStep" TEXT;

-- ---------------------------------------------------------------------------
-- communications: mark the primary linked thread for a case
-- ---------------------------------------------------------------------------
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "isPrimaryForCase" BOOLEAN NOT NULL DEFAULT false;

-- At most one primary thread per case. Partial unique index so the many rows
-- with isPrimaryForCase = false (and the NULL caseId rows) remain unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "communications_primary_per_case_key"
  ON "communications" ("caseId")
  WHERE "isPrimaryForCase" = true AND "caseId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- case_external_participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "case_external_participants" (
  "id"           TEXT NOT NULL,
  "caseId"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "role"         TEXT NOT NULL,
  "side"         TEXT NOT NULL DEFAULT 'OTHER',
  "organization" TEXT,
  "email"        TEXT,
  "phone"        TEXT,
  "note"         TEXT,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_external_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_external_participants_caseId_idx"
  ON "case_external_participants" ("caseId");

-- ---------------------------------------------------------------------------
-- case_intake_deadlines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "case_intake_deadlines" (
  "id"                    TEXT NOT NULL,
  "caseId"                TEXT NOT NULL,
  "title"                 TEXT NOT NULL,
  "deadlineType"          TEXT NOT NULL,
  "dueAt"                 TIMESTAMP(3) NOT NULL,
  "inputMode"             TEXT NOT NULL DEFAULT 'ABSOLUTE',
  "relativeValue"         INTEGER,
  "relativeUnit"          TEXT,
  "reminderMinutesBefore" INTEGER,
  "responsibleId"         TEXT,
  "note"                  TEXT,
  "createdById"           TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_intake_deadlines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_intake_deadlines_caseId_dueAt_idx"
  ON "case_intake_deadlines" ("caseId", "dueAt");
CREATE INDEX IF NOT EXISTS "case_intake_deadlines_responsibleId_dueAt_idx"
  ON "case_intake_deadlines" ("responsibleId", "dueAt");

-- ---------------------------------------------------------------------------
-- Foreign keys and domain CHECK constraints (guarded)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "case_external_participants" ADD CONSTRAINT "case_external_participants_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_external_participants" ADD CONSTRAINT "case_external_participants_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_external_participants" ADD CONSTRAINT "case_external_participants_role_check"
    CHECK (length(btrim("role")) > 0 AND length("role") <= 64);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_external_participants" ADD CONSTRAINT "case_external_participants_name_check"
    CHECK (length(btrim("name")) > 0 AND length("name") <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_responsibleId_fkey"
    FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_type_check"
    CHECK ("deadlineType" IN ('STATUTORY','CLIENT_COMMITMENT','INTERNAL','NEXT_ACTION','OTHER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_input_mode_check"
    CHECK ("inputMode" IN ('ABSOLUTE','RELATIVE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A relative deadline must carry both a positive amount and a supported unit;
-- an absolute one must carry neither. This keeps the stored dueAt explainable.
DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_relative_check"
    CHECK (
      ("inputMode" = 'ABSOLUTE' AND "relativeValue" IS NULL AND "relativeUnit" IS NULL)
      OR
      ("inputMode" = 'RELATIVE' AND "relativeValue" IS NOT NULL AND "relativeValue" > 0
        AND "relativeUnit" IN ('MINUTE','HOUR','DAY','WEEK'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_reminder_check"
    CHECK ("reminderMinutesBefore" IS NULL OR ("reminderMinutesBefore" >= 0 AND "reminderMinutesBefore" <= 43200));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
