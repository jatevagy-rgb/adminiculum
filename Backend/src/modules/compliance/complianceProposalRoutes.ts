import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import * as proposals from './complianceProposalService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'COMPLIANCE_PROPOSAL_INTERNAL_ERROR', message: 'Compliance proposal request failed.' });
}

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    res.json(await proposals.listProposals(actor(req), {
      clientId: req.query.clientId ? String(req.query.clientId) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      caseId: req.query.caseId ? String(req.query.caseId) : undefined,
    }));
  } catch (error) { fail(res, error); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await proposals.createProposal(actor(req), req.body || {})); } catch (error) { fail(res, error); }
});

router.patch('/:id', async (req, res) => {
  try { res.json(await proposals.updateProposal(actor(req), String(req.params.id), req.body || {})); } catch (error) { fail(res, error); }
});

router.post('/:id/bind-case', async (req, res) => {
  try {
    const caseId = String(req.body?.caseId || '');
    if (!caseId) throw new InteractionError(400, 'FIELD_REQUIRED', 'caseId is required.');
    res.json(await proposals.bindProposalToCase(actor(req), String(req.params.id), caseId));
  } catch (error) { fail(res, error); }
});

router.post('/:id/confirm', async (req, res) => {
  try { res.json(await proposals.confirmProposal(actor(req), String(req.params.id))); } catch (error) { fail(res, error); }
});

router.post('/:id/reject', async (req, res) => {
  try { res.json(await proposals.rejectProposal(actor(req), String(req.params.id))); } catch (error) { fail(res, error); }
});

export default router;
