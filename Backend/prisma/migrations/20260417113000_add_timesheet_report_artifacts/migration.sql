-- Patch 5G: persist rendered timesheet outputs as artifacts/history items
CREATE TYPE "TimesheetReportArtifactFormat" AS ENUM ('TEXT_V1', 'DOCX_V1');

CREATE TABLE "timesheet_report_artifacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reportInstanceId" UUID NOT NULL,
  "format" "TimesheetReportArtifactFormat" NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentText" TEXT,
  "contentBase64" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "timesheet_report_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "timesheet_report_artifacts_reportInstanceId_fkey"
    FOREIGN KEY ("reportInstanceId") REFERENCES "timesheet_report_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "timesheet_report_artifacts_reportInstanceId_createdAt_idx"
  ON "timesheet_report_artifacts"("reportInstanceId", "createdAt");
