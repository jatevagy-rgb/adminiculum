import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  approveDocumentPublication,
  approveMatterPublication,
  createActionRequest,
  createDocumentPublication,
  createGrant,
  createMatterPublication,
  createSafeUpdate,
  ClientPublicationError,
  getPublicationOverview,
  listGrants,
  publishDocumentPublication,
  publishMatterPublication,
  revokeDocumentPublication,
  revokeMatterPublication,
  submitDocumentPublication,
  submitMatterPublication,
  supersedeDocumentPublication,
  supersedeMatterPublication,
  transitionActionRequest,
  transitionGrant,
  transitionSafeUpdate,
  updateDocumentPublication,
  updateMatterPublication,
} from './publicationService';

export const clientPublicationRouter = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof ClientPublicationError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_PUBLICATION_INTERNAL_ERROR', message: 'Client publication request failed.' });
}

function payload(req: Request) {
  return { ...(req.body || {}), idempotencyKey: String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim() || undefined };
}

clientPublicationRouter.use(authenticate);

clientPublicationRouter.get('/cases/:caseId/overview', async (req, res) => {
  try { res.json(await getPublicationOverview(actor(req), String(req.params.caseId), req.query.documentId ? String(req.query.documentId) : null)); }
  catch (error) { fail(res, error); }
});

clientPublicationRouter.post('/grants', async (req, res) => {
  try { res.status(201).json(await createGrant(actor(req), payload(req))); }
  catch (error) { fail(res, error); }
});

clientPublicationRouter.get('/cases/:caseId/grants', async (req, res) => {
  try { res.json({ data: await listGrants(actor(req), String(req.params.caseId)) }); }
  catch (error) { fail(res, error); }
});

for (const action of ['activate', 'suspend', 'revoke', 'expire'] as const) {
  clientPublicationRouter.post(`/grants/:grantId/${action}`, async (req, res) => {
    try { res.json(await transitionGrant(actor(req), String(req.params.grantId), action, payload(req))); }
    catch (error) { fail(res, error); }
  });
}

clientPublicationRouter.post('/matters', async (req, res) => {
  try { res.status(201).json(await createMatterPublication(actor(req), payload(req))); }
  catch (error) { fail(res, error); }
});

clientPublicationRouter.patch('/matters/:publicationId', async (req, res) => {
  try { res.json(await updateMatterPublication(actor(req), String(req.params.publicationId), payload(req))); }
  catch (error) { fail(res, error); }
});

const matterActions = {
  submit: submitMatterPublication,
  approve: approveMatterPublication,
  publish: publishMatterPublication,
  revoke: revokeMatterPublication,
  supersede: supersedeMatterPublication,
};

for (const [action, handler] of Object.entries(matterActions)) {
  clientPublicationRouter.post(`/matters/:publicationId/${action}`, async (req, res) => {
    try { res.json(await handler(actor(req), String(req.params.publicationId), payload(req))); }
    catch (error) { fail(res, error); }
  });
}

clientPublicationRouter.post('/documents', async (req, res) => {
  try { res.status(201).json(await createDocumentPublication(actor(req), payload(req))); }
  catch (error) { fail(res, error); }
});

clientPublicationRouter.patch('/documents/:publicationId', async (req, res) => {
  try { res.json(await updateDocumentPublication(actor(req), String(req.params.publicationId), payload(req))); }
  catch (error) { fail(res, error); }
});

const documentActions = {
  submit: submitDocumentPublication,
  approve: approveDocumentPublication,
  publish: publishDocumentPublication,
  revoke: revokeDocumentPublication,
  supersede: supersedeDocumentPublication,
};

for (const [action, handler] of Object.entries(documentActions)) {
  clientPublicationRouter.post(`/documents/:publicationId/${action}`, async (req, res) => {
    try { res.json(await handler(actor(req), String(req.params.publicationId), payload(req))); }
    catch (error) { fail(res, error); }
  });
}

clientPublicationRouter.post('/action-requests', async (req, res) => {
  try { res.status(201).json(await createActionRequest(actor(req), payload(req))); }
  catch (error) { fail(res, error); }
});

for (const action of ['approve', 'publish', 'cancel'] as const) {
  clientPublicationRouter.post(`/action-requests/:requestId/${action}`, async (req, res) => {
    try { res.json(await transitionActionRequest(actor(req), String(req.params.requestId), action, payload(req))); }
    catch (error) { fail(res, error); }
  });
}

clientPublicationRouter.post('/safe-updates', async (req, res) => {
  try { res.status(201).json(await createSafeUpdate(actor(req), payload(req))); }
  catch (error) { fail(res, error); }
});

for (const action of ['approve', 'publish', 'revoke'] as const) {
  clientPublicationRouter.post(`/safe-updates/:updateId/${action}`, async (req, res) => {
    try { res.json(await transitionSafeUpdate(actor(req), String(req.params.updateId), action, payload(req))); }
    catch (error) { fail(res, error); }
  });
}
