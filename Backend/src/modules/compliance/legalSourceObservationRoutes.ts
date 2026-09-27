/**
 * W2 — machine-only legal-source observation ingestion endpoint.
 *
 * AUTH: the dedicated watcher machine-auth middleware ONLY. This route
 * deliberately never uses the human `authenticate` / `requireInternal` path,
 * the local JWT fallback, or any client-portal identity.
 *
 *   POST /api/v1/compliance-intelligence/legal-source-observations
 *
 * A structurally valid batch resolves 200 with per-item outcomes; malformed
 * envelopes and auth failures use their normal 4xx/5xx status codes.
 */
import { Request, Response, Router } from 'express';
import { watcherMachineAuth } from '../../middleware/watcherAuth';
import { InteractionError } from '../client-interaction/base';
import { ingestLegalSourceObservations } from './legalSourceObservationService';

const router = Router();

router.post('/legal-source-observations', watcherMachineAuth, async (req: Request, res: Response) => {
  try {
    const result = await ingestLegalSourceObservations(req.body);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'OBSERVATION_INGESTION_FAILED', message: 'Legal source observation ingestion failed.' });
  }
});

export default router;
