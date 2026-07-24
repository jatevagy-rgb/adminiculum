/**
 * Document work context (DOCUMENT-WORK-CONTEXT-1).
 *
 * A filename is not a work instruction. This service owns the operational meaning
 * of a LOGICAL document — what it is, what must be done with it, who owns it, who
 * reviews it, when it is due — and the two-way document/task relationship.
 *
 * Separation of concerns that this module deliberately preserves:
 *   document.workStatus              -> logical document work status (here)
 *   documentVersion.reviewStatus     -> review state of ONE version (untouched)
 *   documentVersion.publicationStatus-> publication of ONE version (untouched)
 *
 * Updating work metadata never mutates a version.
 */
import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanReadCase, userCanManageCase } from '../cases/authorization';

export class DocumentWorkContextError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'DocumentWorkContextError';
  }
}

const WORK_STATUSES = [
  'RECEIVED', 'WAITING_FOR_PROCESSING', 'IN_PROGRESS', 'INTERNAL_REVIEW',
  'CHANGES_REQUESTED', 'APPROVED', 'READY_FOR_CLIENT', 'SENT', 'ARCHIVED',
] as const;
export type DocumentWorkStatus = (typeof WORK_STATUSES)[number];
const WORK_STATUS_SET = new Set<string>(WORK_STATUSES);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const MAX_TITLE = 300;
const MAX_INSTRUCTION = 4000;
const MAX_NEXT_STEP = 1000;
const MAX_ROLE = 64;
const MAX_NOTE = 1000;

/** Fields a caller may set through the ordinary work-metadata endpoint. */
const UPDATABLE = new Set([
  'title', 'documentRole', 'workStatus', 'workInstruction',
  'responsibleId', 'reviewerId', 'dueDate', 'workPriority', 'nextStep',
]);

/**
 * Never settable through this endpoint: storage identity, version state and
 * publication are different concerns with their own controlled paths.
 */
const FORBIDDEN = [
  'id', 'caseId', 'clientId', 'fileName', 'mimeType', 'checksum', 'size',
  'spPath', 'spDriveId', 'spItemId', 'spWebUrl', 'spVersionId', 'spParentPath',
  'currentVersion', 'currentVersionInt', 'isLatest', 'version',
  'reviewStatus', 'publicationStatus', 'versions', 'workspaceText',
  'workInstructionUpdatedById', 'workInstructionUpdatedAt', 'sourceCommunicationId',
];

function str(value: unknown, max: number, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new DocumentWorkContextError('INVALID_FIELD', `${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new DocumentWorkContextError('FIELD_TOO_LONG', `${field} is too long.`);
  return trimmed;
}

function currentUserId(req: Request): string {
  const id = req.user?.userId;
  if (!id) throw new DocumentWorkContextError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401);
  return id;
}

const DOCUMENT_SELECT = {
  id: true, name: true, fileName: true, title: true, documentRole: true,
  workStatus: true, workInstruction: true, workInstructionUpdatedAt: true,
  dueDate: true, workPriority: true, nextStep: true, category: true,
  documentType: true, currentVersion: true, updatedAt: true, caseId: true,
  sourceCommunicationId: true,
  responsible: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  workInstructionUpdatedBy: { select: { id: true, name: true } },
} as const;

export interface DocumentWorkCardDto {
  id: string;
  title: string;
  fileName: string | null;
  documentRole: string | null;
  workStatus: string;
  workInstruction: string | null;
  workInstructionUpdatedAt: string | null;
  workInstructionUpdatedBy: { id: string; name: string } | null;
  responsible: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null;
  dueDate: string | null;
  workPriority: string | null;
  nextStep: string | null;
  category: string | null;
  documentType: string | null;
  currentVersion: number | null;
  updatedAt: string | null;
  linkedTasks: Array<{ linkId: string; taskId: string; title: string; status: string; dueDate: string | null; assignee: { id: string; name: string } | null }>;
  source: { communicationId: string; subject: string | null; sender: string | null; receivedAt: string | null } | null;
}

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

/**
 * Map to the work card. Storage keys, SharePoint identifiers and checksums are
 * deliberately absent — technical values must not dominate an operational card.
 */
function mapCard(doc: Record<string, any>, links: any[], source: any | null): DocumentWorkCardDto {
  return {
    id: doc.id,
    title: doc.title || doc.name || doc.fileName || 'Dokumentum',
    fileName: doc.fileName ?? null,
    documentRole: doc.documentRole ?? null,
    workStatus: String(doc.workStatus),
    workInstruction: doc.workInstruction ?? null,
    workInstructionUpdatedAt: iso(doc.workInstructionUpdatedAt),
    workInstructionUpdatedBy: doc.workInstructionUpdatedBy
      ? { id: doc.workInstructionUpdatedBy.id, name: doc.workInstructionUpdatedBy.name }
      : null,
    responsible: doc.responsible ? { id: doc.responsible.id, name: doc.responsible.name } : null,
    reviewer: doc.reviewer ? { id: doc.reviewer.id, name: doc.reviewer.name } : null,
    dueDate: iso(doc.dueDate),
    workPriority: doc.workPriority ? String(doc.workPriority) : null,
    nextStep: doc.nextStep ?? null,
    category: doc.category ? String(doc.category) : null,
    documentType: doc.documentType ?? null,
    currentVersion: doc.currentVersion ?? null,
    updatedAt: iso(doc.updatedAt),
    linkedTasks: links.map((l) => ({
      linkId: l.id,
      taskId: l.task.id,
      title: l.task.title,
      status: String(l.task.status),
      dueDate: iso(l.task.dueDate),
      assignee: l.task.assignedTo ? { id: l.task.assignedTo.id, name: l.task.assignedTo.name } : null,
    })),
    // Provenance only — never the message body in a document card.
    source: source
      ? { communicationId: source.id, subject: source.subject ?? null, sender: source.senderName ?? null, receivedAt: iso(source.createdAt) }
      : null,
  };
}

async function loadDocumentForCase(documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, caseId: true } });
  if (!doc) throw new DocumentWorkContextError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
  return doc;
}

/** Read access to the owning case gates every read of the work context. */
async function requireRead(req: Request, documentId: string) {
  const actorId = currentUserId(req);
  const doc = await loadDocumentForCase(documentId);
  const read = await userCanReadCase(req, doc.caseId);
  if (read === null) throw new DocumentWorkContextError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
  if (!read) throw new DocumentWorkContextError('DOCUMENT_ACCESS_FORBIDDEN', 'You do not have access to this document.', 403);
  return { actorId, caseId: doc.caseId };
}

/** Changing work context requires manage rights on the owning case. */
async function requireManage(req: Request, documentId: string) {
  const access = await requireRead(req, documentId);
  const manage = await userCanManageCase(req, access.caseId);
  if (!manage) throw new DocumentWorkContextError('DOCUMENT_MANAGE_FORBIDDEN', 'You cannot change this document.', 403);
  return access;
}

async function fetchCard(documentId: string): Promise<DocumentWorkCardDto> {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: DOCUMENT_SELECT });
  if (!doc) throw new DocumentWorkContextError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
  const links = await prisma.documentTaskLink.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: {
      id: true,
      task: { select: { id: true, title: true, status: true, dueDate: true, assignedTo: { select: { id: true, name: true } } } },
    },
  });
  const source = (doc as any).sourceCommunicationId
    ? await prisma.communication.findUnique({
        where: { id: (doc as any).sourceCommunicationId },
        select: { id: true, subject: true, senderName: true, createdAt: true },
      })
    : null;
  return mapCard(doc as Record<string, any>, links, source);
}

export async function getDocumentWorkContext(req: Request, documentId: string): Promise<DocumentWorkCardDto> {
  await requireRead(req, documentId);
  return fetchCard(documentId);
}

/**
 * Update work metadata. Never touches any DocumentVersion row: the logical work
 * status and the per-version review state are separate concerns.
 */
export async function updateDocumentWorkContext(req: Request, documentId: string, body: unknown): Promise<DocumentWorkCardDto> {
  const access = await requireManage(req, documentId);
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  for (const field of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new DocumentWorkContextError('FIELD_NOT_ACCEPTED', `${field} cannot be changed here.`);
    }
  }
  const unknown = Object.keys(payload).filter((k) => !UPDATABLE.has(k));
  if (unknown.length > 0) {
    throw new DocumentWorkContextError('UNSUPPORTED_FIELD', `Unsupported field: ${unknown[0]}.`);
  }
  if (Object.keys(payload).length === 0) {
    throw new DocumentWorkContextError('NO_FIELDS', 'At least one field is required.');
  }

  const data: Record<string, unknown> = {};

  if ('title' in payload) data.title = str(payload.title, MAX_TITLE, 'title');
  if ('documentRole' in payload) data.documentRole = str(payload.documentRole, MAX_ROLE, 'documentRole');
  if ('nextStep' in payload) data.nextStep = str(payload.nextStep, MAX_NEXT_STEP, 'nextStep');

  if ('workStatus' in payload) {
    const status = String(payload.workStatus || '').toUpperCase();
    if (!WORK_STATUS_SET.has(status)) throw new DocumentWorkContextError('INVALID_WORK_STATUS', 'workStatus is unsupported.');
    data.workStatus = status;
  }

  if ('workPriority' in payload) {
    if (payload.workPriority === null || payload.workPriority === '') data.workPriority = null;
    else {
      const p = String(payload.workPriority).toUpperCase();
      if (!PRIORITIES.has(p)) throw new DocumentWorkContextError('INVALID_PRIORITY', 'workPriority is unsupported.');
      data.workPriority = p;
    }
  }

  if ('dueDate' in payload) {
    if (payload.dueDate === null || payload.dueDate === '') data.dueDate = null;
    else {
      const parsed = new Date(String(payload.dueDate));
      if (Number.isNaN(parsed.getTime())) throw new DocumentWorkContextError('INVALID_DUE_DATE', 'dueDate is not a valid date.');
      data.dueDate = parsed;
    }
  }

  // Responsible and reviewer must be real users who can access the owning case —
  // assigning work must never become a way to surface a matter to an outsider.
  for (const field of ['responsibleId', 'reviewerId'] as const) {
    if (!(field in payload)) continue;
    if (payload[field] === null || payload[field] === '') { data[field] = null; continue; }
    const userId = String(payload[field]);
    const allowed = await userCanAccessCase(userId, access.caseId);
    if (allowed === 'NOT_FOUND') throw new DocumentWorkContextError('USER_NOT_FOUND', `${field} does not exist.`, 400);
    if (allowed === 'FORBIDDEN') throw new DocumentWorkContextError('USER_NOT_ALLOWED', `${field} has no access to this case.`, 403);
    data[field] = userId;
  }

  // The work instruction is the current executable instruction, so who changed it
  // and when is part of the record.
  if ('workInstruction' in payload) {
    data.workInstruction = str(payload.workInstruction, MAX_INSTRUCTION, 'workInstruction');
    data.workInstructionUpdatedAt = new Date();
    data.workInstructionUpdatedById = access.actorId;
  }

  await prisma.document.update({ where: { id: documentId }, data: data as never });
  return fetchCard(documentId);
}

type AccessVerdict = 'OK' | 'NOT_FOUND' | 'FORBIDDEN';

/** Case access check for an arbitrary user id (not the request actor). */
async function userCanAccessCase(userId: string, caseId: string): Promise<AccessVerdict> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return 'NOT_FOUND';
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return 'OK';
  const caseRow = await prisma.case.findUnique({ where: { id: caseId }, select: { assignedLawyerId: true, createdById: true } });
  if (caseRow && (caseRow.assignedLawyerId === userId || caseRow.createdById === userId)) return 'OK';
  const collaborator = await prisma.caseCollaborator.findFirst({ where: { caseId, userId }, select: { id: true } });
  return collaborator ? 'OK' : 'FORBIDDEN';
}

/**
 * Link a document to a task. Both must live in the same case: a link is a work
 * relationship, and work never spans matters.
 */
export async function linkDocumentTask(req: Request, documentId: string, body: unknown): Promise<DocumentWorkCardDto> {
  const access = await requireManage(req, documentId);
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const taskId = str(payload.taskId, 64, 'taskId');
  if (!taskId) throw new DocumentWorkContextError('TASK_ID_REQUIRED', 'taskId is required.');
  const note = str(payload.note, MAX_NOTE, 'note');

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, caseId: true } });
  if (!task) throw new DocumentWorkContextError('TASK_NOT_FOUND', 'Task not found.', 404);
  if (task.caseId !== access.caseId) {
    throw new DocumentWorkContextError('CROSS_CASE_LINK_DENIED', 'The task belongs to a different case.', 403);
  }

  const existing = await prisma.documentTaskLink.findFirst({ where: { documentId, taskId }, select: { id: true } });
  if (existing) throw new DocumentWorkContextError('LINK_ALREADY_EXISTS', 'This document is already linked to the task.', 409);

  await prisma.documentTaskLink.create({ data: { documentId, taskId, note, createdById: access.actorId } });
  return fetchCard(documentId);
}

/** Remove a document/task link. Neither the document nor the task is deleted. */
export async function unlinkDocumentTask(req: Request, documentId: string, taskId: string): Promise<DocumentWorkCardDto> {
  await requireManage(req, documentId);
  const link = await prisma.documentTaskLink.findFirst({ where: { documentId, taskId }, select: { id: true } });
  if (!link) throw new DocumentWorkContextError('LINK_NOT_FOUND', 'Link not found.', 404);
  await prisma.documentTaskLink.delete({ where: { id: link.id } });
  return fetchCard(documentId);
}

/** The other direction: which documents belong to a task. */
export async function listTaskDocuments(req: Request, taskId: string) {
  const actorId = currentUserId(req);
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, caseId: true } });
  if (!task) throw new DocumentWorkContextError('TASK_NOT_FOUND', 'Task not found.', 404);
  const read = await userCanReadCase(req, task.caseId);
  if (read === null) throw new DocumentWorkContextError('TASK_NOT_FOUND', 'Task not found.', 404);
  if (!read) throw new DocumentWorkContextError('TASK_ACCESS_FORBIDDEN', 'You do not have access to this task.', 403);

  const links = await prisma.documentTaskLink.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: {
      id: true, note: true, createdAt: true,
      document: {
        select: {
          id: true, name: true, fileName: true, title: true, workStatus: true,
          documentRole: true, dueDate: true, currentVersion: true,
          responsible: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
        },
      },
    },
  });

  return {
    taskId,
    documents: links.map((l) => ({
      linkId: l.id,
      note: l.note ?? null,
      linkedAt: iso(l.createdAt),
      id: l.document.id,
      title: l.document.title || l.document.name || l.document.fileName || 'Dokumentum',
      fileName: l.document.fileName ?? null,
      workStatus: String(l.document.workStatus),
      documentRole: l.document.documentRole ?? null,
      dueDate: iso(l.document.dueDate),
      currentVersion: l.document.currentVersion ?? null,
      responsible: l.document.responsible,
      reviewer: l.document.reviewer,
    })),
    actorId,
  };
}

export function sendWorkContextError(res: import('express').Response, error: unknown): void {
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  if (e && typeof e.status === 'number' && typeof e.code === 'string') {
    res.status(e.status).json({ status: e.status, code: e.code, message: typeof e.message === 'string' ? e.message : 'Request failed' });
    return;
  }
  console.error('Document work context error:', error);
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}
