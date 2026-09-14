CREATE TYPE "ControlDefinitionType" AS ENUM ('ORGANIZATIONAL', 'TECHNICAL', 'PROCEDURAL', 'LEGAL', 'PHYSICAL');
CREATE TYPE "ControlDefinitionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ClientControlImplementationStatus" AS ENUM ('NOT_ASSESSED', 'PLANNED', 'IMPLEMENTING', 'IMPLEMENTED', 'PARTIAL', 'NOT_IMPLEMENTED');
CREATE TYPE "EvidenceSourceType" AS ENUM ('DOCUMENT_VERSION', 'CLIENT_FACT', 'OBSERVATION', 'EXTERNAL_REFERENCE');
CREATE TYPE "EvidenceReviewStatus" AS ENUM ('PROVIDED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');

CREATE TABLE "control_definitions" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "ControlDefinitionType" NOT NULL,
  "status" "ControlDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
  "defaultReviewCadenceDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "control_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "control_definitions_key_key" ON "control_definitions"("key");

CREATE TABLE "client_controls" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "controlDefinitionId" TEXT NOT NULL,
  "implementationStatus" "ClientControlImplementationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "ownerUserId" TEXT,
  "implementedAt" TIMESTAMP(3),
  "lastReviewedAt" TIMESTAMP(3),
  "nextReviewAt" TIMESTAMP(3),
  "notes" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_controls_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_controls_clientId_controlDefinitionId_key" ON "client_controls"("clientId", "controlDefinitionId");
CREATE UNIQUE INDEX "client_controls_id_clientId_key" ON "client_controls"("id", "clientId");
CREATE INDEX "client_controls_clientId_implementationStatus_idx" ON "client_controls"("clientId", "implementationStatus");
CREATE INDEX "client_controls_controlDefinitionId_idx" ON "client_controls"("controlDefinitionId");
CREATE INDEX "client_controls_clientId_nextReviewAt_idx" ON "client_controls"("clientId", "nextReviewAt");

CREATE TABLE "requirement_control_maps" (
  "id" TEXT NOT NULL,
  "requirementVersionId" TEXT NOT NULL,
  "controlDefinitionId" TEXT NOT NULL,
  "rationale" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requirement_control_maps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "requirement_control_maps_requirementVersionId_controlDefinitionId_key" ON "requirement_control_maps"("requirementVersionId", "controlDefinitionId");
CREATE INDEX "requirement_control_maps_requirementVersionId_idx" ON "requirement_control_maps"("requirementVersionId");
CREATE INDEX "requirement_control_maps_controlDefinitionId_idx" ON "requirement_control_maps"("controlDefinitionId");

CREATE TABLE "evidence_records" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sourceType" "EvidenceSourceType" NOT NULL,
  "status" "EvidenceReviewStatus" NOT NULL DEFAULT 'PROVIDED',
  "title" TEXT NOT NULL,
  "description" VARCHAR(2000),
  "providedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "documentVersionId" TEXT,
  "clientFactId" TEXT,
  "observationId" TEXT,
  "externalReference" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidence_records_exactly_one_source_check" CHECK (
    (CASE WHEN "documentVersionId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "clientFactId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "observationId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "externalReference" IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT "evidence_records_validity_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom")
);
CREATE UNIQUE INDEX "evidence_records_id_clientId_key" ON "evidence_records"("id", "clientId");
CREATE INDEX "evidence_records_clientId_status_idx" ON "evidence_records"("clientId", "status");
CREATE INDEX "evidence_records_clientId_validUntil_idx" ON "evidence_records"("clientId", "validUntil");
CREATE INDEX "evidence_records_clientId_sourceType_idx" ON "evidence_records"("clientId", "sourceType");

CREATE TABLE "evidence_control_links" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "evidenceRecordId" TEXT NOT NULL,
  "clientControlId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_control_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "evidence_control_links_evidenceRecordId_clientControlId_key" ON "evidence_control_links"("evidenceRecordId", "clientControlId");
CREATE INDEX "evidence_control_links_clientId_clientControlId_idx" ON "evidence_control_links"("clientId", "clientControlId");
CREATE INDEX "evidence_control_links_clientId_evidenceRecordId_idx" ON "evidence_control_links"("clientId", "evidenceRecordId");

ALTER TABLE "client_controls" ADD CONSTRAINT "client_controls_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_controls" ADD CONSTRAINT "client_controls_controlDefinitionId_fkey" FOREIGN KEY ("controlDefinitionId") REFERENCES "control_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_controls" ADD CONSTRAINT "client_controls_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requirement_control_maps" ADD CONSTRAINT "requirement_control_maps_requirementVersionId_fkey" FOREIGN KEY ("requirementVersionId") REFERENCES "requirement_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirement_control_maps" ADD CONSTRAINT "requirement_control_maps_controlDefinitionId_fkey" FOREIGN KEY ("controlDefinitionId") REFERENCES "control_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_clientFactId_fkey" FOREIGN KEY ("clientFactId") REFERENCES "client_facts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_control_links" ADD CONSTRAINT "evidence_control_links_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_control_links" ADD CONSTRAINT "evidence_control_links_evidenceRecordId_clientId_fkey" FOREIGN KEY ("evidenceRecordId", "clientId") REFERENCES "evidence_records"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_control_links" ADD CONSTRAINT "evidence_control_links_clientControlId_clientId_fkey" FOREIGN KEY ("clientControlId", "clientId") REFERENCES "client_controls"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;
