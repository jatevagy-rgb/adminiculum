-- T6A invoice draft foundation — additive only. Drafts are snapshot documents
-- derived from CLOSED billing preparations; they are never legal invoices
-- (no numbering, no issuance, no NAV integration).

CREATE TYPE "InvoiceCustomerTaxNumberRequirement" AS ENUM ('UNCONFIRMED', 'REQUIRED', 'NOT_APPLICABLE');
CREATE TYPE "InvoiceDraftStatus" AS ENUM ('DRAFT');
CREATE TYPE "InvoiceVatTreatment" AS ENUM ('NORMAL_VAT', 'TAX_EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE');

CREATE TABLE "invoice_drafts" (
    "id" TEXT NOT NULL,
    "billingPreparationId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "InvoiceDraftStatus" NOT NULL DEFAULT 'DRAFT',

    -- Issuer identity snapshot (captured from configured issuer profile).
    "issuerLegalName" TEXT,
    "issuerAddress" TEXT,
    "issuerTaxNumber" TEXT,
    "issuerEuVatNumber" TEXT,
    "issuerRegistrationNumber" TEXT,
    "issuerBankName" TEXT,
    "issuerBankAccountNumber" TEXT,
    "issuerEmail" TEXT,
    "issuerPhone" TEXT,
    -- No issuerLogoPath: would expose arbitrary server file reads in the PDF
    -- renderer. Logo support is deferred to a safe asset reference hook.

    -- Customer billing identity snapshot.
    "customerTaxNumberRequirement" "InvoiceCustomerTaxNumberRequirement" NOT NULL DEFAULT 'UNCONFIRMED',
    "customerTaxNumberCanonical" BOOLEAN NOT NULL DEFAULT false,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "customerTaxNumber" TEXT,
    "customerVatNumber" TEXT,

    "performanceDate" DATE,
    "draftDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentDueDate" DATE,
    "paymentMethod" VARCHAR(40),
    "note" TEXT,

    "vatTreatment" "InvoiceVatTreatment" NOT NULL DEFAULT 'NORMAL_VAT',
    "vatRate" DECIMAL(7,4),

    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_drafts_currency_check" CHECK ("currency" = 'HUF'),
    CONSTRAINT "invoice_drafts_vat_rate_check" CHECK (
        "vatRate" IS NULL OR ("vatRate" >= 0 AND "vatRate" <= 100 AND "vatRate" NOT IN ('NaN'::numeric, 'Infinity'::numeric))
    ),
    -- Defense in depth only; the service validates VAT combinations first and
    -- returns a controlled 4xx instead of ever reaching this CHECK.
    CONSTRAINT "invoice_drafts_normal_vat_rate_check" CHECK (
        "vatTreatment" <> 'NORMAL_VAT' OR "vatRate" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "invoice_drafts_billingPreparationId_key" ON "invoice_drafts"("billingPreparationId");
CREATE INDEX "invoice_drafts_createdById_idx" ON "invoice_drafts"("createdById");

ALTER TABLE "invoice_drafts"
    ADD CONSTRAINT "invoice_drafts_billingPreparationId_fkey" FOREIGN KEY ("billingPreparationId") REFERENCES "billing_preparations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "invoice_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "invoice_draft_lines" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "billingItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    -- Invoice face is exactly reconcilable: quantity 1 tétel at the
    -- authoritative persisted net; per-minute basis lives in the annex fields.
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "netUnitPrice" DECIMAL(19,4),
    "netAmount" DECIMAL(19,2) NOT NULL,
    "vatTreatment" "InvoiceVatTreatment" NOT NULL DEFAULT 'NORMAL_VAT',
    "vatRate" DECIMAL(7,4),
    "vatAmount" DECIMAL(19,2) NOT NULL,
    "grossAmount" DECIMAL(19,2) NOT NULL,

    -- Provenance for the "Elszámolási melléklet" annex.
    "sourceWorkDate" DATE NOT NULL,
    "caseNumber" TEXT,
    "caseTitle" TEXT,
    "workerName" TEXT,
    "billingMinutes" INTEGER NOT NULL,
    "hourlyRate" DECIMAL(19,4),

    CONSTRAINT "invoice_draft_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_draft_lines_amounts_check" CHECK (
        "netAmount" >= 0 AND "vatAmount" >= 0 AND "grossAmount" >= 0
        AND "netAmount" NOT IN ('NaN'::numeric, 'Infinity'::numeric)
        AND "vatAmount" NOT IN ('NaN'::numeric, 'Infinity'::numeric)
        AND "grossAmount" NOT IN ('NaN'::numeric, 'Infinity'::numeric)
        AND "grossAmount" = "netAmount" + "vatAmount"
    )
);

CREATE UNIQUE INDEX "invoice_draft_lines_draftId_billingItemId_key" ON "invoice_draft_lines"("draftId", "billingItemId");
CREATE INDEX "invoice_draft_lines_draftId_idx" ON "invoice_draft_lines"("draftId");

ALTER TABLE "invoice_draft_lines"
    ADD CONSTRAINT "invoice_draft_lines_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "invoice_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
