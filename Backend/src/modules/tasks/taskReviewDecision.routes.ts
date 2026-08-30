import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import taskReviewDecisionService, { TaskReviewDecisionServiceError } from './taskReviewDecision.service';
import { requireCanonicalStringParams } from './canonicalStringId';

const router = Router();

function actorId(req: Request): string {
  return req.user?.userId || '';
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

router.get('/:taskId/submissions/:submissionId/review', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/return', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/revise', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/approve', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
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

router.post('/:taskId/submissions/:submissionId/external-completion', authenticate, requireCanonicalStringParams('taskId', 'submissionId'), async (req, res) => {
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
