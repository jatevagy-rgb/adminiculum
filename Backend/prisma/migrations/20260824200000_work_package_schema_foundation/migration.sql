-- WP-1 is an additive persistence foundation. It creates no product rows and
-- does not rewrite historic Case or Task records.
CREATE TYPE "WorkPackageModuleType" AS ENUM (
  'DOCUMENT_WORK', 'RESEARCH', 'CLIENT_REQUEST', 'AI_PREWORK', 'REVIEW',
  'APPROVAL', 'COMMUNICATION', 'DEADLINE', 'COMPLIANCE', 'CLAUSE',
  'DELIVERY', 'TASK_GROUP', 'CUSTOM'
);

CREATE TYPE "WorkPackageTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "CaseWorkPackageItemStatus" AS ENUM ('ACTIVE', 'DISABLED', 'COMPLETED');

CREATE TABLE "case_type_definitions" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "legacyCaseTypeKey" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_type_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_type_definitions_slug_key" ON "case_type_definitions"("slug");
CREATE INDEX "case_type_definitions_isActive_sortOrder_idx" ON "case_type_definitions"("isActive", "sortOrder");

CREATE TABLE "work_package_templates" (
  "id" TEXT NOT NULL,
  "caseTypeDefinitionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "WorkPackageTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "defaultWorkflowTemplateId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_package_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_package_templates_caseTypeDefinitionId_version_key"
  ON "work_package_templates"("caseTypeDefinitionId", "version");
CREATE INDEX "work_package_templates_caseTypeDefinitionId_status_idx"
  ON "work_package_templates"("caseTypeDefinitionId", "status");

CREATE TABLE "work_package_template_items" (
  "id" TEXT NOT NULL,
  "workPackageTemplateId" TEXT NOT NULL,
  "moduleType" "WorkPackageModuleType" NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isOptional" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_package_template_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_package_template_items_workPackageTemplateId_moduleKey_key"
  ON "work_package_template_items"("workPackageTemplateId", "moduleKey");
CREATE INDEX "work_package_template_items_workPackageTemplateId_order_idx"
  ON "work_package_template_items"("workPackageTemplateId", "order");

CREATE TABLE "case_work_packages" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "workPackageTemplateId" TEXT,
  "workPackageTemplateVersion" INTEGER,
  "snapshotWorkflowTemplateId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "case_work_packages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_work_packages_caseId_key" ON "case_work_packages"("caseId");
CREATE INDEX "case_work_packages_workPackageTemplateId_idx" ON "case_work_packages"("workPackageTemplateId");
CREATE INDEX "case_work_packages_snapshotWorkflowTemplateId_idx" ON "case_work_packages"("snapshotWorkflowTemplateId");

CREATE TABLE "case_work_package_items" (
  "id" TEXT NOT NULL,
  "caseWorkPackageId" TEXT NOT NULL,
  "moduleType" "WorkPackageModuleType" NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "order" INTEGER NOT NULL DEFAULT 0,
  "status" "CaseWorkPackageItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "responsibleId" TEXT,
  "sourceTemplateItemId" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_work_package_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_work_package_items_caseWorkPackageId_moduleKey_key"
  ON "case_work_package_items"("caseWorkPackageId", "moduleKey");
CREATE INDEX "case_work_package_items_caseWorkPackageId_status_idx"
  ON "case_work_package_items"("caseWorkPackageId", "status");

ALTER TABLE "cases" ADD COLUMN "caseTypeDefinitionId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "workPackageItemId" TEXT;
ALTER TABLE "case_type_definitions"
  ADD CONSTRAINT "case_type_definitions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_package_templates"
  ADD CONSTRAINT "work_package_templates_caseTypeDefinitionId_fkey"
  FOREIGN KEY ("caseTypeDefinitionId") REFERENCES "case_type_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_package_templates_defaultWorkflowTemplateId_fkey"
  FOREIGN KEY ("defaultWorkflowTemplateId") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_package_templates_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_package_template_items"
  ADD CONSTRAINT "work_package_template_items_workPackageTemplateId_fkey"
  FOREIGN KEY ("workPackageTemplateId") REFERENCES "work_package_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_work_packages"
  ADD CONSTRAINT "case_work_packages_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "case_work_packages_workPackageTemplateId_fkey"
  FOREIGN KEY ("workPackageTemplateId") REFERENCES "work_package_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "case_work_packages_snapshotWorkflowTemplateId_fkey"
  FOREIGN KEY ("snapshotWorkflowTemplateId") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "case_work_packages_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_work_package_items"
  ADD CONSTRAINT "case_work_package_items_caseWorkPackageId_fkey"
  FOREIGN KEY ("caseWorkPackageId") REFERENCES "case_work_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "case_work_package_items_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "case_work_package_items_sourceTemplateItemId_fkey"
  FOREIGN KEY ("sourceTemplateItemId") REFERENCES "work_package_template_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "case_work_package_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cases"
  ADD CONSTRAINT "cases_caseTypeDefinitionId_fkey"
  FOREIGN KEY ("caseTypeDefinitionId") REFERENCES "case_type_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_workPackageItemId_fkey"
  FOREIGN KEY ("workPackageItemId") REFERENCES "case_work_package_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
