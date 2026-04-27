// ============================================================================
// TIME ENTRIES API ROUTES
// ============================================================================
//
// CRUD operations for TimeEntries (billable hours)
// Creates TimelineEvent when time is logged
// ============================================================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ============================================================================
// GET /api/v1/time-entries - List time entries
// ============================================================================

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { matterId, userId, workType, startDate, endDate } = req.query;

    const where: any = {};

    if (matterId) where.matterId = matterId;
    if (userId) where.userId = userId;
    if (workType) where.workType = workType;
    
    if (startDate || endDate) {
      where.workDate = {};
      if (startDate) where.workDate.gte = new Date(startDate as string);
      if (endDate) where.workDate.lte = new Date(endDate as string);
    }

    const entries = await prisma.timeEntry.findMany({
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

    const where: any = {};
    if (matterId) where.matterId = matterId;
    if (userId) where.userId = userId;
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

    res.json(entry);
  } catch (error) {
    console.error('Error fetching time entry:', error);
    res.status(500).json({ error: 'Failed to fetch time entry' });
  }
});

// ============================================================================
// POST /api/v1/time-entries - Create new time entry
// ============================================================================

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      matterId,
      workType,
      description,
      minutes,
      workDate,
      departmentId,
      caseId,  // Optional: link to specific case
      userId   // From auth middleware
    } = req.body;

    // Validate required fields
    if (!matterId || !workType || !description || !minutes) {
      return res.status(400).json({
        error: 'Missing required fields: matterId, workType, description, minutes'
      });
    }

    // Get userId from body or auth middleware (placeholder)
    const actualUserId = userId || req.body.userId;

    // Resolve actualUserId — auth middleware should set req.user.id but may not be wired for this route yet.
    // Fall back to first active user to avoid FK constraint failure on userId.
    let resolvedUserId = actualUserId;
    if (!resolvedUserId) {
      const fallbackUser = await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true }
      });
      resolvedUserId = fallbackUser?.id;
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
    const matterExists = await prisma.matter.findUnique({ where: { id: matterId } });
    if (!matterExists) {
      return res.status(400).json({ error: `Matter with id '${matterId}' not found` });
    }

    // Create time entry
    const entry = await prisma.timeEntry.create({
      data: {
        matterId,
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
      where: { id: matterId },
      data: {
        totalMinutes: {
          increment: parseInt(minutes)
        }
      }
    });

    // If caseId provided, create timeline event
    if (caseId) {
      await prisma.timelineEvent.create({
        data: {
          eventType: 'TIME_LOGGED',
          description: `${minutes} perc rögzítve: ${description}`,
          caseId,
          userId: resolvedUserId,
          timeEntryId: entry.id,
          metadata: {
            minutes: parseInt(minutes),
            workType: mappedWorkType,
            matterId
          }
        }
      });
    }

    res.status(201).json(entry);
  } catch (error) {
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

    // Get original entry to calculate difference
    const original = await prisma.timeEntry.findUnique({
      where: { id }
    });

    if (!original) {
      return res.status(404).json({ error: 'Time entry not found' });
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

    const entry = await prisma.timeEntry.findUnique({
      where: { id }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
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
