-- Phase 6 Slice D: immutable deterministic requirement applicability snapshots.
-- Additive only. Historical migrations remain byte-immutable.

CREATE TYPE "RequirementApplicabilityOutcome" AS ENUM (
  'APPLIES',
  'DOES_NOT_APPLY',
  'INSUFFICIENT_FACTS',
  'LEGAL_REVIEW_REQUIRED',
  'TECHNICAL_REVIEW_REQUIRED',
  'SOURCE_SUPPORT_INSUFFICIENT'
);

CREATE TABLE "requirement_applicabilities" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "requirementVersionId" TEXT NOT NULL,
  "ruleVersionId" TEXT NOT NULL,
  "ruleDigest" VARCHAR(64) NOT NULL,
  "outcome" "RequirementApplicabilityOutcome" NOT NULL,
  "scopeType" "FactScopeType" NOT NULL,
  "factSubjectId" TEXT,
  "evaluationAt" TIMESTAMP(3) NOT NULL,
  "referencePeriodStart" TIMESTAMP(3),
  "referencePeriodEnd" TIMESTAMP(3),
  "sourceSupportState" "RequirementSourceSupportState" NOT NULL,
  "specialistRequirement" "RequirementSpecialistRequirement" NOT NULL,
  "specialistDomainCode" TEXT,
  "schemaVersion" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "snapshotDigest" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requirement_applicabilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requirement_applicabilities_rule_digest_check" CHECK ("ruleDigest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "requirement_applicabilities_snapshot_digest_check" CHECK ("snapshotDigest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "requirement_applicabilities_schema_check" CHECK ("schemaVersion" = 'phase6-requirement-applicability/v1'),
  CONSTRAINT "requirement_applicabilities_reference_period_check" CHECK ("referencePeriodEnd" IS NULL OR "referencePeriodStart" IS NOT NULL AND "referencePeriodEnd" >= "referencePeriodStart")
);
CREATE UNIQUE INDEX "requirement_applicabilities_id_clientId_key" ON "requirement_applicabilities"("id", "clientId");
CREATE INDEX "requirement_applicabilities_clientId_evaluationAt_idx" ON "requirement_applicabilities"("clientId", "evaluationAt");
CREATE INDEX "requirement_applicabilities_requirementVersionId_ruleVersionId_idx" ON "requirement_applicabilities"("requirementVersionId", "ruleVersionId");

CREATE TABLE "requirement_applicability_facts" (
  "id" TEXT NOT NULL,
  "applicabilityId" TEXT NOT NULL,
  "clientFactId" TEXT NOT NULL,
  "factDefinitionId" TEXT NOT NULL,
  "factKey" TEXT NOT NULL,
  "normalizedValueDigest" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requirement_applicability_facts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requirement_applicability_facts_digest_check" CHECK ("normalizedValueDigest" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "requirement_applicability_facts_applicabilityId_factKey_clientFactId_key" ON "requirement_applicability_facts"("applicabilityId", "factKey", "clientFactId");
CREATE INDEX "requirement_applicability_facts_applicabilityId_factKey_idx" ON "requirement_applicability_facts"("applicabilityId", "factKey");
CREATE INDEX "requirement_applicability_facts_applicabilityId_idx" ON "requirement_applicability_facts"("applicabilityId");
CREATE INDEX "requirement_applicability_facts_clientFactId_idx" ON "requirement_applicability_facts"("clientFactId");

ALTER TABLE "assessment_findings" ADD COLUMN "requirementApplicabilityId" TEXT;
CREATE INDEX "assessment_findings_requirementApplicabilityId_idx" ON "assessment_findings"("requirementApplicabilityId");

ALTER TABLE "requirement_applicabilities" ADD CONSTRAINT "requirement_applicabilities_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement_applicabilities" ADD CONSTRAINT "requirement_applicabilities_requirementVersionId_fkey"
  FOREIGN KEY ("requirementVersionId") REFERENCES "requirement_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement_applicabilities" ADD CONSTRAINT "requirement_applicabilities_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "applicability_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement_applicability_facts" ADD CONSTRAINT "requirement_applicability_facts_applicabilityId_fkey"
  FOREIGN KEY ("applicabilityId") REFERENCES "requirement_applicabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_requirementApplicabilityId_clientId_fkey"
  FOREIGN KEY ("requirementApplicabilityId", "clientId") REFERENCES "requirement_applicabilities"("id", "clientId") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE FUNCTION phase6_requirement_applicability_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'RequirementApplicability snapshots are immutable';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION phase6_requirement_applicability_fact_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'RequirementApplicabilityFact provenance is immutable';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER requirement_applicabilities_immutable
BEFORE UPDATE ON "requirement_applicabilities"
FOR EACH ROW EXECUTE FUNCTION phase6_requirement_applicability_immutable();
CREATE TRIGGER requirement_applicability_facts_immutable
BEFORE UPDATE ON "requirement_applicability_facts"
FOR EACH ROW EXECUTE FUNCTION phase6_requirement_applicability_fact_immutable();
