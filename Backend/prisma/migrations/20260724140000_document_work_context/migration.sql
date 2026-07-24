-- DOCUMENT-WORK-CONTEXT-1
-- Additive only. Adds logical document work context, an explicit document/task
-- link table, and communication provenance.
--
-- Existing per-version state is untouched: DocumentVersionReviewStatus and
-- DocumentVersionPublicationStatus keep their meaning. The new workStatus is the
-- LOGICAL document work status and is intentionally a separate concern.
--
-- No column is dropped, renamed or rewritten. No data is backfilled: every new
-- column is nullable or carries a safe default, so existing rows stay valid.

-- ---------------------------------------------------------------------------
-- Logical document work status
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "DocumentWorkStatus" AS ENUM (
    'RECEIVED', 'WAITING_FOR_PROCESSING', 'IN_PROGRESS', 'INTERNAL_REVIEW',
    'CHANGES_REQUESTED', 'APPROVED', 'READY_FOR_CLIENT', 'SENT', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- documents: work context columns
-- ---------------------------------------------------------------------------
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "documentRole" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "workStatus" "DocumentWorkStatus" NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "workInstruction" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "workInstructionUpdatedAt" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "workInstructionUpdatedById" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "responsibleId" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "reviewerId" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "workPriority" "Priority";
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "nextStep" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "sourceCommunicationId" TEXT;

CREATE INDEX IF NOT EXISTS "documents_caseId_workStatus_idx" ON "documents" ("caseId", "workStatus");
CREATE INDEX IF NOT EXISTS "documents_responsibleId_workStatus_idx" ON "documents" ("responsibleId", "workStatus");
CREATE INDEX IF NOT EXISTS "documents_reviewerId_workStatus_idx" ON "documents" ("reviewerId", "workStatus");
CREATE INDEX IF NOT EXISTS "documents_dueDate_idx" ON "documents" ("dueDate");

-- People referenced by work context may leave; the document must survive them.
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_responsibleId_fkey"
    FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_workInstructionUpdatedById_fkey"
    FOREIGN KEY ("workInstructionUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Provenance link. SET NULL so removing a communication never destroys the document.
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_sourceCommunicationId_fkey"
    FOREIGN KEY ("sourceCommunicationId") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bound the free-text work fields at the database as well as the service.
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_work_instruction_len_check"
    CHECK ("workInstruction" IS NULL OR length("workInstruction") <= 4000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_title_len_check"
    CHECK ("title" IS NULL OR length("title") <= 300);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_next_step_len_check"
    CHECK ("nextStep" IS NULL OR length("nextStep") <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- document_task_links: explicit two-way document <-> task relationship
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "document_task_links" (
  "id"          TEXT NOT NULL,
  "documentId"  TEXT NOT NULL,
  "taskId"      TEXT NOT NULL,
  "note"        TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_task_links_pkey" PRIMARY KEY ("id")
);

-- A duplicate link is impossible at the database level, not merely discouraged.
CREATE UNIQUE INDEX IF NOT EXISTS "document_task_links_documentId_taskId_key"
  ON "document_task_links" ("documentId", "taskId");
CREATE INDEX IF NOT EXISTS "document_task_links_taskId_idx"
  ON "document_task_links" ("taskId");

DO $$ BEGIN
  ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Restrict: the person who made a link must not be erasable out from under it.
DO $$ BEGIN
  ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_note_len_check"
    CHECK ("note" IS NULL OR length("note") <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
