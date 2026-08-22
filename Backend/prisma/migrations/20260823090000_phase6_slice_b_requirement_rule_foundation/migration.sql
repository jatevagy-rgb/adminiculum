-- Phase 6 Slice B: global requirement, citation, and applicability-rule persistence.
-- No seed data, client ownership, evaluator, or runtime activation is introduced.

CREATE TYPE "RequirementStatus" AS ENUM ('CANDIDATE', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'RETIRED');
CREATE TYPE "RequirementVersionStatus" AS ENUM ('CANDIDATE', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'RETIRED');
CREATE TYPE "RequirementSourceSupportState" AS ENUM ('SUFFICIENT', 'INCOMPLETE', 'AMBIGUOUS', 'MISSING', 'LEGAL_REVIEW_REQUIRED');
CREATE TYPE "RequirementSpecialistRequirement" AS ENUM ('NONE', 'LEGAL_ONLY', 'TECHNICAL_CLASSIFICATION_REQUIRED');
CREATE TYPE "RequirementCitationSupportRole" AS ENUM ('PRIMARY', 'SUPPORTING', 'CONTEXT');
CREATE TYPE "ApplicabilityRuleStatus" AS ENUM ('CANDIDATE', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'RETIRED');

CREATE TABLE "compliance_domains" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER,
    CONSTRAINT "compliance_domains_pkey" PRIMARY KEY ("code")
);
CREATE INDEX "compliance_domains_active_sortOrder_idx" ON "compliance_domains"("active", "sortOrder");

CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "domainCode" TEXT NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "requirements_key_key" ON "requirements"("key");
CREATE INDEX "requirements_jurisdictionCode_domainCode_status_idx" ON "requirements"("jurisdictionCode", "domainCode", "status");
CREATE INDEX "requirements_status_idx" ON "requirements"("status");

CREATE TABLE "requirement_versions" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normativeStatement" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceSupportState" "RequirementSourceSupportState" NOT NULL DEFAULT 'MISSING',
    "specialistRequirement" "RequirementSpecialistRequirement" NOT NULL DEFAULT 'NONE',
    "specialistDomainCode" TEXT,
    "status" "RequirementVersionStatus" NOT NULL DEFAULT 'CANDIDATE',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "supersededById" TEXT,
    CONSTRAINT "requirement_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "requirement_versions_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    CONSTRAINT "requirement_versions_approved_support_check" CHECK ("status" <> 'APPROVED' OR "sourceSupportState" = 'SUFFICIENT'),
    CONSTRAINT "requirement_versions_no_self_supersession_check" CHECK ("supersededById" IS NULL OR "id" <> "supersededById")
);
CREATE UNIQUE INDEX "requirement_versions_requirementId_versionKey_key" ON "requirement_versions"("requirementId", "versionKey");
CREATE UNIQUE INDEX "requirement_versions_id_requirementId_key" ON "requirement_versions"("id", "requirementId");
CREATE INDEX "requirement_versions_requirementId_status_idx" ON "requirement_versions"("requirementId", "status");
CREATE INDEX "requirement_versions_status_effectiveFrom_idx" ON "requirement_versions"("status", "effectiveFrom");

CREATE TABLE "requirement_citations" (
    "id" TEXT NOT NULL,
    "requirementVersionId" TEXT NOT NULL,
    "legalSourceVersionId" TEXT NOT NULL,
    "supportRole" "RequirementCitationSupportRole" NOT NULL,
    "locator" TEXT,
    "article" TEXT,
    "section" TEXT,
    "paragraph" TEXT,
    "page" INTEGER,
    "quotedText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requirement_citations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "requirement_citations_requirementVersionId_supportRole_idx" ON "requirement_citations"("requirementVersionId", "supportRole");
CREATE INDEX "requirement_citations_legalSourceVersionId_idx" ON "requirement_citations"("legalSourceVersionId");

CREATE TABLE "applicability_rule_versions" (
    "id" TEXT NOT NULL,
    "requirementVersionId" TEXT NOT NULL,
    "ruleVersionKey" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "astJson" JSONB NOT NULL,
    "canonicalDigest" VARCHAR(64) NOT NULL,
    "status" "ApplicabilityRuleStatus" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "supersededById" TEXT,
    CONSTRAINT "applicability_rule_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "applicability_rule_versions_digest_format_check" CHECK ("canonicalDigest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "applicability_rule_versions_schema_check" CHECK ("schemaVersion" = 'rule-ast/v1'),
    CONSTRAINT "applicability_rule_versions_no_self_supersession_check" CHECK ("supersededById" IS NULL OR "id" <> "supersededById")
);
CREATE UNIQUE INDEX "applicability_rule_versions_requirementVersionId_ruleVersionKey_key" ON "applicability_rule_versions"("requirementVersionId", "ruleVersionKey");
CREATE UNIQUE INDEX "applicability_rule_versions_id_requirementVersionId_key" ON "applicability_rule_versions"("id", "requirementVersionId");
CREATE UNIQUE INDEX "applicability_rule_versions_one_approved_per_requirement_version"
    ON "applicability_rule_versions"("requirementVersionId")
    WHERE "status" = 'APPROVED';
CREATE INDEX "applicability_rule_versions_requirementVersionId_status_idx" ON "applicability_rule_versions"("requirementVersionId", "status");

CREATE TABLE "applicability_rule_fact_dependencies" (
    "id" TEXT NOT NULL,
    "applicabilityRuleVersionId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "resolvedFactDefinitionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "applicability_rule_fact_dependencies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "applicability_rule_fact_dependencies_applicabilityRuleVersionId_factKey_key"
    ON "applicability_rule_fact_dependencies"("applicabilityRuleVersionId", "factKey");
CREATE INDEX "applicability_rule_fact_dependencies_factKey_idx" ON "applicability_rule_fact_dependencies"("factKey");

ALTER TABLE "requirements" ADD CONSTRAINT "requirements_domainCode_fkey"
    FOREIGN KEY ("domainCode") REFERENCES "compliance_domains"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_supersededById_requirementId_fkey"
    FOREIGN KEY ("supersededById", "requirementId") REFERENCES "requirement_versions"("id", "requirementId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "requirement_citations" ADD CONSTRAINT "requirement_citations_requirementVersionId_fkey"
    FOREIGN KEY ("requirementVersionId") REFERENCES "requirement_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirement_citations" ADD CONSTRAINT "requirement_citations_legalSourceVersionId_fkey"
    FOREIGN KEY ("legalSourceVersionId") REFERENCES "legal_source_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applicability_rule_versions" ADD CONSTRAINT "applicability_rule_versions_requirementVersionId_fkey"
    FOREIGN KEY ("requirementVersionId") REFERENCES "requirement_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applicability_rule_versions" ADD CONSTRAINT "applicability_rule_versions_supersededById_requirementVersionId_fkey"
    FOREIGN KEY ("supersededById", "requirementVersionId") REFERENCES "applicability_rule_versions"("id", "requirementVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "applicability_rule_fact_dependencies" ADD CONSTRAINT "applicability_rule_fact_dependencies_applicabilityRuleVersionId_fkey"
    FOREIGN KEY ("applicabilityRuleVersionId") REFERENCES "applicability_rule_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applicability_rule_fact_dependencies" ADD CONSTRAINT "applicability_rule_fact_dependencies_resolvedFactDefinitionId_fkey"
    FOREIGN KEY ("resolvedFactDefinitionId") REFERENCES "fact_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
