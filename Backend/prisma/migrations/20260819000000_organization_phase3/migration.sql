-- CreateEnum
CREATE TYPE "DocumentSecurityClassification" AS ENUM ('STANDARD', 'HR_CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "OrganizationPersonStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE', 'ENDED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "securityClassification" "DocumentSecurityClassification" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "client_organization_groups" ADD COLUMN "parentGroupId" TEXT;

-- AlterTable
ALTER TABLE "contract_records" ADD COLUMN "businessOwnerPersonId" TEXT;

-- AlterTable
ALTER TABLE "client_obligations" ADD COLUMN "ownerPersonId" TEXT;

-- AlterTable
ALTER TABLE "development_initiatives" ADD COLUMN "clientOwnerPersonId" TEXT;

CREATE TABLE "organization_persons" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationGroupId" TEXT,
    "managerPersonId" TEXT,
    "deputyPersonId" TEXT,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "employmentStatus" "OrganizationPersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "responsibilitiesSummary" TEXT,
    "portalMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_person_responsibilities" (
    "id" TEXT NOT NULL,
    "organizationPersonId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_person_responsibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_person_document_links" (
    "id" TEXT NOT NULL,
    "organizationPersonId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "documentRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_person_document_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_organization_groups_parentGroupId_idx" ON "client_organization_groups"("parentGroupId");

-- CreateIndex
CREATE INDEX "development_initiatives_clientOwnerPersonId_idx" ON "development_initiatives"("clientOwnerPersonId");

-- CreateIndex
CREATE INDEX "contract_records_businessOwnerPersonId_idx" ON "contract_records"("businessOwnerPersonId");

-- CreateIndex
CREATE INDEX "client_obligations_ownerPersonId_idx" ON "client_obligations"("ownerPersonId");

-- CreateIndex
CREATE INDEX "organization_persons_clientId_employmentStatus_idx" ON "organization_persons"("clientId", "employmentStatus");

-- CreateIndex
CREATE INDEX "organization_persons_clientId_organizationGroupId_idx" ON "organization_persons"("clientId", "organizationGroupId");

-- CreateIndex
CREATE INDEX "organization_persons_managerPersonId_idx" ON "organization_persons"("managerPersonId");

-- CreateIndex
CREATE INDEX "organization_persons_deputyPersonId_idx" ON "organization_persons"("deputyPersonId");

-- CreateIndex
CREATE INDEX "organization_person_responsibilities_organizationPersonId_idx" ON "organization_person_responsibilities"("organizationPersonId");

-- CreateIndex
CREATE INDEX "organization_person_document_links_organizationPersonId_idx" ON "organization_person_document_links"("organizationPersonId");

-- CreateIndex
CREATE INDEX "organization_person_document_links_documentVersionId_idx" ON "organization_person_document_links"("documentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_person_document_links_organizationPersonId_doc_key" ON "organization_person_document_links"("organizationPersonId", "documentVersionId", "documentRole");

-- AddForeignKey
ALTER TABLE "client_organization_groups" ADD CONSTRAINT "client_organization_groups_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "client_organization_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_initiatives" ADD CONSTRAINT "development_initiatives_clientOwnerPersonId_fkey" FOREIGN KEY ("clientOwnerPersonId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_businessOwnerPersonId_fkey" FOREIGN KEY ("businessOwnerPersonId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_obligations" ADD CONSTRAINT "client_obligations_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_persons" ADD CONSTRAINT "organization_persons_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_persons" ADD CONSTRAINT "organization_persons_organizationGroupId_fkey" FOREIGN KEY ("organizationGroupId") REFERENCES "client_organization_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_persons" ADD CONSTRAINT "organization_persons_managerPersonId_fkey" FOREIGN KEY ("managerPersonId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_persons" ADD CONSTRAINT "organization_persons_deputyPersonId_fkey" FOREIGN KEY ("deputyPersonId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_person_responsibilities" ADD CONSTRAINT "organization_person_responsibilities_organizationPersonId_fkey" FOREIGN KEY ("organizationPersonId") REFERENCES "organization_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_person_document_links" ADD CONSTRAINT "organization_person_document_links_organizationPersonId_fkey" FOREIGN KEY ("organizationPersonId") REFERENCES "organization_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_person_document_links" ADD CONSTRAINT "organization_person_document_links_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

