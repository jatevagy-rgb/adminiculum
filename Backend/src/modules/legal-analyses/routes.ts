// ============================================================================
// LEGAL ANALYSIS ROUTES — SEC-0B1: Case-level authorization + DTO shaping
// ============================================================================

import { Router, Request, Response } from 'express';
import legalAnalysesService, {
  LegalAnalysisServiceError,
  type LegalAnalysisSourceDocumentType,
} from './service';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';
import { authenticate } from '../../middleware/auth';
import { requireAnonymizeManageAccess, resolveCaseFromDocumentId, resolveCaseFromLegalAnalysisId, canAccessSensitiveCase, checkCaseAccess } from '../anonymize/caseAuthorization';
import { toSummary, toWorking, toSensitive } from './dto';

const router = Router();
const requireLegalAnalysisFoundation = requireDatabaseFoundation({
  feature: 'LEGAL_ANALYSES',
  enabled: () => isDatabaseFoundationEnabled('ENABLE_LEGAL_ANALYSES'),
  message: 'Legal analysis persistence is not available in this environment.',
  nextStep: 'Complete the legal analysis database reconciliation before enabling this feature.',
});

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

async function analysisDto(req: Request, caseId: string, analysis: any) {
  return await canAccessSensitiveCase(req, caseId) ? toSensitive(analysis) : toWorking(analysis);
}

// ---------------------------------------------------------------------------
// Middleware: require read access on a case resolved from document param
// ---------------------------------------------------------------------------

function requireReadAccessOnDocumentCase(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const documentId = String(req.params.documentId || '').trim();
  if (!documentId) {
    res.status(400).json({ status: 400, code: 'INVALID_PARAM', message: 'documentId is required' });
    return;
  }

  resolveCaseFromDocumentId(documentId)
    .then(async (caseId) => {
      if (!caseId) {
        res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
        return;
      }
      const access = await checkCaseAccess(req, caseId, 'read');
      if (access === null) {
        res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
        return;
      }
      if (!access) {
        res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
        return;
      }
      (req as any).__resolvedCaseId = caseId;
      next();
    })
    .catch(() => {
      res.status(500).json({ status: 500, code: 'CASE_AUTHORIZATION_ERROR', message: 'Case access could not be verified.' });
    });
}

// ---------------------------------------------------------------------------
// Middleware: require read access on a case resolved from analysis id param
// ---------------------------------------------------------------------------

function requireReadAccessOnAnalysisCase(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ status: 400, code: 'INVALID_PARAM', message: 'id is required' });
    return;
  }

  resolveCaseFromLegalAnalysisId(id)
    .then(async (caseId) => {
      if (!caseId) {
        res.status(404).json({ status: 404, code: 'LEGAL_ANALYSIS_NOT_FOUND', message: 'Legal analysis not found' });
        return;
      }
      const access = await checkCaseAccess(req, caseId, 'read');
      if (access === null) {
        res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
        return;
      }
      if (!access) {
        res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
        return;
      }
      (req as any).__resolvedCaseId = caseId;
      next();
    })
    .catch(() => {
      res.status(500).json({ status: 500, code: 'CASE_AUTHORIZATION_ERROR', message: 'Case access could not be verified.' });
    });
}

// ---------------------------------------------------------------------------
// Middleware: require manage access on a case resolved from analysis id param
// ---------------------------------------------------------------------------

function requireManageAccessOnAnalysisCase(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ status: 400, code: 'INVALID_PARAM', message: 'id is required' });
    return;
  }

  resolveCaseFromLegalAnalysisId(id)
    .then(async (caseId) => {
      if (!caseId) {
        res.status(404).json({ status: 404, code: 'LEGAL_ANALYSIS_NOT_FOUND', message: 'Legal analysis not found' });
        return;
      }
      const access = await checkCaseAccess(req, caseId, 'manage');
      if (access === null) {
        res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
        return;
      }
      if (!access) {
        res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
        return;
      }
      (req as any).__resolvedCaseId = caseId;
      next();
    })
    .catch(() => {
      res.status(500).json({ status: 500, code: 'CASE_AUTHORIZATION_ERROR', message: 'Case access could not be verified.' });
    });
}

// ============================================================================
// GET /api/v1/documents/:documentId/legal-analyses
// Requires: read access on source document's case
// Response: Summary DTO list (no analysis text, no PII)
// ============================================================================
router.get('/documents/:documentId/legal-analyses', authenticate, requireLegalAnalysisFoundation, requireReadAccessOnDocumentCase, async (req: Request, res: Response): Promise<void> => {
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

    // Summary DTO — no analysis text, no PII
    res.json(analyses.map(toSummary));
  } catch (error) {
    console.error('listLegalAnalyses error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// ============================================================================
// POST /api/v1/documents/:documentId/legal-analyses
// Requires: manage access on the source document's server-resolved case
// ============================================================================
router.post('/documents/:documentId/legal-analyses', authenticate, requireLegalAnalysisFoundation, requireAnonymizeManageAccess('documentId', resolveCaseFromDocumentId), async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params as { documentId: string };
    const { caseId, documentSourceType, title, analysisText, status, sourceType, aiToolName, anonymizedInputSnapshot } = req.body || {};
    const resolvedCaseId = String((req as any).__resolvedCaseId || '');

    if (!resolvedCaseId) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }
    if (caseId !== undefined && String(caseId) !== resolvedCaseId) {
      res.status(400).json({ status: 400, code: 'SOURCE_CASE_MISMATCH', message: 'Source document does not belong to the provided case.' });
      return;
    }
    if (!analysisText || !String(analysisText).trim()) {
      res.status(400).json({ status: 400, code: 'ANALYSIS_TEXT_REQUIRED', message: 'analysisText is required' });
      return;
    }

    const analysis = await legalAnalysesService.createLegalAnalysis({
      caseId: resolvedCaseId,
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

    res.status(201).json(await analysisDto(req, resolvedCaseId, analysis));
  } catch (error) {
    console.error('createLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// ============================================================================
// GET /api/v1/legal-analyses/:id
// Requires: read access on analysis's case
// Response: Working DTO (analysis text included, no PII)
// ============================================================================
router.get('/legal-analyses/:id', authenticate, requireLegalAnalysisFoundation, requireReadAccessOnAnalysisCase, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const analysis = await legalAnalysesService.getLegalAnalysis(id);

    if (!analysis) {
      res.status(404).json({ status: 404, code: 'LEGAL_ANALYSIS_NOT_FOUND', message: 'Legal analysis not found' });
      return;
    }

    // Determine DTO level based on user's sensitive access
    res.json(await analysisDto(req, String((req as any).__resolvedCaseId || ''), analysis));
  } catch (error) {
    console.error('getLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// ============================================================================
// PATCH /api/v1/legal-analyses/:id
// Requires: manage access on analysis's case
// ============================================================================
router.patch('/legal-analyses/:id', authenticate, requireLegalAnalysisFoundation, requireManageAccessOnAnalysisCase, async (req: Request, res: Response): Promise<void> => {
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

    res.json(await analysisDto(req, String((req as any).__resolvedCaseId || ''), analysis));
  } catch (error) {
    console.error('updateLegalAnalysis error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// ============================================================================
// DELETE /api/v1/legal-analyses/:id
// Requires: manage access on analysis's case
// ============================================================================
router.delete('/legal-analyses/:id', authenticate, requireLegalAnalysisFoundation, requireManageAccessOnAnalysisCase, async (req: Request, res: Response): Promise<void> => {
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
