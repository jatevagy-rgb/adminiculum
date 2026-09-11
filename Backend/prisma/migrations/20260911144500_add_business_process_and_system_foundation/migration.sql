-- CreateTable
CREATE TABLE "business_processes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "ownerPersonId" TEXT,
    "organizationGroupId" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_systems" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SOFTWARE',
    "vendor" TEXT,
    "purpose" TEXT,
    "ownerPersonId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_process_steps" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "stepType" TEXT NOT NULL DEFAULT 'MANUAL',
    "responsiblePersonId" TEXT,
    "systemId" TEXT,
    "estimatedActiveMinutes" INTEGER,
    "estimatedWaitingMinutes" INTEGER,
    "isApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_process_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "client_organization_groups_id_clientId_key" ON "client_organization_groups"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "organization_persons_id_clientId_key" ON "organization_persons"("id", "clientId");

-- CreateIndex
CREATE INDEX "business_processes_clientId_status_idx" ON "business_processes"("clientId", "status");

-- CreateIndex
CREATE INDEX "business_processes_ownerPersonId_idx" ON "business_processes"("ownerPersonId");

-- CreateIndex
CREATE INDEX "business_processes_organizationGroupId_idx" ON "business_processes"("organizationGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "business_processes_id_clientId_key" ON "business_processes"("id", "clientId");

-- CreateIndex
CREATE INDEX "business_systems_clientId_status_idx" ON "business_systems"("clientId", "status");

-- CreateIndex
CREATE INDEX "business_systems_ownerPersonId_idx" ON "business_systems"("ownerPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "business_systems_id_clientId_key" ON "business_systems"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "business_systems_clientId_name_key" ON "business_systems"("clientId", "name");

-- CreateIndex
CREATE INDEX "business_process_steps_processId_idx" ON "business_process_steps"("processId");

-- CreateIndex
CREATE INDEX "business_process_steps_clientId_idx" ON "business_process_steps"("clientId");

-- CreateIndex
CREATE INDEX "business_process_steps_systemId_idx" ON "business_process_steps"("systemId");

-- CreateIndex
CREATE INDEX "business_process_steps_responsiblePersonId_idx" ON "business_process_steps"("responsiblePersonId");

-- CreateIndex
CREATE UNIQUE INDEX "business_process_steps_processId_position_key" ON "business_process_steps"("processId", "position");

-- AddForeignKey
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_ownerPersonId_clientId_fkey" FOREIGN KEY ("ownerPersonId", "clientId") REFERENCES "organization_persons"("id", "clientId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_organizationGroupId_clientId_fkey" FOREIGN KEY ("organizationGroupId", "clientId") REFERENCES "client_organization_groups"("id", "clientId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_systems" ADD CONSTRAINT "business_systems_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_systems" ADD CONSTRAINT "business_systems_ownerPersonId_clientId_fkey" FOREIGN KEY ("ownerPersonId", "clientId") REFERENCES "organization_persons"("id", "clientId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_process_steps" ADD CONSTRAINT "business_process_steps_processId_clientId_fkey" FOREIGN KEY ("processId", "clientId") REFERENCES "business_processes"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_process_steps" ADD CONSTRAINT "business_process_steps_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_process_steps" ADD CONSTRAINT "business_process_steps_responsiblePersonId_clientId_fkey" FOREIGN KEY ("responsiblePersonId", "clientId") REFERENCES "organization_persons"("id", "clientId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_process_steps" ADD CONSTRAINT "business_process_steps_systemId_clientId_fkey" FOREIGN KEY ("systemId", "clientId") REFERENCES "business_systems"("id", "clientId") ON DELETE SET NULL ON UPDATE CASCADE;
