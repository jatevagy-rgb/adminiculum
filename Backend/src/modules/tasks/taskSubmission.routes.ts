import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import taskSubmissionService, { TaskSubmissionServiceError } from './taskSubmission.service';
import taskReviewDecisionRoutes from './taskReviewDecision.routes';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getActorId(req: Request): string {
  return req.user?.userId || '';
}

function requireUuidParams(...names: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of names) {
      const value = String(req.params[name] || '').trim();
      if (!UUID_PATTERN.test(value)) {
        res.status(400).json({ status: 400, code: 'INVALID_ID', message: `${name} must be a valid UUID.` });
        return;
      }
    }
    next();
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof TaskSubmissionServiceError) {
    res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
    return;
  }
  console.error('Task submission request failed.');
  res.status(500).json({ status: 500, code: 'TASK_SUBMISSION_INTERNAL_ERROR', message: 'Task submission request failed.' });
}

router.get('/:taskId/workflow', authenticate, requireUuidParams('taskId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.getTaskSubmissionWorkflow(req.params.taskId as string, getActorId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:taskId/eligible-reviewers', authenticate, requireUuidParams('taskId'), async (req, res) => {
  try {
    res.json(await taskSubmissionService.listEligibleReviewers(req.params.taskId as string, getActorId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions', authenticate, requireUuidParams('taskId'), async (req, res) => {
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

router.patch('/:taskId/submissions/:submissionId', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
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

router.get('/:taskId/submissions/:submissionId/readiness', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/documents', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const documentId = String(req.body?.documentId || '').trim();
    if (!UUID_PATTERN.test(documentId)) {
      return res.status(400).json({ status: 400, code: 'INVALID_ID', message: 'documentId must be a valid UUID.' });
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

router.delete('/:taskId/submissions/:submissionId/documents/:documentId', authenticate, requireUuidParams('taskId', 'submissionId', 'documentId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/time-entries', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const timeEntryId = String(req.body?.timeEntryId || '').trim();
    if (!UUID_PATTERN.test(timeEntryId)) {
      return res.status(400).json({ status: 400, code: 'INVALID_ID', message: 'timeEntryId must be a valid UUID.' });
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

router.delete('/:taskId/submissions/:submissionId/time-entries/:timeEntryId', authenticate, requireUuidParams('taskId', 'submissionId', 'timeEntryId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/submit', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
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
