import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { DocumentReviewRailError, getDocumentReviewRail } from './reviewRail.service';
import { requireVersionReadAccess } from './versionAccess';

const router = Router({ mergeParams: true });

router.use(authenticate, requireWorkforceUser, requireVersionReadAccess);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, versionId } = req.params as { documentId: string; versionId: string };
    res.json(await getDocumentReviewRail(documentId, versionId, req.query as Record<string, unknown>));
  } catch (error) {
    if (error instanceof DocumentReviewRailError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    console.error('Document review rail route error:', error);
    res.status(500).json({
      status: 500,
      code: 'DOCUMENT_REVIEW_RAIL_ERROR',
      message: 'Document review rail request failed.',
    });
  }
});

export default router;
