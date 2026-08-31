// ============================================================================
// COMMUNICATIONS MODULE - Official Communications Console
// ============================================================================
//
// Communications module for legal operations workflow:
// - Manage communication threads
// - Link communications to cases
// - Extract tasks from communications
// - Create timeline events for communication actions
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { isWorkforceRole, requireWorkforceUser } from '../../middleware/workforceAuthorization';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';
import { prisma } from '../../prisma/prisma.service';
import { buildPrismaErrorResponse } from '../../utils/prismaError';
import {
  importOutlookMessages,
  OutlookImportServiceError,
  runOutlookImportDryRun,
  syncOutlookMailbox,
} from './outlookImport.service';
import { readOutlookSyncConfig, isOutlookSyncConfigured } from './outlookGraphLive';
import { canUserActOnTask, createTaskFromCommunicationSource, SourceLinkedTaskError } from '../tasks/services';
import casesService from '../cases/services';
import { userCanManageCase as canonicalUserCanManageCase } from '../cases/authorization';
import { InteractionError, type InternalActor } from '../client-interaction/base';
import { listClientCommunicationSummary } from './clientSummary.service';

const router = Router();

const PRIVILEGED_COMMUNICATION_ROLES = new Set(['ADMIN', 'PARTNER']);

async function userCanReadCase(caseId: string, userId: string, role: string): Promise<boolean> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, assignedLawyerId: true, createdById: true },
  });
  if (!caseRow) return false;
  if (PRIVILEGED_COMMUNICATION_ROLES.has(role)) return true;
  if (caseRow.assignedLawyerId === userId || caseRow.createdById === userId) return true;
  const collaborator = await prisma.caseCollaborator.findFirst({ where: { caseId, userId }, select: { id: true } });
  return Boolean(collaborator);
}

async function userCanReadCommunication(userId: string, role: string, row: { caseId: string | null; createdById: string }): Promise<boolean> {
  if (PRIVILEGED_COMMUNICATION_ROLES.has(role)) return true;
  if (row.caseId) return userCanReadCase(row.caseId, userId, role);
  return row.createdById === userId;
}

router.use(authenticate, requireWorkforceUser);

router.param('id', async (req: Request, res: Response, next: NextFunction, id: string) => {
  // Let the feature gate produce its product-safe 501 response before doing
  // resource authorization/database work for disabled mutations.
  if (!isDatabaseFoundationEnabled('ENABLE_COMMUNICATIONS_PERSISTENCE')) {
    next();
    return;
  }
  try {
    const row = await prisma.communication.findUnique({
      where: { id: String(id) },
      select: { id: true, caseId: true, createdById: true },
    });
    if (!row) {
      res.status(404).json({ status: 404, code: 'COMMUNICATION_NOT_FOUND', message: 'Communication not found.' });
      return;
    }
    if (!req.user?.userId || !(await userCanReadCommunication(req.user.userId, req.user.role, row))) {
      res.status(403).json({ status: 403, code: 'COMMUNICATION_ACCESS_FORBIDDEN', message: 'You do not have access to this communication.' });
      return;
    }
    (req as any).communicationAccess = row;
    next();
  } catch (error) {
    logPrismaRouteError('communication authorization', error);
    res.status(500).json({ status: 500, code: 'COMMUNICATION_AUTHORIZATION_ERROR', message: 'Communication access could not be verified.' });
  }
});
const requireCommunicationsFoundation = requireDatabaseFoundation({
  feature: 'COMMUNICATIONS',
  enabled: () => isDatabaseFoundationEnabled('ENABLE_COMMUNICATIONS_PERSISTENCE'),
  message: 'Communication persistence is not available in this environment.',
  nextStep: 'Complete the communications database reconciliation before enabling this operation.',
});

// Separate gate for the Outlook / Microsoft Graph import boundary. Default off.
// This guards the dry-run contract below; no Graph connection or mailbox access
// exists yet — the endpoint only normalizes a provider-shaped payload and reports
// what would be imported, without writing.
const requireOutlookImportFoundation = requireDatabaseFoundation({
  feature: 'OUTLOOK_IMPORT',
  enabled: () => isDatabaseFoundationEnabled('ENABLE_OUTLOOK_IMPORT'),
  message: 'Outlook import is not available in this environment.',
  reason: 'OUTLOOK_IMPORT_NOT_ENABLED',
  nextStep: 'Enable ENABLE_OUTLOOK_IMPORT once the Graph import contract is reviewed and approved.',
});

function logPrismaRouteError(route: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const details =
      process.env.NODE_ENV === 'production'
        ? { code: error.code, message: error.message }
        : { code: error.code, message: error.message, meta: error.meta };
    console.error(`[communications] ${route} prisma error`, details);
    return;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(`[communications] ${route} prisma validation error`, {
      message: error.message,
    });
    return;
  }
  console.error(`[communications] ${route} error`, error instanceof Error ? error.message : error);
}

// ============================================================================
// TYPES
// ============================================================================

type CommunicationType = 'EMAIL' | 'PHONE' | 'MEETING' | 'LETTER' | 'NOTE';

type CommunicationListRow = {
  id: string;
  type: CommunicationType;
  subject: string | null;
  senderName: string | null;
  senderEmail: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  content: string | null;
  summary: string | null;
  caseId: string | null;
  clientId: string | null;
  documentId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  providerConversationId?: string | null;
  direction?: 'INBOUND' | 'OUTBOUND' | null;
  receivedAt?: Date | null;
  source?: 'MANUAL' | 'OUTLOOK' | null;
  syncStatus?: 'IMPORTED' | 'PENDING' | 'FAILED' | null;
  metadata?: unknown;
};

type CommunicationTriage = 'LINKED' | 'NEEDS_ASSIGNMENT' | 'IGNORED' | 'DUPLICATE_OR_ERROR';

type CommunicationListItem = Omit<
  CommunicationListRow,
  'content' | 'createdAt' | 'updatedAt' | 'receivedAt' | 'providerConversationId' | 'direction' | 'source' | 'syncStatus' | 'metadata'
> & {
  contentPreview: string | null;
  clientColorKey: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
  sourceTaskCount: number;
  providerConversationId: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  receivedAt: string | null;
  source: 'MANUAL' | 'OUTLOOK' | null;
  syncStatus: 'IMPORTED' | 'PENDING' | 'FAILED' | null;
  triage: CommunicationTriage;
};

interface CreateCommunicationInput {
  type: CommunicationType;
  subject: string;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
  content?: string;
  summary?: string;
  caseId?: string;
  clientId?: string;
  documentId?: string;
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const CONTENT_PREVIEW_LIMIT = 240;

function parseNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseListLimit(value: unknown): number {
  const parsed = parseNonNegativeInteger(value, DEFAULT_LIST_LIMIT);
  if (parsed === 0) return DEFAULT_LIST_LIMIT;
  return Math.min(parsed, MAX_LIST_LIMIT);
}

function toContentPreview(content?: string | null): string | null {
  if (!content) return null;
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > CONTENT_PREVIEW_LIMIT
    ? `${compact.slice(0, CONTENT_PREVIEW_LIMIT - 1)}…`
    : compact;
}

function mapCommunicationListItem(
  row: CommunicationListRow,
  attachmentCounts: Map<string, number>,
  sourceTaskCounts: Map<string, number>,
  clientColorKeys: Map<string, string>
): CommunicationListItem {
  let triage: CommunicationTriage = 'NEEDS_ASSIGNMENT';
  if (row.caseId) {
    triage = 'LINKED';
  } else if (readTriageFlag(row) === 'IGNORED') {
    triage = 'IGNORED';
  } else if (row.syncStatus === 'FAILED') {
    triage = 'DUPLICATE_OR_ERROR';
  }

  return {
    id: row.id,
    type: row.type,
    subject: row.subject,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    summary: row.summary,
    contentPreview: toContentPreview(row.content),
    caseId: row.caseId,
    clientId: row.clientId,
    clientColorKey: row.clientId ? clientColorKeys.get(row.clientId) || null : null,
    documentId: row.documentId,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attachmentCount: attachmentCounts.get(row.id) || 0,
    sourceTaskCount: sourceTaskCounts.get(row.id) || 0,
    providerConversationId: (row as any).providerConversationId || null,
    direction: (row as any).direction || null,
    receivedAt: (row as any).receivedAt ? new Date((row as any).receivedAt).toISOString() : null,
    source: (row as any).source || null,
    syncStatus: (row as any).syncStatus || null,
    triage,
  };
}

function readTriageFlag(row: CommunicationListRow): 'IGNORED' | null {
  const meta = (row as any).metadata;
  if (meta && typeof meta === 'object' && (meta as Record<string, unknown>).triage === 'IGNORED') {
    return 'IGNORED';
  }
  return null;
}

function countByKey<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

// ============================================================================
// HELPER: Create Timeline Event
// ============================================================================

async function createTimelineEvent(data: {
  caseId: string;
  userId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  return prisma.timelineEvent.create({
    data: {
      caseId: data.caseId,
      userId: data.userId,
      eventType: data.eventType as any,
      type: data.eventType as any,
      payload: data.payload as any,
    } as any
  });
}

// ============================================================================
// GET /api/v1/communications - authenticated read-only list contract.
// This preview endpoint intentionally remains available without
// ENABLE_COMMUNICATIONS_PERSISTENCE; mutating/detail operations below stay gated.
// The response uses scalar Communication fields only and avoids fragile relation
// includes so dashboard/workspace callers get a stable shape during DB drift.
// ============================================================================

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { caseId, clientId, type, documentId } = req.query;

    const where: any = {};

    if (!req.user?.userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated workforce user is required.' });
      return;
    }
    if (!PRIVILEGED_COMMUNICATION_ROLES.has(req.user.role)) {
      const accessibleCases = await prisma.case.findMany({
        where: {
          OR: [
            { assignedLawyerId: req.user.userId },
            { createdById: req.user.userId },
            { collaborators: { some: { userId: req.user.userId } } },
          ],
        },
        select: { id: true },
      });
      where.OR = [
        { caseId: null, createdById: req.user.userId },
        ...(accessibleCases.length > 0 ? [{ caseId: { in: accessibleCases.map((row) => row.id) } }] : []),
      ];
    }

    if (caseId) {
      where.caseId = String(caseId);
    }
    if (clientId) {
      where.clientId = String(clientId);
    }
    if (type) {
      where.type = String(type);
    }
    if (documentId) {
      where.documentId = String(documentId);
    }

    const take = parseListLimit(req.query.limit);
    const skip = parseNonNegativeInteger(req.query.offset, 0);

    let rows: CommunicationListRow[] = [];
    try {
      rows = await prisma.communication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          type: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          recipientName: true,
          recipientEmail: true,
          content: true,
          summary: true,
          caseId: true,
          clientId: true,
          documentId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          providerConversationId: true,
          direction: true,
          receivedAt: true,
          source: true,
          syncStatus: true,
          metadata: true,
        },
      }) as CommunicationListRow[];
    } catch (error) {
      logPrismaRouteError('GET /communications scalar-list-query', error);
      rows = [];
    }

    const rowIds = rows.map((row) => row.id);
    let attachmentCounts = new Map<string, number>();
    let sourceTaskCounts = new Map<string, number>();
    let clientColorKeys = new Map<string, string>();

    if (rowIds.length > 0) {
      try {
        const attachments = await prisma.communicationAttachment.findMany({
          where: { communicationId: { in: rowIds } },
          select: { communicationId: true },
        });
        attachmentCounts = countByKey(attachments, 'communicationId');
      } catch (error) {
        logPrismaRouteError('GET /communications attachment-counts', error);
      }

      try {
        const tasks = await prisma.task.findMany({
          where: { sourceCommunicationId: { in: rowIds } } as any,
          select: { sourceCommunicationId: true } as any,
        });
        sourceTaskCounts = countByKey(tasks as Array<{ sourceCommunicationId?: string | null }>, 'sourceCommunicationId');
      } catch (error) {
        logPrismaRouteError('GET /communications source-task-counts', error);
      }

      const clientIds = Array.from(new Set(rows.map((row) => row.clientId).filter((value): value is string => Boolean(value))));
      if (clientIds.length > 0) {
        try {
          const clients = await prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, colorKey: true },
          });
          clientColorKeys = new Map(
            (clients || [])
              .filter((client) => client.colorKey)
              .map((client): [string, string] => [client.id, String(client.colorKey)]),
          );
        } catch (error) {
          logPrismaRouteError('GET /communications client-colors', error);
        }
      }
    }

    let total = 0;
    try {
      total = await prisma.communication.count({ where });
    } catch (countError) {
      logPrismaRouteError('GET /communications count-total', countError);
      total = rows.length;
    }

    res.json({
      communications: rows.map((row) => mapCommunicationListItem(row, attachmentCounts, sourceTaskCounts, clientColorKeys)),
      pagination: {
        total,
        limit: take,
        offset: skip
      }
    });
  } catch (error) {
    logPrismaRouteError('GET /communications final', error);
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) {
      res.status(prismaErr.status).json(prismaErr.body);
    } else {
      res.status(500).json({ error: 'Error listing communications' });
    }
  }
});

router.get('/client/:clientId/summary', requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated workforce user is required.' });
      return;
    }
    const actor: InternalActor = { userId: String(req.user.userId), role: String(req.user.role || '') };
    const summary = await listClientCommunicationSummary(actor, String(req.params.clientId || ''), {
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    }, prisma);
    res.json(summary);
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    logPrismaRouteError('GET /communications/client/:clientId/summary', error);
    res.status(500).json({
      status: 500,
      code: 'CLIENT_COMMUNICATION_SUMMARY_ERROR',
      message: 'The client communication summary could not be loaded.',
    });
  }
});

// ============================================================================
// GET /api/v1/communications/:id - Get single communication with details
// ============================================================================

router.get('/:id', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const communication = await prisma.communication.findUnique({
      where: { id: String(id) },
      include: {
        attachments: true,
        relatedTasks: {
          include: {
            assignedTo: { select: { id: true, name: true } }
          }
        }
      } as any
    });

    if (!communication) {
      res.status(404).json({ error: 'Communication not found' });
      return;
    }

    const clientColor = communication.clientId
      ? await prisma.client.findUnique({ where: { id: communication.clientId }, select: { colorKey: true } })
      : null;

    res.json({
      ...communication,
      clientColorKey: clientColor?.colorKey ? String(clientColor.colorKey) : null,
    });
  } catch (error) {
    console.error('Error fetching communication:', error);
    res.status(500).json({ error: 'Error fetching communication' });
  }
});

// ============================================================================
// POST /api/v1/communications - Create new communication
// ============================================================================

router.post('/', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { 
      type, subject, senderName, senderEmail, recipientName, recipientEmail,
      content, summary, caseId, clientId, documentId
    } = req.body;

    if (!type || !subject) {
      res.status(400).json({ 
        error: 'Missing required fields: type, subject' 
      });
      return;
    }

    if (caseId) {
      const canRead = req.user?.userId ? await userCanReadCase(String(caseId), req.user.userId, req.user.role) : false;
      if (!canRead) {
        res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
        return;
      }
      const linkedCase = await prisma.case.findUnique({ where: { id: String(caseId) }, select: { clientId: true } });
      if (!linkedCase) {
        res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found.' });
        return;
      }
      if (clientId && clientId !== linkedCase.clientId) {
        res.status(409).json({ status: 409, code: 'CLIENT_CASE_MISMATCH', message: 'Communication client and case client must match.' });
        return;
      }
    }

    const communication = await prisma.communication.create({
      data: {
        type,
        subject,
        senderName,
        senderEmail,
        recipientName,
        recipientEmail,
        content,
        summary,
        caseId,
        clientId,
        documentId,
        createdById: userId
      } as any
    });

    // Create timeline event if linked to case
    if (caseId) {
      await createTimelineEvent({
        caseId,
        userId,
        eventType: 'CLIENT_CONTACT',
        payload: {
          communicationId: communication.id,
          subject,
          type,
          summary
        }
      });
    }

    res.status(201).json(communication);
  } catch (error) {
    console.error('Error creating communication:', error);
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) {
      res.status(prismaErr.status).json(prismaErr.body);
    } else {
      res.status(500).json({ error: 'Error creating communication' });
    }
  }
});

// ============================================================================
// POST /api/v1/communications/:id/link-case - Link communication to case
// ============================================================================

router.post('/:id/link-case', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { caseId } = req.body;

    if (!caseId) {
      res.status(400).json({ error: 'Missing caseId' });
      return;
    }

    // Verify case exists
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, caseNumber: true, clientId: true },
    });

    if (!caseData) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    if (!req.user?.userId || !(await userCanReadCase(String(caseId), req.user.userId, req.user.role))) {
      res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
      return;
    }

    const current = await prisma.communication.findUnique({
      where: { id: String(id) },
      select: { id: true, clientId: true },
    });
    if (!current) {
      res.status(404).json({ status: 404, code: 'COMMUNICATION_NOT_FOUND', message: 'Communication not found.' });
      return;
    }
    if (current.clientId && current.clientId !== caseData.clientId) {
      res.status(409).json({ status: 409, code: 'CLIENT_CASE_MISMATCH', message: 'Communication client and case client must match.' });
      return;
    }

    const communication = await prisma.communication.update({
      where: { id: String(id) },
      data: { caseId, clientId: caseData.clientId }
    });

    // Create timeline event
    await createTimelineEvent({
      caseId,
      userId,
      eventType: 'CLIENT_CONTACT',
      payload: {
        communicationId: communication.id,
        subject: communication.subject,
        action: 'linked_to_case',
        previousCaseId: null
      }
    });

    res.json({ 
      success: true, 
      communication,
      message: `Communication linked to case ${caseData.caseNumber}`
    });
  } catch (error) {
    console.error('Error linking communication to case:', error);
    res.status(500).json({ error: 'Error linking communication to case' });
  }
});

router.post('/:id/link-task', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  const communicationId = String(req.params.id);
  const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required.' });
    return;
  }
  if (!taskId) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'taskId is required.' });
    return;
  }

  try {
    const communication = await prisma.communication.findUnique({
      where: { id: communicationId },
      select: { id: true, caseId: true },
    });
    if (!communication) {
      res.status(404).json({ status: 404, code: 'COMMUNICATION_NOT_FOUND', message: 'Communication not found.' });
      return;
    }
    if (!communication.caseId) {
      res.status(409).json({ status: 409, code: 'COMMUNICATION_CASE_REQUIRED', message: 'Communication must be linked to a case first.' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, caseId: true, status: true, assignedToId: true, assignedById: true, sourceCommunicationId: true },
    });
    if (!task) {
      res.status(404).json({ status: 404, code: 'TASK_NOT_FOUND', message: 'Task not found.' });
      return;
    }
    if (task.caseId !== communication.caseId) {
      res.status(409).json({ status: 409, code: 'TASK_CASE_MISMATCH', message: 'Task and communication must belong to the same case.' });
      return;
    }
    const access = await canUserActOnTask(task, userId);
    if (!access.allowed) {
      res.status(403).json({ status: 403, code: 'TASK_LINK_FORBIDDEN', message: 'You are not allowed to link this task.' });
      return;
    }
    if (task.sourceCommunicationId && task.sourceCommunicationId !== communication.id) {
      res.status(409).json({ status: 409, code: 'TASK_ALREADY_LINKED', message: 'Task is already linked to another communication.' });
      return;
    }
    if (task.sourceCommunicationId === communication.id) {
      res.json({ success: true, linked: false, task, message: 'Task is already linked to this communication.' });
      return;
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: { sourceCommunicationId: communication.id },
      select: { id: true, title: true, caseId: true, status: true, sourceCommunicationId: true },
    });
    res.json({ success: true, linked: true, task: updatedTask, message: 'Task linked to communication.' });
  } catch (error) {
    logPrismaRouteError('POST /communications/:id/link-task', error);
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) {
      res.status(prismaErr.status).json(prismaErr.body);
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Task linking failed.' });
  }
});

// ============================================================================
// POST /api/v1/communications/:id/create-case
// ----------------------------------------------------------------------------
// Atomic Communication -> Matter intake: create a NEW case from an unlinked
// communication and link the communication to it in a single transaction.
// Every DB write (case create + communication link + optional initial task +
// timeline events) runs inside prisma.$transaction, so any failure rolls back
// the whole operation — there is never an orphan case or a half-linked
// communication. SharePoint folder provisioning (external, non-critical) is
// intentionally NOT performed here; the case DB row is the source of truth.
// ============================================================================

const VALID_CASE_MATTER_TYPES = ['REAL_ESTATE_SALE', 'LEASE', 'EMPLOYMENT', 'CORPORATE', 'LITIGATION', 'OTHER'];
const DEFAULT_CASE_MATTER_TYPE = 'OTHER';
const VALID_CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

class CreateCaseFromCommunicationError extends Error {
  constructor(public httpStatus: number, public code: string, message: string) {
    super(message);
    this.name = 'CreateCaseFromCommunicationError';
  }
}

router.post('/:id/create-case', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { id } = req.params;
  const body = (req.body || {}) as Record<string, any>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const matterTypeRaw = typeof body.matterType === 'string' ? body.matterType.trim() : '';
  const priorityRaw = typeof body.priority === 'string' ? body.priority.trim().toUpperCase() : '';
  const clientIdInput = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const description = typeof body.description === 'string' && body.description.trim() ? body.description : undefined;
  const assignedLawyerIdInput = typeof body.assignedLawyerId === 'string' ? body.assignedLawyerId.trim() : '';
  const taskInput = body.task && typeof body.task === 'object' ? (body.task as Record<string, any>) : null;

  // Cheap, write-free validation first.
  if (!title) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: title' });
    return;
  }
  if (!matterTypeRaw) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: matterType' });
    return;
  }
  let deadline: Date | undefined;
  if (body.deadline) {
    const parsed = new Date(body.deadline);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid deadline' });
      return;
    }
    deadline = parsed;
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const communication = await tx.communication.findUnique({ where: { id: String(id) } });
      if (!communication) {
        throw new CreateCaseFromCommunicationError(404, 'COMMUNICATION_NOT_FOUND', 'Communication not found');
      }
      if (communication.caseId) {
        throw new CreateCaseFromCommunicationError(409, 'COMMUNICATION_ALREADY_LINKED', 'Communication is already linked to a case');
      }

      const resolvedClientId = communication.clientId || '';
      if (!resolvedClientId) {
        throw new CreateCaseFromCommunicationError(
          400,
          'COMMUNICATION_CLIENT_REQUIRED',
          'The communication must be linked to a client before creating a case.',
        );
      }
      if (clientIdInput && clientIdInput !== resolvedClientId) {
        throw new CreateCaseFromCommunicationError(403, 'COMMUNICATION_CLIENT_MISMATCH', 'The requested client does not match this communication.');
      }

      const client = await tx.client.findUnique({ where: { id: resolvedClientId }, select: { id: true, name: true } });
      if (!client) {
        throw new CreateCaseFromCommunicationError(400, 'CLIENT_NOT_FOUND', 'Client not found');
      }

      const matterType = VALID_CASE_MATTER_TYPES.includes(matterTypeRaw) ? matterTypeRaw : DEFAULT_CASE_MATTER_TYPE;
      const priority = VALID_CASE_PRIORITIES.includes(priorityRaw) ? priorityRaw : 'MEDIUM';
      const resolvedClientName = client.name;

      let resolvedAssignedLawyerId: string | null = null;
      if (assignedLawyerIdInput) {
        const assignedUser = await tx.user.findUnique({
          where: { id: assignedLawyerIdInput },
          select: { id: true, role: true, status: true, isActive: true },
        });
        if (!assignedUser || !isWorkforceRole(assignedUser.role) || assignedUser.status !== 'ACTIVE' || assignedUser.isActive === false) {
          throw new CreateCaseFromCommunicationError(400, 'INVALID_ASSIGNED_LAWYER', 'A megadott felelős ügyvéd nem található vagy inaktív.');
        }
        resolvedAssignedLawyerId = assignedUser.id;
      }

      const newCase = await casesService.createCase({
        title,
        clientName: resolvedClientName,
        clientId: client.id,
        matterType,
        description,
        priority,
        deadline: deadline?.toISOString(),
        assignedLawyerId: resolvedAssignedLawyerId,
        createdById: userId,
      }, tx, { withinTransaction: true, provisionCaseFolders: false });

      await tx.communication.update({
        where: { id: String(id) },
        data: { caseId: newCase.id },
      });

      await tx.timelineEvent.create({
        data: {
          caseId: newCase.id,
          userId,
          eventType: 'CASE_CREATED',
          type: 'CASE_CREATED',
          payload: {
            caseNumber: newCase.caseNumber,
            clientName: resolvedClientName,
            matterType,
            source: 'communication',
            communicationId: communication.id,
          },
        } as any,
      });

      await tx.timelineEvent.create({
        data: {
          caseId: newCase.id,
          userId,
          eventType: 'CLIENT_CONTACT',
          type: 'CLIENT_CONTACT',
          payload: {
            communicationId: communication.id,
            subject: communication.subject,
            action: 'linked_to_new_case',
          },
        } as any,
      });

      let createdTask: any = null;
      if (taskInput && typeof taskInput.title === 'string' && taskInput.title.trim()) {
        const taskPriorityRaw = typeof taskInput.priority === 'string' ? taskInput.priority.trim().toUpperCase() : '';
        const taskPriority = VALID_CASE_PRIORITIES.includes(taskPriorityRaw) ? taskPriorityRaw : 'MEDIUM';
        const taskDue = taskInput.dueDate ? new Date(taskInput.dueDate) : undefined;
        const taskDescription =
          typeof taskInput.description === 'string' && taskInput.description.trim()
            ? taskInput.description.trim()
            : communication.summary || undefined;

        createdTask = await tx.task.create({
          data: {
            title: taskInput.title.trim(),
            description: taskDescription,
            taskType: 'OTHER' as any,
            type: 'OTHER',
            status: 'TODO' as any,
            priority: taskPriority as any,
            caseId: newCase.id,
            assignedById: userId,
            dueDate: taskDue && !Number.isNaN(taskDue.getTime()) ? taskDue : undefined,
            sourceCommunicationId: communication.id,
          } as any,
        });

        await tx.timelineEvent.create({
          data: {
            caseId: newCase.id,
            userId,
            eventType: 'TASK_CREATED',
            type: 'TASK_CREATED',
            payload: {
              taskId: createdTask.id,
              title: createdTask.title,
              source: 'communication',
              communicationId: communication.id,
            },
          } as any,
        });
      }

      return { newCase, createdTask };
    });

    const responseBody: Record<string, any> = {
      success: true,
      case: {
        id: result.newCase.id,
        caseNumber: result.newCase.caseNumber,
        title: result.newCase.title,
      },
      communication: {
        id: String(id),
        caseId: result.newCase.id,
      },
    };
    if (result.createdTask) {
      responseBody.task = { id: result.createdTask.id, title: result.createdTask.title };
    }

    res.status(201).json(responseBody);
  } catch (error) {
    if (error instanceof CreateCaseFromCommunicationError) {
      res.status(error.httpStatus).json({ status: error.httpStatus, code: error.code, message: error.message });
      return;
    }
    logPrismaRouteError('POST /communications/:id/create-case', error);
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) {
      res.status(prismaErr.status).json(prismaErr.body);
      return;
    }
    res.status(500).json({ error: 'Error creating case from communication' });
  }
});

// ============================================================================
// POST /api/v1/communications/:id/extract-task - Create task from communication
// ============================================================================

router.post('/:id/extract-task', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const body = req.body && typeof req.body === 'object' ? { ...(req.body as Record<string, unknown>) } : {};
    // This compatibility route now delegates to the canonical source-linked
    // task service. Caller-supplied case, description, priority, and assignee
    // values are not allowed to bypass the communication's server-owned case.
    const result = await createTaskFromCommunicationSource(String(id), userId, {
      title: body.title,
      kind: 'FOLLOW_UP',
      dueAt: body.dueDate,
      assigneeId: body.assignedTo,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof SourceLinkedTaskError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    logPrismaRouteError('POST /communications/:id/extract-task', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Task creation from communication failed.' });
  }
});

// ============================================================================
// POST /api/v1/communications/:id/extract-deadline - Create deadline event
// ============================================================================

router.post('/:id/extract-deadline', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { deadline, description, priority, caseId } = req.body;

    // Get communication
    const communication = await prisma.communication.findUnique({
      where: { id: String(id) }
    });

    if (!communication) {
      res.status(404).json({ error: 'Communication not found' });
      return;
    }

    if (caseId && caseId !== communication.caseId) {
      res.status(409).json({ status: 409, code: 'COMMUNICATION_CASE_MISMATCH', message: 'A communication deadline must remain on its linked case.' });
      return;
    }
    const targetCaseId = communication.caseId;
    if (!targetCaseId) {
      res.status(400).json({ error: 'Communication must be linked to a case first' });
      return;
    }

    if (!userId || !(await canonicalUserCanManageCase(req, String(targetCaseId)))) {
      res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
      return;
    }

    if (!deadline) {
      res.status(400).json({ error: 'Missing deadline date' });
      return;
    }

    // Update case deadline if higher priority or earlier
    const caseData = await prisma.case.findUnique({
      where: { id: targetCaseId }
    });

    const shouldUpdateCase = !caseData?.deadline || 
      new Date(deadline) < new Date(caseData.deadline) ||
      priority === 'URGENT';

    let updatedCase: any = caseData;
    if (shouldUpdateCase) {
      updatedCase = await prisma.case.update({
        where: { id: targetCaseId },
        data: { 
          deadline: new Date(deadline),
          priority: priority === 'URGENT' ? 'URGENT' : undefined
        } as any
      });
    }

    // Create timeline event for deadline
    const timelineEvent = await createTimelineEvent({
      caseId: targetCaseId,
      userId,
      eventType: 'DEADLINE_SET',
      payload: {
        communicationId: communication.id,
        deadline: new Date(deadline).toISOString(),
        description: description || `Deadline from: ${communication.subject}`,
        source: 'communication',
        subject: communication.subject
      }
    });

    res.status(201).json({ 
      success: true, 
      timelineEvent,
      caseDeadline: updatedCase?.deadline,
      message: 'Deadline extracted from communication'
    });
  } catch (error) {
    console.error('Error extracting deadline:', error);
    res.status(500).json({ error: 'Error extracting deadline' });
  }
});

// ============================================================================
// POST /api/v1/communications/:id/add-attachment - Link document attachment
// ============================================================================

router.post('/:id/add-attachment', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { documentId, fileName, fileType, description } = req.body;

    // Get communication
    const communication = await prisma.communication.findUnique({
      where: { id: String(id) }
    });

    if (!communication) {
      res.status(404).json({ error: 'Communication not found' });
      return;
    }

    // Create attachment record
    const attachment = await prisma.communicationAttachment.create({
      data: {
        communicationId: String(id),
        documentId,
        fileName,
        fileType,
        description,
        uploadedById: userId
      } as any
    });

    // If there's a document, link it and create timeline event
    if (documentId && communication.caseId) {
      await createTimelineEvent({
        caseId: communication.caseId,
        userId,
        eventType: 'DOCUMENT_UPLOADED',
        payload: {
          documentId,
          communicationId: id,
          subject: communication.subject,
          action: 'attached_to_communication',
          fileName
        }
      });
    }

    res.status(201).json({ 
      success: true, 
      attachment,
      message: 'Attachment linked to communication'
    });
  } catch (error) {
    console.error('Error adding attachment:', error);
    res.status(500).json({ error: 'Error adding attachment' });
  }
});

// ============================================================================
// GET /api/v1/communications/:id/tasks - Get tasks created from communication
// ============================================================================

router.post('/:id/tasks', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const result = await createTaskFromCommunicationSource(String(id), userId, req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof SourceLinkedTaskError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    logPrismaRouteError('POST /communications/:id/tasks', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Task creation from communication failed.' });
  }
});

router.get('/:id/tasks', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const tasks = await prisma.task.findMany({
      where: {
        sourceCommunicationId: String(id)
      } as any,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching communication tasks:', error);
    res.status(500).json({ error: 'Error fetching tasks' });
  }
});

// ============================================================================
// GET /api/v1/communications/:id/attachments - Get communication attachments
// ============================================================================

router.get('/:id/attachments', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const attachments = await prisma.communicationAttachment.findMany({
      where: { communicationId: String(id) },
      include: {
        uploadedBy: { select: { id: true, name: true } } as any,
        document: { select: { id: true, name: true, spWebUrl: true } }
      } as any,
      orderBy: { createdAt: 'desc' }
    });

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Error fetching attachments' });
  }
});

// ============================================================================
// GET /api/v1/communications/outlook/status
// ----------------------------------------------------------------------------
// Returns Outlook connection availability in customer-safe terms.
// No tenant IDs, client IDs, tokens, or mailbox internals exposed.
// ============================================================================

router.get('/outlook/status', authenticate, async (req: Request, res: Response) => {
  try {
    const importEnabled = isDatabaseFoundationEnabled('ENABLE_OUTLOOK_IMPORT');
    const configured = isOutlookSyncConfigured();

    if (!importEnabled) {
      res.json({ available: false, reason: 'DISABLED', message: 'Outlook nincs összekapcsolva.' });
      return;
    }
    if (!configured) {
      res.json({ available: false, reason: 'NOT_CONFIGURED', message: 'Outlook nincs összekapcsolva.' });
      return;
    }

    const lastSync = await prisma.communication.findFirst({
      where: { source: 'OUTLOOK' as any },
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true },
    });

    res.json({
      available: true,
      message: 'Outlook szinkronizálható.',
      lastSyncAt: lastSync?.importedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Outlook status error:', error);
    res.json({ available: false, reason: 'UNAVAILABLE', message: 'Átmenetileg nem érhető el.' });
  }
});

// ============================================================================
// POST /api/v1/communications/outlook/import-dry-run
// ----------------------------------------------------------------------------
// Phase-2 Outlook import boundary — DRY RUN ONLY. Gated by ENABLE_OUTLOOK_IMPORT
// (default off). Accepts a provider-shaped (mocked) email payload, normalizes it
// into the future Communication shape, performs READ-ONLY duplicate detection by
// externalMessageId, and reports what WOULD be imported. It never connects to
// Microsoft Graph, never reads a real mailbox, and NEVER writes communications or
// attachments. No AI classification, no persisted thread — direction is a simple
// transparent derivation from sender vs mailbox.
// ============================================================================

router.post('/outlook/import-dry-run', authenticate, requireOutlookImportFoundation, async (req: Request, res: Response) => {
  try {
    const result = await runOutlookImportDryRun((req.body || {}) as Record<string, any>);
    res.json(result);
  } catch (error) {
    if (error instanceof OutlookImportServiceError) {
      if (error.logRoute) logPrismaRouteError(error.logRoute, error);
      res.status(error.status).json(error.responseBody);
      return;
    }
    logPrismaRouteError('POST /communications/outlook/import-dry-run', error);
    res.status(500).json({ error: 'Error running Outlook import dry-run' });
  }
});

// ============================================================================
// POST /api/v1/communications/outlook/import
// ----------------------------------------------------------------------------
// Phase-3 Outlook import CORE — gated by ENABLE_OUTLOOK_IMPORT (default off).
// Writes Communication rows from a provider-shaped (mock) payload using the SAME
// normalization as the dry-run. This is NOT the Graph connector and NOT automatic
// sync: no Graph call, no mailbox read, no secrets. Dedupe by externalMessageId
// (existing rows are never re-created). Attachments store metadata only (no
// binaries), deduped within a message by providerAttachmentId. No case/client/
// document/task relationships are inferred (caseId/clientId/documentId stay null).
// No AI classification.
// ============================================================================

router.post('/outlook/import', authenticate, requireOutlookImportFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const config = readOutlookSyncConfig();
    if (!config) {
      res.status(501).json({ status: 501, code: 'OUTLOOK_IMPORT_NOT_CONFIGURED', message: 'Outlook import is not configured for a server-controlled mailbox.' });
      return;
    }
    const result = await importOutlookMessages((req.body || {}) as Record<string, any>, userId, config.mailboxAddress);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof OutlookImportServiceError) {
      if (error.logRoute) logPrismaRouteError(error.logRoute, error);
      res.status(error.status).json(error.responseBody);
      return;
    }
    logPrismaRouteError('POST /communications/outlook/import', error);
    res.status(500).json({ error: 'Error importing Outlook communications' });
  }
});

// ============================================================================
// POST /api/v1/communications/outlook/sync
// ----------------------------------------------------------------------------
// LIVE inbound sync boundary (workforce, gated by ENABLE_OUTLOOK_IMPORT AND
// configured COMMUNICATIONS_MAILBOX + app-only credentials). Reads a bounded
// recent window from the workforce mailbox via Microsoft Graph, imports
// idempotently, and applies SAFE thread linkage. Returns only safe counts — no
// raw Graph payloads, no Graph/tenant ids, no tokens, no provider stack traces.
// Provider failures are classified into safe user-facing outcomes.
// ============================================================================

router.post('/outlook/sync', authenticate, requireOutlookImportFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await syncOutlookMailbox(userId);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof OutlookImportServiceError) {
      if (error.logRoute) logPrismaRouteError(error.logRoute, error);
      res.status(error.status).json(error.responseBody);
      return;
    }
    logPrismaRouteError('POST /communications/outlook/sync', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Az Outlook szinkron nem sikerült.' });
  }
});

// ============================================================================
// POST /api/v1/communications/:id/link-client — explicit, safe Client assignment
// ----------------------------------------------------------------------------
// A lawyer explicitly selects the Client this communication belongs to. This is
// the safe layer-2 matching path (no guessing). caseId is left untouched unless
// the selected client differs from the communication's current client.
// ============================================================================

router.post('/:id/link-client', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.trim() : '';

    if (!clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'clientId is required.' });
      return;
    }

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) {
      res.status(404).json({ status: 404, code: 'CLIENT_NOT_FOUND', message: 'Client not found.' });
      return;
    }

    const communication = await prisma.communication.findUnique({ where: { id: String(id) }, select: { id: true, clientId: true, caseId: true } });
    if (!communication) {
      res.status(404).json({ status: 404, code: 'COMMUNICATION_NOT_FOUND', message: 'Communication not found.' });
      return;
    }

    if (communication.caseId) {
      const linkedCase = await prisma.case.findUnique({ where: { id: communication.caseId }, select: { clientId: true } });
      if (!linkedCase || linkedCase.clientId !== client.id) {
        res.status(409).json({ status: 409, code: 'CLIENT_CASE_MISMATCH', message: 'A case-linked communication must keep its case client.' });
        return;
      }
    }

    const updated = await prisma.communication.update({
      where: { id: String(id) },
      data: { clientId: client.id },
      select: { id: true, clientId: true, caseId: true, subject: true },
    });

    if (communication.caseId && updated.caseId) {
      await createTimelineEvent({
        caseId: updated.caseId,
        userId,
        eventType: 'CLIENT_CONTACT',
        payload: {
          communicationId: updated.id,
          subject: updated.subject,
          action: 'client_assigned',
          clientId: client.id,
        },
      });
    }

    res.json({ success: true, communication: updated, message: `Kommunikáció hozzárendelve: ${client.name}` });
  } catch (error) {
    logPrismaRouteError('POST /communications/:id/link-client', error);
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) {
      res.status(prismaErr.status).json(prismaErr.body);
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'A kommunikáció ügyfélhez rendelése nem sikerült.' });
  }
});

// ============================================================================
// POST /api/v1/communications/:id/ignore | /unignore — triage
// ----------------------------------------------------------------------------
// Lightweight triage: mark an unassigned imported message as "ignored / not a
// matter" or restore it. Persisted additively inside the existing metadata JSON
// (no schema migration). Only applies to communications without a case.
// ============================================================================

async function requireCommunicationForTriage(id: string, res: Response, userId: string): Promise<{ id: string } | null> {
  const row = await prisma.communication.findUnique({
    where: { id: String(id) },
    select: { id: true, caseId: true, metadata: true },
  });
  if (!row) {
    res.status(404).json({ status: 404, code: 'COMMUNICATION_NOT_FOUND', message: 'Communication not found.' });
    return null;
  }
  if (row.caseId) {
    res.status(409).json({ status: 409, code: 'COMMUNICATION_ALREADY_LINKED', message: 'A case-linked communication cannot be ignored.' });
    return null;
  }
  void userId;
  return { id: row.id };
}

router.post('/:id/ignore', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const guard = await requireCommunicationForTriage(String(req.params.id), res, userId);
    if (!guard) return;

    const row = await prisma.communication.findUnique({ where: { id: guard.id }, select: { metadata: true } });
    const meta = (row?.metadata && typeof row.metadata === 'object' ? { ...(row.metadata as Record<string, unknown>) } : {}) as Record<string, unknown>;
    meta.triage = 'IGNORED';

    const updated = await prisma.communication.update({
      where: { id: guard.id },
      data: { metadata: meta as any },
      select: { id: true, metadata: true },
    });

    res.json({ success: true, communication: updated, message: 'Kommunikáció megjelölve: nem ügyhöz tartozó.' });
  } catch (error) {
    logPrismaRouteError('POST /communications/:id/ignore', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'A kommunikáció megjelölése nem sikerült.' });
  }
});

router.post('/:id/unignore', authenticate, requireCommunicationsFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const guard = await requireCommunicationForTriage(String(req.params.id), res, userId);
    if (!guard) return;

    const row = await prisma.communication.findUnique({ where: { id: guard.id }, select: { metadata: true } });
    const meta = (row?.metadata && typeof row.metadata === 'object' ? { ...(row.metadata as Record<string, unknown>) } : {}) as Record<string, unknown>;
    delete meta.triage;

    const updated = await prisma.communication.update({
      where: { id: guard.id },
      data: { metadata: meta as any },
      select: { id: true, metadata: true },
    });

    res.json({ success: true, communication: updated, message: 'Kommunikáció visszaállítva feldolgozásra.' });
  } catch (error) {
    logPrismaRouteError('POST /communications/:id/unignore', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'A kommunikáció visszaállítása nem sikerült.' });
  }
});

export default router;
