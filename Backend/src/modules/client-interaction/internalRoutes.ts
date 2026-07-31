/**
 * Internal (workforce) client-interaction routes. Authenticated workforce users
 * with case access operate requests, questions, submissions, accept-into-matter
 * and the notification failure queue. Auth first; explicit service calls.
 */
import { Request, Response, Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { InteractionError, InternalActor } from './base';
import { ClientInteractionGateError } from './gates';
import * as requests from './requestService';
import * as questions from './questionService';
import * as submissions from './submissionService';
import * as notifications from './notificationService';

export const clientInteractionInternalRouter = Router();

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError || error instanceof ClientInteractionGateError) {
    res.status((error as any).status).json({ status: (error as any).status, code: (error as any).code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_INTERACTION_INTERNAL_ERROR', message: 'Client interaction request failed.' });
}

function actor(req: Request): InternalActor {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

clientInteractionInternalRouter.use(authenticate, requireRole('ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER'));

// Requests
clientInteractionInternalRouter.get('/requests', async (req, res) => {
  try { res.json(await requests.listRequestsInternal(actor(req), { caseId: req.query.caseId as string, status: req.query.status as string, limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined })); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/requests', async (req, res) => {
  try { res.status(201).json(await requests.createRequestDraft(actor(req), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.patch('/requests/:id', async (req, res) => {
  try { res.json(await requests.updateRequestDraft(actor(req), String(req.params.id), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/requests/:id/publish', async (req, res) => {
  try { res.json(await requests.publishRequest(actor(req), String(req.params.id), req.body?.expectedRevision)); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/requests/:id/cancel', async (req, res) => {
  try { res.json(await requests.cancelRequest(actor(req), String(req.params.id), req.body?.expectedRevision)); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/requests/:id/complete', async (req, res) => {
  try { res.json(await requests.completeRequest(actor(req), String(req.params.id), req.body?.expectedRevision)); } catch (e) { fail(res, e); }
});

// Questions
clientInteractionInternalRouter.get('/questions', async (req, res) => {
  try { res.json(await questions.listThreadsInternal(actor(req), { caseId: req.query.caseId as string, status: req.query.status as string, limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined })); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.get('/questions/:threadId', async (req, res) => {
  try { res.json(await questions.getThreadInternal(actor(req), String(req.params.threadId))); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/questions/:threadId/answer', async (req, res) => {
  try { res.status(201).json(await questions.draftAnswer(actor(req), String(req.params.threadId), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/questions/:threadId/answer/:messageId/send', async (req, res) => {
  try { res.json(await questions.sendAnswer(actor(req), String(req.params.threadId), String(req.params.messageId), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/questions/:threadId/close', async (req, res) => {
  try { res.json(await questions.closeThread(actor(req), String(req.params.threadId))); } catch (e) { fail(res, e); }
});

// Submissions
clientInteractionInternalRouter.get('/submissions', async (req, res) => {
  try { res.json(await submissions.listSubmissionsInternal(actor(req), { caseId: req.query.caseId as string, requestId: req.query.requestId as string, status: req.query.status as string, limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined })); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.get('/submissions/:id', async (req, res) => {
  try { res.json(await submissions.getSubmissionInternal(actor(req), String(req.params.id))); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/submissions/:id/request-correction', async (req, res) => {
  try { res.json(await submissions.requestCorrection(actor(req), String(req.params.id), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/submissions/:id/reject', async (req, res) => {
  try { res.json(await submissions.rejectSubmission(actor(req), String(req.params.id), req.body || {})); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/submissions/:id/files/:fileId/accept', async (req, res) => {
  try { res.json(await submissions.acceptFileIntoMatter(actor(req), String(req.params.id), String(req.params.fileId), req.body || {})); } catch (e) { fail(res, e); }
});

// Notification failure queue
clientInteractionInternalRouter.get('/notifications', async (req, res) => {
  try { res.json(await notifications.listNotificationDeliveries(actor(req), { caseId: req.query.caseId as string, status: req.query.status as string, limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined })); } catch (e) { fail(res, e); }
});
clientInteractionInternalRouter.post('/notifications/:id/retry', async (req, res) => {
  try { res.json(await notifications.retryDelivery(actor(req), String(req.params.id))); } catch (e) { fail(res, e); }
});
