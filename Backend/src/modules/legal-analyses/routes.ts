import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import legalAnalysesService, {
  LegalAnalysisServiceError,
  type LegalAnalysisSourceDocumentType,
} from './service';

const router = Router();

function getUserId(req: Request): string | undefined {
  return (req as any).user?.userId;
}

function sendServiceError(res: Response, error: unknown): void {
  if (error instanceof LegalAnalysisServiceError) {
    res.status(error.statusCode).json({
      status: error.statusCode,
      code: error.code,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}

router.get('/documents/:documentId/legal-analyses', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params as { documentId: string };
    const documentSourceType = req.query.documentSourceType
      ? String(req.query.documentSourceType) as LegalAnalysisSourceDocumentType
      : undefined;
    const caseId = req.query.caseId ? String(req.query.caseId) : undefined;

    const analyses = await legalAnalysesService.listLegalAnalyses({
      documentId,
      documentSourceType,
      caseId,
    });

    res.json(analyses);
  } catch (error) {
    console.error('listLegalAnalyses error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

router.post('/documents/:documentId/legal-analyses', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params as { documentId: string };
    const { caseId, documentSourceType, title, analysisText, status, sourceType, aiToolName, anonymizedInputSnapshot } = req.body || {};

    if (!caseId) {
      res.status(400).json({ status: 400, code: 'CASE_ID_REQUIRED', message: 'caseId is required' });
      return;
    }
    if (!analysisText || !String(analysisText).trim()) {
      res.status(400).json({ status: 400, code: 'ANALYSIS_TEXT_REQUIRED', message: 'analysisText is required' });
      return;
    }

    const analysis = await legalAnalysesService.createLegalAnalysis({
      caseId,
      documentId,
      documentSourceType,
      title,
      analysisText,
      status,
      sourceType,
      aiToolName,
      anonymizedInputSnapshot,
      createdById: getUserId(req),
    });

    res.status(201).json(analysis);
  } catch (error) {
    console.error('createLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

router.get('/legal-analyses/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const analysis = await legalAnalysesService.getLegalAnalysis(id);

    if (!analysis) {
      res.status(404).json({ status: 404, code: 'LEGAL_ANALYSIS_NOT_FOUND', message: 'Legal analysis not found' });
      return;
    }

    res.json(analysis);
  } catch (error) {
    console.error('getLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

router.patch('/legal-analyses/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { title, analysisText, status, aiToolName, anonymizedInputSnapshot } = req.body || {};

    const analysis = await legalAnalysesService.updateLegalAnalysis(id, {
      title,
      analysisText,
      status,
      aiToolName,
      anonymizedInputSnapshot,
      reviewedById: getUserId(req),
    });

    res.json(analysis);
  } catch (error) {
    console.error('updateLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

router.delete('/legal-analyses/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    await legalAnalysesService.deleteLegalAnalysis(id, getUserId(req));
    res.status(204).send();
  } catch (error) {
    console.error('deleteLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

export default router;
