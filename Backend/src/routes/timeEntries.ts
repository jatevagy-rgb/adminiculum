// ============================================================================
// TIME ENTRIES API ROUTES
// ============================================================================
//
// CRUD operations for TimeEntries (billable hours)
// Creates TimelineEvent when time is logged
// ============================================================================

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireWorkforceUser } from '../middleware/workforceAuthorization';
import { parseCanonicalStringId } from '../modules/tasks/canonicalStringId';
import { canUserActOnTask } from '../modules/tasks/taskAuthorization';
import { resolveTaskTimeAttribution, TaskTimeAttributionError } from '../modules/time-attribution/service';
import { prisma } from '../prisma/prisma.service';

const router = Router();
const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

function isPrivileged(req: Request): boolean {
  return Boolean(req.user?.role && PRIVILEGED_ROLES.has(req.user.role));
}

function getAuthenticatedUserId(req: Request): string | null {
  return req.user?.userId || null;
}

// ============================================================================
// GET /api/v1/time-entries - List time entries
// ============================================================================

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { matterId, userId, workType, startDate, endDate } = req.query;
    const requesterId = getAuthenticatedUserId(req);
    if (!requesterId) {
      return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
    }

    if (userId && String(userId) !== requesterId && !isPrivileged(req)) {
      return res.status(403).json({ status: 403, code: 'TIME_ENTRY_USER_SCOPE_FORBIDDEN', message: 'Time entry user filter is restricted.' });
    }

    const where: any = {};

    if (matterId) where.matterId = matterId;
    where.userId = userId ? String(userId) : requesterId;
    if (workType) where.workType = workType;
    
    if (startDate || endDate) {
      where.workDate = {};
      if (startDate) where.workDate.gte = new Date(startDate as string);
      if (endDate) where.workDate.lte = new Date(endDate as string);
    }

    const loadEntries = async (withCases: boolean) => {
      if (withCases) {
        return prisma.timeEntry.findMany({
          where,
          include: {
            matter: {
              select: {
                id: true,
                title: true,
                clientId: true,
                client: {
                  select: { id: true, name: true }
                },
                cases: {
                  select: {
                    id: true,
                    caseNumber: true,
                    title: true,
                    clientId: true,
                    clientName: true,
                    updatedAt: true,
                  },
                  orderBy: { updatedAt: 'desc' }
                }
              }
            },
            user: {
              select: { id: true, name: true }
            },
            department: {
              select: { id: true, name: true }
            }
          },
          orderBy: { workDate: 'desc' }
        });
      }

      // Fallback for partial staging schema drift where Matter.cases relation is unavailable.
      return prisma.timeEntry.findMany({
        where,
        include: {
          matter: {
            select: {
              id: true,
              title: true,
              clientId: true,
              client: {
                select: { id: true, name: true }
              },
            }
          },
          user: {
            select: { id: true, name: true }
          },
          department: {
            select: { id: true, name: true }
          }
        },
        orderBy: { workDate: 'desc' }
      });
    };

    let entries: any[];
    try {
      entries = await loadEntries(true);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const relationDrift =
        message.includes('cases') ||
        message.includes('unknown field') ||
        message.includes('unknown arg');
      if (!relationDrift) {
        throw error;
      }
      const fallbackEntries = await loadEntries(false);
      entries = fallbackEntries.map((entry: any) => ({
        ...entry,
        matter: entry.matter
          ? {
              ...entry.matter,
              cases: [],
            }
          : entry.matter,
      }));
    }

    res.json(entries);
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// ============================================================================
// GET /api/v1/time-entries/summary - Get time summary
// ============================================================================

router.get('/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { matterId, userId, departmentId, startDate, endDate } = req.query;
    const requesterId = getAuthenticatedUserId(req);
    if (!requesterId) {
      return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
    }
    if (userId && String(userId) !== requesterId && !isPrivileged(req)) {
      return res.status(403).json({ status: 403, code: 'TIME_ENTRY_USER_SCOPE_FORBIDDEN', message: 'Time entry user filter is restricted.' });
    }

    const where: any = {};
    if (matterId) where.matterId = matterId;
    where.userId = userId ? String(userId) : requesterId;
    if (departmentId) where.departmentId = departmentId;

    if (startDate || endDate) {
      where.workDate = {};
      if (startDate) where.workDate.gte = new Date(startDate as string);
      if (endDate) where.workDate.lte = new Date(endDate as string);
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        department: {
          select: { id: true, name: true }
        }
      }
    });

    // Group by department
    const byDepartment: Record<string, { name: string; minutes: number; count: number }> = {};
    let totalMinutes = 0;

    entries.forEach(entry => {
      totalMinutes += entry.minutes;
      
      const deptId = entry.departmentId || 'unassigned';
      if (!byDepartment[deptId]) {
        byDepartment[deptId] = {
          name: entry.department?.name || 'Nincs osztály',
          minutes: 0,
          count: 0
        };
      }
      byDepartment[deptId].minutes += entry.minutes;
      byDepartment[deptId].count++;
    });

    res.json({
      totalEntries: entries.length,
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(2),
      byDepartment: Object.entries(byDepartment).map(([id, data]) => ({
        departmentId: id === 'unassigned' ? null : id,
        departmentName: data.name,
        entries: data.count,
        minutes: data.minutes,
        hours: (data.minutes / 60).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Error fetching time summary:', error);
    res.status(500).json({ error: 'Failed to fetch time summary' });
  }
});

// ============================================================================
// GET /api/v1/time-entries/:id - Get single time entry
// ============================================================================

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      include: {
        matter: {
          include: {
            client: {
              select: { id: true, name: true }
            }
          }
        },
        user: {
          select: { id: true, name: true, email: true }
        },
        department: {
          select: { id: true, name: true }
        }
      }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    const requesterId = getAuthenticatedUserId(req);
    if (!requesterId || (entry.userId !== requesterId && !isPrivileged(req))) {
      return res.status(403).json({ status: 403, code: 'TIME_ENTRY_ACCESS_FORBIDDEN', message: 'Time entry is restricted.' });
    }

    res.json(entry);
  } catch (error) {
    console.error('Error fetching time entry:', error);
    res.status(500).json({ error: 'Failed to fetch time entry' });
  }
});

// ============================================================================
// POST /api/v1/time-entries - Create new time entry
// ============================================================================

router.post('/', authenticate, requireWorkforceUser, async (req: Request, res: Response) => {
  try {
    const {
      matterId,
      workType,
      description,
      minutes,
      workDate,
      departmentId,
      caseId,
      taskId,
    } = req.body;
    const resolvedUserId = getAuthenticatedUserId(req);
    if (!resolvedUserId) {
      return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
    }
    if (req.body?.userId && req.body.userId !== resolvedUserId) {
      return res.status(400).json({ status: 400, code: 'TIME_ENTRY_USER_ID_NOT_ACCEPTED', message: 'Time entries use the authenticated user only.' });
    }
    if (req.body?.documentId || req.body?.communicationId) {
      return res.status(400).json({ status: 400, code: 'TIME_ENTRY_CONTEXT_NOT_SUPPORTED', message: 'Document and communication time links are not supported.' });
    }

    if (!workType || !description || !minutes) {
      return res.status(400).json({
        error: 'Missing required fields: workType, description, minutes'
      });
    }

    let resolvedMatterId = typeof matterId === 'string' ? matterId : null;
    let resolvedCaseId = typeof caseId === 'string' ? caseId : null;
    let resolvedTaskId: string | null = null;
    let taskScopeAuthorized = false;
    if (taskId !== undefined && taskId !== null) {
      const canonicalTaskId = parseCanonicalStringId(taskId);
      if (!canonicalTaskId) {
        return res.status(400).json({ status: 400, code: 'INVALID_TASK_ID', message: 'taskId must be a valid identifier.' });
      }
      const taskScope = await resolveTaskTimeAttribution(canonicalTaskId);
      if (!taskScope) {
        return res.status(404).json({ status: 404, code: 'TASK_NOT_FOUND', message: 'Task not found.' });
      }
      const taskAccess = await canUserActOnTask({
        caseId: taskScope.caseId,
        assignedToId: taskScope.assignedToId,
        assignedById: taskScope.assignedById,
      }, resolvedUserId);
      if (!taskAccess.allowed) {
        return res.status(404).json({ status: 404, code: 'TASK_NOT_FOUND', message: 'Task not found.' });
      }
      if (resolvedCaseId && resolvedCaseId !== taskScope.caseId) {
        return res.status(400).json({ status: 400, code: 'TIME_ENTRY_TASK_CASE_MISMATCH', message: 'caseId does not match the task scope.' });
      }
      if (resolvedMatterId && resolvedMatterId !== taskScope.matterId) {
        return res.status(400).json({ status: 400, code: 'TIME_ENTRY_TASK_MATTER_MISMATCH', message: 'matterId does not match the task scope.' });
      }
      resolvedMatterId = taskScope.matterId;
      resolvedCaseId = taskScope.caseId;
      resolvedTaskId = taskScope.taskId;
      taskScopeAuthorized = true;
    }

    // Case-first: when a Case is given without a Task or an explicit Matter,
    // derive the compatibility Matter scope from the Case SERVER-SIDE so a lawyer
    // never selects a Matter manually. Never fabricate one — if the Case has no
    // resolvable Matter scope, reject with a clear, actionable state.
    if (!resolvedMatterId && resolvedCaseId) {
      const caseForMatter = await prisma.case.findUnique({
        where: { id: resolvedCaseId },
        select: { matterId: true },
      });
      if (!caseForMatter) {
        return res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found.' });
      }
      if (!caseForMatter.matterId) {
        return res.status(409).json({ status: 409, code: 'TIME_ENTRY_CASE_MATTER_UNRESOLVED', message: 'This case has no billing scope yet; it must be provisioned before time can be recorded.' });
      }
      resolvedMatterId = caseForMatter.matterId;
    }

    if (!resolvedMatterId) {
      return res.status(400).json({ error: 'Missing required field: matterId (or taskId)' });
    }

    // Map Hungarian workType labels to Prisma enum values
    const workTypeMap: Record<string, string> = {
      'TÁRGYALÁS': 'CLIENT_CALL',
      'TANÁCSADÁS': 'LEGAL_RESEARCH',
      'IRATELENÉS': 'DRAFTING',
      'FELÜLVIZSGÁLAT': 'REVIEW',
      'KOMMUNIKÁCIÓ': 'CLIENT_CALL',
      'KUTATÁS': 'LEGAL_RESEARCH',
      'EGYÉB': 'OTHER',
    };
    const mappedWorkType = workTypeMap[workType] || workType;

    // Validate matterId exists
    const matterExists = await prisma.matter.findUnique({ where: { id: resolvedMatterId }, select: { id: true } });
    if (!matterExists) {
      return res.status(400).json({ error: `Matter with id '${resolvedMatterId}' not found` });
    }
    if (resolvedCaseId) {
      const caseRecord = await prisma.case.findUnique({
        where: { id: resolvedCaseId },
        select: { id: true, matterId: true, assignedLawyerId: true, createdById: true },
      });
      if (!caseRecord || caseRecord.matterId !== resolvedMatterId) {
        return res.status(400).json({ status: 400, code: 'TIME_ENTRY_CASE_MATTER_MISMATCH', message: 'caseId must belong to the selected matter.' });
      }
      if (!taskScopeAuthorized) {
        const collaborator = await prisma.caseCollaborator.findFirst({
          where: { caseId: resolvedCaseId, userId: resolvedUserId },
          select: { id: true },
        });
        const canRecord =
          isPrivileged(req) ||
          caseRecord.assignedLawyerId === resolvedUserId ||
          caseRecord.createdById === resolvedUserId ||
          Boolean(collaborator);
        if (!canRecord) {
          return res.status(403).json({ status: 403, code: 'TIME_ENTRY_CASE_FORBIDDEN', message: 'You cannot record time on this case.' });
        }
      }
    }

    // Create time entry
    const entry = await prisma.timeEntry.create({
      data: {
        matterId: resolvedMatterId,
        taskId: resolvedTaskId,
        workType: mappedWorkType,
        description,
        minutes: parseInt(minutes),
        workDate: workDate ? new Date(workDate) : new Date(),
        departmentId,
        billable: true,
        userId: resolvedUserId
      },
      include: {
        matter: {
          select: { id: true, title: true }
        },
        user: {
          select: { id: true, name: true }
        },
        department: {
          select: { id: true, name: true }
        }
      }
    });

    // Update matter total minutes
    await prisma.matter.update({
      where: { id: resolvedMatterId },
      data: {
        totalMinutes: {
          increment: parseInt(minutes)
        }
      }
    });

    // If caseId provided, create timeline event
    if (resolvedCaseId) {
      await prisma.timelineEvent.create({
        data: {
          eventType: 'TIME_LOGGED',
          description: `${minutes} perc rögzítve: ${description}`,
          caseId: resolvedCaseId,
          userId: resolvedUserId,
          timeEntryId: entry.id,
          metadata: {
            minutes: parseInt(minutes),
            workType: mappedWorkType,
            matterId: resolvedMatterId,
            taskId: resolvedTaskId,
          }
        }
      });
    }

    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof TaskTimeAttributionError) {
      return res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    }
    console.error('Error creating time entry:', error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// ============================================================================
// PATCH /api/v1/time-entries/:id - Update time entry
// ============================================================================

router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { workType, description, minutes, workDate, departmentId, billable } = req.body;
    if (req.body?.userId || req.body?.taskId || req.body?.documentId || req.body?.communicationId || req.body?.caseId) {
      return res.status(400).json({ status: 400, code: 'TIME_ENTRY_CONTEXT_UPDATE_NOT_SUPPORTED', message: 'Time entry ownership and context cannot be changed here.' });
    }
    const requesterId = getAuthenticatedUserId(req);
    if (!requesterId) {
      return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
    }

    // Get original entry to calculate difference
    const original = await prisma.timeEntry.findUnique({
      where: { id }
    });

    if (!original) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    if (original.userId !== requesterId && !isPrivileged(req)) {
      return res.status(403).json({ status: 403, code: 'TIME_ENTRY_ACCESS_FORBIDDEN', message: 'Time entry is restricted.' });
    }

    // Map Hungarian workType labels to Prisma enum values (same map as POST)
    const workTypeMap: Record<string, string> = {
      'TÁRGYALÁS': 'CLIENT_CALL',
      'TANÁCSADÁS': 'LEGAL_RESEARCH',
      'IRATELENÉS': 'DRAFTING',
      'FELÜLVIZSGÁLAT': 'REVIEW',
      'KOMMUNIKÁCIÓ': 'CLIENT_CALL',
      'KUTATÁS': 'LEGAL_RESEARCH',
      'EGYÉB': 'OTHER',
    };
    const mappedWorkType = workType ? (workTypeMap[workType] || workType) : undefined;

    const minuteDiff = minutes ? parseInt(minutes) - original.minutes : 0;

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: {
        workType: mappedWorkType,
        description,
        minutes: minutes ? parseInt(minutes) : undefined,
        workDate: workDate ? new Date(workDate) : undefined,
        departmentId,
        billable: billable !== undefined ? billable : undefined,
      },
      include: {
        matter: {
          select: { id: true, title: true }
        },
        user: {
          select: { id: true, name: true }
        }
      }
    });

    // Update matter total if minutes changed
    if (minuteDiff !== 0) {
      await prisma.matter.update({
        where: { id: original.matterId },
        data: {
          totalMinutes: {
            increment: minuteDiff
          }
        }
      });
    }

    res.json(entry);
  } catch (error) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// ============================================================================
// DELETE /api/v1/time-entries/:id - Delete time entry
// ============================================================================

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const requesterId = getAuthenticatedUserId(req);
    if (!requesterId) {
      return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    if (entry.userId !== requesterId && !isPrivileged(req)) {
      return res.status(403).json({ status: 403, code: 'TIME_ENTRY_ACCESS_FORBIDDEN', message: 'Time entry is restricted.' });
    }

    // Delete entry
    await prisma.timeEntry.delete({
      where: { id }
    });

    // Update matter total
    await prisma.matter.update({
      where: { id: entry.matterId },
      data: {
        totalMinutes: {
          decrement: entry.minutes
        }
      }
    });

    res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
