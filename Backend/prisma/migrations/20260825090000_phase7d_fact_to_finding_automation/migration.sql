-- Phase 7D: compliance findings are independent of manual Assessments.
ALTER TABLE "assessment_findings"
  ALTER COLUMN "assessmentId" DROP NOT NULL;
