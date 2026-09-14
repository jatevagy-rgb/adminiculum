import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import * as service from './controlEvidenceService';

const router = Router();
router.use(authenticate);

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'COMPLIANCE_CONTROLS_EVIDENCE_INTERNAL_ERROR', message: 'Compliance controls and evidence request failed.' });
}

router.get('/clients/:clientId/compliance/controls', async (req, res) => {
  try { res.json(await service.getControlCoverage(actor(req), String(req.params.clientId))); } catch (error) { fail(res, error); }
});

router.get('/clients/:clientId/compliance/controls/:controlId', async (req, res) => {
  try { return res.json(await service.getClientControl(actor(req), String(req.params.clientId), String(req.params.controlId))); } catch (error) { return fail(res, error); }
});

router.post('/clients/:clientId/compliance/controls', async (req, res) => {
  try { res.status(201).json(await service.createClientControl(actor(req), String(req.params.clientId), req.body || {})); } catch (error) { fail(res, error); }
});

router.patch('/clients/:clientId/compliance/controls/:controlId', async (req, res) => {
  try { res.json(await service.updateClientControl(actor(req), String(req.params.clientId), String(req.params.controlId), req.body || {})); } catch (error) { fail(res, error); }
});

router.post('/clients/:clientId/compliance/evidence', async (req, res) => {
  try { res.status(201).json(await service.createEvidenceRecord(actor(req), String(req.params.clientId), req.body || {})); } catch (error) { fail(res, error); }
});

router.post('/clients/:clientId/compliance/controls/:controlId/evidence/:evidenceId', async (req, res) => {
  try {
    res.status(201).json(await service.linkEvidenceToControl(actor(req), String(req.params.clientId), String(req.params.controlId), String(req.params.evidenceId)));
  } catch (error) { fail(res, error); }
});

export default router;
