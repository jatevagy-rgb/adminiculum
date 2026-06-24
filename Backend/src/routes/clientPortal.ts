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

import { Router } from 'express';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../middleware/featureAvailability';

const router = Router();

router.use(
  requireDatabaseFoundation({
    feature: 'CLIENT_PORTAL',
    enabled: () => isDatabaseFoundationEnabled('ENABLE_CLIENT_PORTAL'),
    message: 'The client portal is not available in this environment.',
    reason: 'CLIENT_PORTAL_NOT_ENABLED',
    nextStep:
      'Client portal requires a separate authenticated implementation before it can be enabled.',
  })
);

export default router;
