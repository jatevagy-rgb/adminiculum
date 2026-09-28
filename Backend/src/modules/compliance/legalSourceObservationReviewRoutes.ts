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
 *   POST /api/v1/compliance/legal-source-observations/:id/start-review
 *   POST /api/v1/compliance/legal-source-observations/:id/decision
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError, requireInternal } from '../client-interaction/base';
import {
  decideLegalSourceObservationReview,
  getLegalSourceObservationDetail,
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
