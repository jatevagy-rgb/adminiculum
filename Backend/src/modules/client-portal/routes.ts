/**
 * Disabled Client Portal route skeleton.
 *
 * This module intentionally exposes no client-visible data while the portal is
 * quarantined. Authentication runs first, then the runtime-readiness gate blocks
 * every authenticated request before Prisma, services, mappers, uploads,
 * downloads, messages, or document content can be reached.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireClientPortalRuntimeReady } from './featureGate';

const router = Router();

router.use(authenticate);
router.use(requireClientPortalRuntimeReady);

export default router;
