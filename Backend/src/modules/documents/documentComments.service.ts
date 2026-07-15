import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanManageCase, userCanReadCase } from '../cases/authorization';

export const DOCUMENT_COMMENT_MAX_LENGTH = 2000;
const DOCUMENT_COMMENT_DEFAULT_LIMIT = 25;
const DOCUMENT_COMMENT_MAX_LIMIT = 50;

type CommentAuthor = {
  id: string;
  name: string | null;
};

type CommentRecord = {
  id: string;
  documentId: string | null;
  caseId: string | null;
  userId: string;
  content: string;
  isResolved: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  user: CommentAuthor;
};

export type DocumentCommentDto = {
  id: string;
  documentId: string;
  author: {
    id: string;
    displayName: string;
  };
  content: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: null;
  capabilities: {
    canResolve: boolean;
    canReopen: boolean;
    canDelete: false;
  };
};

export class DocumentCommentError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'DocumentCommentError';
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function currentUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new DocumentCommentError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }
  return userId;
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? DOCUMENT_COMMENT_DEFAULT_LIMIT);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > DOCUMENT_COMMENT_MAX_LIMIT) {
    throw new DocumentCommentError(400, 'INVALID_COMMENT_LIMIT', `limit must be between 1 and ${DOCUMENT_COMMENT_MAX_LIMIT}.`);
  }
  return parsed;
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5000) {
    throw new DocumentCommentError(400, 'INVALID_COMMENT_OFFSET', 'offset must be a non-negative integer.');
  }
  return parsed;
}

export function validateCommentCreate(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DocumentCommentError(400, 'INVALID_COMMENT_BODY', 'Comment body must be an object.');
  }
  const record = body as Record<string, unknown>;
  for (const forbidden of ['authorId', 'userId', 'documentId', 'caseId', 'status', 'isResolved', 'resolvedAt', 'selectedText', 'editorJson', 'anchor', 'range']) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) {
      throw new DocumentCommentError(400, 'COMMENT_FIELD_NOT_ACCEPTED', `Field ${forbidden} is not accepted.`);
    }
  }
  if (typeof record.content !== 'string') {
    throw new DocumentCommentError(400, 'COMMENT_CONTENT_REQUIRED', 'content must be plain text.');
  }

  const normalized = record.content
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    throw new DocumentCommentError(400, 'COMMENT_CONTENT_REQUIRED', 'content must not be empty.');
  }
  if (normalized.length > DOCUMENT_COMMENT_MAX_LENGTH) {
    throw new DocumentCommentError(400, 'COMMENT_CONTENT_TOO_LONG', `content must be ${DOCUMENT_COMMENT_MAX_LENGTH} characters or fewer.`);
  }
  if (/<\/?[a-z][\s\S]*>/i.test(normalized) || /on[a-z]+\s*=/i.test(normalized) || /javascript:/i.test(normalized)) {
    throw new DocumentCommentError(400, 'COMMENT_HTML_NOT_ACCEPTED', 'Comment content must be plain text.');
  }
  if (/data:[a-z0-9/+.-]+;base64,/i.test(normalized)) {
    throw new DocumentCommentError(400, 'COMMENT_EMBEDDED_DATA_NOT_ACCEPTED', 'Embedded data is not accepted in comments.');
  }
  if (/https?:\/\/\S{300,}/i.test(normalized)) {
    throw new DocumentCommentError(400, 'COMMENT_URL_TOO_LONG', 'Very long URLs are not accepted in comments.');
  }
  return normalized;
}

export function deriveDocumentCommentCapabilities(params: {
  actorId: string;
  isCaseManager: boolean;
  comment: Pick<CommentRecord, 'userId' | 'isResolved'>;
}): DocumentCommentDto['capabilities'] {
  const canAct = params.isCaseManager || params.comment.userId === params.actorId;
  return {
    canResolve: canAct && !params.comment.isResolved,
    canReopen: canAct && params.comment.isResolved,
    canDelete: false,
  };
}

function mapDocumentComment(comment: CommentRecord, actorId: string, isCaseManager: boolean): DocumentCommentDto {
  if (!comment.documentId) {
    throw new DocumentCommentError(500, 'COMMENT_DOCUMENT_RELATION_MISSING', 'Comment is not linked to a document.');
  }
  return {
    id: comment.id,
    documentId: comment.documentId,
    author: {
      id: comment.user.id,
      displayName: comment.user.name || 'Ismeretlen felhasználó',
    },
    content: comment.content,
    status: comment.isResolved ? 'RESOLVED' : 'OPEN',
    createdAt: toIso(comment.createdAt) || '',
    updatedAt: toIso(comment.updatedAt),
    resolvedAt: null,
    capabilities: deriveDocumentCommentCapabilities({ actorId, isCaseManager, comment }),
  };
}

async function resolveDocumentCaseId(documentId: string): Promise<string | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true },
  });
  return document?.caseId || null;
}

async function requireDocumentRead(req: Request, documentId: string): Promise<{ actorId: string; caseId: string; isCaseManager: boolean }> {
  const actorId = currentUserId(req);
  const caseId = await resolveDocumentCaseId(documentId);
  if (!caseId) {
    throw new DocumentCommentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  }
  const read = await userCanReadCase(req, caseId);
  if (read === null) {
    throw new DocumentCommentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  }
  if (!read) {
    throw new DocumentCommentError(403, 'DOCUMENT_ACCESS_FORBIDDEN', 'You do not have access to this document.');
  }
  const manage = await userCanManageCase(req, caseId);
  return { actorId, caseId, isCaseManager: Boolean(manage) };
}

async function findDocumentComment(commentId: string, documentId: string): Promise<CommentRecord | null> {
  return prisma.comment.findFirst({
    where: { id: commentId, documentId },
    select: {
      id: true,
      documentId: true,
      caseId: true,
      userId: true,
      content: true,
      isResolved: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function listDocumentComments(req: Request, documentId: string, query: { limit?: unknown; offset?: unknown }) {
  const access = await requireDocumentRead(req, documentId);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const comments = await prisma.comment.findMany({
    where: { documentId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: offset,
    take: limit,
    select: {
      id: true,
      documentId: true,
      caseId: true,
      userId: true,
      content: true,
      isResolved: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return {
    comments: comments.map((comment) => mapDocumentComment(comment, access.actorId, access.isCaseManager)),
    pagination: { limit, offset },
    availability: { anchoredComments: false, delete: false },
  };
}

export async function createDocumentComment(req: Request, documentId: string, body: unknown): Promise<DocumentCommentDto> {
  const access = await requireDocumentRead(req, documentId);
  const content = validateCommentCreate(body);
  const comment = await prisma.comment.create({
    data: {
      documentId,
      caseId: access.caseId,
      userId: access.actorId,
      content,
    },
    select: {
      id: true,
      documentId: true,
      caseId: true,
      userId: true,
      content: true,
      isResolved: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  return mapDocumentComment(comment, access.actorId, access.isCaseManager);
}

async function transitionDocumentComment(req: Request, documentId: string, commentId: string, nextResolved: boolean): Promise<DocumentCommentDto> {
  const access = await requireDocumentRead(req, documentId);
  const existing = await findDocumentComment(commentId, documentId);
  if (!existing) {
    throw new DocumentCommentError(404, 'COMMENT_NOT_FOUND', 'Comment not found.');
  }
  const capabilities = deriveDocumentCommentCapabilities({ actorId: access.actorId, isCaseManager: access.isCaseManager, comment: existing });
  if (nextResolved && !capabilities.canResolve) {
    throw new DocumentCommentError(existing.isResolved ? 409 : 403, existing.isResolved ? 'COMMENT_ALREADY_RESOLVED' : 'COMMENT_ACTION_FORBIDDEN', existing.isResolved ? 'Comment is already resolved.' : 'You cannot resolve this comment.');
  }
  if (!nextResolved && !capabilities.canReopen) {
    throw new DocumentCommentError(!existing.isResolved ? 409 : 403, !existing.isResolved ? 'COMMENT_ALREADY_OPEN' : 'COMMENT_ACTION_FORBIDDEN', !existing.isResolved ? 'Comment is already open.' : 'You cannot reopen this comment.');
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { isResolved: nextResolved },
    select: {
      id: true,
      documentId: true,
      caseId: true,
      userId: true,
      content: true,
      isResolved: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  return mapDocumentComment(updated, access.actorId, access.isCaseManager);
}

export async function resolveDocumentComment(req: Request, documentId: string, commentId: string): Promise<DocumentCommentDto> {
  return transitionDocumentComment(req, documentId, commentId, true);
}

export async function reopenDocumentComment(req: Request, documentId: string, commentId: string): Promise<DocumentCommentDto> {
  return transitionDocumentComment(req, documentId, commentId, false);
}
