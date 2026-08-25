-- Organization client answer discovery is additive.  Existing facts do not
-- imply an answer state; absence remains the persisted representation of an
-- unanswered question.
CREATE TYPE "FactAnswerStatus" AS ENUM ('ANSWERED', 'UNKNOWN');

CREATE TABLE "client_fact_answer_states" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "factDefinitionId" TEXT NOT NULL,
    "scopeType" "FactScopeType" NOT NULL,
    "factSubjectId" TEXT,
    "currentFactId" TEXT,
    "status" "FactAnswerStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_fact_answer_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_fact_answer_states_currentFactId_key" UNIQUE ("currentFactId"),
    CONSTRAINT "client_fact_answer_states_status_fact_check" CHECK (
      ("status" = 'ANSWERED' AND "currentFactId" IS NOT NULL)
      OR ("status" = 'UNKNOWN' AND "currentFactId" IS NULL)
    )
);

CREATE UNIQUE INDEX "client_fact_answer_states_company_key"
  ON "client_fact_answer_states" ("clientId", "factDefinitionId", "scopeType")
  WHERE "factSubjectId" IS NULL;
CREATE UNIQUE INDEX "client_fact_answer_states_subject_key"
  ON "client_fact_answer_states" ("clientId", "factDefinitionId", "scopeType", "factSubjectId")
  WHERE "factSubjectId" IS NOT NULL;
CREATE INDEX "client_fact_answer_states_clientId_status_idx"
  ON "client_fact_answer_states" ("clientId", "status");
CREATE INDEX "client_fact_answer_states_lookup_idx"
  ON "client_fact_answer_states" ("clientId", "factDefinitionId", "scopeType", "factSubjectId");

ALTER TABLE "client_fact_answer_states"
  ADD CONSTRAINT "client_fact_answer_states_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_fact_answer_states"
  ADD CONSTRAINT "client_fact_answer_states_factDefinitionId_fkey"
  FOREIGN KEY ("factDefinitionId") REFERENCES "fact_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_fact_answer_states"
  ADD CONSTRAINT "client_fact_answer_states_factSubjectId_fkey"
  FOREIGN KEY ("factSubjectId") REFERENCES "fact_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_fact_answer_states"
  ADD CONSTRAINT "client_fact_answer_states_currentFactId_fkey"
  FOREIGN KEY ("currentFactId") REFERENCES "client_facts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
