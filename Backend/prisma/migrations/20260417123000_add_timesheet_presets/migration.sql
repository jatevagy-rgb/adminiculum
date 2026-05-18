-- CreateEnum
CREATE TYPE "public"."TimesheetPresetLayer" AS ENUM (
  'TEMPLATE_DEFAULT',
  'LAWYER_DEFAULT',
  'CLIENT_DEFAULT',
  'CLIENT_LAWYER_OVERRIDE'
);

-- CreateTable
CREATE TABLE "public"."timesheet_presets" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "templateFamily" "public"."TimesheetReportTemplateFamily" NOT NULL,
  "layer" "public"."TimesheetPresetLayer" NOT NULL,
  "lawyerId" TEXT,
  "lawyerName" TEXT,
  "clientId" TEXT,
  "clientName" TEXT,
  "monthlyClosure" TEXT,
  "pendingOpenMattersNote" TEXT,
  "clientClosingText" TEXT,
  "defaultLawyerName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "timesheet_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timesheet_presets_templateFamily_isActive_idx" ON "public"."timesheet_presets"("templateFamily", "isActive");

-- CreateIndex
CREATE INDEX "timesheet_presets_layer_isActive_idx" ON "public"."timesheet_presets"("layer", "isActive");

-- CreateIndex
CREATE INDEX "timesheet_presets_templateFamily_lawyerId_clientId_isActive_idx" ON "public"."timesheet_presets"("templateFamily", "lawyerId", "clientId", "isActive");
