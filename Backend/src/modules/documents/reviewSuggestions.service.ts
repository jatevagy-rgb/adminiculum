import {
  DocumentReviewSuggestionStatus,
  DocumentReviewSuggestionType,
  DocumentReviewWorkspaceSource,
} from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

const MAX_SELECTED_TEXT_PREVIEW_LENGTH = 500;
const MAX_REPLACEMENT_TEXT_LENGTH = 10000;
const MAX_HELPER_TEXT_LENGTH = 1000;

export class DocumentReviewSuggestionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export type ListDocumentReviewSuggestionsFilters = {
  workspaceSource?: string;
  status?: string;
};

export type CreateDocumentReviewSuggestionInput = {
  workspaceSource?: string;
  type?: string;
  selectedTextPreview?: string;
  rangeFrom?: unknown;
  rangeTo?: unknown;
  replacementText?: string;
  documentTextHash?: string;
  anchorMetadata?: unknown;
  helperText?: string;
  documentVersionId?: string;
  authorId?: string | null;
};

const parseWorkspaceSource = (value: unknown): DocumentReviewWorkspaceSource | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'CONTRACT_WORKSPACE') return DocumentReviewWorkspaceSource.CONTRACT_WORKSPACE;
  if (normalized === 'LITIGATION_WORKSPACE') return DocumentReviewWorkspaceSource.LITIGATION_WORKSPACE;
  return null;
};

const parseSuggestionType = (value: unknown): DocumentReviewSuggestionType | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'COMMENT') return DocumentReviewSuggestionType.COMMENT;
  if (normalized === 'REPLACEMENT') return DocumentReviewSuggestionType.REPLACEMENT;
  if (normalized === 'DELETION') return DocumentReviewSuggestionType.DELETION;
  return null;
};

const parseSuggestionStatus = (value: unknown): DocumentReviewSuggestionStatus | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PENDING') return DocumentReviewSuggestionStatus.PENDING;
  if (normalized === 'ACCEPTED') return DocumentReviewSuggestionStatus.ACCEPTED;
  if (normalized === 'REJECTED') return DocumentReviewSuggestionStatus.REJECTED;
  return null;
};

const parseOptionalRange = (value: unknown, fieldName: string): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_RANGE', `${fieldName} must be a non-negative integer`);
  }
  return value;
};

const truncate = (value: string | undefined, maxLength: number): string | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const getDocumentOrThrow = async (documentId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true },
  });

  if (!document) {
    throw new DocumentReviewSuggestionError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  return document;
};

export async function listDocumentReviewSuggestions(
  documentId: string,
  filters: ListDocumentReviewSuggestionsFilters = {}
) {
  await getDocumentOrThrow(documentId);

  const workspaceSource = filters.workspaceSource ? parseWorkspaceSource(filters.workspaceSource) : null;
  const status = filters.status ? parseSuggestionStatus(filters.status) : null;

  if (filters.workspaceSource && !workspaceSource) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_WORKSPACE_SOURCE', 'Invalid workspaceSource');
  }
  if (filters.status && !status) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_STATUS', 'Invalid status');
  }

  return prisma.documentReviewSuggestion.findMany({
    where: {
      documentId,
      ...(workspaceSource ? { workspaceSource } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createDocumentReviewSuggestion(
  documentId: string,
  input: CreateDocumentReviewSuggestionInput
) {
  const document = await getDocumentOrThrow(documentId);
  const workspaceSource = parseWorkspaceSource(input.workspaceSource);
  const type = parseSuggestionType(input.type);
  const selectedTextPreview = truncate(input.selectedTextPreview, MAX_SELECTED_TEXT_PREVIEW_LENGTH);
  const rangeFrom = parseOptionalRange(input.rangeFrom, 'rangeFrom');
  const rangeTo = parseOptionalRange(input.rangeTo, 'rangeTo');
  const replacementText = truncate(input.replacementText, MAX_REPLACEMENT_TEXT_LENGTH);

  if (!workspaceSource) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_WORKSPACE_SOURCE', 'Invalid workspaceSource');
  }
  if (!type) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_TYPE', 'Invalid suggestion type');
  }
  if (!selectedTextPreview) {
    throw new DocumentReviewSuggestionError(400, 'SELECTED_TEXT_REQUIRED', 'selectedTextPreview is required');
  }
  if (rangeFrom !== null && rangeTo !== null && rangeTo <= rangeFrom) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_RANGE', 'rangeTo must be greater than rangeFrom');
  }
  if (type === DocumentReviewSuggestionType.REPLACEMENT && !replacementText) {
    throw new DocumentReviewSuggestionError(400, 'REPLACEMENT_TEXT_REQUIRED', 'replacementText is required for replacement suggestions');
  }

  return prisma.documentReviewSuggestion.create({
    data: {
      caseId: document.caseId,
      documentId: document.id,
      documentVersionId: input.documentVersionId || null,
      workspaceSource,
      type,
      status: DocumentReviewSuggestionStatus.PENDING,
      selectedTextPreview,
      rangeFrom,
      rangeTo,
      replacementText: type === DocumentReviewSuggestionType.REPLACEMENT ? replacementText : null,
      documentTextHash: truncate(input.documentTextHash, 256),
      anchorMetadata: input.anchorMetadata === undefined ? undefined : (input.anchorMetadata as any),
      helperText: truncate(input.helperText, MAX_HELPER_TEXT_LENGTH),
      authorId: input.authorId || null,
    },
  });
}

export async function updateDocumentReviewSuggestionStatus(
  documentId: string,
  suggestionId: string,
  statusInput: unknown
) {
  await getDocumentOrThrow(documentId);
  const status = parseSuggestionStatus(statusInput);

  if (status !== DocumentReviewSuggestionStatus.ACCEPTED && status !== DocumentReviewSuggestionStatus.REJECTED) {
    throw new DocumentReviewSuggestionError(400, 'INVALID_STATUS', 'Status can only be updated to ACCEPTED or REJECTED');
  }

  const suggestion = await prisma.documentReviewSuggestion.findFirst({
    where: { id: suggestionId, documentId },
  });

  if (!suggestion) {
    throw new DocumentReviewSuggestionError(404, 'SUGGESTION_NOT_FOUND', 'Review suggestion not found');
  }

  if (suggestion.status !== DocumentReviewSuggestionStatus.PENDING) {
    throw new DocumentReviewSuggestionError(409, 'SUGGESTION_ALREADY_RESOLVED', 'Only pending suggestions can be resolved');
  }

  return prisma.documentReviewSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status,
      resolvedAt: new Date(),
    },
  });
}
