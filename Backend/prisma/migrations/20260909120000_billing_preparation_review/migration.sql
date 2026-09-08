-- T4 persistent billing review ("Számlázás előkészítése").
-- Additive only: new enum + two tables. The preparation never mutates
-- TimeEntries; items capture source facts + a deterministic fingerprint so
-- source changes surface as STALE instead of being silently overwritten.
-- No invoice lifecycle, numbering, VAT, or issuance in this migration.

-- CreateEnum
CREATE TYPE "BillingPreparationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "billing_preparations" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "calculationPolicyVersion" VARCHAR(64) NOT NULL,
    "status" "BillingPreparationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "billing_preparations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_preparations_period_check" CHECK ("periodStart" <= "periodEnd"),
    CONSTRAINT "billing_preparations_currency_check" CHECK ("currency" = 'HUF')
);

-- CreateTable
CREATE TABLE "billing_preparation_items" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "sourceTimeEntryId" TEXT NOT NULL,
    "sourceFingerprint" VARCHAR(64) NOT NULL,

    "sourceWorkDate" DATE NOT NULL,
    "sourceMinutes" INTEGER NOT NULL,
    "sourceBillable" BOOLEAN NOT NULL,
    "sourceDescription" TEXT,
    "sourceWorkType" "WorkType" NOT NULL,
    "workerId" TEXT NOT NULL,
    "workerName" TEXT,
    "caseId" TEXT,
    "caseNumber" TEXT,
    "caseTitle" TEXT,
    "taskId" TEXT,
    "taskTitle" TEXT,
    "requesterId" TEXT,
    "requesterName" TEXT,
    "requesterJobTitle" TEXT,
    "organizationGroupId" TEXT,
    "organizationGroupName" TEXT,
    "departmentId" TEXT,
    "departmentName" TEXT,
    "attributionKind" VARCHAR(20) NOT NULL,

    "rateVersionId" TEXT,
    "rateScope" VARCHAR(20),
    "hourlyRate" DECIMAL(19,4),
    "rateCurrency" VARCHAR(3),

    "included" BOOLEAN NOT NULL DEFAULT false,
    "billingMinutes" INTEGER NOT NULL,
    "invoiceDescription" TEXT,
    "rateOverride" DECIMAL(19,4),
    "rateOverrideReason" TEXT,
    "rateOverrideById" TEXT,
    "rateOverrideAt" TIMESTAMP(3),
    "adjustmentReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "netAmount" DECIMAL(19,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "billing_preparation_items_pkey" PRIMARY KEY ("id"),
    -- V1 write-down rule: billing minutes may only be reduced, never exceed
    -- the recorded source minutes, and every reduction REQUIRES a non-blank
    -- reason at the database level (the service rule mirrored as integrity).
    -- Restoring billingMinutes == sourceMinutes may retain an existing reason.
    CONSTRAINT "billing_prep_item_minutes_writedown" CHECK (
        "billingMinutes" >= 0
        AND "billingMinutes" <= "sourceMinutes"
        AND (
            "billingMinutes" = "sourceMinutes"
            OR ("adjustmentReason" IS NOT NULL AND length(btrim("adjustmentReason")) > 0)
        )
    ),
    -- A billing-row rate override must always carry reason + author + timestamp,
    -- and must be a positive finite decimal (NaN/Infinity rejected here too).
    CONSTRAINT "billing_prep_item_override_integrity" CHECK (
        "rateOverride" IS NULL OR (
            "rateOverride" > 0
            AND "rateOverride" <> 'NaN'::numeric
            AND "rateOverride" <> 'Infinity'::numeric
            AND "rateOverrideReason" IS NOT NULL
            AND "rateOverrideById" IS NOT NULL
            AND "rateOverrideAt" IS NOT NULL
        )
    ),
    -- An included row must always carry its calculated net amount.
    CONSTRAINT "billing_prep_item_included_amount" CHECK ("included" = false OR "netAmount" IS NOT NULL),
    CONSTRAINT "billing_prep_item_attribution_check" CHECK ("attributionKind" IN ('EXACT_CASE', 'TASK_DERIVED_CASE', 'MATTER_ONLY', 'AMBIGUOUS')),
    CONSTRAINT "billing_prep_item_rate_scope_check" CHECK ("rateScope" IS NULL OR "rateScope" IN ('CASE', 'CLIENT', 'UNRESOLVED'))
);

-- CreateIndex: one OPEN preparation per client + period (deterministic;
-- avoids ambiguous duplicate active review workspaces).
CREATE UNIQUE INDEX "billing_preparations_one_open_period" ON "billing_preparations"("clientId", "periodStart", "periodEnd") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE INDEX "billing_preparations_clientId_periodStart_periodEnd_idx" ON "billing_preparations"("clientId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "billing_preparation_items_preparationId_sourceTimeEntryId_key" ON "billing_preparation_items"("preparationId", "sourceTimeEntryId");

-- CreateIndex
CREATE INDEX "billing_preparation_items_sourceTimeEntryId_idx" ON "billing_preparation_items"("sourceTimeEntryId");

-- AddForeignKey
ALTER TABLE "billing_preparations" ADD CONSTRAINT "billing_preparations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "billing_preparations" ADD CONSTRAINT "billing_preparations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "billing_preparations" ADD CONSTRAINT "billing_preparations_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "billing_preparation_items" ADD CONSTRAINT "billing_preparation_items_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "billing_preparations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deliberate: NO foreign key on "sourceTimeEntryId". TimeEntry deletion must
-- remain possible (preservation); a deleted or relationally changed source is
-- detected through the fingerprint/missing-source check and flagged for review.
