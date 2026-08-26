// ============================================================================
// ANONYMIZE ROUTES - Dokumentum anonimizálás endpointok
// SEC-0B1: Case-level authorization + DTO-level response shaping
// ============================================================================

import { Router, Request, Response } from 'express';
import anonymizeService from './services';
import { authenticate } from '../../middleware/auth';
import {
  requireAnonymizeReadAccess,
  requireAnonymizeManageAccess,
  requireAnonymizeSensitiveAccess,
  requireClientSensitiveAccess,
  canAccessSensitiveCase,
  resolveCaseFromDocumentId,
  resolveCaseFromAnonymousDocumentId,
  resolveCaseFromSourceDocumentId,
  hasSensitiveAccess,
  checkCaseAccess,
} from './caseAuthorization';
import { toSummary, toWorking, toSensitive, toWorkingAnonymizationResult, toSensitiveClientRedactionProfile } from './dto';

const router = Router();

// ============================================================================
// FEATURE FLAG GUARD — AI Anonymization
// ============================================================================
function requireAnonymizeEnabled(req: Request, res: Response, next: () => void) {
  if (process.env.ENABLE_AI_ANONYMIZATION !== 'true') {
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'AI Anonymization feature is disabled. Set ENABLE_AI_ANONYMIZATION=true to enable.',
    });
  }
  next();
}

// ============================================================================
// POST /api/v1/documents/:documentId/anonymize
// Requires: manage access on source document's case
// ============================================================================
router.post(
  '/documents/:documentId/anonymize',
  authenticate,
  requireAnonymizeEnabled,
  requireAnonymizeManageAccess('documentId', resolveCaseFromDocumentId),
  async (req: Request, res: Response) => {
    try {
      const documentIdParam = req.params.documentId;
      const documentId = Array.isArray(documentIdParam) ? documentIdParam[0] : documentIdParam;
      const { aiTask, customPrompt, redactionLevel, counterparties, sourceText, metadata } = req.body;
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Felhasználó nem azonosított' });
      }

      const result = await anonymizeService.anonymizeDocument({
        documentId,
        userId,
        aiTask,
        customPrompt,
        redactionLevel,
        counterparties,
        sourceText,
        metadata,
      });

      if (!result.success) {
        return res.status(400).json({
          status: 400,
          code: 'ANONYMIZATION_FAILED',
          message: 'A dokumentum anonimizálása nem sikerült.',
        });
      }

      res.json(toWorkingAnonymizationResult(result));
    } catch (error) {
      console.error('Anonymize error:', error);
      res.status(500).json({
        error: 'Hiba az anonimizálás során',
      });
    }
  },
);

// ============================================================================
// GET /api/v1/documents/:documentId/anonymization-source
// Requires: read access on source document's case
// ============================================================================
router.get(
  '/documents/:documentId/anonymization-source',
  authenticate,
  requireAnonymizeEnabled,
  requireAnonymizeSensitiveAccess('documentId', resolveCaseFromDocumentId),
  async (req: Request, res: Response) => {
    try {
      const documentIdParam = req.params.documentId;
      const documentId = Array.isArray(documentIdParam) ? documentIdParam[0] : documentIdParam;

      const result = await anonymizeService.getAnonymizationSourceText(documentId);
      res.json(result);
    } catch (error) {
      console.error('Get anonymization source error:', error);
      res.status(500).json({
        success: false,
        textAvailable: false,
        error: 'Hiba a forrásszöveg lekérésekor',
      });
    }
  },
);

// ============================================================================
// GET /api/v1/clients/:clientId/redaction-profile
// Requires: read access on client's case
// ============================================================================
router.get(
  '/clients/:clientId/redaction-profile',
  authenticate,
  requireAnonymizeEnabled,
  requireClientSensitiveAccess('read'),
  async (req: Request, res: Response) => {
    try {
      const clientIdParam = req.params.clientId;
      const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;

      const profile = await anonymizeService.getClientRedactionProfile(clientId);

      res.json(profile ? toSensitiveClientRedactionProfile(profile as unknown as Record<string, unknown>) : { error: 'Nincs redakciós profil' });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Hiba a profil lekérésekor' });
    }
  },
);

// ============================================================================
// POST /api/v1/clients/:clientId/redaction-profile
// Requires: manage access on client's case
// ============================================================================
router.post(
  '/clients/:clientId/redaction-profile',
  authenticate,
  requireAnonymizeEnabled,
  requireClientSensitiveAccess('manage'),
  async (req: Request, res: Response) => {
    try {
      const clientIdParam = req.params.clientId;
      const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
      const { fullName, aliases, addresses, taxId, personalId, bankAccounts, phones, emails } = req.body;

      const profile = await anonymizeService.upsertRedactionProfile({
        clientId,
        fullName,
        aliases,
        addresses,
        taxId,
        personalId,
        bankAccounts,
        phones,
        emails
      });

      res.json(toSensitiveClientRedactionProfile(profile as unknown as Record<string, unknown>));
    } catch (error) {
      console.error('Upsert profile error:', error);
      res.status(500).json({ error: 'Hiba a profil mentésekor' });
    }
  },
);

// ============================================================================
// GET /api/v1/anonymous-documents/:id
// Requires: read access on anonymous document's case
// Response: Working DTO (safe for workspace, no PII)
// ============================================================================
router.get(
  '/anonymous-documents/:id',
  authenticate,
  requireAnonymizeEnabled,
  requireAnonymizeReadAccess('id', resolveCaseFromAnonymousDocumentId),
  async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;

      const doc = await anonymizeService.getAnonymousDocument(id);

      if (!doc) {
        return res.status(404).json({ error: 'Anoním dokumentum nem található' });
      }

      // Determine DTO level based on user's sensitive access
      const caseId = (req as any).__resolvedCaseId;
      const user = (req as any).user;
      let isSensitive = false;
      if (caseId && user?.userId) {
        const { prisma } = await import('../../prisma/prisma.service');
        const caseRecord = await prisma.case.findUnique({
          where: { id: caseId },
          select: { assignedLawyerId: true, createdById: true },
        });
        if (caseRecord) {
          isSensitive = hasSensitiveAccess(req, caseRecord);
        }
      }

      const response = isSensitive ? toSensitive(doc) : toWorking(doc);
      res.json(response);
    } catch (error) {
      console.error('Get anonymous doc error:', error);
      res.status(500).json({ error: 'Hiba a dokumentum lekérésekor' });
    }
  },
);

// ============================================================================
// POST /api/v1/anonymous-documents/:id/import-ai-response
// Requires: manage access on anonymous document's case
// ============================================================================
router.post(
  '/anonymous-documents/:id/import-ai-response',
  authenticate,
  requireAnonymizeEnabled,
  requireAnonymizeManageAccess('id', resolveCaseFromAnonymousDocumentId),
  async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;

      const { aiResponseText } = req.body;
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Felhasználó nem azonosított' });
      }

      if (!aiResponseText || typeof aiResponseText !== 'string') {
        return res.status(400).json({ error: 'AI response text is required' });
      }

      const result = await anonymizeService.importAIResponse({
        anonymousDocId: id,
        aiResponseText,
        userId
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const caseId = String((req as any).__resolvedCaseId || '');
      const doc = await anonymizeService.getAnonymousDocument(id);
      const sensitive = caseId && await canAccessSensitiveCase(req, caseId);
      res.json({
        success: true,
        anonymousDocId: result.anonymousDocId,
        rehydrationStatus: result.rehydrationStatus,
        totalTokens: result.totalTokens,
        resolvedTokens: result.resolvedTokens,
        unresolvedTokens: result.unresolvedTokens,
        document: doc ? (sensitive ? toSensitive(doc) : toWorking(doc)) : null,
      });
    } catch (error) {
      console.error('Import AI response error:', error);
      res.status(500).json({ error: 'Hiba az AI válasz importálása során' });
    }
  },
);

// ============================================================================
// POST /api/v1/anonymous-documents/:id/save-as-document
// Requires: manage access on anonymous document's case
// ============================================================================
router.post(
  '/anonymous-documents/:id/save-as-document',
  authenticate,
  requireAnonymizeEnabled,
  requireAnonymizeManageAccess('id', resolveCaseFromAnonymousDocumentId),
  async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Felhasználó nem azonosított' });
      }

      const result = await anonymizeService.saveRehydratedResultToDocument({
        anonymousDocId: id,
        userId
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        documentId: result.documentId,
        fileName: result.fileName
      });
    } catch (error) {
      console.error('Save as document error:', error);
      res.status(500).json({ error: 'Hiba a dokumentum mentése során' });
    }
  },
);

// ============================================================================
// GET /api/v1/anonymous-documents/by-source/:sourceDocumentId
// Requires: read access on source document's case
// Response: Working DTO list (workspace needs redactedText + redactedItems)
// ============================================================================
router.get(
  '/anonymous-documents/by-source/:sourceDocumentId',
  authenticate,
  requireAnonymizeEnabled,
  requireAnonymizeReadAccess('sourceDocumentId', resolveCaseFromSourceDocumentId),
  async (req: Request, res: Response) => {
    try {
      const sourceDocIdParam = req.params.sourceDocumentId;
      const sourceDocumentId = Array.isArray(sourceDocIdParam) ? sourceDocIdParam[0] : sourceDocIdParam;

      if (!sourceDocumentId) {
        return res.status(400).json({ error: 'sourceDocumentId is required' });
      }

      const docs = await anonymizeService.listAnonymousDocumentsBySource(sourceDocumentId);

      // Resolve case access for DTO level
      const caseId = docs.length > 0 ? docs[0].caseId : null;
      const user = (req as any).user;
      let isSensitive = false;
      if (caseId && user?.userId) {
        const { prisma } = await import('../../prisma/prisma.service');
        const caseRecord = await prisma.case.findUnique({
          where: { id: caseId },
          select: { assignedLawyerId: true, createdById: true },
        });
        if (caseRecord) {
          isSensitive = hasSensitiveAccess(req, caseRecord);
        }
      }

      const result = docs.map(doc => isSensitive ? toSensitive(doc) : toWorking(doc));

      res.json(result);
    } catch (error) {
      console.error('List anonymous docs by source error:', error);
      res.status(500).json({ error: 'Hiba a dokumentumok lekérésekor' });
    }
  },
);

// ============================================================================
// GET /api/v1/anonymous-documents?caseId=xxx
// Requires: read access on caseId query param
// Response: Summary DTO list (no content, safe for list views)
// ============================================================================
router.get(
  '/anonymous-documents',
  authenticate,
  requireAnonymizeEnabled,
  async (req: Request, res: Response) => {
    try {
      const { caseId, sourceDocId } = req.query;

      if (!caseId && !sourceDocId) {
        return res.status(400).json({ error: 'caseId or sourceDocId query parameter required' });
      }

      // Case-level authorization for caseId path
      if (caseId) {
        const access = await checkCaseAccess(req, caseId as string, 'read');
        if (access === null) {
          return res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
        }
        if (!access) {
          return res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
        }
      }

      let docs;
      if (caseId) {
        docs = await anonymizeService.listAnonymousDocumentsByCase(caseId as string);
      } else {
        // sourceDocId path: resolve case from source document and check access
        const caseIdFromSource = await resolveCaseFromSourceDocumentId(sourceDocId as string);
        if (!caseIdFromSource) {
          return res.status(404).json({ status: 404, code: 'SOURCE_DOCUMENT_NOT_FOUND', message: 'Source document not found.' });
        }
        const access = await checkCaseAccess(req, caseIdFromSource, 'read');
        if (access !== true) {
          return res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'You do not have access to this case.' });
        }
        docs = await anonymizeService.listAnonymousDocumentsBySource(sourceDocId as string);
      }

      // Summary DTO — no content, no PII
      const safeDocs = docs.map(doc => toSummary(doc));

      res.json(safeDocs);
    } catch (error) {
      console.error('List anonymous docs error:', error);
      res.status(500).json({ error: 'Hiba a dokumentumok lekérésekor' });
    }
  },
);

export default router;
