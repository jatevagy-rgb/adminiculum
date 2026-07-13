/**
 * Intake Queue Routes — WORKFLOW-CORE-INTAKE-MATTER-OPENING-1
 *
 * One canonical authenticated internal intake queue. Bounded, deterministic,
 * no inaccessible-case leakage, no sensitive identity detail, backend-derived
 * blockers/next steps. TEAM scope only for privileged roles.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { getIntakeQueue, IntakeServiceError } from '../cases/intakeService';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const queue = await getIntakeQueue({
      actor: { userId, role: req.user?.role },
      scope: req.query.scope,
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(queue);
  } catch (error) {
    if (error instanceof IntakeServiceError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    console.error('Get intake queue error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
