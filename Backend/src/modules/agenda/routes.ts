import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { AgendaRequestError, getWorkflowAgenda } from './service';

const router = Router();

function getUserId(req: Request): string | null {
  const userId = (req as any).user?.userId;
  return typeof userId === 'string' && userId.trim().length > 0 ? userId : null;
}

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }

    const agenda = await getWorkflowAgenda({
      userId,
      scope: req.query.scope,
      status: req.query.status,
      caseId: req.query.caseId ? String(req.query.caseId) : undefined,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(agenda);
  } catch (error) {
    if (error instanceof AgendaRequestError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    console.error('Get agenda error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
