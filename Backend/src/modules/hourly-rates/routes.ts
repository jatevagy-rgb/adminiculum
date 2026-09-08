import { Router } from 'express';
import { authenticate, requireRole, ROLES } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { appendRate, billingDate, getRateHistory } from './service';

const router = Router();
// Deliberately privileged for reads too: viewing hours does not grant rate access.
router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.PARTNER));
for (const route of ['/clients/:clientId', '/clients/:clientId/cases/:caseId']) {
  router.get(route, async (req, res) => {
    try {
      const result = await getRateHistory({ clientId: String(req.params.clientId), caseId: req.params.caseId ? String(req.params.caseId) : null },
        { userId: req.user!.userId, role: req.user!.role }, req.query.workDate === undefined ? billingDate() : req.query.workDate as string);
      res.json(result);
    } catch (error) { respond(error, res); }
  });
  router.post(route, async (req, res) => {
    try {
      const result = await appendRate({ clientId: String(req.params.clientId), caseId: req.params.caseId ? String(req.params.caseId) : null },
        { userId: req.user!.userId, role: req.user!.role }, req.body);
      res.status(201).json(result);
    } catch (error) { respond(error, res); }
  });
}

function respond(error: unknown, res: import('express').Response) {
  if (error instanceof InteractionError) return res.status(error.status).json({ code: error.code, message: error.message });
  console.error('Hourly rate operation failed', error);
  return res.status(500).json({ code: 'RATE_INTERNAL_ERROR', message: 'Az óradíj most nem érhető el. Próbálja újra később.' });
}
export default router;
