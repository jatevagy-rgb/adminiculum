import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { AnchorValidationError } from './anchorValidation';
import {
  createDocumentReviewComment,
  createDocumentReviewCommentReply,
  ReviewCommentError,
} from './reviewComments.service';
import { requireVersionReadAccess } from './versionAccess';

const router = Router({ mergeParams: true });

router.use(authenticate, requireWorkforceUser, requireVersionReadAccess);

function actorId(req: Request): string | null {
  return req.user?.userId || null;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ReviewCommentError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  if (error instanceof AnchorValidationError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  console.error('Document review comment route error:', error);
  res.status(500).json({
    status: 500,
    code: 'DOCUMENT_REVIEW_COMMENT_ERROR',
    message: 'Document review comment request failed.',
  });
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId } = req.params as { documentId: string; versionId: string };
    res.status(201).json(await createDocumentReviewComment(documentId, versionId, userId, req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:annotationId/replies', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, annotationId } = req.params as {
      documentId: string;
      versionId: string;
      annotationId: string;
    };
    const reply = await createDocumentReviewCommentReply(
      documentId,
      versionId,
      annotationId,
      userId,
      req.body?.body
    );
    if (!reply) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_ANNOTATION_NOT_FOUND',
        message: 'Annotation not found.',
      });
      return;
    }
    res.status(201).json(reply);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
