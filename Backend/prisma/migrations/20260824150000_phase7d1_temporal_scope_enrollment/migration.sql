CREATE TYPE "ComplianceEnrollmentStatus" AS ENUM ('ENROLLED', 'NOT_ENROLLED', 'SUSPENDED');

ALTER TABLE "client_operating_profiles"
  ADD COLUMN "complianceEnrollmentStatus" "ComplianceEnrollmentStatus" NOT NULL DEFAULT 'NOT_ENROLLED';

UPDATE "client_operating_profiles" SET "complianceEnrollmentStatus" = 'ENROLLED';

ALTER TABLE "applicability_rule_versions"
  ADD COLUMN "evaluationScopeType" "FactScopeType";

CREATE UNIQUE INDEX "requirement_versions_one_approved_effective_from"
  ON "requirement_versions"("requirementId", "effectiveFrom")
  WHERE "status" = 'APPROVED';

DROP INDEX "applicability_rule_versions_one_approved_per_requirement_version";
CREATE UNIQUE INDEX "applicability_rule_versions_one_current_approved_per_requirement_version"
  ON "applicability_rule_versions"("requirementVersionId")
  WHERE "status" = 'APPROVED' AND "supersededById" IS NULL;
