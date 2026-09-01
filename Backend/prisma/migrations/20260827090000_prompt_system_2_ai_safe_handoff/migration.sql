CREATE TYPE "AiPromptDraftStatus" AS ENUM (
  'PREPARED',
  'AI_DRAFT',
  'JUNIOR_VERIFIED',
  'LAWYER_APPROVED',
  'RETURNED_FOR_CORRECTION',
  'REJECTED'
);

CREATE TABLE "ai_prompt_template_versions" (
  "id" TEXT NOT NULL,
  "stableKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "legalWorkCategory" TEXT NOT NULL,
  "caseTypeKeys" JSONB NOT NULL DEFAULT '[]',
  "workPackageModuleKeys" JSONB NOT NULL DEFAULT '[]',
  "taskTypes" JSONB NOT NULL DEFAULT '[]',
  "blocks" JSONB NOT NULL,
  "requiredContext" JSONB NOT NULL DEFAULT '[]',
  "optionalContext" JSONB NOT NULL DEFAULT '[]',
  "outputInstructions" TEXT NOT NULL,
  "verificationChecklist" JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_prompt_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_prompt_template_versions_stableKey_version_key"
  ON "ai_prompt_template_versions"("stableKey", "version");
CREATE INDEX "ai_prompt_template_versions_stableKey_isActive_idx"
  ON "ai_prompt_template_versions"("stableKey", "isActive");
CREATE INDEX "ai_prompt_template_versions_legalWorkCategory_isActive_idx"
  ON "ai_prompt_template_versions"("legalWorkCategory", "isActive");

CREATE TABLE "ai_prompt_drafts" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "promptTemplateId" TEXT NOT NULL,
  "promptTemplateStableKey" TEXT NOT NULL,
  "promptTemplateVersion" INTEGER NOT NULL,
  "promptTemplateSnapshot" JSONB NOT NULL,
  "sourceDocumentIds" JSONB NOT NULL DEFAULT '[]',
  "sourceDocumentVersionIds" JSONB NOT NULL DEFAULT '[]',
  "sourceTaskId" TEXT,
  "sourceWorkPackageItemId" TEXT,
  "selectedContext" JSONB NOT NULL,
  "anonymizedPreview" TEXT NOT NULL,
  "externalPromptText" TEXT NOT NULL,
  "rehydrationMap" JSONB NOT NULL,
  "anonymizationSnapshot" JSONB NOT NULL,
  "importedResponse" TEXT,
  "rehydratedResponse" TEXT,
  "rehydrationWarnings" JSONB NOT NULL DEFAULT '[]',
  "status" "AiPromptDraftStatus" NOT NULL DEFAULT 'PREPARED',
  "reviewerNotes" TEXT,
  "preparedById" TEXT NOT NULL,
  "importedById" TEXT,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_prompt_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_prompt_drafts_caseId_status_idx"
  ON "ai_prompt_drafts"("caseId", "status");
CREATE INDEX "ai_prompt_drafts_promptTemplateStableKey_promptTemplateVersion_idx"
  ON "ai_prompt_drafts"("promptTemplateStableKey", "promptTemplateVersion");
CREATE INDEX "ai_prompt_drafts_sourceTaskId_idx"
  ON "ai_prompt_drafts"("sourceTaskId");
CREATE INDEX "ai_prompt_drafts_sourceWorkPackageItemId_idx"
  ON "ai_prompt_drafts"("sourceWorkPackageItemId");
