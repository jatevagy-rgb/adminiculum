/**
 * C4D office reads plus BE-COMP-003/004 client workbench and explicit impact decisions.
 * Office routes remain read-only. Client decisions reuse canonical services and
 * require authenticated workforce identity and exact client access.
 *
 * Mounted at /api/v1/compliance (Backend/src/index.ts).
 *
 * AUTHORIZATION: workforce authenticate + requireInternal. The overview is a
 * DERIVED cross-client read model; client-level rows are filtered by the
 * actor's canonical case scope (`internalCaseScope`) and document-level impact
 * is never re-derived here — the frontend reuses the existing
 * /api/v1/compliance-intelligence/legal-source-impact route for that.
 *
 * TRUTHFULNESS: this surface reports review workload that is already persisted
 * (open findings, expired evidence, due control reviews, registry review
 * states). It is NOT a persisted assignment queue and it never implies an
 * external legal-source watcher ran.
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError, requireInternal } from '../client-interaction/base';
import { getComplianceCenterOverview, getComplianceDocumentFamilies } from './complianceCenterService';

import { getClientComplianceWorkbench } from './complianceWorkbenchService';
import { decideClientImpact } from './complianceImpactDecisionService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

router.use(authenticate);

router.get('/office/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    res.json(await getComplianceCenterOverview(actor(req)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_CENTER_OVERVIEW_ERROR', message: 'Compliance Center overview request failed.' });
  }
});

router.get('/office/document-families', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    res.json(await getComplianceDocumentFamilies(actor(req)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_CENTER_DOCUMENT_FAMILIES_ERROR', message: 'Compliance Center document families request failed.' });
  }
});

router.get('/clients/:clientId/workbench', async (req, res) => {
  try { res.json(await getClientComplianceWorkbench(actor(req), String(req.params.clientId))); }
  catch (error) { workbenchError(res, error); }
});
router.post('/clients/:clientId/source-impacts/:observationId/decision', async (req, res) => {
  try { res.json(await decideClientImpact(actor(req), String(req.params.clientId), String(req.params.observationId), req.body || {})); }
  catch (error) { workbenchError(res, error); }
});
function workbenchError(res: Response, error: unknown) {
  if (error instanceof InteractionError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
  res.status(500).json({ code: 'COMPLIANCE_WORKBENCH_FAILED', message: 'Compliance workbench request failed.' });
}
export default router;
