-- Phase 7A.1: scope-aware finding identity and transaction-safe uniqueness.
-- The original Phase 7A migration remains byte-immutable.

ALTER TABLE "assessment_findings" ADD COLUMN "scopeType" "FactScopeType";
ALTER TABLE "assessment_findings" ADD COLUMN "factSubjectId" TEXT;

UPDATE "assessment_findings" AS finding
SET "scopeType" = applicability."scopeType",
    "factSubjectId" = applicability."factSubjectId"
FROM "requirement_applicabilities" AS applicability
WHERE finding."requirementApplicabilityId" = applicability."id"
  AND finding."clientId" = applicability."clientId"
  AND finding."requirementId" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "assessment_findings"
    WHERE "requirementId" IS NOT NULL
      AND "scopeType" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 7A.1 backfill failed closed: materialized findings require scopeType';
  END IF;
END $$;

ALTER TABLE "assessment_findings"
  ADD CONSTRAINT "assessment_findings_materialized_scope_required_check"
  CHECK ("requirementId" IS NULL OR "scopeType" IS NOT NULL);

DROP INDEX IF EXISTS "assessment_findings_clientId_requirementId_materialized_key";

CREATE UNIQUE INDEX "assessment_findings_client_requirement_scope_subject_materialized_key"
  ON "assessment_findings"("clientId", "requirementId", "scopeType", "factSubjectId")
  WHERE "requirementId" IS NOT NULL
    AND "factSubjectId" IS NOT NULL;

CREATE UNIQUE INDEX "assessment_findings_client_requirement_scope_subjectless_materialized_key"
  ON "assessment_findings"("clientId", "requirementId", "scopeType")
  WHERE "requirementId" IS NOT NULL
    AND "factSubjectId" IS NULL;
