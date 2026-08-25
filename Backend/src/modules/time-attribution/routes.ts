import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireCaseReadAccess } from '../cases/authorization';
import { getCaseTimeSummary } from './service';

const router = Router();

function dates(req: Request): { periodStart?: Date; periodEnd?: Date; recentLimit?: number } {
  const parse = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('TIME_SUMMARY_PERIOD_INVALID');
    }
    return parsed;
  };
  const periodStart = parse(req.query.periodStart);
  const periodEnd = parse(req.query.periodEnd);
  const recentRaw = Number(req.query.recentLimit || 20);
  const recentLimit = Number.isInteger(recentRaw) && recentRaw > 0 ? Math.min(recentRaw, 50) : 20;
  return { periodStart, periodEnd, recentLimit };
}

/**
 * GET /api/v1/time-attribution/cases/:caseId
 * Case-scoped recorded-time summary with truthful attribution. EXACT_CASE +
 * TASK_DERIVED_CASE are the Case total; MATTER_ONLY and AMBIGUOUS are returned
 * separately and must never be treated as certain Case time.
 */
router.get('/cases/:caseId', authenticate, requireCaseReadAccess, async (req: Request, res: Response) => {
  try {
    const period = dates(req);
    const result = await getCaseTimeSummary({
      caseId: String(req.params.caseId),
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      recentLimit: period.recentLimit,
    });
    if (!result) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found.' });
      return;
    }
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'TIME_SUMMARY_PERIOD_INVALID') {
      res.status(400).json({ status: 400, code: 'TIME_SUMMARY_PERIOD_INVALID', message: 'periodStart/periodEnd must be valid ISO dates with periodStart before periodEnd.' });
      return;
    }
    res.status(500).json({ status: 500, code: 'TIME_ATTRIBUTION_ERROR', message: 'Time attribution summary could not be loaded.' });
  }
});

export default router;
