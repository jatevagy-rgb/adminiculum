CREATE TYPE "ContractLifecycleStatus" AS ENUM ('DRAFT', 'NEGOTIATION', 'AWAITING_SIGNATURE', 'SIGNED_NOT_EFFECTIVE', 'ACTIVE', 'TERMINATING', 'EXPIRED', 'TERMINATED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractSecurityClassification" AS ENUM ('STANDARD', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ClientObligationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SATISFIED', 'WAIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ContractEntitlementStatus" AS ENUM ('ACTIVE', 'EXERCISED', 'EXPIRED', 'WAIVED');

CREATE TABLE "contract_records" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "status" "ContractLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "businessOwnerLabel" TEXT,
    "lawFirmOwnerUserId" TEXT,
    "sourceCaseId" TEXT,
    "canonicalDocumentVersionId" TEXT,
    "signatureDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "termType" TEXT,
    "noticePeriodDays" INTEGER,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "nextCriticalDate" TIMESTAMP(3),
    "securityClassification" "ContractSecurityClassification" NOT NULL DEFAULT 'STANDARD',
    "internalNote" TEXT,
    "parentContractId" TEXT,
    "familyRootContractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_parties" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_obligations" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceContractId" TEXT,
    "sourceReference" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerLabel" TEXT,
    "triggerType" TEXT NOT NULL,
    "frequencyCode" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "status" "ClientObligationStatus" NOT NULL DEFAULT 'OPEN',
    "relatedTaskId" TEXT,
    "evidenceDocumentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_entitlements" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceReference" TEXT,
    "exerciseByDate" TIMESTAMP(3),
    "status" "ContractEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_records_clientId_status_idx" ON "contract_records"("clientId", "status");

-- CreateIndex
CREATE INDEX "contract_records_clientId_expiryDate_idx" ON "contract_records"("clientId", "expiryDate");

-- CreateIndex
CREATE INDEX "contract_records_clientId_nextCriticalDate_idx" ON "contract_records"("clientId", "nextCriticalDate");

-- CreateIndex
CREATE INDEX "contract_records_canonicalDocumentVersionId_idx" ON "contract_records"("canonicalDocumentVersionId");

-- CreateIndex
CREATE INDEX "contract_records_parentContractId_idx" ON "contract_records"("parentContractId");

-- CreateIndex
CREATE INDEX "contract_records_familyRootContractId_idx" ON "contract_records"("familyRootContractId");

-- CreateIndex
CREATE INDEX "contract_parties_contractId_idx" ON "contract_parties"("contractId");

-- CreateIndex
CREATE INDEX "client_obligations_clientId_status_idx" ON "client_obligations"("clientId", "status");

-- CreateIndex
CREATE INDEX "client_obligations_clientId_nextDueDate_idx" ON "client_obligations"("clientId", "nextDueDate");

-- CreateIndex
CREATE INDEX "client_obligations_sourceContractId_status_idx" ON "client_obligations"("sourceContractId", "status");

-- CreateIndex
CREATE INDEX "client_obligations_relatedTaskId_idx" ON "client_obligations"("relatedTaskId");

-- CreateIndex
CREATE INDEX "contract_entitlements_contractId_status_idx" ON "contract_entitlements"("contractId", "status");

-- CreateIndex
CREATE INDEX "contract_entitlements_clientId_status_idx" ON "contract_entitlements"("clientId", "status");

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_lawFirmOwnerUserId_fkey" FOREIGN KEY ("lawFirmOwnerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_sourceCaseId_fkey" FOREIGN KEY ("sourceCaseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_canonicalDocumentVersionId_fkey" FOREIGN KEY ("canonicalDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "contract_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_familyRootContractId_fkey" FOREIGN KEY ("familyRootContractId") REFERENCES "contract_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligations" ADD CONSTRAINT "client_obligations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligations" ADD CONSTRAINT "client_obligations_sourceContractId_fkey" FOREIGN KEY ("sourceContractId") REFERENCES "contract_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligations" ADD CONSTRAINT "client_obligations_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligations" ADD CONSTRAINT "client_obligations_evidenceDocumentVersionId_fkey" FOREIGN KEY ("evidenceDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_entitlements" ADD CONSTRAINT "contract_entitlements_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_entitlements" ADD CONSTRAINT "contract_entitlements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

