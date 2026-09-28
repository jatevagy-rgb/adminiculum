/**
 * Portal Teendők entry-point projection (focused).
 *
 * The portal workspace projects every canonical actionable ClientRequest type
 * into the customer-facing Teendők request rows. These tests pin the kinds,
 * the terminal-status exclusion, and the customer-safe field set of the entry
 * row. No database is required — the projection is exercised directly.
 */
jest.mock('../src/prisma/prisma.service', () => ({ prisma: {} }));

import { toCustomerRequestEntryRow } from '../src/routes/clientPortal';

const base = {
  id: 'req-1',
  matterId: 'pub-1',
  matterTitle: 'Közzétett ügy',
  type: 'INFORMATION_REQUEST',
  title: 'Adja meg az érintett szervezeteket',
  description: 'Kérjük, sorolja fel a hatókörbe tartozó szervezeteket.',
  status: 'Teendő',
  rawStatus: 'PUBLISHED',
  publishedAt: '2026-09-20T08:00:00.000Z',
  dueAt: '2026-09-30T08:00:00.000Z',
  actionUrl: '/portal/matters/pub-1',
};

describe('portal Teendők request entry projection', () => {
  it('projects every canonical actionable request type', () => {
    const kinds: Record<string, string> = {
      DOCUMENT_UPLOAD: 'DOCUMENT_REQUEST',
      MISSING_DOCUMENT_REQUEST: 'DOCUMENT_REQUEST',
      CORRECTION_REQUEST: 'CORRECTION_REQUEST',
      INFORMATION_REQUEST: 'INFORMATION_REQUEST',
      DATA_FORM: 'DATA_FORM',
      QUESTION_RESPONSE: 'QUESTION_RESPONSE',
    };
    for (const [type, kind] of Object.entries(kinds)) {
      const row = toCustomerRequestEntryRow({ ...base, type });
      expect(row).not.toBeNull();
      expect(row!.kind).toBe(kind);
      expect(row!.id).toBe('req-1');
      expect(row!.matterId).toBe('pub-1');
    }
  });

  it('keeps the existing document-request row shape', () => {
    const row = toCustomerRequestEntryRow({ ...base, type: 'DOCUMENT_UPLOAD' });
    expect(row).toEqual({
      id: 'req-1',
      matterId: 'pub-1',
      matterTitle: 'Közzétett ügy',
      title: 'Adja meg az érintett szervezeteket',
      description: 'Kérjük, sorolja fel a hatókörbe tartozó szervezeteket.',
      status: 'Teendő',
      publishedAt: '2026-09-20T08:00:00.000Z',
      dueAt: '2026-09-30T08:00:00.000Z',
      kind: 'DOCUMENT_REQUEST',
      actionUrl: '/portal/matters/pub-1',
    });
  });

  it('excludes terminal requests from the entry list', () => {
    for (const rawStatus of ['COMPLETED', 'CANCELLED', 'EXPIRED']) {
      expect(toCustomerRequestEntryRow({ ...base, rawStatus })).toBeNull();
    }
  });

  it('keeps every in-flight customer-visible status actionable', () => {
    for (const rawStatus of ['PUBLISHED', 'PARTIALLY_SUBMITTED', 'SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED']) {
      expect(toCustomerRequestEntryRow({ ...base, rawStatus })).not.toBeNull();
    }
  });

  it('ignores request types that are not canonical entry points', () => {
    expect(toCustomerRequestEntryRow({ ...base, type: 'UNKNOWN_REQUEST_TYPE' })).toBeNull();
    expect(toCustomerRequestEntryRow({ ...base, type: undefined })).toBeNull();
  });

  it('emits only the customer-safe entry fields', () => {
    const row = toCustomerRequestEntryRow({
      ...base,
      caseId: 'case-internal-id',
      documentSpec: { internalReviewRequired: true, acceptedMimeTypes: ['application/pdf'] },
      fields: [{ id: 'field-1', clientSafeLabel: 'Belső' }],
      assignedInternalUserId: 'user-internal-1',
      createdById: 'user-internal-1',
      audienceSnapshot: { internal: true },
      reviewerNotes: 'internal note',
      requirementVersionId: 'requirement-version-1',
    });
    expect(row).not.toBeNull();
    expect(Object.keys(row!).sort()).toEqual([
      'actionUrl',
      'description',
      'dueAt',
      'id',
      'kind',
      'matterId',
      'matterTitle',
      'publishedAt',
      'status',
      'title',
    ]);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/case-internal-id|internalReviewRequired|assignedInternalUserId|audienceSnapshot|reviewerNotes|requirement-version-1|user-internal-1/);
    expect(serialized).not.toContain('rawStatus');
  });

  it('reports a null due date without fabricating one', () => {
    const row = toCustomerRequestEntryRow({ ...base, dueAt: null, publishedAt: null });
    expect(row!.dueAt).toBeNull();
    expect(row!.publishedAt).toBeNull();
  });
});
