/**
 * Disabled Client Portal route skeleton + inert V1 route matrix.
 *
 * This module intentionally exposes no client-visible data while the portal is
 * quarantined. Authentication runs first, then the runtime-readiness gate blocks
 * every authenticated request before Prisma, services, mappers, uploads,
 * downloads, messages, or document content can be reached.
 *
 * The V1 route matrix below makes the future API surface explicit, but every
 * handler is an inert disabled fallback: the runtime-ready gate above already
 * returns 501 before any handler runs, and the handlers themselves call no
 * service, no mapper, no Prisma, and touch no data.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireClientPortalRuntimeReady } from './featureGate';
import { sendFeatureUnavailable } from '../../middleware/featureAvailability';
import { CLIENT_PORTAL_FEATURE, CLIENT_PORTAL_NOT_ENABLED_REASON } from './types';

const router = Router();

router.use(authenticate);
router.use(requireClientPortalRuntimeReady);

/**
 * Inert disabled handler. Returns the same content-free 501
 * `CLIENT_PORTAL_NOT_ENABLED` response as the runtime-ready gate. It is a
 * belt-and-suspenders fallback: while the portal is disabled the gate above
 * short-circuits every request before this ever runs. It never calls a service
 * stub, a mapper, Prisma, or the DB, and returns no synthetic data.
 */
function disabledPortalRoute(_req: Request, res: Response): void {
  sendFeatureUnavailable(res, {
    feature: CLIENT_PORTAL_FEATURE,
    message: 'The client portal is not available in this environment.',
    reason: CLIENT_PORTAL_NOT_ENABLED_REASON,
    nextStep:
      'Client portal requires a separate client-user ownership model and runtime readiness review before it can be enabled.',
  });
}

// ---------------------------------------------------------------------------
// Client Portal V1 route matrix — DISABLED placeholders only.
// External-safe `*Ref` path params; no handler reaches data while disabled.
// ---------------------------------------------------------------------------
router.get('/me', disabledPortalRoute);
router.get('/matters', disabledPortalRoute);
router.get('/matters/:matterRef', disabledPortalRoute);
router.get('/matters/:matterRef/documents', disabledPortalRoute);
router.get('/documents/:documentRef', disabledPortalRoute);
router.get('/tasks', disabledPortalRoute);
router.post('/tasks/:taskRef/complete', disabledPortalRoute);
router.get('/uploads', disabledPortalRoute);

// Deferred placeholders — still disabled. No upload/download/message behavior.
router.post('/uploads/:uploadRequestRef/files', disabledPortalRoute);
router.get('/messages', disabledPortalRoute);
router.post('/messages/:threadRef/replies', disabledPortalRoute);

export default router;
