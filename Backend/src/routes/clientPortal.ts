/**
 * Client Portal routes — RC2F security patch
 *
 * The client portal is a future product track requiring a separate
 * authentication implementation (email-code, not Azure AD / local JWT).
 * Until ENABLE_CLIENT_PORTAL=true is set alongside that implementation,
 * every request to /api/v1/client-portal/* returns 501 FEATURE_NOT_AVAILABLE.
 *
 * The previous placeholder code used an x-user-id header with no JWT
 * verification, which created an unauthenticated data-access path. That
 * code has been removed. No Prisma queries run while the feature is disabled.
 */

import { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth';
import documentsService from '../modules/documents/services';
import {
  authorizePortalDocumentDownload,
  ClientPublicationError,
  CLIENT_PUBLICATION_GATES,
  getPortalActionRequest,
  getPortalDocument,
  getPortalMatter,
  getPortalSafeUpdate,
  listPortalActionRequests,
  listPortalDocuments,
  listPortalMatters,
  listPortalSafeUpdates,
  portalHomeSnapshot,
} from '../modules/client-publication/publicationService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof ClientPublicationError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_PORTAL_INTERNAL_ERROR', message: 'Client portal request failed.' });
}

router.get('/home', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await portalHomeSnapshot(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/matters', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await listPortalMatters(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/matters/:publicationId', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await getPortalMatter(actor(req), String(req.params.publicationId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/matters/:publicationId/documents', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await listPortalDocuments(actor(req), String(req.params.publicationId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/documents/:publicationId', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await getPortalDocument(actor(req), String(req.params.publicationId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/documents/:publicationId/download', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const authorized = await authorizePortalDocumentDownload(actor(req), String(req.params.publicationId));
    const result = await documentsService.downloadDocumentVersion(authorized.documentId, authorized.documentVersionId);
    if (!result) {
      res.status(404).json({ status: 404, code: 'PORTAL_RESOURCE_NOT_FOUND', message: 'Portal content is not available.' });
      return;
    }
    if ('error' in result) {
      res.status(result.status).json({ status: result.status, code: result.code, message: 'The published file is not available.' });
      return;
    }
    const fileName = String(authorized.fileName || result.version.originalFileName || 'document').replace(/"/g, "'");
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', result.version.mimeType || authorized.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', result.content.length);
    res.send(result.content);
  } catch (error) {
    fail(res, error);
  }
});

router.get('/action-requests', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await listPortalActionRequests(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/action-requests/:requestId', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await getPortalActionRequest(actor(req), String(req.params.requestId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/updates', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await listPortalSafeUpdates(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/updates/:updateId', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    res.json(await getPortalSafeUpdate(actor(req), String(req.params.updateId)));
  } catch (error) {
    fail(res, error);
  }
});

router.all('/action-requests/:requestId/complete', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticate(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    if (!CLIENT_PUBLICATION_GATES.portalActions()) {
      res.status(503).json({
        status: 503,
        code: 'CLIENT_PORTAL_ACTIONS_DISABLED',
        message: 'Client portal actions are disabled.',
      });
      return;
    }
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL_ACTIONS',
      reason: 'CLIENT_PORTAL_ACTION_UI_NOT_IMPLEMENTED',
      message: 'Client portal action completion is not implemented.',
    });
  } catch (error) {
    fail(res, error);
  }
});

router.all('*', async (_req, res) => {
  res.status(501).json({
    status: 501,
    code: 'FEATURE_NOT_AVAILABLE',
    feature: 'CLIENT_PORTAL',
    reason: 'CLIENT_PORTAL_NOT_ENABLED',
    message: 'The client portal is not available in this environment.',
    nextStep: 'Client portal reads and actions remain disabled until a separate portal authentication boundary is enabled.',
  });
});

export default router;
