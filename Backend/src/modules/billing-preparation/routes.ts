import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { assertInternalCaseAccess, InteractionError } from '../client-interaction/base';
import { getCaseBillingPreparation } from './service';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// GET /api/v1/billing-preparation/case/:caseId — workforce-only, internal.
// Never projected to a Client: requires an active workforce user with case
// access (ADMIN/PARTNER or creator/assigned/collaborator).
router.get('/case/:caseId', authenticate, requireWorkforceUser, async (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    await assertInternalCaseAccess(actor(req), caseId);
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    const preparation = await getCaseBillingPreparation(caseId, { startDate, endDate });
    if (!preparation) {
      return res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found.' });
    }
    res.json(preparation);
  } catch (error) {
    if (error instanceof InteractionError) {
      return res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    }
    console.error('Error preparing case billing:', error);
    res.status(500).json({ status: 500, code: 'BILLING_PREPARATION_INTERNAL_ERROR', message: 'Billing preparation failed.' });
  }
});

export default router;
