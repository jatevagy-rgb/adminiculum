-- Phase 6 Slice A: additive fact and legal-source persistence foundation.
-- No legacy rows are rewritten and no production compliance writer is enabled.

CREATE TYPE "FactValueType" AS ENUM ('BOOLEAN', 'ENUM', 'NUMBER', 'MONEY', 'DATE', 'DATETIME', 'STRING', 'JURISDICTION', 'ENTITY_REFERENCE', 'MULTI_ENUM', 'PERIOD');
CREATE TYPE "FactScopeType" AS ENUM ('COMPANY', 'WORKPLACE_SITE', 'EMPLOYEE', 'EVENT', 'SALES_CHANNEL', 'PRODUCT_SERVICE', 'CONTRACT', 'TAX_PERIOD', 'TRANSACTION', 'REPORTING_EVENT');
CREATE TYPE "FactDeterminationMethod" AS ENUM ('USER_PROVIDED', 'DERIVED', 'LEGAL_CLASSIFICATION_REQUIRED', 'TECHNICAL_CLASSIFICATION_REQUIRED');
CREATE TYPE "FactOverlapPolicy" AS ENUM ('ALLOW', 'DISALLOW');
CREATE TYPE "FactTemporalPolicy" AS ENUM ('VALIDITY_INTERVAL', 'OBSERVATION', 'EFFECTIVE_INSTANT', 'REFERENCE_PERIOD', 'EVENT');
CREATE TYPE "FactDefinitionStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'RETIRED');
CREATE TYPE "LegalSourceStatus" AS ENUM ('CANDIDATE', 'LEGAL_REVIEW_REQUIRED', 'APPROVED', 'RETIRED');
CREATE TYPE "LegalSourceInstrumentType" AS ENUM ('LEGISLATION', 'REGULATION', 'GUIDANCE', 'STANDARD', 'CASE_LAW', 'OTHER');
CREATE TYPE "LegalSourceVersionStatus" AS ENUM ('CANDIDATE', 'ACTIVE', 'SUPERSEDED', 'RETIRED');
CREATE TYPE "LegalSourceReviewStatus" AS ENUM ('UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'VERSION_AMBIGUOUS');
CREATE TYPE "LegalSourceCaptureCompleteness" AS ENUM ('COMPLETE', 'PARTIAL', 'UNKNOWN');
CREATE TYPE "LegalSourceCaptureStatus" AS ENUM ('CANDIDATE', 'CAPTURED', 'REVIEWED', 'REJECTED');
CREATE TYPE "LegalSourceCaptureAmbiguityStatus" AS ENUM ('NONE', 'POSSIBLE_DUPLICATE', 'VERSION_AMBIGUOUS');

CREATE TABLE "fact_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "domainCode" TEXT NOT NULL,
    "valueType" "FactValueType" NOT NULL,
    "allowedEnumValues" JSONB,
    "allowedScopeTypes" "FactScopeType"[] NOT NULL,
    "determinationMethod" "FactDeterminationMethod" NOT NULL,
    "overlapPolicy" "FactOverlapPolicy" NOT NULL,
    "temporalPolicy" "FactTemporalPolicy" NOT NULL,
    "questionKey" TEXT,
    "status" "FactDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    CONSTRAINT "fact_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fact_definitions_key_key" ON "fact_definitions"("key");
CREATE INDEX "fact_definitions_status_valueType_idx" ON "fact_definitions"("status", "valueType");
CREATE INDEX "fact_definitions_domainCode_status_idx" ON "fact_definitions"("domainCode", "status");

CREATE TABLE "fact_subjects" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopeType" "FactScopeType" NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "displayLabel" TEXT,
    "contractRecordId" TEXT,
    "organizationPersonId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "fact_subjects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fact_subjects_clientId_scopeType_subjectKey_key" ON "fact_subjects"("clientId", "scopeType", "subjectKey");
CREATE UNIQUE INDEX "fact_subjects_contractRecordId_key" ON "fact_subjects"("contractRecordId");
CREATE UNIQUE INDEX "fact_subjects_organizationPersonId_key" ON "fact_subjects"("organizationPersonId");
CREATE INDEX "fact_subjects_clientId_scopeType_idx" ON "fact_subjects"("clientId", "scopeType");
CREATE INDEX "fact_subjects_clientId_archivedAt_idx" ON "fact_subjects"("clientId", "archivedAt");
ALTER TABLE "fact_subjects" ADD CONSTRAINT "fact_subjects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fact_subjects" ADD CONSTRAINT "fact_subjects_contractRecordId_fkey" FOREIGN KEY ("contractRecordId") REFERENCES "contract_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fact_subjects" ADD CONSTRAINT "fact_subjects_organizationPersonId_fkey" FOREIGN KEY ("organizationPersonId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "legal_sources" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "instrumentType" "LegalSourceInstrumentType" NOT NULL,
    "canonicalCitation" TEXT,
    "title" TEXT,
    "issuer" TEXT,
    "status" "LegalSourceStatus" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "legal_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_sources_sourceKey_key" ON "legal_sources"("sourceKey");
CREATE INDEX "legal_sources_jurisdictionCode_instrumentType_idx" ON "legal_sources"("jurisdictionCode", "instrumentType");
CREATE INDEX "legal_sources_status_idx" ON "legal_sources"("status");

CREATE TABLE "legal_source_versions" (
    "id" TEXT NOT NULL,
    "legalSourceId" TEXT NOT NULL,
    "legalVersionKey" TEXT NOT NULL,
    "versionLabel" TEXT,
    "consolidationDate" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "publicationDate" TIMESTAMP(3),
    "adoptionDate" TIMESTAMP(3),
    "status" "LegalSourceVersionStatus" NOT NULL DEFAULT 'CANDIDATE',
    "reviewStatus" "LegalSourceReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    CONSTRAINT "legal_source_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_source_versions_legalSourceId_legalVersionKey_key" ON "legal_source_versions"("legalSourceId", "legalVersionKey");
CREATE INDEX "legal_source_versions_legalSourceId_effectiveFrom_idx" ON "legal_source_versions"("legalSourceId", "effectiveFrom");
CREATE INDEX "legal_source_versions_status_reviewStatus_idx" ON "legal_source_versions"("status", "reviewStatus");
ALTER TABLE "legal_source_versions" ADD CONSTRAINT "legal_source_versions_legalSourceId_fkey" FOREIGN KEY ("legalSourceId") REFERENCES "legal_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_source_versions" ADD CONSTRAINT "legal_source_versions_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "legal_source_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "legal_source_captures" (
    "id" TEXT NOT NULL,
    "legalSourceVersionId" TEXT NOT NULL,
    "sourceSha256" VARCHAR(64) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provenance" JSONB,
    "completeness" "LegalSourceCaptureCompleteness" NOT NULL DEFAULT 'UNKNOWN',
    "captureStatus" "LegalSourceCaptureStatus" NOT NULL DEFAULT 'CANDIDATE',
    "ambiguityStatus" "LegalSourceCaptureAmbiguityStatus" NOT NULL DEFAULT 'NONE',
    "sourceUri" TEXT,
    "importedById" TEXT,
    "selectedForReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_source_captures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_source_captures_legalSourceVersionId_sourceSha256_key" ON "legal_source_captures"("legalSourceVersionId", "sourceSha256");
CREATE INDEX "legal_source_captures_sourceSha256_idx" ON "legal_source_captures"("sourceSha256");
CREATE INDEX "legal_source_captures_legalSourceVersionId_captureStatus_idx" ON "legal_source_captures"("legalSourceVersionId", "captureStatus");
ALTER TABLE "legal_source_captures" ADD CONSTRAINT "legal_source_captures_legalSourceVersionId_fkey" FOREIGN KEY ("legalSourceVersionId") REFERENCES "legal_source_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_source_captures" ADD CONSTRAINT "legal_source_captures_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_facts" ADD COLUMN "factDefinitionId" TEXT;
ALTER TABLE "client_facts" ADD COLUMN "factSubjectId" TEXT;
ALTER TABLE "client_facts" ADD COLUMN "scopeType" "FactScopeType";
ALTER TABLE "client_facts" ADD COLUMN "booleanValue" BOOLEAN;
ALTER TABLE "client_facts" ADD COLUMN "numberValue" DECIMAL(24,8);
ALTER TABLE "client_facts" ADD COLUMN "stringValue" TEXT;
ALTER TABLE "client_facts" ADD COLUMN "dateValue" TIMESTAMP(3);
ALTER TABLE "client_facts" ADD COLUMN "datetimeValue" TIMESTAMP(3);
ALTER TABLE "client_facts" ADD COLUMN "moneyAmount" DECIMAL(24,8);
ALTER TABLE "client_facts" ADD COLUMN "moneyCurrency" VARCHAR(3);
ALTER TABLE "client_facts" ADD COLUMN "enumValue" TEXT;
ALTER TABLE "client_facts" ADD COLUMN "jsonValue" JSONB;
ALTER TABLE "client_facts" ADD COLUMN "observedAt" TIMESTAMP(3);
ALTER TABLE "client_facts" ADD COLUMN "effectiveAt" TIMESTAMP(3);
ALTER TABLE "client_facts" ADD COLUMN "referencePeriodStart" TIMESTAMP(3);
ALTER TABLE "client_facts" ADD COLUMN "referencePeriodEnd" TIMESTAMP(3);
ALTER TABLE "client_facts" ADD COLUMN "determinationMethod" "FactDeterminationMethod";
ALTER TABLE "client_facts" ADD COLUMN "supersededAt" TIMESTAMP(3);
CREATE INDEX "client_facts_factDefinitionId_clientId_validFrom_idx" ON "client_facts"("factDefinitionId", "clientId", "validFrom");
CREATE INDEX "client_facts_factSubjectId_validFrom_idx" ON "client_facts"("factSubjectId", "validFrom");
CREATE INDEX "client_facts_clientId_scopeType_validFrom_idx" ON "client_facts"("clientId", "scopeType", "validFrom");
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_factDefinitionId_fkey" FOREIGN KEY ("factDefinitionId") REFERENCES "fact_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_factSubjectId_fkey" FOREIGN KEY ("factSubjectId") REFERENCES "fact_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_money_pair_check" CHECK (("moneyAmount" IS NULL AND "moneyCurrency" IS NULL) OR ("moneyAmount" IS NOT NULL AND "moneyCurrency" ~ '^[A-Z]{3}$'));
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_reference_period_check" CHECK ("referencePeriodEnd" IS NULL OR "referencePeriodStart" IS NULL OR "referencePeriodEnd" >= "referencePeriodStart");
