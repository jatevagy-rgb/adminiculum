/**
 * CONTRACT DATE EXTRACTION — internal workforce routes.
 * Mounted at /api/v1/contract-date-candidates. Workforce auth; reads are
 * case-scoped, extraction/rejection require case-manage access, and
 * confirmation requires canonical contract mutation permission (ADMIN/PARTNER)
 * enforced inside the canonical contract service and the candidate service.
 * No client-portal route is exposed: pending candidates are internal lawyer
 * work and are never projected to customers.
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { InteractionError } from '../client-interaction/base';
import * as candidates from './service';

export const contractDateCandidatesRouter = Router();

function actor(req: Request): { userId: string; role?: string | null } {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'CONTRACT_DATE_CANDIDATES_INTERNAL_ERROR', message: 'Contract date candidate request failed.' });
}

contractDateCandidatesRouter.use(authenticate, requireWorkforceUser);

contractDateCandidatesRouter.get('/', async (req, res) => {
  try {
    const documentId = String(req.query.documentId || '').trim();
    if (!documentId) {
      res.status(400).json({ status: 400, code: 'DOCUMENT_ID_REQUIRED', message: 'documentId is required.' });
      return;
    }
    res.json(await candidates.listCandidatesForDocument(actor(req), documentId, { status: req.query.status as string }));
  } catch (e) { fail(res, e); }
});

contractDateCandidatesRouter.post('/extract', async (req, res) => {
  try {
    res.json(await candidates.extractCandidatesForVersion(actor(req), req.body || {}));
  } catch (e) { fail(res, e); }
});

contractDateCandidatesRouter.post('/:candidateId/confirm', async (req, res) => {
  try {
    res.json(await candidates.confirmCandidate(actor(req), String(req.params.candidateId), req.body || {}));
  } catch (e) { fail(res, e); }
});

contractDateCandidatesRouter.post('/:candidateId/reject', async (req, res) => {
  try {
    res.json(await candidates.rejectCandidate(actor(req), String(req.params.candidateId), (req.body || {}).reason ?? null));
  } catch (e) { fail(res, e); }
});
