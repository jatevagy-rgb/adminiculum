/**
 * W3A — human/internal legal-source observation review lifecycle routes.
 *
 * Mounted at /api/v1/compliance (Backend/src/index.ts) — deliberately NOT at
 * /api/v1/compliance-intelligence, which is the machine ingestion surface.
 *
 * AUTH: workforce `authenticate` + requireInternal. The W2 watcher machine
 * token carries no human identity and cannot pass `authenticate`, and no
 * client-portal identity passes requireInternal.
 *
 *   GET  /api/v1/compliance/legal-source-observations
 *   GET  /api/v1/compliance/legal-source-observations/:id
 *   GET  /api/v1/compliance/legal-source-observations/:id/impact
 *   POST /api/v1/compliance/legal-source-observations/:id/start-review
 *   POST /api/v1/compliance/legal-source-observations/:id/decision
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError, requireInternal } from '../client-interaction/base';
import { resolveImpactAccessScope } from '../compliance-doc-intelligence/routes';
import {
  decideLegalSourceObservationReview,
  getLegalSourceObservationDetail,
  getLegalSourceObservationImpact,
  listLegalSourceObservations,
  startLegalSourceObservationReview,
  type LegalSourceObservationListQuery,
} from './legalSourceObservationReviewService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function sendError(res: Response, error: unknown, fallbackCode: string, fallbackMessage: string): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: fallbackCode, message: fallbackMessage });
}

router.use(authenticate);

router.get('/legal-source-observations', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    res.json(await listLegalSourceObservations(req.query as LegalSourceObservationListQuery));
  } catch (error) {
    sendError(res, error, 'OBSERVATION_REVIEW_LIST_FAILED', 'Legal source observation review list failed.');
  }
});

router.get('/legal-source-observations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    res.json(await getLegalSourceObservationDetail(String(req.params.id || '')));
  } catch (error) {
    sendError(res, error, 'OBSERVATION_REVIEW_DETAIL_FAILED', 'Legal source observation review detail failed.');
  }
});

/**
 * W3B — read-only impact projection for ONE IMPACT_CONFIRMED observation.
 *
 * Same internal boundary as the rest of this router (authenticate +
 * requireInternal). The actor's access scope is resolved by the EXISTING
 * canonical C4C resolver (`resolveImpactAccessScope`: canonical case scope +
 * HR_CONFIDENTIAL boundary + derived client read scope) — no second access
 * policy. The projection itself is the existing canonical
 * `buildLegalSourceImpactForVersion` result; this route performs no writes and
 * turns a legal change into a review signal only.
 */
router.get('/legal-source-observations/:id/impact', async (req: Request, res: Response): Promise<void> => {
  try {
    const internal = actor(req);
    requireInternal(internal);
    const accessScope = await resolveImpactAccessScope(internal);
    res.json(await getLegalSourceObservationImpact(String(req.params.id || ''), accessScope));
  } catch (error) {
    sendError(res, error, 'OBSERVATION_IMPACT_FAILED', 'Legal source observation impact projection failed.');
  }
});

router.post('/legal-source-observations/:id/start-review', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    res.json(await startLegalSourceObservationReview(String(req.params.id || ''), actor(req)));
  } catch (error) {
    sendError(res, error, 'OBSERVATION_REVIEW_START_FAILED', 'Starting the legal source observation review failed.');
  }
});

router.post('/legal-source-observations/:id/decision', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    res.json(await decideLegalSourceObservationReview(String(req.params.id || ''), { decision: body.decision, note: body.note }, actor(req)));
  } catch (error) {
    sendError(res, error, 'OBSERVATION_REVIEW_DECISION_FAILED', 'Legal source observation decision failed.');
  }
});

export default router;
