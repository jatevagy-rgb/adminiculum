-- Add workspaceText to Document model for storing modified working copy text persistently
ALTER TABLE "documents" ADD COLUMN "workspaceText" TEXT;
COMMENT ON COLUMN "documents"."workspaceText" IS 'Persistent workspace editor text for modified working copy documents.';