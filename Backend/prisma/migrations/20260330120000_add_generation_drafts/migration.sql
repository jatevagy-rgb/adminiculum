-- Create generation_drafts table for persisted user-entered generation field data
CREATE TABLE "generation_drafts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "caseId" VARCHAR(255) NOT NULL,
    "templateId" VARCHAR(255),
    "templateName" VARCHAR(255),
    "documentFamily" VARCHAR(100),
    "draftData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdById" VARCHAR(255),
    "lastEditedById" VARCHAR(255),
    CONSTRAINT "generation_drafts_caseId_templateId_unique" UNIQUE ("caseId", "templateId")
);

-- Create indexes for fast lookup
CREATE INDEX "generation_drafts_caseId_idx" ON "generation_drafts" ("caseId");
CREATE INDEX "generation_drafts_templateId_idx" ON "generation_drafts" ("templateId");