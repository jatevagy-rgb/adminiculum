-- ============================================================================
-- GROW PRODUCT + TASK PLANNING (additive only)
-- Research corpus / diagnosis / recommendation / human review / opportunity /
-- outcome / ROI provenance; reusable task definition catalogue; task work roles
-- (planned reviewer + collaborators — NO case access granted). The legacy
-- TaskType enum and all existing task columns are preserved; new columns are
-- nullable so legacy rows stay valid.
-- ============================================================================

-- CreateEnum
CREATE TYPE "EvidenceVerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RecommendationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DiagnosisCandidateStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REJECTED', 'NEEDS_MORE_DATA');

-- CreateEnum
CREATE TYPE "SufficiencyDecision" AS ENUM ('SUPPORTED', 'NEEDS_MORE_DATA', 'INSUFFICIENT_EVIDENCE', 'OUT_OF_SCOPE');

-- CreateEnum
CREATE TYPE "RecommendationCandidateStatus" AS ENUM ('PENDING_REVIEW', 'NEEDS_MORE_DATA', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ImprovementOpportunityStatus" AS ENUM ('OPEN', 'INITIATIVE_STARTED', 'OUTCOME_RECORDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutcomeMeasurementBasis" AS ENUM ('MEASURED', 'CALCULATED', 'ESTIMATED', 'ASSUMED');

-- CreateEnum
CREATE TYPE "TaskDefinitionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterEnum (additive value for declared survey observations)
ALTER TYPE "ObservationType" ADD VALUE 'DECLARED_SURVEY';

-- AlterTable (additive nullable columns; legacy rows unchanged)
ALTER TABLE "tasks"
  ADD COLUMN "plannedReviewerId" TEXT,
  ADD COLUMN "taskDefinitionId" TEXT,
  ADD COLUMN "taskTypeLabelSnapshot" TEXT;

-- CreateTable
CREATE TABLE "research_evidence" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "corpusKey" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "venue" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "locator" TEXT,
    "verificationStatus" "EvidenceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "strength" TEXT NOT NULL DEFAULT 'WEAK',
    "domainKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicabilityNotes" TEXT,
    "limitations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_domains" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "RecommendationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosis_candidates" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "problemDomainId" TEXT,
    "businessProcessId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "DiagnosisCandidateStatus" NOT NULL DEFAULT 'OPEN',
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnosis_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosis_evidence_links" (
    "id" TEXT NOT NULL,
    "diagnosisId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnosis_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_candidates" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "diagnosisId" TEXT,
    "title" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "impactTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sufficiency" "SufficiencyDecision" NOT NULL,
    "status" "RecommendationCandidateStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_evidence_links" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_opportunities" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "impactTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidenceStrength" TEXT NOT NULL DEFAULT 'WEAK',
    "status" "ImprovementOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "developmentInitiativeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "improvement_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcome_measurements" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "developmentInitiativeId" TEXT,
    "businessProcessId" TEXT,
    "beforeSnapshotId" TEXT NOT NULL,
    "afterSnapshotId" TEXT,
    "basis" "OutcomeMeasurementBasis" NOT NULL,
    "metricsSummary" JSONB,
    "roi" JSONB,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outcome_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_definitions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "defaultEstimatedMinutes" INTEGER,
    "defaultAttentionCategory" "ReviewAttentionLevel",
    "status" "TaskDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_collaborators" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_evidence_corpusKey_key" ON "research_evidence"("corpusKey");

-- CreateIndex
CREATE INDEX "research_evidence_clientId_verificationStatus_idx" ON "research_evidence"("clientId", "verificationStatus");

-- CreateIndex
CREATE INDEX "research_evidence_verificationStatus_idx" ON "research_evidence"("verificationStatus");

-- CreateIndex
CREATE INDEX "problem_domains_clientId_status_idx" ON "problem_domains"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "problem_domains_clientId_key_key" ON "problem_domains"("clientId", "key");

-- CreateIndex
CREATE INDEX "recommendation_runs_clientId_status_idx" ON "recommendation_runs"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_runs_id_clientId_key" ON "recommendation_runs"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_runs_clientId_idempotencyKey_key" ON "recommendation_runs"("clientId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "diagnosis_candidates_clientId_status_idx" ON "diagnosis_candidates"("clientId", "status");

-- CreateIndex
CREATE INDEX "diagnosis_candidates_clientId_runId_idx" ON "diagnosis_candidates"("clientId", "runId");

-- CreateIndex
CREATE INDEX "diagnosis_candidates_problemDomainId_idx" ON "diagnosis_candidates"("problemDomainId");

-- CreateIndex
CREATE INDEX "diagnosis_candidates_businessProcessId_idx" ON "diagnosis_candidates"("businessProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "diagnosis_candidates_id_clientId_key" ON "diagnosis_candidates"("id", "clientId");

-- CreateIndex
CREATE INDEX "diagnosis_evidence_links_evidenceId_idx" ON "diagnosis_evidence_links"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "diagnosis_evidence_links_diagnosisId_evidenceId_key" ON "diagnosis_evidence_links"("diagnosisId", "evidenceId");

-- CreateIndex
CREATE INDEX "recommendation_candidates_clientId_status_idx" ON "recommendation_candidates"("clientId", "status");

-- CreateIndex
CREATE INDEX "recommendation_candidates_clientId_runId_idx" ON "recommendation_candidates"("clientId", "runId");

-- CreateIndex
CREATE INDEX "recommendation_candidates_diagnosisId_idx" ON "recommendation_candidates"("diagnosisId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_candidates_id_clientId_key" ON "recommendation_candidates"("id", "clientId");

-- CreateIndex
CREATE INDEX "recommendation_evidence_links_evidenceId_idx" ON "recommendation_evidence_links"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_evidence_links_recommendationId_evidenceId_key" ON "recommendation_evidence_links"("recommendationId", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "improvement_opportunities_recommendationId_key" ON "improvement_opportunities"("recommendationId");

-- CreateIndex
CREATE INDEX "improvement_opportunities_clientId_status_idx" ON "improvement_opportunities"("clientId", "status");

-- CreateIndex
CREATE INDEX "improvement_opportunities_developmentInitiativeId_idx" ON "improvement_opportunities"("developmentInitiativeId");

-- CreateIndex
CREATE INDEX "outcome_measurements_clientId_opportunityId_idx" ON "outcome_measurements"("clientId", "opportunityId");

-- CreateIndex
CREATE INDEX "outcome_measurements_clientId_businessProcessId_idx" ON "outcome_measurements"("clientId", "businessProcessId");

-- CreateIndex
CREATE INDEX "outcome_measurements_developmentInitiativeId_idx" ON "outcome_measurements"("developmentInitiativeId");

-- CreateIndex
CREATE INDEX "task_definitions_clientId_status_idx" ON "task_definitions"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_definitions_clientId_label_key" ON "task_definitions"("clientId", "label");

-- CreateIndex
CREATE INDEX "task_collaborators_userId_idx" ON "task_collaborators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_collaborators_taskId_userId_key" ON "task_collaborators"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_domains" ADD CONSTRAINT "problem_domains_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_candidates" ADD CONSTRAINT "diagnosis_candidates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_candidates" ADD CONSTRAINT "diagnosis_candidates_runId_clientId_fkey" FOREIGN KEY ("runId", "clientId") REFERENCES "recommendation_runs"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_candidates" ADD CONSTRAINT "diagnosis_candidates_problemDomainId_fkey" FOREIGN KEY ("problemDomainId") REFERENCES "problem_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_candidates" ADD CONSTRAINT "diagnosis_candidates_businessProcessId_clientId_fkey" FOREIGN KEY ("businessProcessId", "clientId") REFERENCES "business_processes"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_evidence_links" ADD CONSTRAINT "diagnosis_evidence_links_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "diagnosis_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_evidence_links" ADD CONSTRAINT "diagnosis_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "research_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_candidates" ADD CONSTRAINT "recommendation_candidates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_candidates" ADD CONSTRAINT "recommendation_candidates_runId_clientId_fkey" FOREIGN KEY ("runId", "clientId") REFERENCES "recommendation_runs"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_candidates" ADD CONSTRAINT "recommendation_candidates_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "diagnosis_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_candidates" ADD CONSTRAINT "recommendation_candidates_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_evidence_links" ADD CONSTRAINT "recommendation_evidence_links_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendation_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_evidence_links" ADD CONSTRAINT "recommendation_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "research_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_opportunities" ADD CONSTRAINT "improvement_opportunities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_opportunities" ADD CONSTRAINT "improvement_opportunities_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendation_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_opportunities" ADD CONSTRAINT "improvement_opportunities_developmentInitiativeId_fkey" FOREIGN KEY ("developmentInitiativeId") REFERENCES "development_initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "improvement_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_developmentInitiativeId_fkey" FOREIGN KEY ("developmentInitiativeId") REFERENCES "development_initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_businessProcessId_clientId_fkey" FOREIGN KEY ("businessProcessId", "clientId") REFERENCES "business_processes"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_beforeSnapshotId_fkey" FOREIGN KEY ("beforeSnapshotId") REFERENCES "process_observation_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_afterSnapshotId_fkey" FOREIGN KEY ("afterSnapshotId") REFERENCES "process_observation_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_taskDefinitionId_fkey" FOREIGN KEY ("taskDefinitionId") REFERENCES "task_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_plannedReviewerId_fkey" FOREIGN KEY ("plannedReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
