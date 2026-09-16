-- CDI-1: additive persistence for derived INTERNAL-ONLY compliance document
-- intelligence. One row = one (DocumentVersion, document clause, relation type,
-- legal/case/authority anchor) relation extracted from the ADM-* Word Developer
-- Content Controls of an INTERNAL_ANALYSIS compliance master DOCX.
--
-- Additive only: no existing column is rewritten, no backfill, no deletion, and
-- no Requirement / publication semantics are touched. Provenance is scoped to an
-- immutable document_versions row; re-ingesting the same version is a no-op and
-- changed content must arrive as a new DocumentVersion.
--
-- CLIENT BOUNDARY: rows are internal analysis metadata and are never projected
-- through clientSafeComplianceService, the client portal, or any customer DTO.
-- CLIENT_POLICY documents never trigger ingestion.

-- CreateEnum
CREATE TYPE "ComplianceAnchorType" AS ENUM ('LEGAL', 'CASE', 'AUTHORITY');

-- CreateTable
CREATE TABLE "compliance_document_clause_anchors" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "clauseRef" TEXT NOT NULL,
    "clauseTitle" TEXT,
    "clauseStableId" TEXT,
    "relationType" VARCHAR(64) NOT NULL,
    "anchorType" "ComplianceAnchorType" NOT NULL,
    "anchorDisplay" TEXT NOT NULL,
    "anchorStableId" TEXT,
    "anchorKey" TEXT,
    "eli" TEXT,
    "celex" TEXT,
    "locator" TEXT,
    "ecli" TEXT,
    "caseId" TEXT,
    "caseLocator" TEXT,
    "decisionId" TEXT,
    "authorityLocator" TEXT,
    "sourceUrl" TEXT,
    "rationale" TEXT,
    "legalSourceVersionId" TEXT,
    "ingestWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rowDigest" VARCHAR(64) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_document_clause_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_documentVersionId_idx" ON "compliance_document_clause_anchors"("documentVersionId");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_documentVersionId_clause_idx" ON "compliance_document_clause_anchors"("documentVersionId", "clauseRef");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_anchorKey_idx" ON "compliance_document_clause_anchors"("anchorKey");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_anchorStableId_idx" ON "compliance_document_clause_anchors"("anchorStableId");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_legalSourceVersionId_idx" ON "compliance_document_clause_anchors"("legalSourceVersionId");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_anchorType_idx" ON "compliance_document_clause_anchors"("anchorType");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_eli_idx" ON "compliance_document_clause_anchors"("eli");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_celex_idx" ON "compliance_document_clause_anchors"("celex");

-- CreateIndex
CREATE INDEX "compliance_document_clause_anchors_ecli_idx" ON "compliance_document_clause_anchors"("ecli");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_document_clause_anchors_documentVersionId_rowDig_key" ON "compliance_document_clause_anchors"("documentVersionId", "rowDigest");

-- AddForeignKey
ALTER TABLE "compliance_document_clause_anchors" ADD CONSTRAINT "compliance_document_clause_anchors_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_document_clause_anchors" ADD CONSTRAINT "compliance_document_clause_anchors_legalSourceVersionId_fkey" FOREIGN KEY ("legalSourceVersionId") REFERENCES "legal_source_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
