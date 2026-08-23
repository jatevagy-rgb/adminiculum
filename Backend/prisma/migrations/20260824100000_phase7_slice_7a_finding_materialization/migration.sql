-- Phase 7 Slice 7A: current finding materialization identity and outcome.
-- Additive only. Historical migrations remain byte-immutable.

ALTER TABLE "assessment_findings" ADD COLUMN "requirementId" TEXT;
ALTER TABLE "assessment_findings" ADD COLUMN "applicabilityOutcome" "RequirementApplicabilityOutcome";

ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "assessment_findings_clientId_requirementId_idx"
  ON "assessment_findings"("clientId", "requirementId");

CREATE UNIQUE INDEX "assessment_findings_clientId_requirementId_materialized_key"
  ON "assessment_findings"("clientId", "requirementId")
  WHERE "requirementId" IS NOT NULL;
