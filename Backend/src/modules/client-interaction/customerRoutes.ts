/**
 * Customer-facing client-interaction routes. Every route is authenticated as a
 * customer, resolves an ACTIVE case grant (client/case derived server-side —
 * never from input), and is guarded by the relevant capability gate inside the
 * service. Responses carry only client-safe DTOs.
 */
import { Request, Response, Router } from 'express';
import { authenticateClientPortal } from '../../middleware/clientPortalAuth';
import { InteractionError, resolveActiveCustomerGrant, CustomerContext } from './base';
import { ClientInteractionGateError } from './gates';
import * as requests from './requestService';
import * as questions from './questionService';
import * as submissions from './submissionService';
import { resolvePortalWorkspace } from '../client-workspace/workspaceService';

export const clientInteractionCustomerRouter = Router();

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) { res.status(error.status).json({ status: error.status, code: error.code, message: error.message }); return; }
  if (error instanceof ClientInteractionGateError) { res.status(error.status).json({ status: error.status, code: error.code, message: error.message }); return; }
  res.status(500).json({ status: 500, code: 'CLIENT_INTERACTION_INTERNAL_ERROR', message: 'Client interaction request failed.' });
}

async function ctxFor(req: Request): Promise<CustomerContext> {
  const identityId = String(req.clientPortalSession?.clientPortalIdentityId || '');
  const caseId = String(req.params.caseId || '');
  if (!req.clientPortalSession) throw new InteractionError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
  const workspace = await resolvePortalWorkspace(req.clientPortalSession, req.header('x-client-portal-workspace'));
  return resolveActiveCustomerGrant(identityId, caseId, workspace.id);
}

clientInteractionCustomerRouter.use(authenticateClientPortal);

// Requests
clientInteractionCustomerRouter.get('/cases/:caseId/requests', async (req, res) => {
  try { res.json(await requests.listCustomerRequests(await ctxFor(req))); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.get('/cases/:caseId/requests/:requestId', async (req, res) => {
  try { res.json(await requests.getCustomerRequest(await ctxFor(req), String(req.params.requestId))); } catch (e) { fail(res, e); }
});

// Submissions
clientInteractionCustomerRouter.post('/cases/:caseId/requests/:requestId/submissions', async (req, res) => {
  try { res.status(201).json(await submissions.createDraftSubmission(await ctxFor(req), String(req.params.requestId))); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.post('/cases/:caseId/submissions/:submissionId/answers', async (req, res) => {
  try { res.json(await submissions.addStructuredAnswers(await ctxFor(req), String(req.params.submissionId), req.body?.answers || [])); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.post('/cases/:caseId/submissions/:submissionId/files', async (req, res) => {
  try { res.status(201).json(await submissions.addFile(await ctxFor(req), String(req.params.submissionId), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.post('/cases/:caseId/submissions/:submissionId/submit', async (req, res) => {
  try { res.json(await submissions.submitSubmission(await ctxFor(req), String(req.params.submissionId), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.get('/cases/:caseId/submissions', async (req, res) => {
  try { res.json(await submissions.listCustomerSubmissions(await ctxFor(req), req.query.requestId ? String(req.query.requestId) : undefined)); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.get('/cases/:caseId/submissions/:submissionId', async (req, res) => {
  try { res.json(await submissions.getCustomerSubmission(await ctxFor(req), String(req.params.submissionId))); } catch (e) { fail(res, e); }
});

// Questions
clientInteractionCustomerRouter.post('/cases/:caseId/questions', async (req, res) => {
  try { res.status(201).json(await questions.createCustomerQuestion(await ctxFor(req), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.get('/cases/:caseId/questions', async (req, res) => {
  try { res.json(await questions.listCustomerThreads(await ctxFor(req))); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.get('/cases/:caseId/questions/:threadId', async (req, res) => {
  try { res.json(await questions.getCustomerThread(await ctxFor(req), String(req.params.threadId))); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.post('/cases/:caseId/questions/:threadId/messages', async (req, res) => {
  try { res.status(201).json(await questions.sendCustomerMessage(await ctxFor(req), String(req.params.threadId), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.post('/cases/:caseId/questions/:threadId/read', async (req, res) => {
  try { res.json(await questions.markCustomerThreadRead(await ctxFor(req), String(req.params.threadId))); } catch (e) { fail(res, e); }
});
clientInteractionCustomerRouter.get('/cases/:caseId/questions/:threadId/attachments/:attachmentId', async (req, res) => {
  try { res.json(await questions.authorizeCustomerMessageAttachment(await ctxFor(req), String(req.params.threadId), String(req.params.attachmentId))); } catch (e) { fail(res, e); }
});
