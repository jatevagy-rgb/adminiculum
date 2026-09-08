import { Router } from 'express';
import { authenticate, requireRole, ROLES } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { createDraft, discardDraft, getDraft, getDraftPdf, getIssuerProfile, patchDraft, patchDraftLine, putIssuerProfile } from './service';

const router = Router();

// Invoice drafts are workforce financial data — same sensitivity class as
// billing review. Internal workforce only — ADMIN/PARTNER. Never client portal.
router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.PARTNER));

function actor(req: import('express').Request) {
  return { userId: String(req.user!.userId), role: req.user!.role };
}

router.get('/issuer-profile', (req, res) => {
  getIssuerProfile(actor(req)).then((result) => res.json(result)).catch((error) => respond(error, res));
});

router.put('/issuer-profile', (req, res) => {
  putIssuerProfile(actor(req), req.body).then((result) => res.json(result)).catch((error) => respond(error, res));
});

router.post('/drafts', (req, res) => {
  createDraft(actor(req), req.body)
    .then((result) => res.status(result.created ? 201 : 200).json(result))
    .catch((error) => respond(error, res));
});

router.get('/drafts/:draftId', (req, res) => {
  getDraft(actor(req), String(req.params.draftId)).then((result) => res.json(result)).catch((error) => respond(error, res));
});

router.patch('/drafts/:draftId', (req, res) => {
  patchDraft(actor(req), String(req.params.draftId), req.body).then((result) => res.json(result)).catch((error) => respond(error, res));
});

router.patch('/drafts/:draftId/lines/:lineId', (req, res) => {
  patchDraftLine(actor(req), String(req.params.draftId), String(req.params.lineId), req.body)
    .then((result) => res.json(result))
    .catch((error) => respond(error, res));
});

router.delete('/drafts/:draftId', (req, res) => {
  discardDraft(actor(req), String(req.params.draftId)).then((result) => res.json(result)).catch((error) => respond(error, res));
});

router.get('/drafts/:draftId/pdf', (req, res) => {
  getDraftPdf(actor(req), String(req.params.draftId))
    .then((pdf) => {
      res.type('application/pdf');
      res.attachment('szamlatervezet-nem-szamla.pdf');
      res.send(pdf);
    })
    .catch((error) => respond(error, res));
});

function respond(error: unknown, res: import('express').Response) {
  if (error instanceof InteractionError) {
    const missing = (error as InteractionError & { missing?: string[] }).missing;
    return res.status(error.status).json({ code: error.code, message: error.message, ...(missing ? { missing } : {}) });
  }
  console.error('Invoice draft operation failed', error);
  return res.status(500).json({ code: 'INVOICE_DRAFT_INTERNAL_ERROR', message: 'A számlatervezet most nem érhető el. Próbálja újra később.' });
}

export default router;
