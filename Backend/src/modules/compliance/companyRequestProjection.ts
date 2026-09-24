/**
 * Company-level customer request projection for the organizational portal.
 *
 * Aggregates the published ClientRequest rows that the authenticated portal
 * identity is actually allowed to see, so the customer does not have to open
 * every case to discover requested documents or open questions.
 *
 * AUTHORIZATION (fail closed):
 *   - the clientId comes from the resolved portal workspace, never the browser;
 *   - only cases with an ACTIVE, unexpired ClientPortalGrant for
 *     (identity, workspace, client) contribute rows;
 *   - a request whose case has no active grant can never appear, even when the
 *     clientId matches;
 *   - requests without a case (intake-scoped) are excluded;
 *   - only CUSTOMER_VISIBLE statuses are returned (DRAFT/READY_TO_PUBLISH/
 *     CANCELLED/EXPIRED are never customer-readable).
 *
 * PROJECTION (customer-safe):
 *   - reuses the canonical toClientSafeRequest mapper + assertClientSafe scanner;
 *   - exposes only a derived contextLabel for Compliance provenance, never
 *     requirementVersionId / clientControlId / findingId;
 *   - adds a fully translated customer state, never a raw internal enum alone.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { Prisma } from '../client-interaction/base';
import { toClientSafeRequest, customerVisibleRequestStatuses } from '../client-interaction/requestService';

export type CompanyRequestCategory = 'DOCUMENT' | 'QUESTION';
export type CompanyRequestState = 'AWAITING_CUSTOMER' | 'OFFICE_PROCESSING' | 'CLOSED';

const DOCUMENT_REQUEST_TYPES = new Set(['DOCUMENT_UPLOAD', 'MISSING_DOCUMENT_REQUEST']);

export type CompanyRequestCounts = {
  awaitingCustomer: number;
  officeProcessing: number;
  closed: number;
  requestedDocuments: number;
  openQuestions: number;
};

export type CompanyClientRequest = {
  id: string;
  caseId: string | null;
  type: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  required: boolean;
  status: string;
  documentSpec: unknown;
  publishedAt: string | null;
  fields: unknown[];
  contextLabel: string | null;
  category: CompanyRequestCategory;
  state: CompanyRequestState;
  canRespond: boolean;
  canUpload: boolean;
};

export function companyRequestCategory(type: string): CompanyRequestCategory {
  return DOCUMENT_REQUEST_TYPES.has(type) ? 'DOCUMENT' : 'QUESTION';
}

export function companyRequestState(status: string): CompanyRequestState {
  switch (status) {
    case 'PUBLISHED':
    case 'PARTIALLY_SUBMITTED':
    case 'CORRECTION_REQUESTED':
      return 'AWAITING_CUSTOMER';
    case 'SUBMITTED':
    case 'UNDER_INTERNAL_REVIEW':
      return 'OFFICE_PROCESSING';
    case 'COMPLETED':
      return 'CLOSED';
    default:
      // Unreachable for CUSTOMER_VISIBLE statuses; conservatively never claim a
      // customer action for an unknown state.
      return 'OFFICE_PROCESSING';
  }
}

export async function getCompanyClientRequestProjection(
  clientId: string,
  clientPortalIdentityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<{ items: CompanyClientRequest[]; counts: CompanyRequestCounts; generatedAt: string }> {
  const generatedAt = new Date().toISOString();
  const empty: CompanyRequestCounts = { awaitingCustomer: 0, officeProcessing: 0, closed: 0, requestedDocuments: 0, openQuestions: 0 };

  const now = new Date();
  const grants = await prisma.clientPortalGrant.findMany({
    where: {
      clientPortalIdentityId,
      workspaceId,
      clientId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { caseId: true },
  });
  const grantedCaseIds = [...new Set(grants.map((grant) => grant.caseId).filter((caseId): caseId is string => Boolean(caseId)))];
  if (grantedCaseIds.length === 0) {
    return { items: [], counts: empty, generatedAt };
  }

  const rows = await prisma.clientRequest.findMany({
    where: {
      clientId,
      caseId: { in: grantedCaseIds },
      status: { in: customerVisibleRequestStatuses as any },
    },
    orderBy: [{ dueAt: 'asc' }, { publishedAt: 'desc' }],
    take: 500,
    include: {
      fields: { orderBy: { displayOrder: 'asc' } },
      requirementVersion: { select: { title: true } },
      clientControl: { select: { controlDefinition: { select: { title: true } } } },
      finding: { select: { title: true } },
    },
  });

  const items: CompanyClientRequest[] = rows.map((row) => {
    const safe = toClientSafeRequest(row);
    const category = companyRequestCategory(safe.type);
    const state = companyRequestState(safe.status);
    const awaitingCustomer = state === 'AWAITING_CUSTOMER';
    return {
      id: safe.id,
      caseId: safe.caseId ?? null,
      type: safe.type,
      title: safe.title,
      instructions: safe.instructions ?? null,
      dueAt: safe.dueAt ? new Date(safe.dueAt).toISOString() : null,
      required: Boolean(safe.required),
      status: safe.status,
      documentSpec: safe.documentSpec ?? null,
      publishedAt: safe.publishedAt ? new Date(safe.publishedAt).toISOString() : null,
      fields: safe.fields,
      contextLabel: safe.contextLabel ?? null,
      category,
      state,
      canRespond: awaitingCustomer,
      canUpload: awaitingCustomer && category === 'DOCUMENT',
    };
  });

  const counts: CompanyRequestCounts = {
    awaitingCustomer: items.filter((item) => item.state === 'AWAITING_CUSTOMER').length,
    officeProcessing: items.filter((item) => item.state === 'OFFICE_PROCESSING').length,
    closed: items.filter((item) => item.state === 'CLOSED').length,
    requestedDocuments: items.filter((item) => item.category === 'DOCUMENT').length,
    openQuestions: items.filter((item) => item.category === 'QUESTION' && item.state !== 'CLOSED').length,
  };

  return { items, counts, generatedAt };
}
