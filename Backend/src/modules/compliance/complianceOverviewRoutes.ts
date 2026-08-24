import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { getComplianceOverview } from './complianceOverviewService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

router.use(authenticate);

router.get('/clients/:clientId/overview', async (req, res: Response) => {
  try {
    res.json(await getComplianceOverview(actor(req), String(req.params.clientId)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_OVERVIEW_INTERNAL_ERROR', message: 'Compliance overview request failed.' });
  }
});

export default router;
