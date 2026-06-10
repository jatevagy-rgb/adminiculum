import {
  DocumentReviewSuggestionStatus,
  DocumentReviewSuggestionType,
  DocumentReviewWorkspaceSource,
} from '@prisma/client';
import {
  createDocumentReviewSuggestion,
  DocumentReviewSuggestionError,
  listDocumentReviewSuggestions,
  updateDocumentReviewSuggestionStatus,
} from '../src/modules/documents/reviewSuggestions.service';
import { prisma } from '../src/prisma/prisma.service';

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    document: {
      findUnique: jest.fn(),
    },
    documentReviewSuggestion: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  document: { findUnique: jest.Mock };
  documentReviewSuggestion: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

const documentRecord = { id: 'document-1', caseId: 'case-1' };

beforeEach(() => {
  jest.useRealTimers();
  mockedPrisma.document.findUnique.mockResolvedValue(documentRecord);
});

describe('document review suggestions service', () => {
  it('creates a comment suggestion', async () => {
    mockedPrisma.documentReviewSuggestion.create.mockImplementation(async ({ data }) => ({ id: 'suggestion-1', ...data }));

    const result = await createDocumentReviewSuggestion('document-1', {
      workspaceSource: 'CONTRACT_WORKSPACE',
      type: 'COMMENT',
      selectedTextPreview: 'Kijelölt szöveg',
      rangeFrom: 2,
      rangeTo: 18,
      authorId: 'user-1',
    });

    expect(result.type).toBe(DocumentReviewSuggestionType.COMMENT);
    expect(result.status).toBe(DocumentReviewSuggestionStatus.PENDING);
    expect(result.caseId).toBe('case-1');
    expect(result.replacementText).toBeNull();
  });

  it('creates a replacement suggestion', async () => {
    mockedPrisma.documentReviewSuggestion.create.mockImplementation(async ({ data }) => ({ id: 'suggestion-2', ...data }));

    const result = await createDocumentReviewSuggestion('document-1', {
      workspaceSource: 'CONTRACT_WORKSPACE',
      type: 'REPLACEMENT',
      selectedTextPreview: 'régi szöveg',
      replacementText: 'új szöveg',
    });

    expect(result.type).toBe(DocumentReviewSuggestionType.REPLACEMENT);
    expect(result.replacementText).toBe('új szöveg');
  });

  it('creates a deletion suggestion', async () => {
    mockedPrisma.documentReviewSuggestion.create.mockImplementation(async ({ data }) => ({ id: 'suggestion-3', ...data }));

    const result = await createDocumentReviewSuggestion('document-1', {
      workspaceSource: 'LITIGATION_WORKSPACE',
      type: 'DELETION',
      selectedTextPreview: 'törlendő szöveg',
    });

    expect(result.type).toBe(DocumentReviewSuggestionType.DELETION);
    expect(result.workspaceSource).toBe(DocumentReviewWorkspaceSource.LITIGATION_WORKSPACE);
  });

  it('lists suggestions by document', async () => {
    mockedPrisma.documentReviewSuggestion.findMany.mockResolvedValue([{ id: 'suggestion-1' }]);

    const result = await listDocumentReviewSuggestions('document-1');

    expect(result).toEqual([{ id: 'suggestion-1' }]);
    expect(mockedPrisma.documentReviewSuggestion.findMany).toHaveBeenCalledWith({
      where: { documentId: 'document-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters suggestions by status and workspaceSource', async () => {
    mockedPrisma.documentReviewSuggestion.findMany.mockResolvedValue([]);

    await listDocumentReviewSuggestions('document-1', {
      status: 'PENDING',
      workspaceSource: 'CONTRACT_WORKSPACE',
    });

    expect(mockedPrisma.documentReviewSuggestion.findMany).toHaveBeenCalledWith({
      where: {
        documentId: 'document-1',
        status: DocumentReviewSuggestionStatus.PENDING,
        workspaceSource: DocumentReviewWorkspaceSource.CONTRACT_WORKSPACE,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('accepts a pending suggestion', async () => {
    mockedPrisma.documentReviewSuggestion.findFirst.mockResolvedValue({
      id: 'suggestion-1',
      documentId: 'document-1',
      status: DocumentReviewSuggestionStatus.PENDING,
    });
    mockedPrisma.documentReviewSuggestion.update.mockImplementation(async ({ data }) => ({ id: 'suggestion-1', ...data }));

    const result = await updateDocumentReviewSuggestionStatus('document-1', 'suggestion-1', 'ACCEPTED');

    expect(result.status).toBe(DocumentReviewSuggestionStatus.ACCEPTED);
    expect(result.resolvedAt).toBeInstanceOf(Date);
  });

  it('rejects a pending suggestion', async () => {
    mockedPrisma.documentReviewSuggestion.findFirst.mockResolvedValue({
      id: 'suggestion-1',
      documentId: 'document-1',
      status: DocumentReviewSuggestionStatus.PENDING,
    });
    mockedPrisma.documentReviewSuggestion.update.mockImplementation(async ({ data }) => ({ id: 'suggestion-1', ...data }));

    const result = await updateDocumentReviewSuggestionStatus('document-1', 'suggestion-1', 'REJECTED');

    expect(result.status).toBe(DocumentReviewSuggestionStatus.REJECTED);
  });

  it('rejects invalid documents', async () => {
    mockedPrisma.document.findUnique.mockResolvedValue(null);

    await expect(listDocumentReviewSuggestions('missing-document')).rejects.toMatchObject({
      status: 404,
      code: 'DOCUMENT_NOT_FOUND',
    } satisfies Partial<DocumentReviewSuggestionError>);
  });

  it('rejects invalid type and status values', async () => {
    await expect(
      createDocumentReviewSuggestion('document-1', {
        workspaceSource: 'CONTRACT_WORKSPACE',
        type: 'UNKNOWN',
        selectedTextPreview: 'szöveg',
      })
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_TYPE' });

    await expect(listDocumentReviewSuggestions('document-1', { status: 'DONE' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_STATUS',
    });
  });

  it('requires replacementText for replacement suggestions', async () => {
    await expect(
      createDocumentReviewSuggestion('document-1', {
        workspaceSource: 'CONTRACT_WORKSPACE',
        type: 'REPLACEMENT',
        selectedTextPreview: 'régi szöveg',
      })
    ).rejects.toMatchObject({ status: 400, code: 'REPLACEMENT_TEXT_REQUIRED' });
  });
});
