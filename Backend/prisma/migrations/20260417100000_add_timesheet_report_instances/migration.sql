-- Patch 5E: saved timesheet report instances + history
CREATE TYPE "TimesheetReportTemplateFamily" AS ENUM ('HU_DETAILED_MONTHLY', 'CORPORATE_SUMMARY');

CREATE TYPE "TimesheetReportInstanceStatus" AS ENUM ('DRAFT', 'GENERATED');

CREATE TABLE "timesheet_report_instances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "templateId" TEXT NOT NULL,
  "templateFamily" "TimesheetReportTemplateFamily" NOT NULL,
  "reportPeriod" TEXT NOT NULL,
  "clientId" TEXT,
  "clientName" TEXT,
  "matterId" TEXT,
  "matterName" TEXT,
  "caseId" TEXT,
  "caseReference" TEXT,
  "presetId" TEXT,
  "monthlyClosure" TEXT,
  "pendingOpenMattersNote" TEXT,
  "clientClosingText" TEXT,
  "defaultLawyerName" TEXT,
  "carriedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "aboveThresholdHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rows" JSONB NOT NULL,
  "totalsSnapshot" JSONB NOT NULL,
  "status" "TimesheetReportInstanceStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "timesheet_report_instances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "timesheet_report_instances_updatedAt_idx" ON "timesheet_report_instances"("updatedAt");
CREATE INDEX "timesheet_report_instances_reportPeriod_idx" ON "timesheet_report_instances"("reportPeriod");
