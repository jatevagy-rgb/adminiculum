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

const deleteSharePointDocument = jest.fn();

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: mockPrisma,
}));

jest.mock('../src/modules/sharepoint', () => ({
  driveService: {
    deleteDocument: deleteSharePointDocument,
  },
}));

import documentsService, { DocumentDeleteError } from '../src/modules/documents/services';

const baseDocument = {
  id: 'doc-1',
  caseId: 'case-1',
  documentType: 'CLIENT_INPUT',
  category: 'CLIENT_INPUT',
  folder: 'CLIENT_INPUT',
  spItemId: null,
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
    deleteSharePointDocument.mockResolvedValue(true);
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
    expect(deleteSharePointDocument).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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

  it('deletes SharePoint storage first using only the server-resolved item id', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({ ...baseDocument, spItemId: 'server-sp-item-1' });

    await documentsService.deleteDocument('doc-1', 'user-1');

    expect(deleteSharePointDocument).toHaveBeenCalledWith('server-sp-item-1');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('blocks prohibited dependencies before storage or DB mutation', async () => {
    mockPrisma.anonymousDocument.count.mockResolvedValueOnce(1);

    await expect(documentsService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_DELETE_CONFLICT',
      reason: 'ANONYMIZED_DOCUMENT_EXISTS',
    } satisfies Partial<DocumentDeleteError>);

    expect(deleteSharePointDocument).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not modify DB when SharePoint deletion fails', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce({ ...baseDocument, spItemId: 'server-sp-item-1' });
    deleteSharePointDocument.mockResolvedValueOnce(false);

    await expect(documentsService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 502,
      code: 'DOCUMENT_STORAGE_DELETE_FAILED',
      reason: 'STORAGE_DELETE_FAILED',
    } satisfies Partial<DocumentDeleteError>);

    expect(deleteSharePointDocument).toHaveBeenCalledWith('server-sp-item-1');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
