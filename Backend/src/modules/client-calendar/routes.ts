/**
 * CLIENT CALENDAR — internal workforce read-only projection.
 * Mounted at /api/v1/client-calendar. Workforce auth + client-scoped reads
 * via the canonical client-interaction access helpers.
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { getClientCalendar } from './service';

export const clientCalendarRouter = Router();

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  console.error('Client calendar error:', error);
  res.status(500).json({ status: 500, code: 'CALENDAR_INTERNAL_ERROR', message: 'Client calendar request failed.' });
}

clientCalendarRouter.use(authenticate);

clientCalendarRouter.get('/clients/:clientId', async (req, res) => {
  try {
    res.json(await getClientCalendar(actor(req), String(req.params.clientId), { from: req.query.from, to: req.query.to }));
  } catch (e) {
    fail(res, e);
  }
});
