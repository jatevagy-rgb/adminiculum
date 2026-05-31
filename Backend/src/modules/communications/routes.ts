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
import { authenticate } from '../../middleware/auth.js';
import { prisma } from '../../prisma/prisma.service.js';
import { buildPrismaErrorResponse } from '../../utils/prismaError.js';

const router = Router();

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
// GET /api/v1/communications - List communications (case-scoped or all)
// ============================================================================

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, clientId, type, documentId, limit = '50', offset = '0' } = req.query;

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

    const take = parseInt(String(limit), 10);
    const skip = parseInt(String(offset), 10);

    const loadCommunications = async (mode: 'full' | 'count-lite' | 'minimal') => {
      if (mode === 'minimal') {
        const rows = await prisma.communication.findMany({
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
            createdAt: true,
            updatedAt: true,
          },
        });
        return rows.map((row) => ({
          ...row,
          _count: { attachments: 0, relatedTasks: 0 },
        }));
      }

      if (mode === 'full') {
        return prisma.communication.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
          include: {
            _count: {
              select: { attachments: true, relatedTasks: true }
            }
          }
        });
      }

      // Fallback for staging schema drift: keep communications list available even if
      // a relation used by _count is temporarily missing.
      return prisma.communication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          _count: {
            select: { attachments: true }
          }
        }
      });
    };

    let communications: any[] = [];
    try {
      communications = await loadCommunications('full');
    } catch (error) {
      logPrismaRouteError('GET /communications full-query', error);
      try {
        communications = await loadCommunications('count-lite');
      } catch (fallbackError) {
        logPrismaRouteError('GET /communications count-lite-query', fallbackError);
        try {
          communications = await loadCommunications('minimal');
        } catch (minimalError) {
          logPrismaRouteError('GET /communications minimal-query', minimalError);
          // Staging-safe fallback: keep dashboard operational with empty list shape.
          communications = [];
        }
      }
    }

    let total = 0;
    try {
      total = await prisma.communication.count({ where });
    } catch (countError) {
      logPrismaRouteError('GET /communications count-total', countError);
      // Fallback when schema drift or data mismatch prevents count.
      total = communications.length;
    }

    res.json({
      communications,
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

router.get('/:id', authenticate, async (req: Request, res: Response) => {
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

router.post('/', authenticate, async (req: Request, res: Response) => {
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

router.post('/:id/link-case', authenticate, async (req: Request, res: Response) => {
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
// POST /api/v1/communications/:id/extract-task - Create task from communication
// ============================================================================

router.post('/:id/extract-task', authenticate, async (req: Request, res: Response) => {
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

router.post('/:id/extract-deadline', authenticate, async (req: Request, res: Response) => {
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

router.post('/:id/add-attachment', authenticate, async (req: Request, res: Response) => {
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

router.get('/:id/tasks', authenticate, async (req: Request, res: Response) => {
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

router.get('/:id/attachments', authenticate, async (req: Request, res: Response) => {
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

export default router;
