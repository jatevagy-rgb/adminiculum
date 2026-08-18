-- CreateEnum
CREATE TYPE "ClientFactVerificationStatus" AS ENUM ('UNVERIFIED', 'CLIENT_PROVIDED', 'DOCUMENT_VERIFIED', 'LAW_FIRM_VERIFIED');

-- CreateEnum
CREATE TYPE "CompanyMilestoneStatus" AS ENUM ('PLANNED', 'ACHIEVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentItemKind" AS ENUM ('FACT', 'QUESTION', 'CHECK');

-- CreateEnum
CREATE TYPE "AssessmentFindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssessmentFindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ACTION_PLANNED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DevelopmentInitiativePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DevelopmentInitiativeStatus" AS ENUM ('BACKLOG', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TABLE "client_operating_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT,
    "summary" TEXT,
    "internalNote" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_operating_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_facts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "sourceDocumentVersionId" TEXT,
    "verificationStatus" "ClientFactVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_milestones" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "milestoneDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "status" "CompanyMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "developmentInitiativeId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "methodRef" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reviewAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_items" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "AssessmentItemKind" NOT NULL DEFAULT 'QUESTION',
    "currentPractice" TEXT,
    "maturityLevel" INTEGER,
    "statusCode" TEXT,
    "evidenceSummary" TEXT,
    "comment" TEXT,
    "targetState" TEXT,
    "reviewerUserId" TEXT,
    "evidenceDocumentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_findings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "assessmentItemId" TEXT,
    "severity" "AssessmentFindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recommendation" TEXT,
    "status" "AssessmentFindingStatus" NOT NULL DEFAULT 'OPEN',
    "developmentInitiativeId" TEXT,
    "remediationTaskId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_initiatives" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "currentState" TEXT,
    "targetState" TEXT,
    "priority" "DevelopmentInitiativePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "DevelopmentInitiativeStatus" NOT NULL DEFAULT 'BACKLOG',
    "lawFirmOwnerUserId" TEXT,
    "caseId" TEXT,
    "targetAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_initiatives_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "client_operating_profiles_clientId_key" ON "client_operating_profiles"("clientId");

-- CreateIndex
CREATE INDEX "client_facts_clientId_type_validFrom_idx" ON "client_facts"("clientId", "type", "validFrom");

-- CreateIndex
CREATE INDEX "client_facts_clientId_verificationStatus_idx" ON "client_facts"("clientId", "verificationStatus");

-- CreateIndex
CREATE INDEX "client_facts_sourceDocumentVersionId_idx" ON "client_facts"("sourceDocumentVersionId");

-- CreateIndex
CREATE INDEX "company_milestones_clientId_status_idx" ON "company_milestones"("clientId", "status");

-- CreateIndex
CREATE INDEX "company_milestones_clientId_milestoneDate_idx" ON "company_milestones"("clientId", "milestoneDate");

-- CreateIndex
CREATE INDEX "company_milestones_developmentInitiativeId_idx" ON "company_milestones"("developmentInitiativeId");

-- CreateIndex
CREATE INDEX "assessments_clientId_status_idx" ON "assessments"("clientId", "status");

-- CreateIndex
CREATE INDEX "assessments_clientId_type_idx" ON "assessments"("clientId", "type");

-- CreateIndex
CREATE INDEX "assessment_items_assessmentId_idx" ON "assessment_items"("assessmentId");

-- CreateIndex
CREATE INDEX "assessment_items_evidenceDocumentVersionId_idx" ON "assessment_items"("evidenceDocumentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_items_assessmentId_key_key" ON "assessment_items"("assessmentId", "key");

-- CreateIndex
CREATE INDEX "assessment_findings_assessmentId_idx" ON "assessment_findings"("assessmentId");

-- CreateIndex
CREATE INDEX "assessment_findings_clientId_status_idx" ON "assessment_findings"("clientId", "status");

-- CreateIndex
CREATE INDEX "assessment_findings_developmentInitiativeId_idx" ON "assessment_findings"("developmentInitiativeId");

-- CreateIndex
CREATE INDEX "assessment_findings_remediationTaskId_idx" ON "assessment_findings"("remediationTaskId");

-- CreateIndex
CREATE INDEX "development_initiatives_clientId_status_idx" ON "development_initiatives"("clientId", "status");

-- CreateIndex
CREATE INDEX "development_initiatives_caseId_idx" ON "development_initiatives"("caseId");

-- CreateIndex
CREATE INDEX "development_initiatives_lawFirmOwnerUserId_idx" ON "development_initiatives"("lawFirmOwnerUserId");

-- AddForeignKey
ALTER TABLE "client_operating_profiles" ADD CONSTRAINT "client_operating_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_sourceDocumentVersionId_fkey" FOREIGN KEY ("sourceDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_milestones" ADD CONSTRAINT "company_milestones_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_milestones" ADD CONSTRAINT "company_milestones_developmentInitiativeId_fkey" FOREIGN KEY ("developmentInitiativeId") REFERENCES "development_initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_milestones" ADD CONSTRAINT "company_milestones_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_evidenceDocumentVersionId_fkey" FOREIGN KEY ("evidenceDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_assessmentItemId_fkey" FOREIGN KEY ("assessmentItemId") REFERENCES "assessment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_developmentInitiativeId_fkey" FOREIGN KEY ("developmentInitiativeId") REFERENCES "development_initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_remediationTaskId_fkey" FOREIGN KEY ("remediationTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_findings" ADD CONSTRAINT "assessment_findings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_initiatives" ADD CONSTRAINT "development_initiatives_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_initiatives" ADD CONSTRAINT "development_initiatives_lawFirmOwnerUserId_fkey" FOREIGN KEY ("lawFirmOwnerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_initiatives" ADD CONSTRAINT "development_initiatives_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
