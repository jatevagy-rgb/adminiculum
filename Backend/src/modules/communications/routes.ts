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

import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';
import { prisma } from '../../prisma/prisma.service';
import { buildPrismaErrorResponse } from '../../utils/prismaError';

const router = Router();
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
};

type CommunicationListItem = Omit<CommunicationListRow, 'content' | 'createdAt' | 'updatedAt'> & {
  contentPreview: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
  sourceTaskCount: number;
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
  sourceTaskCounts: Map<string, number>
): CommunicationListItem {
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
    documentId: row.documentId,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attachmentCount: attachmentCounts.get(row.id) || 0,
    sourceTaskCount: sourceTaskCounts.get(row.id) || 0,
  };
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
        },
      }) as CommunicationListRow[];
    } catch (error) {
      logPrismaRouteError('GET /communications scalar-list-query', error);
      rows = [];
    }

    const rowIds = rows.map((row) => row.id);
    let attachmentCounts = new Map<string, number>();
    let sourceTaskCounts = new Map<string, number>();

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
    }

    let total = 0;
    try {
      total = await prisma.communication.count({ where });
    } catch (countError) {
      logPrismaRouteError('GET /communications count-total', countError);
      total = rows.length;
    }

    res.json({
      communications: rows.map((row) => mapCommunicationListItem(row, attachmentCounts, sourceTaskCounts)),
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

    res.json(communication);
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
      where: { id: caseId }
    });

    if (!caseData) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const communication = await prisma.communication.update({
      where: { id: String(id) },
      data: { caseId }
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
const DEFAULT_CASE_STATUS = 'CLIENT_INPUT';
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
  const clientNameInput = typeof body.clientName === 'string' ? body.clientName.trim() : '';
  const description = typeof body.description === 'string' && body.description.trim() ? body.description : undefined;
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

      const resolvedClientId = clientIdInput || (communication.clientId || '');
      if (!resolvedClientId) {
        throw new CreateCaseFromCommunicationError(
          400,
          'VALIDATION_ERROR',
          'A client is required: provide clientId or use a communication that already has a clientId',
        );
      }

      const client = await tx.client.findUnique({ where: { id: resolvedClientId }, select: { id: true, name: true } });
      if (!client) {
        throw new CreateCaseFromCommunicationError(400, 'CLIENT_NOT_FOUND', 'Client not found');
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, isActive: true },
      });
      if (!user) {
        throw new CreateCaseFromCommunicationError(401, 'NOT_AUTHENTICATED', 'Authenticated user not found');
      }
      if (user.status !== 'ACTIVE' || user.isActive === false) {
        throw new CreateCaseFromCommunicationError(403, 'USER_INACTIVE', 'Authenticated user is inactive');
      }

      const matterType = VALID_CASE_MATTER_TYPES.includes(matterTypeRaw) ? matterTypeRaw : DEFAULT_CASE_MATTER_TYPE;
      const priority = VALID_CASE_PRIORITIES.includes(priorityRaw) ? priorityRaw : 'MEDIUM';
      const resolvedClientName = clientNameInput || client.name;

      const year = new Date().getFullYear();
      const count = await tx.case.count();
      const caseNumber = `CASE-${year}-${String(count + 1).padStart(3, '0')}`;

      const newCase = await tx.case.create({
        data: {
          caseNumber,
          title,
          clientName: resolvedClientName,
          matterType: matterType as any,
          caseType: 'OTHER' as any,
          description,
          status: DEFAULT_CASE_STATUS as any,
          priority: priority as any,
          deadline: deadline || undefined,
          sharepointSite: 'Adminiculum - Legal Workflow',
          sharepointRoot: `/sites/AdminiculumLegalWorkflow/Cases/${caseNumber}`,
          createdById: user.id,
          clientId: client.id,
        } as any,
      });

      await tx.communication.update({
        where: { id: String(id) },
        data: { caseId: newCase.id },
      });

      await tx.timelineEvent.create({
        data: {
          caseId: newCase.id,
          userId: user.id,
          eventType: 'CASE_CREATED',
          type: 'CASE_CREATED',
          payload: {
            caseNumber,
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
          userId: user.id,
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
            assignedById: user.id,
            dueDate: taskDue && !Number.isNaN(taskDue.getTime()) ? taskDue : undefined,
            sourceCommunicationId: communication.id,
          } as any,
        });

        await tx.timelineEvent.create({
          data: {
            caseId: newCase.id,
            userId: user.id,
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
    const { 
      title, description, type, priority, dueDate, assignedTo, caseId 
    } = req.body;

    // Get communication
    const communication = await prisma.communication.findUnique({
      where: { id: String(id) }
    });

    if (!communication) {
      res.status(404).json({ error: 'Communication not found' });
      return;
    }

    const targetCaseId = caseId || communication.caseId;
    if (!targetCaseId) {
      res.status(400).json({ error: 'Communication must be linked to a case first' });
      return;
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        title: title || `Task from: ${communication.subject}`,
        description: description || communication.summary || communication.content?.substring(0, 500),
        taskType: type || 'OTHER',
        type: type || 'OTHER',
        status: 'TODO',
        priority: priority || 'MEDIUM',
        caseId: targetCaseId,
        assignedToId: assignedTo,
        assignedById: userId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        sourceCommunicationId: String(id)
      } as any
    });

    // Link task to communication
    await prisma.communication.update({
      where: { id: String(id) },
      data: {
        relatedTasks: {
          connect: { id: task.id }
        }
      }
    });

    // Create timeline event
    await createTimelineEvent({
      caseId: targetCaseId,
      userId,
      eventType: 'TASK_CREATED',
      payload: {
        taskId: task.id,
        title: task.title,
        source: 'communication',
        communicationId: communication.id
      }
    });

    res.status(201).json({ 
      success: true, 
      task,
      message: 'Task created from communication'
    });
  } catch (error) {
    console.error('Error creating task from communication:', error);
    res.status(500).json({ error: 'Error creating task from communication' });
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

    const targetCaseId = caseId || communication.caseId;
    if (!targetCaseId) {
      res.status(400).json({ error: 'Communication must be linked to a case first' });
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

const OUTLOOK_PREVIEW_LIMIT = 240;

function normalizeEmailAddress(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseOutlookDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function outlookPreview(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > OUTLOOK_PREVIEW_LIMIT ? `${compact.slice(0, OUTLOOK_PREVIEW_LIMIT - 1)}…` : compact;
}

type NormalizedOutlookAttachment = {
  providerAttachmentId: string | null;
  fileName: string | null;
  fileType: string | null;
  sizeBytes: number | null;
};

type NormalizedOutlookMessage = {
  valid: boolean;
  invalidReason?: string;
  externalMessageId: string | null;
  providerConversationId: string | null;
  mailboxAddress: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  subject: string;
  sender: string | null;
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  receivedAt: string | null;
  sentAt: string | null;
  contentPreview: string | null;
  metadata: { provider: string; hasAttachments: boolean; attachmentCount: number };
  attachments: NormalizedOutlookAttachment[];
};

// Shared normalization used by BOTH the dry-run and the (gated) write import so
// they apply identical rules. Pure: no DB access, no Graph calls, no AI.
// Direction is a transparent derivation (sender==mailbox -> OUTBOUND, else INBOUND).
function normalizeOutlookMessage(raw: any, mailboxNorm: string, mailboxAddress: string): NormalizedOutlookMessage {
  const msg = (raw || {}) as Record<string, any>;
  const externalMessageId = typeof msg.externalMessageId === 'string' ? msg.externalMessageId.trim() : '';
  const subject = typeof msg.subject === 'string' ? msg.subject.trim() : '';
  const sender = typeof msg.sender === 'string' ? msg.sender.trim() : '';

  let invalidReason: string | undefined;
  if (!externalMessageId) invalidReason = 'Missing externalMessageId';
  else if (!subject) invalidReason = 'Missing subject';
  const valid = !invalidReason;

  const senderNorm = normalizeEmailAddress(sender);
  const direction: 'INBOUND' | 'OUTBOUND' | null = !sender
    ? null
    : mailboxNorm && senderNorm === mailboxNorm
      ? 'OUTBOUND'
      : 'INBOUND';

  const recipientsIn = (msg.recipients || {}) as Record<string, any>;
  const recipients = {
    to: toStringArray(recipientsIn.to),
    cc: toStringArray(recipientsIn.cc),
    bcc: toStringArray(recipientsIn.bcc),
  };

  const rawAttachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  const attachments: NormalizedOutlookAttachment[] = rawAttachments
    .filter((a: any) => a && typeof a === 'object')
    .map((a: any) => ({
      providerAttachmentId: typeof a.providerAttachmentId === 'string' ? a.providerAttachmentId : null,
      fileName: typeof a.name === 'string' ? a.name : null,
      fileType: typeof a.contentType === 'string' ? a.contentType : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? a.sizeBytes : null,
    }));

  return {
    valid,
    invalidReason,
    externalMessageId: externalMessageId || null,
    providerConversationId: typeof msg.providerConversationId === 'string' ? msg.providerConversationId : null,
    mailboxAddress: mailboxAddress || null,
    direction,
    subject,
    sender: sender || null,
    recipients,
    receivedAt: typeof msg.receivedAt === 'string' ? msg.receivedAt : null,
    sentAt: typeof msg.sentAt === 'string' ? msg.sentAt : null,
    contentPreview: outlookPreview(msg.bodyPreview),
    metadata: {
      provider: 'outlook',
      hasAttachments: Boolean(msg.hasAttachments) || attachments.length > 0,
      attachmentCount: attachments.length,
    },
    attachments,
  };
}

type OutlookDryRunItem = {
  externalMessageId: string | null;
  providerConversationId: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  wouldImport: boolean;
  duplicate: boolean;
  valid: boolean;
  invalidReason?: string;
  communicationPreview: Record<string, unknown> | null;
  attachmentPreviews: Array<Record<string, unknown>>;
};

router.post('/outlook/import-dry-run', authenticate, requireOutlookImportFoundation, async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as Record<string, any>;
    const mailboxAddress = typeof body.mailboxAddress === 'string' ? body.mailboxAddress.trim() : '';
    const messages = body.messages;

    if (!Array.isArray(messages)) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing or invalid field: messages (array required)' });
      return;
    }

    const mailboxNorm = normalizeEmailAddress(mailboxAddress);

    // First pass: normalize + validate (no DB access). Uses the shared normalizer.
    const normalized = messages.map((raw: any): OutlookDryRunItem => {
      const n = normalizeOutlookMessage(raw, mailboxNorm, mailboxAddress);
      const communicationPreview = n.valid
        ? {
            type: 'EMAIL',
            source: 'OUTLOOK',
            syncStatus: 'PENDING',
            externalMessageId: n.externalMessageId,
            providerConversationId: n.providerConversationId,
            mailboxAddress: n.mailboxAddress,
            direction: n.direction,
            subject: n.subject,
            sender: n.sender,
            recipients: n.recipients,
            receivedAt: n.receivedAt,
            sentAt: n.sentAt,
            contentPreview: n.contentPreview,
            metadata: n.metadata,
          }
        : null;

      return {
        externalMessageId: n.externalMessageId,
        providerConversationId: n.providerConversationId,
        direction: n.direction,
        wouldImport: false, // resolved after read-only dedupe
        duplicate: false,
        valid: n.valid,
        invalidReason: n.invalidReason,
        communicationPreview,
        attachmentPreviews: n.attachments,
      };
    });

    // Read-only duplicate detection by externalMessageId. NO writes.
    const candidateIds = Array.from(
      new Set(normalized.filter((n) => n.valid && n.externalMessageId).map((n) => n.externalMessageId as string)),
    );

    let existingIds = new Set<string>();
    if (candidateIds.length > 0) {
      try {
        const existing = await prisma.communication.findMany({
          where: { externalMessageId: { in: candidateIds } } as any,
          select: { externalMessageId: true } as any,
        });
        existingIds = new Set(
          (existing as unknown as Array<{ externalMessageId: string | null }>)
            .map((r) => r.externalMessageId)
            .filter((v): v is string => typeof v === 'string'),
        );
      } catch (error) {
        logPrismaRouteError('POST /communications/outlook/import-dry-run dedupe', error);
        // Read-only failure: surface honestly rather than pretend uniqueness.
        res.status(500).json({ error: 'Error checking existing communications for dry-run' });
        return;
      }
    }

    for (const item of normalized) {
      if (!item.valid) continue;
      const dup = item.externalMessageId ? existingIds.has(item.externalMessageId) : false;
      item.duplicate = dup;
      item.wouldImport = !dup;
    }

    const summary = {
      received: normalized.length,
      new: normalized.filter((n) => n.valid && n.wouldImport).length,
      duplicates: normalized.filter((n) => n.valid && n.duplicate).length,
      invalid: normalized.filter((n) => !n.valid).length,
    };

    res.json({
      success: true,
      dryRun: true,
      mailboxAddress: mailboxAddress || null,
      summary,
      items: normalized.map((n) => ({
        externalMessageId: n.externalMessageId,
        providerConversationId: n.providerConversationId,
        direction: n.direction,
        wouldImport: n.wouldImport,
        duplicate: n.duplicate,
        valid: n.valid,
        ...(n.invalidReason ? { invalidReason: n.invalidReason } : {}),
        communicationPreview: n.communicationPreview,
        attachmentPreviews: n.attachmentPreviews,
      })),
    });
  } catch (error) {
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
//
// Transaction: all NEW communications + their attachments are written in a single
// batch transaction (all-or-nothing on a genuine DB error -> 500, no partial
// commit, no fake success). Validation-invalid messages are filtered out BEFORE
// the transaction, so they neither write nor block valid messages; duplicates are
// skipped without writing.
// ============================================================================

router.post('/outlook/import', authenticate, requireOutlookImportFoundation, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const body = (req.body || {}) as Record<string, any>;
    const mailboxAddress = typeof body.mailboxAddress === 'string' ? body.mailboxAddress.trim() : '';
    const messages = body.messages;

    if (!Array.isArray(messages)) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing or invalid field: messages (array required)' });
      return;
    }

    const mailboxNorm = normalizeEmailAddress(mailboxAddress);
    const normalized = messages.map((raw: any) => normalizeOutlookMessage(raw, mailboxNorm, mailboxAddress));

    // Read-only dedupe: existing externalMessageId -> existing communication id.
    const candidateIds = Array.from(
      new Set(normalized.filter((n) => n.valid && n.externalMessageId).map((n) => n.externalMessageId as string)),
    );
    const existingById = new Map<string, string>();
    if (candidateIds.length > 0) {
      try {
        const existing = await prisma.communication.findMany({
          where: { externalMessageId: { in: candidateIds } } as any,
          select: { id: true, externalMessageId: true } as any,
        });
        for (const row of existing as unknown as Array<{ id: string; externalMessageId: string | null }>) {
          if (row.externalMessageId) existingById.set(row.externalMessageId, row.id);
        }
      } catch (error) {
        logPrismaRouteError('POST /communications/outlook/import dedupe', error);
        res.status(500).json({ error: 'Error checking existing communications for import' });
        return;
      }
    }

    // New (non-duplicate, valid) messages to import.
    const toImport = normalized.filter(
      (n) => n.valid && n.externalMessageId && !existingById.has(n.externalMessageId),
    );

    const importedIds = new Map<string, string>();
    if (toImport.length > 0) {
      try {
        await prisma.$transaction(async (tx: any) => {
          for (const n of toImport) {
            const created = await tx.communication.create({
              data: {
                type: 'EMAIL',
                source: 'OUTLOOK',
                syncStatus: 'IMPORTED',
                externalMessageId: n.externalMessageId,
                providerConversationId: n.providerConversationId,
                mailboxAddress: n.mailboxAddress,
                direction: n.direction || undefined,
                subject: n.subject,
                senderEmail: n.sender,
                content: null, // full body is not fetched in the mock import
                summary: n.contentPreview, // provider bodyPreview only
                receivedAt: parseOutlookDate(n.receivedAt),
                sentAt: parseOutlookDate(n.sentAt),
                importedAt: new Date(),
                recipients: n.recipients,
                metadata: n.metadata,
                createdById: userId,
                // caseId / clientId / documentId intentionally left null (no relationship inference)
              } as any,
            });
            importedIds.set(n.externalMessageId as string, created.id);

            // Attachment metadata only — no binaries. Dedupe non-null provider ids within the message.
            const seen = new Set<string>();
            for (const att of n.attachments) {
              if (att.providerAttachmentId) {
                if (seen.has(att.providerAttachmentId)) continue;
                seen.add(att.providerAttachmentId);
              }
              await tx.communicationAttachment.create({
                data: {
                  communicationId: created.id,
                  fileName: att.fileName || att.providerAttachmentId || 'attachment',
                  fileType: att.fileType || undefined,
                  providerAttachmentId: att.providerAttachmentId || undefined,
                  sizeBytes: att.sizeBytes ?? undefined,
                  uploadedById: userId,
                } as any,
              });
            }
          }
        }, { timeout: 120000, maxWait: 120000 });
      } catch (error) {
        logPrismaRouteError('POST /communications/outlook/import write', error);
        res.status(500).json({ error: 'Error importing communications' });
        return;
      }
    }

    const items = normalized.map((n) => {
      if (!n.valid) {
        return {
          externalMessageId: n.externalMessageId,
          communicationId: null,
          imported: false,
          duplicate: false,
          valid: false,
          ...(n.invalidReason ? { invalidReason: n.invalidReason } : {}),
          direction: n.direction,
        };
      }
      const ext = n.externalMessageId as string;
      if (existingById.has(ext)) {
        return {
          externalMessageId: ext,
          communicationId: existingById.get(ext) as string,
          imported: false,
          duplicate: true,
          valid: true,
          direction: n.direction,
        };
      }
      return {
        externalMessageId: ext,
        communicationId: importedIds.get(ext) || null,
        imported: true,
        duplicate: false,
        valid: true,
        direction: n.direction,
      };
    });

    const summary = {
      received: normalized.length,
      imported: items.filter((i) => i.imported).length,
      duplicates: items.filter((i) => i.duplicate).length,
      invalid: normalized.filter((n) => !n.valid).length,
    };

    res.status(201).json({
      success: true,
      dryRun: false,
      mailboxAddress: mailboxAddress || null,
      summary,
      items,
    });
  } catch (error) {
    logPrismaRouteError('POST /communications/outlook/import', error);
    res.status(500).json({ error: 'Error importing Outlook communications' });
  }
});

export default router;
