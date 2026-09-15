import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { linkComplianceDocument, listComplianceDocuments, unlinkComplianceDocument } from './complianceDocumentService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function respond(error: unknown, res: Response, fallbackCode: string): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: fallbackCode, message: 'Compliance document request failed.' });
}

router.use(authenticate);

router.get('/clients/:clientId/documents', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listComplianceDocuments(actor(req), String(req.params.clientId)));
  } catch (error) {
    respond(error, res, 'COMPLIANCE_DOCUMENT_LIST_ERROR');
  }
});

router.post('/clients/:clientId/documents', async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await linkComplianceDocument(actor(req), {
      clientId: String(req.params.clientId),
      requirementKey: String(req.body?.requirementKey || ''),
      documentId: String(req.body?.documentId || ''),
      audience: String(req.body?.audience || ''),
    }));
  } catch (error) {
    respond(error, res, 'COMPLIANCE_DOCUMENT_LINK_ERROR');
  }
});

router.delete('/clients/:clientId/documents/:complianceDocumentId', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await unlinkComplianceDocument(actor(req), {
      clientId: String(req.params.clientId),
      complianceDocumentId: String(req.params.complianceDocumentId),
    }));
  } catch (error) {
    respond(error, res, 'COMPLIANCE_DOCUMENT_UNLINK_ERROR');
  }
});

export default router;
