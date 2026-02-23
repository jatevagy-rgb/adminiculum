// ============================================================================
// ANONYMIZE ROUTES - Dokumentum anonimizálás endpointok
// ============================================================================

import { Router, Request, Response } from 'express';
import anonymizeService from './services.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// ============================================================================
// POST /api/v1/documents/:documentId/anonymize
// ============================================================================
router.post('/documents/:documentId/anonymize', authenticate, async (req: Request, res: Response) => {
  try {
    const documentIdParam = req.params.documentId;
    const documentId = Array.isArray(documentIdParam) ? documentIdParam[0] : documentIdParam;
    const { aiTask, customPrompt, redactionLevel } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Felhasználó nem azonosított' });
    }

    const result = await anonymizeService.anonymizeDocument({
      documentId,
      userId,
      aiTask,
      customPrompt,
      redactionLevel
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Anonymize error:', error);
    res.status(500).json({ error: 'Hiba az anonimizálás során' });
  }
});

// ============================================================================
// GET /api/v1/clients/:clientId/redaction-profile
// ============================================================================
router.get('/clients/:clientId/redaction-profile', authenticate, async (req: Request, res: Response) => {
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
router.post('/clients/:clientId/redaction-profile', authenticate, async (req: Request, res: Response) => {
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
router.get('/anonymous-documents/:id', authenticate, async (req: Request, res: Response) => {
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

export default router;
