import { Router, Request, Response } from 'express';
import { authenticate } from '../../../middleware/auth';
import { requireDocumentReadAccess } from '../authorization';
import {
  addPoint,
  createReview,
  DocumentReviewWorkflowError,
  getReview,
  listDecisions,
  listPoints,
  listReviews,
  nextActions,
  transitionReview,
  updatePoint,
} from './reviewService';
import { toDecisionDto, toPointDto, toReviewDto } from './reviewDto';

function actor(req: Request) {
  return { userId: String((req as any).user?.userId || ''), role: String((req as any).user?.role || '') };
}

function fail(res: Response, error: unknown) {
  if (error instanceof DocumentReviewWorkflowError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

function bodyWithIdempotency(req: Request) {
  return { ...(req.body || {}), idempotencyKey: String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim() || undefined };
}

export const documentReviewRouter = Router();

documentReviewRouter.post('/:id/reviews', authenticate, requireDocumentReadAccess, async (req, res) => {
  try { res.status(201).json(toReviewDto(await createReview(String(req.params.id), actor(req), bodyWithIdempotency(req)))); }
  catch (error) { fail(res, error); }
});

documentReviewRouter.get('/:id/reviews', authenticate, requireDocumentReadAccess, async (req, res) => {
  try { res.json({ data: (await listReviews(String(req.params.id), actor(req))).map(toReviewDto) }); }
  catch (error) { fail(res, error); }
});

export const reviewRouter = Router();

reviewRouter.get('/:reviewId', authenticate, async (req, res) => {
  try {
    const review = await getReview(String(req.params.reviewId), actor(req));
    res.json({ ...toReviewDto(review), permittedActions: nextActions(String(review.status)) });
  } catch (error) { fail(res, error); }
});

function transition(action: any) {
  return async (req: Request, res: Response) => {
    try { res.json(toReviewDto(await transitionReview(String(req.params.reviewId), action, actor(req), bodyWithIdempotency(req)))); }
    catch (error) { fail(res, error); }
  };
}

reviewRouter.post('/:reviewId/assign', authenticate, transition('ASSIGN'));
reviewRouter.post('/:reviewId/start', authenticate, transition('START'));
reviewRouter.post('/:reviewId/request-changes', authenticate, transition('REQUEST_CHANGES'));
reviewRouter.post('/:reviewId/resubmit', authenticate, transition('RESUBMIT'));
reviewRouter.post('/:reviewId/approve', authenticate, transition('APPROVE'));
reviewRouter.post('/:reviewId/cancel', authenticate, transition('CANCEL'));
reviewRouter.post('/:reviewId/close', authenticate, transition('CLOSE'));

reviewRouter.get('/:reviewId/points', authenticate, async (req, res) => {
  try {
    const page = await listPoints(String(req.params.reviewId), actor(req), {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: page.items.map(toPointDto), total: page.total, limit: page.limit, offset: page.offset });
  } catch (error) { fail(res, error); }
});

reviewRouter.post('/:reviewId/points', authenticate, async (req, res) => {
  try { res.status(201).json(toPointDto(await addPoint(String(req.params.reviewId), actor(req), bodyWithIdempotency(req)))); }
  catch (error) { fail(res, error); }
});

reviewRouter.patch('/:reviewId/points/:pointId', authenticate, async (req, res) => {
  try { res.json(toPointDto(await updatePoint(String(req.params.reviewId), String(req.params.pointId), actor(req), bodyWithIdempotency(req)))); }
  catch (error) { fail(res, error); }
});

reviewRouter.get('/:reviewId/decisions', authenticate, async (req, res) => {
  try {
    const page = await listDecisions(String(req.params.reviewId), actor(req), {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: page.items.map(toDecisionDto), total: page.total, limit: page.limit, offset: page.offset });
  } catch (error) { fail(res, error); }
});
