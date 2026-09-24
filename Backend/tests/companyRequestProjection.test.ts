/**
 * Company-level customer request projection (unit/contract).
 *
 * Proves the authorization scope and the customer-safe projection WITHOUT a
 * database: the projection must restrict the query to the cases the identity
 * holds an active grant for, must hide non-customer-visible statuses, and must
 * never expose Compliance internal identifiers. A DB-backed leak test lives in
 * the PG integration suite.
 */
import { getCompanyClientRequestProjection, companyRequestCategory, companyRequestState } from '../src/modules/compliance/companyRequestProjection';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    caseId: 'caseA',
    type: 'DOCUMENT_UPLOAD',
    clientSafeTitle: 'Munkavédelmi oktatási nyilvántartás',
    clientSafeInstructions: 'Töltse fel az oktatási nyilvántartást.',
    dueAt: new Date('2026-10-01T00:00:00.000Z'),
    required: true,
    status: 'PUBLISHED',
    documentSpec: { acceptedMimeTypes: ['application/pdf'], maxFileCount: 1 },
    publishedAt: new Date('2026-09-01T00:00:00.000Z'),
    fields: [],
    requirementVersion: null,
    clientControl: null,
    finding: { title: 'Munkavédelmi követelmények' },
    ...overrides,
  };
}

function makePrisma(grants: Array<{ caseId: string }>, rows: any[]) {
  return {
    clientPortalGrant: { findMany: jest.fn(async () => grants) },
    clientRequest: { findMany: jest.fn(async () => rows) },
  } as any;
}

describe('companyRequestState / companyRequestCategory', () => {
  it('maps lifecycle statuses to translated customer states', () => {
    expect(companyRequestState('PUBLISHED')).toBe('AWAITING_CUSTOMER');
    expect(companyRequestState('PARTIALLY_SUBMITTED')).toBe('AWAITING_CUSTOMER');
    expect(companyRequestState('CORRECTION_REQUESTED')).toBe('AWAITING_CUSTOMER');
    expect(companyRequestState('SUBMITTED')).toBe('OFFICE_PROCESSING');
    expect(companyRequestState('UNDER_INTERNAL_REVIEW')).toBe('OFFICE_PROCESSING');
    expect(companyRequestState('COMPLETED')).toBe('CLOSED');
  });

  it('maps request types to document vs question categories', () => {
    expect(companyRequestCategory('DOCUMENT_UPLOAD')).toBe('DOCUMENT');
    expect(companyRequestCategory('MISSING_DOCUMENT_REQUEST')).toBe('DOCUMENT');
    expect(companyRequestCategory('INFORMATION_REQUEST')).toBe('QUESTION');
    expect(companyRequestCategory('DATA_FORM')).toBe('QUESTION');
    expect(companyRequestCategory('QUESTION_RESPONSE')).toBe('QUESTION');
    expect(companyRequestCategory('CORRECTION_REQUEST')).toBe('QUESTION');
  });
});

describe('getCompanyClientRequestProjection authorization', () => {
  it('fails closed when the identity has no active grant (no request query)', async () => {
    const prisma = makePrisma([], [makeRow()]);
    const result = await getCompanyClientRequestProjection('clientX', 'identity-1', 'ws-1', prisma);

    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({ awaitingCustomer: 0, officeProcessing: 0, closed: 0, requestedDocuments: 0, openQuestions: 0 });
    expect(prisma.clientRequest.findMany).not.toHaveBeenCalled();
  });

  it('scopes the request query to granted cases and to customer-visible statuses only', async () => {
    const prisma = makePrisma([{ caseId: 'caseA' }], [makeRow()]);
    await getCompanyClientRequestProjection('clientX', 'identity-1', 'ws-1', prisma);

    expect(prisma.clientPortalGrant.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.clientRequest.findMany.mock.calls[0][0].where;
    expect(where.clientId).toBe('clientX');
    expect(where.caseId).toEqual({ in: ['caseA'] });
    expect(where.status.in).toEqual(
      expect.arrayContaining(['PUBLISHED', 'SUBMITTED', 'COMPLETED']),
    );
    expect(where.status.in).not.toContain('DRAFT');
    expect(where.status.in).not.toContain('CANCELLED');
    expect(where.status.in).not.toContain('READY_TO_PUBLISH');
  });

  it('deduplicates granted cases so a case cannot widen scope', async () => {
    const prisma = makePrisma([{ caseId: 'caseA' }, { caseId: 'caseA' }, { caseId: 'caseB' }], [makeRow()]);
    await getCompanyClientRequestProjection('clientX', 'identity-1', 'ws-1', prisma);
    const where = prisma.clientRequest.findMany.mock.calls[0][0].where;
    expect(where.caseId.in.sort()).toEqual(['caseA', 'caseB']);
  });

  it('exposes only customer-safe fields with a derived contextLabel and no internal identifiers', async () => {
    const prisma = makePrisma([{ caseId: 'caseA' }], [makeRow()]);
    const result = await getCompanyClientRequestProjection('clientX', 'identity-1', 'ws-1', prisma);
    const item = result.items[0] as Record<string, unknown>;

    expect(item.contextLabel).toBe('Munkavédelmi követelmények');
    expect(item.category).toBe('DOCUMENT');
    expect(item.state).toBe('AWAITING_CUSTOMER');
    expect(item.canRespond).toBe(true);
    expect(item.canUpload).toBe(true);
    expect(item.documentSpec).toEqual({ acceptedMimeTypes: ['application/pdf'], maxFileCount: 1 });

    for (const forbiddenKey of ['requirementVersionId', 'clientControlId', 'findingId', 'audienceSnapshot', 'createdById', 'assignedInternalUserId']) {
      expect(item).not.toHaveProperty(forbiddenKey);
    }
  });

  it('does not offer a customer CTA once the office has the request', async () => {
    const prisma = makePrisma([{ caseId: 'caseA' }], [makeRow({ type: 'INFORMATION_REQUEST', status: 'SUBMITTED', finding: null, requirementVersion: { title: 'Adatkezelési követelmények' } })]);
    const result = await getCompanyClientRequestProjection('clientX', 'identity-1', 'ws-1', prisma);
    expect(result.items[0].category).toBe('QUESTION');
    expect(result.items[0].state).toBe('OFFICE_PROCESSING');
    expect(result.items[0].canRespond).toBe(false);
    expect(result.items[0].canUpload).toBe(false);
    expect(result.items[0].contextLabel).toBe('Adatkezelési követelmények');
  });

  it('reports truthful counts across categories and states', async () => {
    const prisma = makePrisma(
      [{ caseId: 'caseA' }],
      [
        makeRow({ id: 'r1', type: 'DOCUMENT_UPLOAD', status: 'PUBLISHED' }),
        makeRow({ id: 'r2', type: 'INFORMATION_REQUEST', status: 'PUBLISHED', finding: null }),
        makeRow({ id: 'r3', type: 'QUESTION_RESPONSE', status: 'UNDER_INTERNAL_REVIEW', finding: null }),
        makeRow({ id: 'r4', type: 'MISSING_DOCUMENT_REQUEST', status: 'COMPLETED' }),
      ],
    );
    const result = await getCompanyClientRequestProjection('clientX', 'identity-1', 'ws-1', prisma);
    expect(result.counts).toEqual({ awaitingCustomer: 2, officeProcessing: 1, closed: 1, requestedDocuments: 2, openQuestions: 2 });
  });
});
