const mockUploadDocument = jest.fn();
const mockDeleteDocument = jest.fn();

const mockPrisma = {
  case: { findUnique: jest.fn(), update: jest.fn() },
  document: { create: jest.fn() },
  timelineEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: mockPrisma }));

jest.mock('../src/modules/sharepoint', () => ({
  driveService: {
    uploadDocument: mockUploadDocument,
    deleteDocument: mockDeleteDocument,
  },
}));

import documentsService, { DocumentStorageUploadError } from '../src/modules/documents/services';

const input = {
  caseId: 'case-1',
  fileName: 'clean.pdf',
  fileContent: Buffer.from('%PDF-1.4\nclean'),
  mimeType: 'application/pdf',
  documentType: 'OTHER' as const,
  folder: 'Internal' as const,
  createdById: 'user-1',
};

describe('canonical document upload persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', caseNumber: 'CASE-1', clientId: 'client-1' });
    mockPrisma.case.update.mockResolvedValue({ id: 'case-1', status: 'DRAFT' });
    mockUploadDocument.mockResolvedValue({
      success: true,
      item: { id: 'sp-item-1', name: 'clean.v1.uuid.pdf' },
      version: '1.0',
      webUrl: 'https://sharepoint.example/items/sp-item-1',
    });
    mockDeleteDocument.mockResolvedValue(true);
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma));
    mockPrisma.document.create.mockResolvedValue({
      id: 'document-1',
      caseId: 'case-1',
      fileName: 'clean.pdf',
      documentType: 'CLIENT_INPUT',
      spItemId: 'sp-item-1',
      spPath: 'https://sharepoint.example/items/sp-item-1',
      version: '1.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.timelineEvent.create.mockResolvedValue({ id: 'event-1' });
  });

  it('creates one canonical document, initial version, timeline event, and case projection in one transaction', async () => {
    const result = await documentsService.createDocument(input);

    expect(result.id).toBe('document-1');
    expect(mockUploadDocument).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.document.create.mock.calls[0][0].data.versions.create).toMatchObject({
      version: 1,
      originalFileName: 'clean.pdf',
      storageReference: 'sp-item-1',
      spItemId: 'sp-item-1',
      isCurrent: true,
    });
    expect(mockPrisma.timelineEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { status: 'DRAFT' },
    });
  });

  it('removes SharePoint content and persists no document when canonical persistence fails', async () => {
    mockPrisma.document.create.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(documentsService.createDocument(input)).rejects.toThrow('database unavailable');

    expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.timelineEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.case.update).not.toHaveBeenCalled();
    expect(mockDeleteDocument).toHaveBeenCalledWith('sp-item-1');
  });

  it('does not publish a second document with a null storage reference on conflicts', async () => {
    const conflict = Object.assign(new Error('unique conflict'), {
      code: 'P2002',
      meta: { target: ['spItemId'] },
    });
    mockPrisma.document.create.mockRejectedValueOnce(conflict);

    await expect(documentsService.createDocument(input)).rejects.toBe(conflict);

    expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    expect(mockDeleteDocument).toHaveBeenCalledWith('sp-item-1');
  });

  it('fails truthfully when SharePoint does not accept the file', async () => {
    mockUploadDocument.mockResolvedValueOnce({ success: false, error: 'provider failure' });

    await expect(documentsService.createDocument(input)).rejects.toBeInstanceOf(DocumentStorageUploadError);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });
});
