import { fetchApi, fetchApiBlob } from './api';

/** Backend contract: all monetary values are decimal strings; the frontend never computes money. */
export type BillingReviewStatus =
  | 'SOURCE_MISSING' | 'STALE' | 'REVIEW_REQUIRED' | 'NO_RATE' | 'NON_BILLABLE' | 'ZERO_MINUTES' | 'OK';

export type BillingPreparationSummary = {
  id: string;
  clientId: string;
  clientName: string | null;
  periodStart: string;
  periodEnd: string;
  currency: string;
  calculationPolicyVersion: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  createdById: string;
  closedAt: string | null;
  closedById: string | null;
  itemCount?: number;
  includedMinutes?: number;
  includedNetAmount?: string;
};

export type BillingItem = {
  id: string;
  sourceTimeEntryId: string;
  reviewStatus: BillingReviewStatus;
  attributionKind: 'EXACT_CASE' | 'TASK_DERIVED_CASE' | 'MATTER_ONLY' | 'AMBIGUOUS';
  source: {
    workDate: string;
    minutes: number;
    billable: boolean;
    description: string | null;
    workType: string;
    worker: { id: string; name: string | null };
    case: { id: string; caseNumber: string | null; title: string | null } | null;
    task: { id: string; title: string | null } | null;
    requester: { id: string; name: string | null; jobTitle: string | null } | null;
    organizationGroup: { id: string; name: string | null } | null;
    department: { id: string; name: string | null } | null;
  };
  rate: {
    rateVersionId: string | null;
    scope: 'CASE' | 'CLIENT' | 'UNRESOLVED' | null;
    hourlyRate: string | null;
    currency: string | null;
  };
  billing: {
    included: boolean;
    billingMinutes: number;
    invoiceDescription: string | null;
    rateOverride: string | null;
    rateOverrideReason: string | null;
    rateOverrideById: string | null;
    rateOverrideAt: string | null;
    adjustmentReason: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    effectiveHourlyRate: string | null;
    netAmount: string | null;
  };
};

export type BillingWorkspace = {
  preparation: BillingPreparationSummary;
  summary: {
    currency: string;
    itemCount: number;
    includedMinutes: number;
    excludedMinutes: number;
    includedNetAmount: string;
    reviewRequiredCount: number;
    noRateCount: number;
    staleCount: number;
    nonBillableCount: number;
  };
  items: BillingItem[];
  canManage: boolean;
};

const base = '/billing-preparations';

export function createBillingPreparation(input: { clientId: string; periodStart: string; periodEnd: string }) {
  return fetchApi<{ created: boolean; preparation: BillingPreparationSummary; itemCount?: number }>(base, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listBillingPreparations(clientId: string) {
  return fetchApi<BillingPreparationSummary[]>(`${base}?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' });
}

export function getBillingPreparation(preparationId: string) {
  return fetchApi<BillingWorkspace>(`${base}/${encodeURIComponent(preparationId)}`, { cache: 'no-store' });
}

export function downloadBillingPreparationPdf(preparationId: string) {
  return fetchApiBlob(`${base}/${encodeURIComponent(preparationId)}/pdf`);
}

export type BillingItemPatch = {
  included?: boolean;
  billingMinutes?: number;
  invoiceDescription?: string | null;
  rateOverride?: string | null;
  rateOverrideReason?: string | null;
  adjustmentReason?: string | null;
  markReviewed?: boolean;
};

export function patchBillingItem(preparationId: string, itemId: string, body: BillingItemPatch) {
  return fetchApi<BillingItem>(`${base}/${encodeURIComponent(preparationId)}/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function resyncBillingItem(preparationId: string, itemId: string) {
  return fetchApi<{ resynced: boolean; minutesClamped?: boolean; reason?: string; item: BillingItem }>(
    `${base}/${encodeURIComponent(preparationId)}/items/${encodeURIComponent(itemId)}/resync`,
    { method: 'POST' },
  );
}

export function refreshBillingPreparation(preparationId: string) {
  return fetchApi<{ resynced: number; added: number; stillMissing: number }>(
    `${base}/${encodeURIComponent(preparationId)}/refresh`,
    { method: 'POST' },
  );
}

export function setBillingPreparationStatus(preparationId: string, status: 'OPEN' | 'CLOSED') {
  return fetchApi<{ preparation: BillingPreparationSummary }>(
    `${base}/${encodeURIComponent(preparationId)}/${status === 'CLOSED' ? 'close' : 'reopen'}`,
    { method: 'POST' },
  );
}
