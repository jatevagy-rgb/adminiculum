import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireDocumentObjectManageAccess, requireDocumentObjectReadAccess } from './documentObjectAuthorization';
import {
  createDocumentReviewSuggestion,
  DocumentReviewSuggestionError,
  listDocumentReviewSuggestions,
  updateDocumentReviewSuggestionStatus,
} from './reviewSuggestions.service';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';

const router = Router({ mergeParams: true });
const requireReviewSuggestionFoundation = requireDatabaseFoundation({
  feature: 'DOCUMENT_REVIEW_SUGGESTIONS',
  enabled: () => isDatabaseFoundationEnabled('ENABLE_DOCUMENT_REVIEW_SUGGESTIONS'),
  message: 'Document review suggestion persistence is not available in this environment.',
  nextStep: 'Complete BP3A database reconciliation before enabling this feature.',
});

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

router.use(authenticate, requireWorkforceUser);

router.get('/', requireReviewSuggestionFoundation, requireDocumentObjectReadAccess, async (req: Request, res: Response): Promise<void> => {
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

router.post('/', requireReviewSuggestionFoundation, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
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

router.patch('/:suggestionId', requireReviewSuggestionFoundation, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, suggestionId } = req.params as { documentId: string; suggestionId: string };
    const suggestion = await updateDocumentReviewSuggestionStatus(documentId, suggestionId, req.body?.status);

    res.json(suggestion);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
