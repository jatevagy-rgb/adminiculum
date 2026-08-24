-- Phase 7B: human-confirmed compliance action proposals.
CREATE TYPE "ComplianceProposalStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED', 'STALE');
CREATE TYPE "ComplianceProposalKind" AS ENUM ('REMEDIATION', 'DISCLOSURE', 'DOCUMENT_UPDATE', 'CONTROL_IMPLEMENTATION', 'REVIEW', 'OPEN_MATTER');

CREATE TABLE "compliance_proposals" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "proposalKind" "ComplianceProposalKind" NOT NULL,
    "actionIntentKey" TEXT NOT NULL,
    "caseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "suggestedAction" TEXT,
    "assigneeId" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "ComplianceProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "applicabilityIdAtProposal" TEXT NOT NULL,
    "findingStatusAtProposal" "AssessmentFindingStatus" NOT NULL,
    "taskId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_proposals_taskId_key" ON "compliance_proposals"("taskId");
CREATE INDEX "compliance_proposals_clientId_status_idx" ON "compliance_proposals"("clientId", "status");
CREATE INDEX "compliance_proposals_findingId_status_idx" ON "compliance_proposals"("findingId", "status");
CREATE INDEX "compliance_proposals_caseId_status_idx" ON "compliance_proposals"("caseId", "status");
CREATE INDEX "compliance_proposals_applicabilityIdAtProposal_idx" ON "compliance_proposals"("applicabilityIdAtProposal");

CREATE UNIQUE INDEX "compliance_proposals_active_case_identity_key"
  ON "compliance_proposals" ("findingId", "proposalKind", "actionIntentKey", "caseId")
  WHERE "status" = 'PROPOSED' AND "caseId" IS NOT NULL;

CREATE UNIQUE INDEX "compliance_proposals_active_no_case_identity_key"
  ON "compliance_proposals" ("findingId", "proposalKind", "actionIntentKey")
  WHERE "status" = 'PROPOSED' AND "caseId" IS NULL;

ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "assessment_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_applicability_fkey"
  FOREIGN KEY ("applicabilityIdAtProposal", "clientId") REFERENCES "requirement_applicabilities"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_proposals"
  ADD CONSTRAINT "compliance_proposals_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
