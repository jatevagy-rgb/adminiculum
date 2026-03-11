import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireDocumentAccess } from '../../middleware/access';
import auditService from '../../services/audit.service';
import classificationService from './services';

const router = Router();

router.post('/documents/:id/classify', authenticate, requireDocumentAccess({ source: 'params', field: 'id' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId as string | undefined;
    const { id } = req.params as { id: string };
    const record = await classificationService.classifyDocument(id);

    await auditService.logAction(userId, 'DOCUMENT_CLASSIFIED', 'DocumentClassification', record.id, {
      documentId: id,
      category: record.category,
      tags: record.tags,
      confidence: record.confidence,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Classify document error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

router.get('/documents/:id/classification', authenticate, requireDocumentAccess({ source: 'params', field: 'id' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const record = await classificationService.getLatestForDocument(id);
    if (!record) {
      res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Classification not found',
      });
      return;
    }

    res.json(record);
  } catch (error) {
    console.error('Get classification error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;

