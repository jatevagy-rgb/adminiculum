-- Workforce-administered, DB-backed workflow templates (Beállítások → Munkafolyamatok).
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "caseTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" JSONB NOT NULL DEFAULT '[]',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_templates_key_version_key" ON "workflow_templates"("key", "version");
CREATE INDEX "workflow_templates_key_idx" ON "workflow_templates"("key");
CREATE INDEX "workflow_templates_status_idx" ON "workflow_templates"("status");
