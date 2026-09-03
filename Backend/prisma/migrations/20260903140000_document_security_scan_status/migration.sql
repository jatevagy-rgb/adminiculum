CREATE TYPE "DocumentSecurityScanStatus" AS ENUM ('PENDING_SCAN', 'CLEAN', 'SCAN_FAILED', 'INFECTED');
ALTER TABLE "document_versions" ADD COLUMN "securityScanStatus" "DocumentSecurityScanStatus" NOT NULL DEFAULT 'CLEAN';
