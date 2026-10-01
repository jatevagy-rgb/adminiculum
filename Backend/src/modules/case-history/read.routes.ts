import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { readInternalCaseHistory } from './read.service';

/** Integrator mount: /api/v1/case-history (not mounted by this owned leaf). */
export const caseHistoryReadRouter = Router();
caseHistoryReadRouter.use(authenticate);

caseHistoryReadRouter.get('/cases/:caseId', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit === undefined ? 30 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ status: 400, code: 'INVALID_LIMIT', message: 'Limit must be 1–100.' });
      return;
    }
    const cursor = req.query.cursor === undefined ? null : String(req.query.cursor);
    if (cursor && !/^(timeline|time):[a-zA-Z0-9_-]+$/.test(cursor)) {
      res.status(400).json({ status: 400, code: 'INVALID_CURSOR', message: 'Invalid history cursor.' });
      return;
    }
    res.json(await readInternalCaseHistory(
      { userId: String(req.user?.userId || ''), role: req.user?.role },
      String(req.params.caseId || ''), { limit, cursor },
    ));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    if (error instanceof Error && error.message === 'Invalid history cursor') {
      res.status(400).json({ status: 400, code: 'INVALID_CURSOR', message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'CASE_HISTORY_READ_ERROR', message: 'Case history could not be loaded.' });
  }
});
