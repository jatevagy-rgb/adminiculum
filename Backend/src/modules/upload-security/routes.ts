/**
 * SEC-2: Upload-security internal readiness endpoint.
 *
 * Lets operations distinguish SCANNER_CONFIGURED vs SCANNER_UNAVAILABLE without
 * exposing any credential, endpoint URL, or provider internals. Workforce-only.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { scannerReadiness } from './scannerAdapter';

const router = Router();
router.use(authenticate, requireWorkforceUser);

/**
 * GET /api/v1/upload-security/scanner-readiness
 * Returns only { configured, provider } — provider is a stable label
 * ('HTTP' | 'NONE' | 'DEV_MOCK'), never a URL/key/provider internal.
 */
router.get('/scanner-readiness', (_req: Request, res: Response) => {
  const readiness = scannerReadiness();
  res.json({
    configured: readiness.configured,
    provider: readiness.provider,
    status: readiness.configured ? 'SCANNER_CONFIGURED' : 'SCANNER_UNAVAILABLE',
  });
});

export default router;

