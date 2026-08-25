import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { authenticate, requireRole } from '../../middleware/auth';
import { getWorkloadForUser, getTeamWorkload } from './service';

const router = Router();

/**
 * GET /api/v1/capacity/me
 * Individual workload projection for the authenticated user.
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user?.userId || '');
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required.' });
      return;
    }
    res.json(await getWorkloadForUser(userId));
  } catch {
    res.status(500).json({ status: 500, code: 'CAPACITY_ERROR', message: 'Workload projection could not be loaded.' });
  }
});

/**
 * GET /api/v1/capacity/team
 * Management/team aggregation. ADMIN/PARTNER only. Safely aggregated.
 */
router.get('/team', authenticate, requireRole('ADMIN', 'PARTNER'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const workforce = await prisma.user.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        role: { in: ['LAWYER', 'COLLAB_LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT'] },
      },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    const rows = await getTeamWorkload(workforce.map((u) => u.id));
    res.json({ items: rows });
  } catch {
    res.status(500).json({ status: 500, code: 'CAPACITY_ERROR', message: 'Workload projection could not be loaded.' });
  }
});

export default router;
