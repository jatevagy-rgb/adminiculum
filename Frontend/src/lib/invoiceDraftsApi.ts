import { fetchApi, fetchApiBlob } from './api';

/**
 * T6A invoice-draft ("Számlatervezet — nem számla") API client.
 * All monetary values are decimal strings; the frontend never computes money.
 */

export type VatTreatment = 'NORMAL_VAT' | 'TAX_EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';

export type IssuerProfile = {
  legalName: string | null;
  address: string | null;
  taxNumber: string | null;
  euVatNumber: string | null;
  registrationNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  email: string | null;
  phone: string | null;
  logoPath: string | null;
  defaultVatTreatment: VatTreatment;
  defaultVatRate: string | null;
  defaultPaymentMethod: string | null;
  defaultPaymentTermDays: number | null;
};

export type InvoiceDraftLine = {
  id: string;
  billingItemId: string;
  sortOrder: number;
  description: string;
  quantity: string;
  unit: string;
  netUnitPrice: string | null;
  netAmount: string;
  vatTreatment: VatTreatment;
  vatRate: string | null;
  vatAmount: string;
  grossAmount: string;
  source: {
    workDate: string | null;
    caseNumber: string | null;
    caseTitle: string | null;
    workerName: string | null;
    billingMinutes: number;
    hourlyRate: string | null;
  };
};

export type InvoiceDraft = {
  id: string;
  billingPreparationId: string;
  currency: string;
  status: 'DRAFT';
  issuer: {
    legalName: string | null;
    address: string | null;
    taxNumber: string | null;
    euVatNumber: string | null;
    registrationNumber: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    email: string | null;
    phone: string | null;
    logoPath: string | null;
  };
  customer: {
    name: string | null;
    address: string | null;
    taxNumber: string | null;
    vatNumber: string | null;
  };
  performanceDate: string | null;
  draftDate: string | null;
  paymentDueDate: string | null;
  paymentMethod: string | null;
  note: string | null;
  vatTreatment: VatTreatment;
  vatRate: string | null;
  missing: string[];
  totals: { netAmount: string; vatAmount: string; grossAmount: string };
  lines: InvoiceDraftLine[];
  createdAt: string;
  updatedAt: string;
};

const base = '/invoice-drafts';

export function getIssuerProfile() {
  return fetchApi<{ profile: IssuerProfile; configured: string | null }>(`${base}/issuer-profile`, { cache: 'no-store' });
}

export function putIssuerProfile(profile: Partial<IssuerProfile>) {
  return fetchApi<{ profile: IssuerProfile }>(`${base}/issuer-profile`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function createInvoiceDraft(input: { billingPreparationId: string; performanceDate?: string | null; paymentDueDate?: string | null; paymentMethod?: string | null; vatTreatment?: VatTreatment; vatRate?: string | null; note?: string | null }) {
  return fetchApi<{ created: boolean; draft: InvoiceDraft }>(`${base}/drafts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getInvoiceDraft(draftId: string) {
  return fetchApi<{ draft: InvoiceDraft }>(`${base}/drafts/${encodeURIComponent(draftId)}`, { cache: 'no-store' });
}

export type InvoiceDraftPatch = {
  performanceDate?: string | null;
  draftDate?: string | null;
  paymentDueDate?: string | null;
  paymentMethod?: string | null;
  note?: string | null;
  vatTreatment?: VatTreatment;
  vatRate?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerTaxNumber?: string | null;
  customerVatNumber?: string | null;
};

export function patchInvoiceDraft(draftId: string, body: InvoiceDraftPatch) {
  return fetchApi<{ draft: InvoiceDraft }>(`${base}/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function patchInvoiceDraftLine(draftId: string, lineId: string, description: string) {
  return fetchApi<{ draft: InvoiceDraft }>(`${base}/drafts/${encodeURIComponent(draftId)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ description }),
  });
}

export function downloadInvoiceDraftPdf(draftId: string) {
  return fetchApiBlob(`${base}/drafts/${encodeURIComponent(draftId)}/pdf`);
}
