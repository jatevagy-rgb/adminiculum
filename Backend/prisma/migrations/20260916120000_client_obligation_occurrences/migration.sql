-- Contract Watch CW1 — additive child table for independently tracked
-- contractual obligation occurrences (installments / milestones / payment and
-- performance dates). Purely additive: no existing table, column, enum or row
-- is altered. ClientObligation keeps its legacy single nextDueDate/status.
-- Status reuses the existing "ClientObligationStatus" enum (no new enum).
-- Uniqueness on (obligationId, occurrenceKey) makes materialization idempotent.

-- CreateTable
CREATE TABLE "client_obligation_occurrences" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "occurrenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "expectedAmount" DECIMAL(19,2),
    "currency" VARCHAR(3),
    "status" "ClientObligationStatus" NOT NULL DEFAULT 'OPEN',
    "satisfiedAt" TIMESTAMP(3),
    "evidenceDocumentVersionId" TEXT,
    "relatedTaskId" TEXT,
    "sourceReference" TEXT,
    "internalNote" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_obligation_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_obligation_occurrences_clientId_dueDate_idx" ON "client_obligation_occurrences"("clientId", "dueDate");

-- CreateIndex
CREATE INDEX "client_obligation_occurrences_contractId_status_idx" ON "client_obligation_occurrences"("contractId", "status");

-- CreateIndex
CREATE INDEX "client_obligation_occurrences_obligationId_status_idx" ON "client_obligation_occurrences"("obligationId", "status");

-- CreateIndex
CREATE INDEX "client_obligation_occurrences_evidenceDocumentVersionId_idx" ON "client_obligation_occurrences"("evidenceDocumentVersionId");

-- CreateIndex
CREATE INDEX "client_obligation_occurrences_relatedTaskId_idx" ON "client_obligation_occurrences"("relatedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "client_obligation_occurrences_obligationId_occurrenceKey_key" ON "client_obligation_occurrences"("obligationId", "occurrenceKey");

-- AddForeignKey
ALTER TABLE "client_obligation_occurrences" ADD CONSTRAINT "client_obligation_occurrences_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligation_occurrences" ADD CONSTRAINT "client_obligation_occurrences_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligation_occurrences" ADD CONSTRAINT "client_obligation_occurrences_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "client_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligation_occurrences" ADD CONSTRAINT "client_obligation_occurrences_evidenceDocumentVersionId_fkey" FOREIGN KEY ("evidenceDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligation_occurrences" ADD CONSTRAINT "client_obligation_occurrences_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
