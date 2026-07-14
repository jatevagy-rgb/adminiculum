/**
 * Documents Routes V2
 * Document management with SharePoint integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import documentsService from './services';
import { extractText } from './textExtractor';
import reviewSuggestionsRoutes from './reviewSuggestions.routes';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../prisma/prisma.service';
import { isDatabaseFoundationEnabled, sendFeatureUnavailable } from '../../middleware/featureAvailability';
import { requireDocumentReadAccess, requireDocumentManageAccess } from './authorization';
import { safeWorkspaceTextLogContext } from './logging';
import { createTaskFromDocumentSource, SourceLinkedTaskError } from '../tasks/services';
import { getDocumentEditorMetadata } from '../documentEditor/service';
import {
  createDocumentComment,
  DocumentCommentError,
  listDocumentComments,
  reopenDocumentComment,
  resolveDocumentComment,
} from './documentComments.service';

const router = Router();
const isDocumentProcessingEnabled = (): boolean =>
  isDatabaseFoundationEnabled('ENABLE_DOCUMENT_PROCESSING') &&
  isDatabaseFoundationEnabled('ENABLE_DOCUMENT_AI_PRIVACY_MODEL');

const requireDocumentProcessingEnabled = (_req: Request, res: Response, next: NextFunction): void => {
  if (!isDocumentProcessingEnabled()) {
    sendFeatureUnavailable(res, {
      feature: 'DOCUMENT_AI',
      message: 'Document processing and AI/privacy-sensitive document operations are not available in this environment.',
      reason: 'DOCUMENT_AI_NOT_ENABLED',
      nextStep:
        'Document processing requires an approved storage, retention, permission, external-processing, and audit model before it can be enabled.',
    });
    return;
  }
  next();
};

router.use('/:documentId/review-suggestions', reviewSuggestionsRoutes);

/**
 * GET /api/v1/documents/search
 * Metadata search for documents (file name, type, case/client linkage)
 */
router.get('/search', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    const limitParam = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 50)) : 50;

    if (!q) {
      res.json([]);
      return;
    }

    const results = await documentsService.searchDocuments(q, limit);
    res.json(results);
  } catch (error) {
    console.error('Search documents error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/documents
 * Upload new document
 */
router.post('/', authenticate, requireDocumentProcessingEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, fileName, documentType, folder } = req.body;

    if (!caseId || !fileName) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Missing required fields: caseId, fileName' 
      });
      return;
    }

    // For now, require file content (multipart form data would be better for production)
    if (!req.body.fileContent) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Missing fileContent' 
      });
      return;
    }

    let fileContentBuffer: Buffer;
    try {
      fileContentBuffer = Buffer.from(req.body.fileContent as string, 'base64');
      if (!fileContentBuffer.length) {
        throw new Error('Empty decoded buffer');
      }
    } catch {
      res.status(400).json({
        status: 400,
        code: 'INVALID_FILE_CONTENT',
        message: 'A feltöltött fájl tartalma sérült vagy nem base64 formátumú.',
      });
      return;
    }
    
    const result = await documentsService.createDocument({
      caseId,
      fileName,
      fileContent: fileContentBuffer,
      mimeType: req.body.mimeType || 'application/octet-stream',
      documentType: documentType || 'OTHER',
      folder,
      createdById: userId
    });

    // Create TimelineEvent for document upload (AUTOMATIC)
    await prisma.timelineEvent.create({
      data: {
        caseId,
        userId,
        documentId: result.id,
        eventType: 'DOCUMENT_UPLOADED',
        description: `Document uploaded: ${fileName}`,
        metadata: {
          documentId: result.id,
          documentName: fileName,
          documentType: documentType || 'OTHER',
          folder: folder || '01_Client_Input'
        }
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create document error:', error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Case not found') {
      res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message
      });
      return;
    }
    if (message.toLowerCase().includes('sharepoint')) {
      res.status(502).json({
        status: 502,
        code: 'SHAREPOINT_UPLOAD_FAILED',
        message
      });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({
        status: 409,
        code: 'DOCUMENT_UPLOAD_CONFLICT',
        message: 'Dokumentum feltöltése sikertelen. Ütköző dokumentumazonosító keletkezett.'
      });
      return;
    }
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Dokumentum feltöltése sikertelen.'
    });
  }
});

/**
 * GET /api/v1/documents/case/:caseId
 * Get all documents for a case
 */
router.get('/case/:caseId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const documents = await documentsService.getCaseDocuments(caseId);
    res.json(documents);
  } catch (error) {
    console.error('Get case documents error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

/**
 * POST /api/v1/documents/:id/tasks
 * Create a safe source-linked task from document metadata only.
 */
router.post('/:id/tasks', authenticate, requireDocumentReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params as { id: string };
    const result = await createTaskFromDocumentSource(id, userId, req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof SourceLinkedTaskError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    console.error('Create document source task error:', error instanceof Error ? error.message : error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Task creation from document failed.' });
  }
});

function sendDocumentCommentError(res: Response, error: unknown): void {
  if (error instanceof DocumentCommentError) {
    res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
    return;
  }
  console.error('Document comment route error:', error instanceof Error ? error.message : error);
  res.status(500).json({ status: 500, code: 'DOCUMENT_COMMENT_ERROR', message: 'Document comments could not be processed.' });
}

/**
 * GET /api/v1/documents/:id/comments
 * Document-level comments only. No selected text, anchors, editor JSON, or content persistence.
 */
router.get('/:id/comments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await listDocumentComments(req, String(req.params.id || ''), req.query);
    res.json(result);
  } catch (error) {
    sendDocumentCommentError(res, error);
  }
});

/**
 * POST /api/v1/documents/:id/comments
 * Create bounded plain-text document-level comment. Author is always derived from auth.
 */
router.post('/:id/comments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await createDocumentComment(req, String(req.params.id || ''), req.body);
    res.status(201).json(result);
  } catch (error) {
    sendDocumentCommentError(res, error);
  }
});

router.post('/:id/comments/:commentId/resolve', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await resolveDocumentComment(req, String(req.params.id || ''), String(req.params.commentId || ''));
    res.json(result);
  } catch (error) {
    sendDocumentCommentError(res, error);
  }
});

router.post('/:id/comments/:commentId/reopen', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await reopenDocumentComment(req, String(req.params.id || ''), String(req.params.commentId || ''));
    res.json(result);
  } catch (error) {
    sendDocumentCommentError(res, error);
  }
});

/**
 * GET /api/v1/documents/:id/editor
 * Editor metadata/capability contract. Mode C only: no persisted editor content.
 */
router.get('/:id/editor', authenticate, requireDocumentReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const dto = await getDocumentEditorMetadata(req, String(req.params.id || ''));
    if (!dto) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found',
      });
      return;
    }
    res.json(dto);
  } catch {
    res.status(500).json({
      status: 500,
      code: 'DOCUMENT_EDITOR_METADATA_UNAVAILABLE',
      message: 'Document editor metadata could not be loaded.',
    });
  }
});

/**
 * GET /api/v1/documents/:id
 * Get document by ID
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const document = await documentsService.getDocumentById(id);
    
    if (!document) {
      res.status(404).json({ 
        status: 404, 
        code: 'NOT_FOUND', 
        message: 'Document not found' 
      });
      return;
    }

    res.json(document);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

/**
 * GET /api/v1/documents/:id/text
 * Extract readable text from the real SharePoint-backed document when available.
 */
router.get('/:id/text', authenticate, requireDocumentProcessingEnabled, requireDocumentReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
const { id } = req.params as { id: string };
    const document = await prisma.document.findUnique({ where: { id } });

    if (!document) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
      return;
    }

    if (document.documentType === 'MODIFIED_WORKING_COPY' && document.workspaceText?.trim()) {
      res.json({
        documentId: id,
        source: 'MODIFIED_WORKING_COPY',
        text: document.workspaceText,
        extractedAt: document.updatedAt.toISOString(),
      });
      return;
    }

    if (!document.spItemId) {
      res.json({
        documentId: id,
        source: 'UPLOADED',
        text: '',
        unavailableReason: 'A dokumentumhoz nincs SharePoint azonosító, ezért a szöveg nem nyerhető ki.',
      });
      return;
    }

    const driveService = (await import('../sharepoint/driveService.js')).default;
    const fileBuffer = await driveService.downloadDocument(document.spItemId);
    if (!fileBuffer) {
      res.json({
        documentId: id,
        source: 'UPLOADED',
        text: '',
        unavailableReason: 'A dokumentum letöltése SharePointból nem sikerült.',
      });
      return;
    }

    const extraction = await extractText(fileBuffer, document.mimeType || 'application/octet-stream', document.fileName || document.name || undefined);
    if (!extraction.success || !extraction.text?.trim()) {
      res.json({
        documentId: id,
        source: 'UPLOADED',
        text: '',
        format: extraction.format,
        unavailableReason: extraction.error || 'A dokumentum nem tartalmaz olvasható szöveget.',
      });
      return;
    }

    res.json({
      documentId: id,
      source: 'UPLOADED',
      text: extraction.text,
      format: extraction.format,
      pageCount: extraction.pageCount,
      extractedAt: new Date().toISOString(),
    });
  } catch (error) {
    // Content-free logging only: this route handles raw workspaceText, so never log
    // the raw error object (it may serialize legal text or query params).
    console.error(
      'Extract document text error',
      safeWorkspaceTextLogContext({ action: 'workspace_text_read', result: 'error', documentId: String(req.params.id || ''), error })
    );
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'A dokumentumszöveg kinyerése sikertelen.' });
  }
});

/**
 * POST /api/v1/documents/:id/version
 * Upload new version
 */
router.post('/:id/version', authenticate, requireDocumentProcessingEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { fileContent, comment } = req.body;

    if (!fileContent) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Missing fileContent' 
      });
      return;
    }

    const { id } = req.params as { id: string };
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(fileContent as string, 'base64');
      if (!fileBuffer.length) {
        throw new Error('Empty decoded buffer');
      }
    } catch {
      res.status(400).json({
        status: 400,
        code: 'INVALID_FILE_CONTENT',
        message: 'A verziófájl tartalma sérült vagy nem base64 formátumú.',
      });
      return;
    }
    const result = await documentsService.uploadNewVersion(
      id,
      fileBuffer,
      userId,
      comment
    );

    if (!result) {
      res.status(500).json({ 
        status: 500, 
        code: 'UPLOAD_FAILED', 
        message: 'Failed to upload version' 
      });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Upload version error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

/**
 * POST /api/v1/documents/:id/submit-review
 * Submit document for review
 */
router.post('/:id/submit-review', authenticate, requireDocumentProcessingEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params as { id: string };
    const success = await documentsService.submitForReview(id, userId);

    if (!success) {
      res.status(500).json({ 
        status: 500, 
        code: 'OPERATION_FAILED', 
        message: 'Failed to submit for review' 
      });
      return;
    }

    res.json({ success: true, message: 'Document submitted for review' });
  } catch (error) {
    console.error('Submit for review error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

/**
 * POST /api/v1/documents/:id/approve
 * Approve document
 */
router.post('/:id/approve', authenticate, requireDocumentProcessingEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { comment } = req.body;
    const { id } = req.params as { id: string };
    const success = await documentsService.approveDocument(id, userId, comment);

    if (!success) {
      res.status(500).json({ 
        status: 500, 
        code: 'OPERATION_FAILED', 
        message: 'Failed to approve document' 
      });
      return;
    }

    res.json({ success: true, message: 'Document approved' });
  } catch (error) {
    console.error('Approve document error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

/**
 * POST /api/v1/documents/:id/reject
 * Reject document
 */
router.post('/:id/reject', authenticate, requireDocumentProcessingEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Reason is required' 
      });
      return;
    }

    const { id } = req.params as { id: string };
    const success = await documentsService.rejectDocument(id, userId, reason);

    if (!success) {
      res.status(500).json({ 
        status: 500, 
        code: 'OPERATION_FAILED', 
        message: 'Failed to reject document' 
      });
      return;
    }

    res.json({ success: true, message: 'Document rejected' });
  } catch (error) {
    console.error('Reject document error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

/**
 * POST /api/v1/documents/:documentId/save-workspace-version
 * Save the workspace editor's draft text as a new "modified working copy" document.
 * Does NOT overwrite the original document.
 */
router.post('/:id/save-workspace-version', authenticate, requireDocumentProcessingEnabled, requireDocumentManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { text, title, note } = req.body as { text?: string; title?: string; note?: string };

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'A munkapéldány szövege üres. Nem menthető.'
      });
      return;
    }

    const { id } = req.params as { id: string };
    const original = await prisma.document.findUnique({ where: { id } });

    if (!original) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Eredeti dokumentum nem található.' });
      return;
    }

    const newName = title?.trim() || `${original.name} — módosított munkapéldány`;
    const trimmedText = text.trim();

    const newDocument = await prisma.document.create({
      data: {
        name: newName,
        description: note || 'Szöveges módosított munkapéldány. Ügyvédi ellenőrzés szükséges.',
        mimeType: 'text/plain',
        category: (original.category as any) || 'INTERNAL_MEMO',
        caseId: original.caseId,
        clientId: original.clientId,
        fileName: newName,
        documentType: 'MODIFIED_WORKING_COPY',
        folder: 'DRAFTS',
        currentVersion: 1,
        isLatest: true,
        workspaceText: trimmedText,
      }
    });

    await prisma.timelineEvent.create({
      data: {
        caseId: original.caseId,
        userId,
        documentId: newDocument.id,
        eventType: 'DOCUMENT_VERSION_CREATED',
        description: `Módosított munkapéldány létrehozva: ${newName}`,
        metadata: {
          sourceDocumentId: original.id,
          sourceDocumentName: original.name,
          workspaceVersion: true,
        }
      }
    });

    res.status(201).json({
      id: newDocument.id,
      name: newDocument.name,
      description: newDocument.description,
      caseId: newDocument.caseId,
      clientId: newDocument.clientId,
      fileName: newDocument.fileName,
      documentType: newDocument.documentType,
      category: newDocument.category,
      createdAt: newDocument.createdAt,
      updatedAt: newDocument.updatedAt,
    });
  } catch (error) {
    // Content-free logging only: the raw workspace text is in scope here, so never log
    // the raw error object (Prisma errors can echo the input value / query params).
    console.error(
      'Save workspace version error',
      safeWorkspaceTextLogContext({ action: 'workspace_text_update', result: 'error', documentId: String(req.params.id || ''), actorId: (req as any).user?.userId, error })
    );
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Módosított munkapéldány mentése sikertelen.' });
  }
});

/**
 * GET /api/v1/documents/:id/download
 * Download document from SharePoint
 */
router.get('/:id/download', authenticate, requireDocumentProcessingEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    // Get document to find SharePoint item ID
    const document = await prisma.document.findUnique({
      where: { id }
    });

    if (!document) {
      res.status(404).json({ 
        status: 404, 
        code: 'NOT_FOUND', 
        message: 'Document not found' 
      });
      return;
    }

    if (!document.spItemId) {
      res.status(400).json({ 
        status: 400, 
        code: 'NO_SHAREPOINT_ITEM', 
        message: 'Document has no SharePoint item ID' 
      });
      return;
    }

    // Download from SharePoint
    const driveService = (await import('../sharepoint/driveService.js')).default;
    const downloadResult = await driveService.downloadDocumentResult(document.spItemId);

    if (downloadResult.success === false) {
      const mappedStatus =
        downloadResult.status ||
        (downloadResult.code === 'SHAREPOINT_FILE_NOT_FOUND' ? 404 : 502);
      res.status(mappedStatus).json({
        status: mappedStatus,
        code: downloadResult.code,
        message: downloadResult.error,
      });
      return;
    }

    // Return file with appropriate headers
    const fileName = document.fileName || document.name || 'document.txt';
    const mimeType = document.mimeType || 'application/octet-stream';
    const encodedFileName = encodeURIComponent(fileName);
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, "'")}"; filename*=UTF-8''${encodedFileName}`
    );
    res.setHeader('Content-Length', downloadResult.content.length);
    res.send(downloadResult.content);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ 
      status: 500, 
      code: 'INTERNAL_ERROR', 
      message: 'Internal server error' 
    });
  }
});

export default router;
