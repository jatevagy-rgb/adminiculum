import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  createDocumentReviewSuggestion,
  DocumentReviewSuggestionError,
  listDocumentReviewSuggestions,
  updateDocumentReviewSuggestionStatus,
} from './reviewSuggestions.service';

const router = Router({ mergeParams: true });

const getAuthorId = (req: Request): string | null =>
  ((req as any).user?.userId || (req as any).user?.id || null) as string | null;

const sendError = (res: Response, error: unknown) => {
  if (error instanceof DocumentReviewSuggestionError) {
    res.status(error.status).json({
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error('Document review suggestion error:', error);
  res.status(500).json({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
};

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params as { documentId: string };
    const suggestions = await listDocumentReviewSuggestions(documentId, {
      workspaceSource: req.query.workspaceSource ? String(req.query.workspaceSource) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
    });

    res.json(suggestions);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params as { documentId: string };
    const suggestion = await createDocumentReviewSuggestion(documentId, {
      ...req.body,
      authorId: getAuthorId(req),
    });

    res.status(201).json(suggestion);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:suggestionId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, suggestionId } = req.params as { documentId: string; suggestionId: string };
    const suggestion = await updateDocumentReviewSuggestionStatus(documentId, suggestionId, req.body?.status);

    res.json(suggestion);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
