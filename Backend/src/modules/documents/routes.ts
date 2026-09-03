/**
 * Documents Routes V2
 * Document management with SharePoint integration
 */

import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import documentsService from './services';
import { DocumentDeleteError, DocumentStorageUploadError } from './services';
import { extractText } from './textExtractor';
import annotationRoutes from './annotations.routes';
import {
  getDocumentWorkContext,
  updateDocumentWorkContext,
  linkDocumentTask,
  unlinkDocumentTask,
  listTaskDocuments,
  sendWorkContextError,
} from './workContext.service';
import reviewSuggestionsRoutes from './reviewSuggestions.routes';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { prisma } from '../../prisma/prisma.service';
import { requireDocumentReadAccess, requireDocumentManageAccess, requireHrConfidentialReadAccess } from './authorization';
import { validateWorkforceUpload, mapWorkforceUploadRejection } from '../upload-security/uploadValidationCore';
import { requireDocumentObjectReadAccess, requireDocumentObjectManageAccess } from './documentObjectAuthorization';
import { getCaseReadScope, userCanManageCase, requireCaseReadAccess } from '../cases/authorization';
import { createTaskFromDocumentSource, SourceLinkedTaskError } from '../tasks/services';
import { getDocumentEditorMetadata } from '../documentEditor/service';
import { retryDocumentVersionScan, securityScanBlock } from './securityScan.service';
import {
  createDocumentComment,
  DocumentCommentError,
  listDocumentComments,
  reopenDocumentComment,
  resolveDocumentComment,
} from './documentComments.service';

const router = Router();
router.use(authenticate, requireWorkforceUser);
router.use('/:documentId/review-suggestions', reviewSuggestionsRoutes);
router.use('/:documentId/versions/:versionId/annotations', annotationRoutes);

// ============================================================================
// Document work context (DOCUMENT-WORK-CONTEXT-1)
// Logical document work metadata and the two-way document/task relationship.
// Version review/publication state is untouched by these routes.
// ============================================================================
router.get('/:id/work-context', authenticate, requireDocumentObjectReadAccess, async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getDocumentWorkContext(req, String(req.params.id || ''))); }
  catch (error) { sendWorkContextError(res, error); }
});

router.patch('/:id/work-context', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try { res.json(await updateDocumentWorkContext(req, String(req.params.id || ''), req.body)); }
  catch (error) { sendWorkContextError(res, error); }
});

router.post('/:id/task-links', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try { res.status(201).json(await linkDocumentTask(req, String(req.params.id || ''), req.body)); }
  catch (error) { sendWorkContextError(res, error); }
});

router.delete('/:id/task-links/:taskId', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try { res.json(await unlinkDocumentTask(req, String(req.params.id || ''), String(req.params.taskId || ''))); }
  catch (error) { sendWorkContextError(res, error); }
});

// The reverse direction: documents attached to a task.
router.get('/task/:taskId/documents', authenticate, async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listTaskDocuments(req, String(req.params.taskId || ''))); }
  catch (error) { sendWorkContextError(res, error); }
});

const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES: Record<string, Set<string>> = {
  '.pdf': new Set(['application/pdf']),
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream']),
  '.txt': new Set(['text/plain', 'application/octet-stream']),
};
const ALLOWED_VERSION_UPLOAD_SOURCES = new Set([
  'CLIENT_UPLOAD',
  'LAWYER_UPLOAD',
  'EMAIL_IMPORT',
  'SHAREPOINT',
  'CLIENT_PORTAL',
  'GENERATED',
  'EXTERNAL',
  'WORKSPACE_SAVE',
  'IMPORT',
]);
const ALLOWED_VERSION_TYPES = new Set([
  'ORIGINAL',
  'WORKING_COPY',
  'REVIEW_DRAFT',
  'CLIENT_DRAFT',
  'FINAL',
  'SIGNED',
]);

function sanitizeUploadFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const baseName = value.replace(/\\/g, '/').split('/').pop()?.trim() || '';
  const sanitized = baseName.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim();
  if (!sanitized || sanitized === '.' || sanitized === '..' || sanitized.length > 180) return null;
  return sanitized;
}

function getUploadExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

function isAllowedUploadMime(extension: string, mimeType: unknown): boolean {
  const accepted = ALLOWED_UPLOAD_TYPES[extension];
  if (!accepted) return false;
  if (typeof mimeType !== 'string' || !mimeType.trim()) return true;
  return accepted.has(mimeType.toLowerCase());
}

function decodeBase64FileContent(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const buffer = Buffer.from(value, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

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

    const results = await documentsService.searchDocuments(
      q,
      limit,
      String((req as any).user?.role || ''),
      getCaseReadScope(req),
    );
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
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, documentType, folder } = req.body;
    const fileName = sanitizeUploadFileName(req.body?.fileName);

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

    const canManage = await userCanManageCase(req, String(caseId));
    if (canManage === null) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
      return;
    }
    if (!canManage) {
      res.status(403).json({ status: 403, code: 'DOCUMENT_UPLOAD_FORBIDDEN', message: 'You are not allowed to upload documents to this case.' });
      return;
    }

    const extension = getUploadExtension(fileName);
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_UPLOAD_TYPES, extension)) {
      res.status(400).json({
        status: 400,
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Nem támogatott fájltípus. Engedélyezett: PDF, DOC, DOCX vagy TXT.',
      });
      return;
    }

    if (!isAllowedUploadMime(extension, req.body.mimeType)) {
      res.status(400).json({
        status: 400,
        code: 'UNSUPPORTED_MIME_TYPE',
        message: 'A fájl MIME típusa nem egyezik az engedélyezett fájltípussal.',
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

    if (fileContentBuffer.length > MAX_DOCUMENT_UPLOAD_BYTES) {
      res.status(413).json({
        status: 413,
        code: 'DOCUMENT_TOO_LARGE',
        message: 'A fájl mérete meghaladja a 25 MB-os korlátot.',
      });
      return;
    }

    // SEC-2: Content validation — magic bytes, unsafe content, archive inspection
    const contentValidation = await validateWorkforceUpload({
      buffer: fileContentBuffer,
      declaredMimeType: req.body.mimeType,
      originalFileName: fileName,
      inspectArchiveContent: true,
      scan: false,
    });
    if (!contentValidation.ok) {
      const rejection = mapWorkforceUploadRejection(contentValidation);
      res.status(rejection.status).json({
        status: rejection.status,
        code: rejection.code,
        message: rejection.message,
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
    if (error instanceof DocumentStorageUploadError) {
      res.status(502).json({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
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
router.get('/case/:caseId', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const documents = await documentsService.getCaseDocuments(caseId, String((req as any).user?.role || ''));
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

/**
 * DELETE /api/v1/documents/:id
 * Authorized hard delete for uploaded document metadata + SharePoint item.
 * No soft-delete flag exists in the current schema, so deletion is blocked
 * whenever dependent legal workflow records would be unsafe to detach.
 */
router.delete('/:id', authenticate, requireDocumentManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    await documentsService.deleteDocument(String(req.params.id || ''), userId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof DocumentDeleteError) {
      res.status(error.statusCode).json({
        status: error.statusCode,
        code: error.code,
        message: error.message,
        ...(error.reason ? { reason: error.reason } : {}),
      });
      return;
    }
    console.error('Delete document error:', error instanceof Error ? error.message : error);
    res.status(500).json({
      status: 500,
      code: 'DOCUMENT_DELETE_FAILED',
      message: 'A dokumentum törlése nem sikerült.',
    });
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
router.get('/:id/comments', authenticate, requireDocumentObjectReadAccess, async (req: Request, res: Response): Promise<void> => {
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
router.post('/:id/comments', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await createDocumentComment(req, String(req.params.id || ''), req.body);
    res.status(201).json(result);
  } catch (error) {
    sendDocumentCommentError(res, error);
  }
});

router.post('/:id/comments/:commentId/resolve', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await resolveDocumentComment(req, String(req.params.id || ''), String(req.params.commentId || ''));
    res.json(result);
  } catch (error) {
    sendDocumentCommentError(res, error);
  }
});

router.post('/:id/comments/:commentId/reopen', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
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
 * GET /api/v1/documents/:id/versions
 * Immutable version history for one logical document.
 */
router.get('/:id/versions', authenticate, requireDocumentReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const versions = await documentsService.listDocumentVersions(id);
    res.json({ documentId: id, versions });
  } catch (error) {
    console.error('List document versions error:', error);
    res.status(500).json({ status: 500, code: 'DOCUMENT_VERSIONS_UNAVAILABLE', message: 'Document versions could not be loaded.' });
  }
});

/**
 * POST /api/v1/documents/:id/versions
 * Upload a new immutable content version. Never overwrites an existing file.
 */
router.post('/:id/versions', authenticate, requireDocumentManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params as { id: string };
    const fileName = sanitizeUploadFileName(req.body?.fileName);

    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    if (!fileName) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: fileName' });
      return;
    }

    const extension = getUploadExtension(fileName);
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_UPLOAD_TYPES, extension)) {
      res.status(400).json({
        status: 400,
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Nem támogatott fájltípus. Engedélyezett: PDF, DOC, DOCX vagy TXT.',
      });
      return;
    }
    if (!isAllowedUploadMime(extension, req.body?.mimeType)) {
      res.status(400).json({
        status: 400,
        code: 'UNSUPPORTED_MIME_TYPE',
        message: 'A fájl MIME típusa nem egyezik az engedélyezett fájltípussal.',
      });
      return;
    }
    const uploadSource = String(req.body?.uploadSource || 'LAWYER_UPLOAD').trim().toUpperCase();
    if (!ALLOWED_VERSION_UPLOAD_SOURCES.has(uploadSource)) {
      res.status(400).json({
        status: 400,
        code: 'INVALID_UPLOAD_SOURCE',
        message: 'Unsupported document version upload source.',
      });
      return;
    }
    const versionType = String(req.body?.versionType || 'WORKING_COPY').trim().toUpperCase();
    if (!ALLOWED_VERSION_TYPES.has(versionType)) {
      res.status(400).json({
        status: 400,
        code: 'INVALID_VERSION_TYPE',
        message: 'Unsupported document version type.',
      });
      return;
    }

    const fileBuffer = decodeBase64FileContent(req.body?.fileContent);
    if (!fileBuffer) {
      res.status(400).json({
        status: 400,
        code: 'INVALID_FILE_CONTENT',
        message: 'A verziófájl tartalma sérült vagy nem base64 formátumú.',
      });
      return;
    }
    if (fileBuffer.length > MAX_DOCUMENT_UPLOAD_BYTES) {
      res.status(413).json({
        status: 413,
        code: 'DOCUMENT_TOO_LARGE',
        message: 'A fájl mérete meghaladja a 25 MB-os korlátot.',
      });
      return;
    }

    // SEC-2: Content validation — magic bytes, unsafe content, archive inspection
    const contentValidation = await validateWorkforceUpload({
      buffer: fileBuffer,
      declaredMimeType: req.body?.mimeType,
      originalFileName: fileName,
      inspectArchiveContent: true,
      scan: false,
    });
    if (!contentValidation.ok) {
      const rejection = mapWorkforceUploadRejection(contentValidation);
      res.status(rejection.status).json({
        status: rejection.status,
        code: rejection.code,
        message: rejection.message,
      });
      return;
    }

    const result = await documentsService.uploadNewVersion(
      id,
      fileBuffer,
      userId,
      req.body?.comment,
      {
        originalFileName: fileName,
        mimeType: req.body?.mimeType || 'application/octet-stream',
        uploadSource,
        versionType,
      }
    );

    if (!result) {
      res.status(500).json({ status: 500, code: 'UPLOAD_FAILED', message: 'Failed to upload version' });
      return;
    }

    const versions = await documentsService.listDocumentVersions(id);
    res.status(201).json({ document: result, currentVersion: versions.find((version) => version.isCurrent) || null, versions });
  } catch (error) {
    console.error('Upload immutable version error:', error);
    if (error instanceof DocumentStorageUploadError) {
      res.status(502).json({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
      });
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Document version upload failed.' });
  }
});

/**
 * GET /api/v1/documents/:id/versions/:versionId
 */
router.get('/:id/versions/:versionId', authenticate, requireDocumentReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const version = await documentsService.getDocumentVersion(id, versionId);
    if (!version) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_VERSION_NOT_FOUND', message: 'Document version not found.' });
      return;
    }
    res.json(version);
  } catch (error) {
    console.error('Get document version error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Document version could not be loaded.' });
  }
});

/**
 * GET /api/v1/documents/:id/versions/:versionId/download
 */
router.get('/:id/versions/:versionId/download', authenticate, requireDocumentReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const result = await documentsService.downloadDocumentVersion(id, versionId);
    if (!result) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_VERSION_NOT_FOUND', message: 'Document version not found.' });
      return;
    }
    if ('error' in result) {
      res.status(result.status).json({ status: result.status, code: result.code, message: result.error });
      return;
    }

    const fileName = result.version.originalFileName || 'document';
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', result.version.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, "'")}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', result.content.length);
    res.send(result.content);
  } catch (error) {
    console.error('Download document version error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Document version download failed.' });
  }
});

/** Retry a failed background security scan without replacing stored content. */
router.post('/:id/versions/:versionId/security-scan/retry', authenticate, requireDocumentManageAccess, async (req: Request, res: Response): Promise<void> => {
  const { id, versionId } = req.params as { id: string; versionId: string };
  const version = await documentsService.getDocumentVersion(id, versionId);
  if (!version) {
    res.status(404).json({ status: 404, code: 'DOCUMENT_VERSION_NOT_FOUND', message: 'Document version not found.' });
    return;
  }
  if (version.securityScanStatus !== 'SCAN_FAILED') {
    res.status(409).json({ status: 409, code: 'DOCUMENT_SCAN_RETRY_NOT_ALLOWED', message: 'This document does not need a security scan retry.' });
    return;
  }
  const started = await retryDocumentVersionScan(versionId);
  if (!started) {
    res.status(502).json({ status: 502, code: 'DOCUMENT_SCAN_RETRY_UNAVAILABLE', message: 'The security scan could not be restarted.' });
    return;
  }
  res.status(202).json({ status: 202, code: 'DOCUMENT_SCAN_RETRY_STARTED', message: 'Security scan retry started.' });
});

/**
 * POST /api/v1/documents/:id/versions/:versionId/promote-current
 */
router.post('/:id/versions/:versionId/promote-current', authenticate, requireDocumentManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { id, versionId } = req.params as { id: string; versionId: string };
    const version = await documentsService.promoteCurrentVersion(id, versionId, userId);
    if (!version) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_VERSION_NOT_FOUND', message: 'Document version not found.' });
      return;
    }
    res.json(version);
  } catch (error) {
    console.error('Promote document version error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Document version could not be promoted.' });
  }
});

/**
 * GET /api/v1/documents/:id
 * Get document by ID
 */
router.get('/:id', authenticate, requireDocumentObjectReadAccess, async (req: Request, res: Response): Promise<void> => {
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
router.get('/:id/text', authenticate, requireDocumentObjectReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        documentType: true,
        workspaceText: true,
        updatedAt: true,
        spItemId: true,
        mimeType: true,
        fileName: true,
        name: true,
        versions: { where: { isCurrent: true }, select: { securityScanStatus: true }, take: 1 },
      },
    });

    if (!document) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
      return;
    }

    const textBlocked = securityScanBlock(document.versions?.[0]?.securityScanStatus || 'CLEAN');
    if (textBlocked) {
      res.status(textBlocked.status).json(textBlocked);
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
    console.error('Extract document text error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'A dokumentumszöveg kinyerése sikertelen.' });
  }
});

/**
 * POST /api/v1/documents/:id/version
 * Upload new version
 */
router.post('/:id/version', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { fileContent, comment } = req.body;
    const fileName = sanitizeUploadFileName(req.body?.fileName);

    if (!fileContent) {
      res.status(400).json({ 
        status: 400, 
        code: 'VALIDATION_ERROR', 
        message: 'Missing fileContent' 
      });
      return;
    }

    const { id } = req.params as { id: string };
    const fileBuffer = decodeBase64FileContent(fileContent);
    if (!fileBuffer) {
      res.status(400).json({
        status: 400,
        code: 'INVALID_FILE_CONTENT',
        message: 'A verziófájl tartalma sérült vagy nem base64 formátumú.',
      });
      return;
    }
    if (fileBuffer.length > MAX_DOCUMENT_UPLOAD_BYTES) {
      res.status(413).json({
        status: 413,
        code: 'DOCUMENT_TOO_LARGE',
        message: 'A fájl mérete meghaladja a 25 MB-os korlátot.',
      });
      return;
    }

    // SEC-2: Content validation — magic bytes, unsafe content, archive inspection
    const contentValidation = await validateWorkforceUpload({
      buffer: fileBuffer,
      declaredMimeType: req.body?.mimeType,
      originalFileName: fileName || 'document',
      inspectArchiveContent: true,
      scan: false,
    });
    if (!contentValidation.ok) {
      const rejection = mapWorkforceUploadRejection(contentValidation);
      res.status(rejection.status).json({
        status: rejection.status,
        code: rejection.code,
        message: rejection.message,
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
    if (error instanceof DocumentStorageUploadError) {
      res.status(502).json({
        status: 502,
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'A tárhelykapcsolat jelenleg nem érhető el.',
      });
      return;
    }
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
router.post('/:id/submit-review', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
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
router.post('/:id/approve', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { comment } = req.body;
    const { id } = req.params as { id: string };
    const success = await documentsService.approveDocument(id, userId, comment, (req as any).user?.role);

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
    if (typeof (error as any)?.status === 'number' && typeof (error as any)?.code === 'string') {
      res.status((error as any).status).json({ status: (error as any).status, code: (error as any).code, message: (error as any).message });
      return;
    }
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
router.post('/:id/reject', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
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
    const success = await documentsService.rejectDocument(id, userId, reason, (req as any).user?.role);

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
    if (typeof (error as any)?.status === 'number' && typeof (error as any)?.code === 'string') {
      res.status((error as any).status).json({ status: (error as any).status, code: (error as any).code, message: (error as any).message });
      return;
    }
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
router.post('/:id/save-workspace-version', authenticate, requireDocumentObjectManageAccess, async (req: Request, res: Response): Promise<void> => {
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
    console.error('Save workspace version error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Módosított munkapéldány mentése sikertelen.' });
  }
});

/**
 * GET /api/v1/documents/:id/download
 * Download document from SharePoint
 */
router.get('/:id/download', authenticate, requireDocumentObjectReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    // Get document to find SharePoint item ID
    const document = await prisma.document.findUnique({
      where: { id },
      include: { versions: { where: { isCurrent: true }, select: { securityScanStatus: true }, take: 1 } },
    });

    if (!document) {
      res.status(404).json({ 
        status: 404, 
        code: 'NOT_FOUND', 
        message: 'Document not found' 
      });
      return;
    }

    const downloadBlocked = securityScanBlock(document.versions?.[0]?.securityScanStatus || 'CLEAN');
    if (downloadBlocked) {
      res.status(downloadBlocked.status).json(downloadBlocked);
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
