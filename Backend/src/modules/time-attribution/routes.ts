import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess } from '../cases/authorization';
import { getCaseTimeAttributionSummary } from './service';

const router = Router();

router.get(
  '/cases/:caseId',
  authenticate,
  requireWorkforceUser,
  requireCaseReadAccess,
  async (req: Request, res: Response) => {
    try {
      const summary = await getCaseTimeAttributionSummary(String(req.params.caseId));
      if (!summary) {
        return res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      }
      return res.json(summary);
    } catch (error) {
      console.error('Error resolving case time attribution:', error);
      return res.status(500).json({ status: 500, code: 'TIME_ATTRIBUTION_UNAVAILABLE', message: 'Case time attribution is unavailable.' });
    }
  },
);

export default router;
