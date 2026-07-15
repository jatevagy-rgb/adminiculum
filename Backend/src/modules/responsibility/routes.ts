import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { getWorkflowWorkload, WorkflowResponsibilityError } from './service';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required.' });
      return;
    }

    const scope = req.query.scope ? String(req.query.scope) : undefined;
    const normalizedScope = scope === 'TEAM' || scope === 'MY_CASES' || scope === 'MY_WORK' ? scope : 'MY_WORK';
    const result = await getWorkflowWorkload(
      { userId, role: req.user?.role },
      { scope: normalizedScope, caseId: req.query.caseId ? String(req.query.caseId) : undefined }
    );

    res.json(result);
  } catch (error) {
    if (error instanceof WorkflowResponsibilityError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    console.error('Get workflow workload error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
