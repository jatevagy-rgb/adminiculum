/**
 * COMPANY WORKSPACE (Phase 4) — internal workforce routes.
 *
 * Mounted at /api/v1/company-workspace. Workforce-only (authenticate) + Client-
 * scoped reads via the canonical Phase 1-3 access posture. This is a read-only
 * projection surface — there are no write routes here and no customer route is
 * exposed. No new company publication scope is introduced.
 *
 * Distinct from the CP1 customer-facing `client-workspace` module.
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import * as workspace from './service';

export const companyWorkspaceRouter = Router();

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'COMPANY_WORKSPACE_INTERNAL_ERROR', message: 'Company workspace request failed.' });
}

companyWorkspaceRouter.use(authenticate);

companyWorkspaceRouter.get('/clients/:clientId/overview', async (req, res) => {
  try { res.json(await workspace.getWorkspaceOverview(actor(req), String(req.params.clientId))); } catch (e) { fail(res, e); }
});