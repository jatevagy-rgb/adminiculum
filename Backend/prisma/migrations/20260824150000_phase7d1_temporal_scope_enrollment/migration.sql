CREATE TYPE "ComplianceEnrollmentStatus" AS ENUM ('ENROLLED', 'NOT_ENROLLED', 'SUSPENDED');

ALTER TABLE "client_operating_profiles"
  ADD COLUMN "complianceEnrollmentStatus" "ComplianceEnrollmentStatus" NOT NULL DEFAULT 'NOT_ENROLLED';

UPDATE "client_operating_profiles"
SET "complianceEnrollmentStatus" = 'ENROLLED';

ALTER TABLE "applicability_rule_versions"
  ADD COLUMN "evaluationScopeType" "FactScopeType";

-- Backfill only singleton dependency-scope intersections. Every other legacy
-- rule remains NULL and is rejected by the runtime approval/effective resolver.
WITH rule_dependencies AS (
  SELECT d."applicabilityRuleVersionId", d."resolvedFactDefinitionId",
         f."allowedScopeTypes"
  FROM "applicability_rule_fact_dependencies" d
  LEFT JOIN "fact_definitions" f ON f."id" = d."resolvedFactDefinitionId"
), candidates AS (
  SELECT "applicabilityRuleVersionId", scope
  FROM rule_dependencies, LATERAL unnest("allowedScopeTypes") AS scope
  WHERE "resolvedFactDefinitionId" IS NOT NULL
  GROUP BY "applicabilityRuleVersionId", scope
  HAVING COUNT(*) = (SELECT COUNT(*) FROM rule_dependencies all_deps WHERE all_deps."applicabilityRuleVersionId" = rule_dependencies."applicabilityRuleVersionId")
), singleton AS (
  SELECT "applicabilityRuleVersionId", min(scope)::"FactScopeType" AS scope
  FROM candidates GROUP BY "applicabilityRuleVersionId" HAVING COUNT(*) = 1
)
UPDATE "applicability_rule_versions" rule
SET "evaluationScopeType" = singleton.scope
FROM singleton
WHERE rule."id" = singleton."applicabilityRuleVersionId";

CREATE UNIQUE INDEX "requirement_versions_one_approved_effective_from"
  ON "requirement_versions"("requirementId", "effectiveFrom")
  WHERE "status" = 'APPROVED';

DROP INDEX "applicability_rule_versions_one_approved_per_requirement_version";
CREATE UNIQUE INDEX "applicability_rule_versions_one_current_approved_per_requirement_version"
  ON "applicability_rule_versions"("requirementVersionId")
  WHERE "status" = 'APPROVED' AND "supersededById" IS NULL;
