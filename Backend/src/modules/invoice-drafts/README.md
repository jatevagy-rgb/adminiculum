# Invoice drafts (T6A) — "Számlatervezet, nem számla"

Legally safe invoice-draft foundation. A draft is a **snapshot** derived from
one CLOSED `BillingPreparation`: issuer profile, customer identity, and all
billing lines are copied at creation — later TimeEntry/Client/profile edits
never retroactively change a draft.

- Issuer profile lives in `SystemSetting` under key `billing.issuerProfile`
  (existing settings system — no parallel store). Writes are ADMIN-only.
- Lines come only from persisted `BillingPreparationItem` rows (`included`,
  `billingMinutes`, `invoiceDescription`/`sourceDescription`, `netAmount`).
  No TimeEntry re-read, no rate re-resolution, no billing recompute.
- Money is `Prisma.Decimal` end to end; VAT = `net × rate / 100` HALF_UP 2dp.
  No hardcoded VAT rate — it comes from the issuer profile or the draft input.
- `InvoiceVatTreatment` already models `NORMAL_VAT | TAX_EXEMPT |
  REVERSE_CHARGE | OUT_OF_SCOPE` so alternate legal treatments stay possible.
- PDF: `SZÁMLATERVEZET` / `NEM SZÁMLA` face + `Elszámolási melléklet` annex.
  Renders without a logo; `issuerLogoPath` is the config hook for a later
  approved asset (top-left branding area).

## T6B extension points (not implemented here)

- Sequential `invoiceNumber` + `ISSUED` state: extend
  `InvoiceDraftStatus` and add a numbering table/sequence.
- NAV Online Számla M2M: new module — must never reuse this draft PDF face.
- Correction/storno invoices, archival policy, NAV audit export.
