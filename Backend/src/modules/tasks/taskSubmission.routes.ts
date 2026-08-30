import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import taskSubmissionService, { TaskSubmissionServiceError } from './taskSubmission.service';
import taskReviewDecisionRoutes from './taskReviewDecision.routes';
import { parseCanonicalStringId, requireCanonicalStringParams } from './canonicalStringId';

const router = Router();

function getActorId(req: Request): string {
  return req.user?.userId || '';
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof TaskSubmissionServiceError) {
    res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
    return;
  }
  console.error('Task submission request failed.');
  res.status(500).json({ status: 500, code: 'TASK_SUBMISSION_INTERNAL_ERROR', message: 'Task submission request failed.' });
}

router.get('/:taskId/workflow', authenticate, requireCanonicalStringParams('taskId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.getTaskSubmissionWorkflow(req.params.taskId as string, getActorId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:taskId/eligible-reviewers', authenticate, requireCanonicalStringParams('taskId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.listEligibleReviewers(req.params.taskId as string, getActorId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions', authenticate, requireCanonicalStringParams('taskId'), async (req, res) => {
  try {
    const result = await taskSubmissionService.createTaskSubmissionDraft(
      req.params.taskId as string,
      getActorId(req),
      req.body || {},
    );
    res.status(result.created ? 201 : 200).json(result.workflow);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:taskId/submissions/:submissionId', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.updateTaskSubmissionDraft(
      req.params.taskId as string,
      req.params.submissionId as string,
      getActorId(req),
      req.body || {},
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:taskId/submissions/:submissionId/readiness', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.validateSubmissionReadiness(
      req.params.taskId as string,
      req.params.submissionId as string,
      getActorId(req),
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/documents', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const documentId = parseCanonicalStringId(req.body?.documentId);
    if (documentId === null) {
      return res.status(400).json({ status: 400, code: 'INVALID_ID', message: 'documentId must be a valid identifier.' });
    }
    const result = await taskSubmissionService.attachSubmissionDocument(
      req.params.taskId as string,
      req.params.submissionId as string,
      getActorId(req),
      { documentId, role: String(req.body?.role || '') },
    );
    return res.status(result.created ? 201 : 200).json(result.workflow);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:taskId/submissions/:submissionId/documents/:documentId', authenticate, requireCanonicalStringParams('taskId', 'submissionId', 'documentId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.detachSubmissionDocument(
      req.params.taskId as string,
      req.params.submissionId as string,
      req.params.documentId as string,
      getActorId(req),
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/time-entries', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const timeEntryId = parseCanonicalStringId(req.body?.timeEntryId);
    if (timeEntryId === null) {
      return res.status(400).json({ status: 400, code: 'INVALID_ID', message: 'timeEntryId must be a valid identifier.' });
    }
    const result = await taskSubmissionService.attachSubmissionTimeEntry(
      req.params.taskId as string,
      req.params.submissionId as string,
      getActorId(req),
      { timeEntryId },
    );
    return res.status(result.created ? 201 : 200).json(result.workflow);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:taskId/submissions/:submissionId/time-entries/:timeEntryId', authenticate, requireCanonicalStringParams('taskId', 'submissionId', 'timeEntryId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.detachSubmissionTimeEntry(
      req.params.taskId as string,
      req.params.submissionId as string,
      req.params.timeEntryId as string,
      getActorId(req),
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/submit', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const result = await taskSubmissionService.submitTaskSubmission(
      req.params.taskId as string,
      req.params.submissionId as string,
      getActorId(req),
      String(req.header('Idempotency-Key') || ''),
    );
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.use('/', taskReviewDecisionRoutes);

export default router;
