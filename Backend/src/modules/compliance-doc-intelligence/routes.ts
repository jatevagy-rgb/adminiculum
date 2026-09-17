/**
 * CDI-1 — INTERNAL read surface for derived compliance document intelligence.
 *
 * Mounted at /api/v1/compliance-intelligence (Backend/src/index.ts).
 *
 * AUTH: workforce authenticate + requireInternal + client read access. The
 * clientId comes from the URL only for an internal actor, and the document is
 * verified to belong to that client before any relation is returned.
 *
 * BOUNDARY: this route is INTERNAL ONLY. It is deliberately separate from
 * /api/v1/client-portal/compliance, and it is the only place these rows are
 * exposed. No anchor key, anchor display, rationale, ELI/CELEX/ECLI, case or
 * authority metadata, row digest or parser warning may reach a customer DTO.
 */
import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../prisma/prisma.service';
import { InteractionError, assertClientReadAccess, requireInternal } from '../client-interaction/base';
import {
  findClauseAnchorReferencesByAnchorKey,
  listClauseAnchorsForDocumentWithBinding,
  summarizeClauseAnchorsForDocument,
} from './service';
import { buildComplianceMonitoringManifest } from './monitoringManifest';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function respond(error: unknown, res: Response, fallbackCode: string): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ status: 500, code: fallbackCode, message: 'Compliance intelligence request failed.' });
}

async function assertDocumentBelongsToClient(clientId: string, documentId: string): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, clientId },
    select: { id: true },
  });
  if (!document) {
    throw new InteractionError(404, 'COMPLIANCE_INTELLIGENCE_DOCUMENT_NOT_FOUND', 'Document not found for this client.');
  }
}

router.use(authenticate);

router.get('/clients/:clientId/documents/:documentId/clause-anchors', async (req: Request, res: Response): Promise<void> => {
  try {
    const internal = actor(req);
    requireInternal(internal);
    const clientId = String(req.params.clientId);
    const documentId = String(req.params.documentId);
    await assertClientReadAccess(internal, clientId);
    await assertDocumentBelongsToClient(clientId, documentId);
    // C3A: includes internal canonical binding metadata (stored-at-ingest or
    // resolved read-time on an exact CELEX match). Nothing is written here.
    res.json(await listClauseAnchorsForDocumentWithBinding(documentId));
  } catch (error) {
    respond(error, res, 'COMPLIANCE_INTELLIGENCE_LIST_ERROR');
  }
});

router.get('/clients/:clientId/documents/:documentId/clause-anchors/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const internal = actor(req);
    requireInternal(internal);
    const clientId = String(req.params.clientId);
    const documentId = String(req.params.documentId);
    await assertClientReadAccess(internal, clientId);
    await assertDocumentBelongsToClient(clientId, documentId);
    res.json(await summarizeClauseAnchorsForDocument(documentId));
  } catch (error) {
    respond(error, res, 'COMPLIANCE_INTELLIGENCE_SUMMARY_ERROR');
  }
});

/**
 * Future monitoring lookup shape: which document versions and clauses reference
 * one stable anchor key. Read-only; no monitoring is implemented in this slice.
 */
router.get('/clients/:clientId/anchor-keys/:anchorKey', async (req: Request, res: Response): Promise<void> => {
  try {
    const internal = actor(req);
    requireInternal(internal);
    const clientId = String(req.params.clientId);
    await assertClientReadAccess(internal, clientId);
    const anchorKey = String(req.params.anchorKey);
    const references = await findClauseAnchorReferencesByAnchorKey(anchorKey, clientId);
    res.json({ anchorKey, references });
  } catch (error) {
    respond(error, res, 'COMPLIANCE_INTELLIGENCE_ANCHOR_LOOKUP_ERROR');
  }
});

/**
 * C4B — read-only compliance monitoring manifest.
 *
 * CROSS-CLIENT AGGREGATE BY DESIGN: it returns deduplicated legal-source
 * monitoring demand (identifier family, source identifier, locators, reference
 * count) and deliberately carries NO client, matter, case, document, clause or
 * rationale identity. It is therefore gated by this module's existing internal
 * authorization only (authenticate + requireInternal). Pure projection:
 * nothing is written, no clientId scoping is faked.
 */
router.get('/monitoring-manifest', async (req: Request, res: Response): Promise<void> => {
  try {
    requireInternal(actor(req));
    res.json(await buildComplianceMonitoringManifest());
  } catch (error) {
    respond(error, res, 'COMPLIANCE_INTELLIGENCE_MONITORING_MANIFEST_ERROR');
  }
});

export default router;
