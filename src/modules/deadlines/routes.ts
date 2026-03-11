import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireCaseAccess, requireDocumentAccess } from '../../middleware/access';
import auditService from '../../services/audit.service';
import deadlinesService from './services';

const router = Router();

router.post('/deadlines/extract', authenticate, requireCaseAccess({ source: 'body', field: 'caseId' }), requireDocumentAccess({ source: 'body', field: 'documentId' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId as string | undefined;
    const { caseId, documentId, servedAt } = req.body || {};

    if (!caseId || !documentId) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'caseId and documentId are required',
      });
      return;
    }

    if (servedAt) {
      const parsed = new Date(servedAt);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'servedAt must be a valid ISO datetime',
        });
        return;
      }
    }

    const deadlines = await deadlinesService.extract({
      caseId,
      documentId,
      servedAt,
    });

    await auditService.logAction(userId, 'DEADLINES_EXTRACTED', 'Deadline', null, {
      caseId,
      documentId,
      servedAt: servedAt || null,
      count: deadlines.length,
    });

    res.status(201).json({
      count: deadlines.length,
      deadlines,
    });
  } catch (error) {
    console.error('Extract deadlines error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

router.get('/cases/:caseId/deadlines', authenticate, requireCaseAccess({ source: 'params', field: 'caseId' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const deadlines = await deadlinesService.listCaseDeadlines(caseId);
    res.json(deadlines);
  } catch (error) {
    console.error('List case deadlines error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;

