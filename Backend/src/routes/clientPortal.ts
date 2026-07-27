/**
 * Client Portal routes — RC2F security patch
 *
 * The client portal is a future product track requiring a separate
 * authentication implementation (email-code, not Azure AD / local JWT).
 * Until ENABLE_CLIENT_PORTAL=true is set alongside that implementation,
 * every request to /api/v1/client-portal/* returns 501 FEATURE_NOT_AVAILABLE.
 *
 * The previous placeholder code used an x-user-id header with no JWT
 * verification, which created an unauthenticated data-access path. That
 * code has been removed. No Prisma queries run while the feature is disabled.
 */

import { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  ClientPublicationError,
  portalHomeSnapshot,
} from '../modules/client-publication/publicationService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof ClientPublicationError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_PORTAL_INTERNAL_ERROR', message: 'Client portal request failed.' });
}

router.get('/home', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await portalHomeSnapshot(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.all('*', async (_req, res) => {
  res.status(501).json({
    status: 501,
    code: 'FEATURE_NOT_AVAILABLE',
    feature: 'CLIENT_PORTAL',
    reason: 'CLIENT_PORTAL_NOT_ENABLED',
    message: 'The client portal is not available in this environment.',
    nextStep: 'Client portal reads and actions remain disabled until a separate portal authentication boundary is enabled.',
  });
});

export default router;
