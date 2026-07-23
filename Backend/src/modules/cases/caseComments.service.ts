/**
 * Case-level comment service (CASE-WORKSPACE-INLINE-ACTIONS-1).
 *
 * Uses the polymorphic Comment model (caseId set, documentId null) — the domain
 * model for internal notes attached to a case. This is deliberately NOT stored as
 * a Communication: a Comment is an internal working note, not client/external
 * correspondence. Author is always derived from auth; caseId is set server-side.
 */
import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanManageCase, userCanReadCase } from './authorization';
import { validateCommentCreate } from '../documents/documentComments.service';

const CASE_COMMENT_DEFAULT_LIMIT = 25;
const CASE_COMMENT_MAX_LIMIT = 50;

type CommentAuthor = { id: string; name: string | null };
type CommentRecord = {
  id: string;
  caseId: string | null;
  documentId: string | null;
  userId: string;
  content: string;
  isResolved: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  user: CommentAuthor;
};

export type CaseCommentDto = {
  id: string;
  caseId: string;
  author: { id: string; displayName: string };
  content: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  updatedAt: string | null;
  capabilities: { canResolve: boolean; canReopen: boolean; canDelete: false };
};

export class CaseCommentError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'CaseCommentError';
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function currentUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new CaseCommentError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }
  return userId;
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? CASE_COMMENT_DEFAULT_LIMIT);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > CASE_COMMENT_MAX_LIMIT) {
    throw new CaseCommentError(400, 'INVALID_COMMENT_LIMIT', `limit must be between 1 and ${CASE_COMMENT_MAX_LIMIT}.`);
  }
  return parsed;
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5000) {
    throw new CaseCommentError(400, 'INVALID_COMMENT_OFFSET', 'offset must be a non-negative integer.');
  }
  return parsed;
}

const COMMENT_SELECT = {
  id: true,
  caseId: true,
  documentId: true,
  userId: true,
  content: true,
  isResolved: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
} as const;

function deriveCapabilities(params: {
  actorId: string;
  isCaseManager: boolean;
  comment: Pick<CommentRecord, 'userId' | 'isResolved'>;
}): CaseCommentDto['capabilities'] {
  const canAct = params.isCaseManager || params.comment.userId === params.actorId;
  return {
    canResolve: canAct && !params.comment.isResolved,
    canReopen: canAct && params.comment.isResolved,
    canDelete: false,
  };
}

function mapCaseComment(comment: CommentRecord, actorId: string, isCaseManager: boolean): CaseCommentDto {
  if (!comment.caseId) {
    throw new CaseCommentError(500, 'COMMENT_CASE_RELATION_MISSING', 'Comment is not linked to a case.');
  }
  return {
    id: comment.id,
    caseId: comment.caseId,
    author: { id: comment.user.id, displayName: comment.user.name || 'Ismeretlen felhasználó' },
    content: comment.content,
    status: comment.isResolved ? 'RESOLVED' : 'OPEN',
    createdAt: toIso(comment.createdAt) || '',
    updatedAt: toIso(comment.updatedAt),
    capabilities: deriveCapabilities({ actorId, isCaseManager, comment }),
  };
}

/** Authorize case read; returns actor + manager flag, or throws 404/403. */
async function requireCaseAccess(req: Request, caseId: string): Promise<{ actorId: string; isCaseManager: boolean }> {
  const actorId = currentUserId(req);
  const read = await userCanReadCase(req, caseId);
  if (read === null) {
    throw new CaseCommentError(404, 'CASE_NOT_FOUND', 'Case not found.');
  }
  if (!read) {
    throw new CaseCommentError(403, 'CASE_ACCESS_FORBIDDEN', 'You do not have access to this case.');
  }
  const manage = await userCanManageCase(req, caseId);
  return { actorId, isCaseManager: Boolean(manage) };
}

async function findCaseComment(commentId: string, caseId: string): Promise<CommentRecord | null> {
  return prisma.comment.findFirst({
    where: { id: commentId, caseId, documentId: null },
    select: COMMENT_SELECT,
  });
}

export async function listCaseComments(req: Request, caseId: string, query: { limit?: unknown; offset?: unknown }) {
  const access = await requireCaseAccess(req, caseId);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  // Only case-level notes (documentId null); document comments are surfaced on the document.
  const comments = await prisma.comment.findMany({
    where: { caseId, documentId: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: offset,
    take: limit,
    select: COMMENT_SELECT,
  });
  return {
    comments: comments.map((comment) => mapCaseComment(comment, access.actorId, access.isCaseManager)),
    pagination: { limit, offset },
  };
}

export async function createCaseComment(req: Request, caseId: string, body: unknown): Promise<CaseCommentDto> {
  const access = await requireCaseAccess(req, caseId);
  const content = validateCommentCreate(body);
  const comment = await prisma.comment.create({
    data: { caseId, documentId: null, userId: access.actorId, content },
    select: COMMENT_SELECT,
  });
  return mapCaseComment(comment, access.actorId, access.isCaseManager);
}

async function transitionCaseComment(req: Request, caseId: string, commentId: string, nextResolved: boolean): Promise<CaseCommentDto> {
  const access = await requireCaseAccess(req, caseId);
  const existing = await findCaseComment(commentId, caseId);
  if (!existing) {
    throw new CaseCommentError(404, 'COMMENT_NOT_FOUND', 'Comment not found.');
  }
  const capabilities = deriveCapabilities({ actorId: access.actorId, isCaseManager: access.isCaseManager, comment: existing });
  if (nextResolved && !capabilities.canResolve) {
    throw new CaseCommentError(existing.isResolved ? 409 : 403, existing.isResolved ? 'COMMENT_ALREADY_RESOLVED' : 'COMMENT_ACTION_FORBIDDEN', existing.isResolved ? 'Comment is already resolved.' : 'You cannot resolve this comment.');
  }
  if (!nextResolved && !capabilities.canReopen) {
    throw new CaseCommentError(!existing.isResolved ? 409 : 403, !existing.isResolved ? 'COMMENT_ALREADY_OPEN' : 'COMMENT_ACTION_FORBIDDEN', !existing.isResolved ? 'Comment is already open.' : 'You cannot reopen this comment.');
  }
  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { isResolved: nextResolved },
    select: COMMENT_SELECT,
  });
  return mapCaseComment(updated, access.actorId, access.isCaseManager);
}

export async function resolveCaseComment(req: Request, caseId: string, commentId: string): Promise<CaseCommentDto> {
  return transitionCaseComment(req, caseId, commentId, true);
}

export async function reopenCaseComment(req: Request, caseId: string, commentId: string): Promise<CaseCommentDto> {
  return transitionCaseComment(req, caseId, commentId, false);
}

export function sendCaseCommentError(res: import('express').Response, error: unknown): void {
  // Handles CaseCommentError and the reused DocumentCommentError (from
  // validateCommentCreate) — both carry a numeric statusCode + string code.
  const e = error as { statusCode?: unknown; code?: unknown; message?: unknown };
  if (e && typeof e.statusCode === 'number' && typeof e.code === 'string') {
    res.status(e.statusCode).json({ status: e.statusCode, code: e.code, message: typeof e.message === 'string' ? e.message : 'Request failed' });
    return;
  }
  console.error('Case comment error:', error);
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}
