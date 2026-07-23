import { NextFunction, Request, Response, Router } from 'express';
import { DocumentAnnotationStatus } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';
import { userCanManageCase, userCanReadCase } from '../cases/authorization';
import {
  createDocumentAnnotation,
  createDocumentAnnotationComment,
  deleteDocumentAnnotation,
  DocumentAnnotationError,
  getDocumentAnnotation,
  listDocumentAnnotationComments,
  listDocumentAnnotations,
  transitionDocumentAnnotation,
  updateDocumentAnnotation,
} from './annotations.service';

const router = Router({ mergeParams: true });

async function requireVersionAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  check: (req: Request, caseId: string) => Promise<boolean | null>
): Promise<void> {
  const documentId = String(req.params.documentId || '').trim();
  const versionId = String(req.params.versionId || '').trim();
  if (!documentId || !versionId) {
    res.status(400).json({
      status: 400,
      code: 'DOCUMENT_VERSION_ID_REQUIRED',
      message: 'documentId and versionId are required.',
    });
    return;
  }

  try {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      select: { document: { select: { caseId: true } } },
    });
    if (!version) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_VERSION_NOT_FOUND',
        message: 'Document version not found.',
      });
      return;
    }

    const access = await check(req, version.document.caseId);
    if (access === null) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found.',
      });
      return;
    }
    if (!access) {
      res.status(403).json({
        status: 403,
        code: 'DOCUMENT_ACCESS_FORBIDDEN',
        message: 'You do not have access to this document.',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Document annotation authorization error:', error);
    res.status(500).json({
      status: 500,
      code: 'DOCUMENT_AUTHORIZATION_ERROR',
      message: 'Document access could not be verified.',
    });
  }
}

function requireRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  return requireVersionAccess(req, res, next, userCanReadCase);
}

function requireManage(req: Request, res: Response, next: NextFunction): Promise<void> {
  return requireVersionAccess(req, res, next, userCanManageCase);
}

function actorId(req: Request): string | null {
  return req.user?.userId || null;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof DocumentAnnotationError) {
    res.status(error.status).json({
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return;
  }
  console.error('Document annotation route error:', error);
  res.status(500).json({
    status: 500,
    code: 'DOCUMENT_ANNOTATION_ERROR',
    message: 'Document annotation request failed.',
  });
}

router.use(authenticate);

router.get('/', requireRead, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, versionId } = req.params as { documentId: string; versionId: string };
    res.json(await listDocumentAnnotations(documentId, versionId, req.query));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', requireManage, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId } = req.params as { documentId: string; versionId: string };
    res.status(201).json(await createDocumentAnnotation(documentId, versionId, userId, req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:annotationId', requireRead, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const annotation = await getDocumentAnnotation(documentId, versionId, annotationId);
    if (!annotation) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.json(annotation);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:annotationId', requireManage, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const annotation = await updateDocumentAnnotation(documentId, versionId, annotationId, userId, req.body || {});
    if (!annotation) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.json(annotation);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:annotationId/resolve', requireManage, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const annotation = await transitionDocumentAnnotation(
      documentId,
      versionId,
      annotationId,
      userId,
      DocumentAnnotationStatus.RESOLVED,
      req.body?.resolutionNote
    );
    if (!annotation) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.json(annotation);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:annotationId/reopen', requireManage, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const annotation = await transitionDocumentAnnotation(
      documentId,
      versionId,
      annotationId,
      userId,
      DocumentAnnotationStatus.REOPENED
    );
    if (!annotation) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.json(annotation);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:annotationId', requireManage, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const deleted = await deleteDocumentAnnotation(documentId, versionId, annotationId, userId);
    if (!deleted) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:annotationId/comments', requireRead, async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const comments = await listDocumentAnnotationComments(documentId, versionId, annotationId);
    if (!comments) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.json({ annotationId, comments });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:annotationId/comments', requireManage, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = actorId(req);
    if (!userId) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, annotationId } = req.params as { documentId: string; versionId: string; annotationId: string };
    const comment = await createDocumentAnnotationComment(documentId, versionId, annotationId, userId, req.body?.body);
    if (!comment) {
      res.status(404).json({ status: 404, code: 'DOCUMENT_ANNOTATION_NOT_FOUND', message: 'Annotation not found.' });
      return;
    }
    res.status(201).json(comment);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
