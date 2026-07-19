import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import taskReviewDecisionService, { TaskReviewDecisionServiceError } from './taskReviewDecision.service';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function actorId(req: Request): string {
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

function assertFields(body: Record<string, unknown>, allowed: string[]): void {
  const allowedFields = new Set(allowed);
  const unexpected = Object.keys(body).find((key) => !allowedFields.has(key));
  if (unexpected) {
    throw new TaskReviewDecisionServiceError(400, 'REVIEW_FIELD_NOT_ACCEPTED', `Field ${unexpected} is not accepted.`);
  }
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof TaskReviewDecisionServiceError) {
    res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
    return;
  }
  console.error('Task review decision request failed.');
  res.status(500).json({ status: 500, code: 'TASK_REVIEW_DECISION_INTERNAL_ERROR', message: 'Task review decision request failed.' });
}

router.get('/:taskId/submissions/:submissionId/review', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const detail = await taskReviewDecisionService.getReviewDetail(
      req.params.taskId as string,
      req.params.submissionId as string,
      actorId(req),
    );
    res.setHeader('ETag', `"${detail.reviewVersion}"`);
    res.json(detail);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/return', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const body = req.body || {};
    assertFields(body, ['note', 'requestedCorrections', 'requiresFullReview', 'correctionDeadline']);
    res.json(await taskReviewDecisionService.returnSubmission(
      req.params.taskId as string,
      req.params.submissionId as string,
      actorId(req),
      String(req.header('Idempotency-Key') || ''),
      String(req.header('If-Match') || ''),
      body,
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/revise', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    assertFields(req.body || {}, []);
    const result = await taskReviewDecisionService.reviseSubmission(
      req.params.taskId as string,
      req.params.submissionId as string,
      actorId(req),
      String(req.header('Idempotency-Key') || ''),
    );
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/approve', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const body = req.body || {};
    assertFields(body, ['note']);
    res.json(await taskReviewDecisionService.approveSubmission(
      req.params.taskId as string,
      req.params.submissionId as string,
      actorId(req),
      String(req.header('Idempotency-Key') || ''),
      String(req.header('If-Match') || ''),
      body,
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:taskId/submissions/:submissionId/external-completion', authenticate, requireUuidParams('taskId', 'submissionId'), async (req, res) => {
  try {
    const body = req.body || {};
    assertFields(body, ['completedAt', 'actionType']);
    res.json(await taskReviewDecisionService.recordExternalCompletion(
      req.params.taskId as string,
      req.params.submissionId as string,
      actorId(req),
      String(req.header('Idempotency-Key') || ''),
      body,
    ));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
