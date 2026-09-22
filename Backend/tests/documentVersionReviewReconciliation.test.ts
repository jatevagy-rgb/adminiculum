/**
 * Read-time reconciliation of DocumentVersion.reviewStatus.
 *
 * The canonical review workflow lives on DocumentReview. A version whose review
 * is active must never surface the stored upload-time default NOT_IN_REVIEW, even
 * for rows created before the workflow mirrored its verdict. This locks the
 * version-level truth that the document workspace renders.
 */
const mockPrisma = {
  documentVersion: { findMany: jest.fn(), findFirst: jest.fn() },
  documentReview: { findMany: jest.fn() },
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrisma }));

import documentsService from '../src/modules/documents/services';

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v2',
    documentId: 'doc-1',
    version: 2,
    originalFileName: 'v2.docx',
    name: 'v2.docx',
    mimeType: 'application/docx',
    size: 10,
    storageReference: 'sp-v2',
    previousVersionId: 'v1',
    isCurrent: true,
    reviewStatus: 'NOT_IN_REVIEW',
    publicationStatus: 'INTERNAL_ONLY',
    uploadSource: 'LAWYER_UPLOAD',
    versionType: 'WORKING_COPY',
    securityScanStatus: 'CLEAN',
    createdAt: new Date('2026-09-02'),
    uploadedById: 'user-1',
    uploadedBy: { id: 'user-1', name: 'Ügyvéd' },
    ...overrides,
  };
}

describe('listDocumentVersions reviewStatus reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reconciles a stored NOT_IN_REVIEW version with its active canonical review', async () => {
    mockPrisma.documentVersion.findMany.mockResolvedValue([
      version(),
      version({ id: 'v1', version: 1, isCurrent: false, originalFileName: 'v1.docx', name: 'v1.docx' }),
    ]);
    mockPrisma.documentReview.findMany.mockResolvedValue([
      { status: 'IN_REVIEW', documentVersionId: 'v2', approvedVersionId: null, currentRound: { reviewVersionId: 'v2' } },
    ]);

    const result = await documentsService.listDocumentVersions('doc-1');
    const v2 = result.find((item) => item.id === 'v2');
    const v1 = result.find((item) => item.id === 'v1');
    expect(v2?.reviewStatus).toBe('IN_REVIEW');
    // Untouched version stays truthful: no canonical review, no invented state.
    expect(v1?.reviewStatus).toBe('NOT_IN_REVIEW');
  });

  it('keeps the reviewed version truthful while another version is viewed', async () => {
    mockPrisma.documentVersion.findMany.mockResolvedValue([
      version(),
      version({ id: 'v1', version: 1, isCurrent: false }),
    ]);
    mockPrisma.documentReview.findMany.mockResolvedValue([
      { status: 'CHANGES_REQUESTED', documentVersionId: 'v1', approvedVersionId: null, currentRound: { reviewVersionId: 'v1' } },
    ]);

    const result = await documentsService.listDocumentVersions('doc-1');
    expect(result.find((item) => item.id === 'v1')?.reviewStatus).toBe('CHANGES_REQUESTED');
    expect(result.find((item) => item.id === 'v2')?.reviewStatus).toBe('NOT_IN_REVIEW');
  });

  it('reports the approved version as APPROVED even after the review closed', async () => {
    mockPrisma.documentVersion.findMany.mockResolvedValue([version()]);
    mockPrisma.documentReview.findMany.mockResolvedValue([
      { status: 'CLOSED', documentVersionId: 'v2', approvedVersionId: 'v2', currentRound: { reviewVersionId: 'v2' } },
    ]);

    const result = await documentsService.listDocumentVersions('doc-1');
    expect(result[0].reviewStatus).toBe('APPROVED');
  });

  it('never invents a review state when the document has no reviews', async () => {
    mockPrisma.documentVersion.findMany.mockResolvedValue([version()]);
    mockPrisma.documentReview.findMany.mockResolvedValue([]);

    const result = await documentsService.listDocumentVersions('doc-1');
    expect(result[0].reviewStatus).toBe('NOT_IN_REVIEW');
  });
});
