-- Migration: Add Contract Templates Tables & User Authentication Fields
-- This adds the contract_templates, contract_generations tables, and user auth fields

-- Create enum types if they don't exist
DO $$ BEGIN
    CREATE TYPE "TemplateCategory" AS ENUM ('ADASVETEL', 'BERLET', 'MEGBIZAS', 'MUNKASZERZODES', 'VALLALKOZAS', 'EGYEB');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PREVIEW', 'GENERATED', 'UPLOADED', 'FAILED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add authentication fields to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "UserStatus" DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP WITH TIME ZONE;

-- Create contract_templates table
CREATE TABLE IF NOT EXISTS "contract_templates" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TemplateCategory" NOT NULL,
    "templatePath" TEXT NOT NULL,
    "originalFileName" TEXT,
    "variables" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contract_generations table
CREATE TABLE IF NOT EXISTS "contract_generations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "templateId" UUID NOT NULL REFERENCES "contract_templates"(id) ON DELETE CASCADE,
    "caseId" TEXT,
    "templateData" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "expiresAt" TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_contract_templates_category" ON "contract_templates"("category");
CREATE INDEX IF NOT EXISTS "idx_contract_templates_active" ON "contract_templates"("isActive");
CREATE INDEX IF NOT EXISTS "idx_contract_generations_template_id" ON "contract_generations"("templateId");
CREATE INDEX IF NOT EXISTS "idx_contract_generations_case_id" ON "contract_generations"("caseId");
CREATE INDEX IF NOT EXISTS "idx_contract_generations_status" ON "contract_generations"("status");

-- Add comments
COMMENT ON TABLE "contract_templates" IS 'Stores document templates for contract generation';
COMMENT ON TABLE "contract_generations" IS 'Stores generated contract documents';
COMMENT ON COLUMN "users"."passwordHash" IS 'BCrypt hashed password for authentication';
COMMENT ON COLUMN "users"."status" IS 'User account status (ACTIVE, INACTIVE, SUSPENDED)';
COMMENT ON COLUMN "users"."lastLoginAt" IS 'Timestamp of last successful login';
