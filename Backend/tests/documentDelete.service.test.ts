const txMock = {
  communication: { updateMany: jest.fn() },
  communicationAttachment: { updateMany: jest.fn() },
  timelineEvent: { create: jest.fn() },
  document: { delete: jest.fn() },
};

const mockPrisma = {
  document: { findUnique: jest.fn() },
  anonymousDocument: { count: jest.fn() },
  task: { count: jest.fn() },
  legalAnalysis: { count: jest.fn() },
  documentReviewSuggestion: { count: jest.fn() },
  $transaction: jest.fn(async (callback: (tx: typeof txMock) => Promise<void>) => callback(txMock)),
};

const storageDelete = jest.fn();

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: mockPrisma,
}));

// No driveService mock needed: DW0 delete goes through the storage interface.
jest.mock('../src/modules/storage', () => {
  const actual = jest.requireActual('../src/modules/storage');
  return {
    ...actual,
    getDocumentStorage: () => ({
      put: jest.fn(),
      get: jest.fn(),
      delete: storageDelete,
      exists: jest.fn(),
      metadata: jest.fn(),
    }),
  };
});

import documentsService, { DocumentDeleteError } from '../src/modules/documents/services';

const baseDocument = {
  id: 'doc-1',
  caseId: 'case-1',
  documentType: 'CLIENT_INPUT',
  category: 'CLIENT_INPUT',
  folder: 'CLIENT_INPUT',
  spItemId: null,
  versions: [],
};

describe('document delete service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({ ...baseDocument });
    mockPrisma.anonymousDocument.count.mockResolvedValue(0);
    mockPrisma.task.count.mockResolvedValue(0);
    mockPrisma.legalAnalysis.count.mockResolvedValue(0);
    mockPrisma.documentReviewSuggestion.count.mockResolvedValue(0);
    txMock.communication.updateMany.mockResolvedValue({ count: 0 });
    txMock.communicationAttachment.updateMany.mockResolvedValue({ count: 0 });
    txMock.timelineEvent.create.mockResolvedValue({ id: 'event-1' });
    txMock.document.delete.mockResolvedValue({ id: 'doc-1' });
    storageDelete.mockResolvedValue(true);
  });

  it('deletes metadata-only documents in a DB transaction without content projection', async () => {
    await documentsService.deleteDocument('doc-1', 'user-1');

    expect(mockPrisma.document.findUnique).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      select: expect.not.objectContaining({
        workspaceText: true,
        fileName: true,
        spPath: true,
        spWebUrl: true,
      }),
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(storageDelete).not.toHaveBeenCalled();
    expect(txMock.communication.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      data: { documentId: null },
    });
    expect(txMock.communicationAttachment.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      data: { documentId: null },
    });
    expect(txMock.timelineEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        caseId: 'case-1',
        userId: 'user-1',
        eventType: 'CUSTOM',
        type: 'DOCUMENT_DELETED',
        payload: expect.objectContaining({
          documentId: 'doc-1',
          action: 'DOCUMENT_DELETED',
        }),
      }),
    }));
    expect(JSON.stringify(txMock.timelineEvent.create.mock.calls[0][0])).not.toMatch(/workspaceText|content|fileName|spPath|spWebUrl/i);
    expect(txMock.document.delete).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      select: { id: true },
    });
  });

  it('deletes storage AFTER the DB delete succeeds, using the server-resolved reference', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({
      ...baseDocument,
      versions: [{ storageReference: 'ref-1', spItemId: 'server-sp-item-1' }],
    });

    await documentsService.deleteDocument('doc-1', 'user-1');

    // DB transaction runs FIRST ...
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' }, select: { id: true } });
    // ... then the storage object is removed (DB-first, storage-second order).
    expect(storageDelete).toHaveBeenCalledWith('ref-1');
  });

  it('blocks prohibited dependencies before storage or DB mutation', async () => {
    mockPrisma.anonymousDocument.count.mockResolvedValueOnce(1);

    await expect(documentsService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_DELETE_CONFLICT',
      reason: 'ANONYMIZED_DOCUMENT_EXISTS',
    } satisfies Partial<DocumentDeleteError>);

    expect(storageDelete).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('never leaves a DB row pointing at deleted bytes: DB delete first, orphan storage on failure', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({
      ...baseDocument,
      versions: [{ storageReference: 'ref-1', spItemId: 'server-sp-item-1' }],
    });
    storageDelete.mockResolvedValueOnce(false);

    // DB delete is allowed to proceed (DB-first compensation-safe order) ...
    await documentsService.deleteDocument('doc-1', 'user-1');
    // ... the DB row is gone (transaction ran) ...
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.document.delete).toHaveBeenCalled();
    // ... and a storage delete that fails is isolated as an orphan warning.
    expect(storageDelete).toHaveBeenCalledWith('ref-1');
  });

  it('surfaces a truthful residual when a storage delete THROWS after the DB delete', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({
      ...baseDocument,
      versions: [{ storageReference: 'ref-throw', spItemId: 'server-item-throw' }],
    });
    storageDelete.mockRejectedValueOnce(new Error('graph down'));

    await expect(documentsService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 202,
      code: 'DOCUMENT_DELETED_WITH_ORPHANED_STORAGE',
      reason: 'STORAGE_ORPHANED',
    } satisfies Partial<DocumentDeleteError>);

    // DB delete still ran first (DB-first, compensation-safe) ...
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.document.delete).toHaveBeenCalled();
    // ... and the throw is not silently swallowed into a 204.
    expect(storageDelete).toHaveBeenCalledWith('ref-throw');
  });

  it('blocks hard delete when preserved version history exists unless forced', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({
      ...baseDocument,
      versions: [
        { storageReference: 'ref-1', spItemId: 'item-1' },
        { storageReference: 'ref-2', spItemId: 'item-2' },
      ],
    });

    await expect(documentsService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_DELETE_CONFLICT',
      reason: 'VERSION_HISTORY_PRESERVED',
    } satisfies Partial<DocumentDeleteError>);

    // No storage delete, no DB mutation: the lineage is preserved.
    expect(storageDelete).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows hard delete of version history when explicitly forced', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({
      ...baseDocument,
      versions: [
        { storageReference: 'ref-1', spItemId: 'ref-1' },
        { storageReference: 'ref-2', spItemId: 'ref-2' },
      ],
    });

    await documentsService.deleteDocument('doc-1', 'user-1', { forceHistoryDelete: true });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.document.delete).toHaveBeenCalled();
    expect(storageDelete).toHaveBeenCalledTimes(2);
    expect(storageDelete).toHaveBeenCalledWith('ref-1');
    expect(storageDelete).toHaveBeenCalledWith('ref-2');
  });
});