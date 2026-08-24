import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../prisma/prisma.service';
import { assertClientReadAccess, InteractionError } from '../client-interaction/base';
import { requireCaseReadAccess } from '../cases/authorization';
import { getCaseTimeSummary, getClientTimeSummary, getCurrentUserTimeSummary } from './service';

const router = Router();
const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const MAX_RECENT = 50;

function dates(req: Request) {
  const parse = (value: unknown) => {
    if (!value) return undefined;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) throw new InteractionError(400, 'TIME_SUMMARY_PERIOD_INVALID', 'periodStart and periodEnd must be valid ISO dates.');
    return parsed;
  };
  const periodStart = parse(req.query.periodStart);
  const periodEnd = parse(req.query.periodEnd);
  if (periodStart && periodEnd && periodStart >= periodEnd) throw new InteractionError(400, 'TIME_SUMMARY_PERIOD_INVALID', 'periodStart must be before periodEnd.');
  const requested = Number(req.query.recentLimit || 20);
  return { periodStart, periodEnd, recentLimit: Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_RECENT) : 20 };
}

function fail(res: Response, error: unknown) {
  if (error instanceof InteractionError) return res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
  return res.status(500).json({ status: 500, code: 'TIME_ECONOMICS_ERROR', message: 'Time summary could not be loaded.' });
}

router.get('/cases/:caseId/time-summary', authenticate, requireCaseReadAccess, async (req, res) => {
  try {
    const result = await getCaseTimeSummary({ caseId: String(req.params.caseId), ...dates(req) });
    if (!result) return res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found.' });
    return res.json(result);
  } catch (error) { return fail(res, error); }
});

router.get('/clients/:clientId/time-summary', authenticate, async (req, res) => {
  try {
    const actor = { userId: String(req.user?.userId || ''), role: req.user?.role || null };
    await assertClientReadAccess(actor, String(req.params.clientId), prisma);
    return res.json(await getClientTimeSummary({ clientId: String(req.params.clientId), includeLawyers: PRIVILEGED_ROLES.has(String(req.user?.role || '')), ...dates(req) }));
  } catch (error) { return fail(res, error); }
});

router.get('/me/time-summary', authenticate, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required.' });
  return res.json(await getCurrentUserTimeSummary(userId));
});

export default router;
