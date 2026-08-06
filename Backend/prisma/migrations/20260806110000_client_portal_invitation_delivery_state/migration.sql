ALTER TABLE "client_portal_invitations"
  ADD COLUMN IF NOT EXISTS "deliveryId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatus" "ClientNotificationDeliveryStatus",
  ADD COLUMN IF NOT EXISTS "deliveryCodeSafe" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryAttemptedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "client_portal_invitations_deliveryId_idx"
  ON "client_portal_invitations"("deliveryId");

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "workflowInstanceId" TEXT,
  ADD COLUMN IF NOT EXISTS "workflowTemplateKey" TEXT,
  ADD COLUMN IF NOT EXISTS "workflowTemplateVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "workflowStepKey" TEXT,
  ADD COLUMN IF NOT EXISTS "workflowDependsOnKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "workflowPublicMilestoneCandidate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "workflowActivatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "tasks_workflowInstanceId_idx" ON "tasks"("workflowInstanceId");
CREATE INDEX IF NOT EXISTS "tasks_caseId_workflowInstanceId_idx" ON "tasks"("caseId", "workflowInstanceId");
