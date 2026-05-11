// ============================================================================
// ANONYMIZE ROUTES - Dokumentum anonimizálás endpointok
// ============================================================================

import { Router, Request, Response } from 'express';
import anonymizeService from './services.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// ============================================================================
// FEATURE FLAG GUARD — AI Anonymization
// ============================================================================
const isAnonymizeEnabled = process.env.ENABLE_AI_ANONYMIZATION === 'true';

function requireAnonymizeEnabled(req: Request, res: Response, next: () => void) {
  if (!isAnonymizeEnabled) {
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'AI Anonymization feature is disabled. Set ENABLE_AI_ANONYMIZATION=true to enable.',
    });
  }
  next();
}

// ============================================================================
// POST /api/v1/documents/:documentId/anonymize
// ============================================================================
router.post('/documents/:documentId/anonymize', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
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
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Anonymize error:', error);
    res.status(500).json({
      error: 'Hiba az anonimizálás során',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// GET /api/v1/documents/:documentId/anonymization-source
// ============================================================================
router.get('/documents/:documentId/anonymization-source', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
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
});

// ============================================================================
// GET /api/v1/clients/:clientId/redaction-profile
// ============================================================================
router.get('/clients/:clientId/redaction-profile', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
  try {
    const clientIdParam = req.params.clientId;
    const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;

    const profile = await anonymizeService.getClientRedactionProfile(clientId);

    res.json(profile || { error: 'Nincs redakciós profil' });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Hiba a profil lekérésekor' });
  }
});

// ============================================================================
// POST /api/v1/clients/:clientId/redaction-profile
// ============================================================================
router.post('/clients/:clientId/redaction-profile', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
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

    res.json(profile);
  } catch (error) {
    console.error('Upsert profile error:', error);
    res.status(500).json({ error: 'Hiba a profil mentésekor' });
  }
});

// ============================================================================
// GET /api/v1/anonymous-documents/:id
// ============================================================================
router.get('/anonymous-documents/:id', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    const doc = await anonymizeService.getAnonymousDocument(id);

    if (!doc) {
      return res.status(404).json({ error: 'Anoním dokumentum nem található' });
    }

    res.json(doc);
  } catch (error) {
    console.error('Get anonymous doc error:', error);
    res.status(500).json({ error: 'Hiba a dokumentum lekérésekor' });
  }
});

// ============================================================================
// POST /api/v1/anonymous-documents/:id/import-ai-response
// ============================================================================
// Import external AI response and rehydrate the anonymized content
router.post('/anonymous-documents/:id/import-ai-response', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
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

    res.json({
      success: true,
      anonymousDocId: result.anonymousDocId,
      rehydrationStatus: result.rehydrationStatus,
      rehydratedContent: result.rehydratedContent,
      warnings: result.warnings || [],
      totalTokens: result.totalTokens,
      resolvedTokens: result.resolvedTokens,
      unresolvedTokens: result.unresolvedTokens
    });
  } catch (error) {
    console.error('Import AI response error:', error);
    res.status(500).json({ error: 'Hiba az AI válasz importálása során' });
  }
});

// ============================================================================
// POST /api/v1/anonymous-documents/:id/save-as-document
// ============================================================================
// Save rehydrated result as a reviewable Document
router.post('/anonymous-documents/:id/save-as-document', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
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
});

// ============================================================================
// GET /api/v1/anonymous-documents?caseId=xxx
// ============================================================================
// List anonymous documents for a case
router.get('/anonymous-documents', authenticate, requireAnonymizeEnabled, async (req: Request, res: Response) => {
  try {
    const { caseId, sourceDocId } = req.query;
    
    if (!caseId && !sourceDocId) {
      return res.status(400).json({ error: 'caseId or sourceDocId query parameter required' });
    }

    let docs;
    if (caseId) {
      docs = await anonymizeService.listAnonymousDocumentsByCase(caseId as string);
    } else {
      docs = await anonymizeService.listAnonymousDocumentsBySource(sourceDocId as string);
    }

    // Return a safe subset of fields (not the full content for list view)
    const safeDocs = docs.map(doc => ({
      id: doc.id,
      name: doc.name,
      sourceDocId: doc.sourceDocId,
      caseId: doc.caseId,
      aiTask: doc.aiTask,
      customPrompt: doc.customPrompt,
      rehydrationStatus: doc.rehydrationStatus,
      rehydratedAt: doc.rehydratedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));

    res.json(safeDocs);
  } catch (error) {
    console.error('List anonymous docs error:', error);
    res.status(500).json({ error: 'Hiba a dokumentumok lekérésekor' });
  }
});

export default router;
