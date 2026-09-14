-- Additive compliance-topic -> logical-document linkage with explicit
-- audience/purpose classification. Does NOT carry publication state:
-- CLIENT_POLICY visibility remains driven exclusively by
-- client_document_publications. INTERNAL_ANALYSIS never crosses the portal.

CREATE TYPE "ComplianceDocumentAudience" AS ENUM ('INTERNAL_ANALYSIS', 'CLIENT_POLICY');

CREATE TABLE "compliance_documents" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "audience" "ComplianceDocumentAudience" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_documents_requirementId_documentId_audience_key"
    ON "compliance_documents"("requirementId", "documentId", "audience");

CREATE INDEX "compliance_documents_requirementId_audience_idx"
    ON "compliance_documents"("requirementId", "audience");

ALTER TABLE "compliance_documents"
    ADD CONSTRAINT "compliance_documents_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "requirements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "compliance_documents"
    ADD CONSTRAINT "compliance_documents_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
