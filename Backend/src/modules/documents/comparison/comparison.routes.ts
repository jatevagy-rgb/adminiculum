/**
 * Structured comparison routes (STRUCTURED-DOC-COMPARISON-1, Phase 6).
 *
 * Two mount points:
 *   - documentScopedComparisonRouter → mounted under /api/v1/documents
 *       POST  /:id/comparisons          create/get for a version pair
 *       GET   /:id/comparisons          list comparisons for the document
 *   - comparisonRouter → mounted at /api/v1/document-comparisons
 *       GET    /:comparisonId
 *       GET    /:comparisonId/segments
 *       POST   /:comparisonId/retry
 *       PATCH  /:comparisonId/segments/:segmentId
 *       POST   /:comparisonId/segments/:segmentId/task-link
 *       DELETE /:comparisonId/segments/:segmentId/task-link
 *       POST   /:comparisonId/segments/:segmentId/annotation-link
 *       DELETE /:comparisonId/segments/:segmentId/annotation-link
 *
 * Every handler authenticates first, then checks case/document authorization.
 * Only DTOs are returned; the version-text provider and engine internals never
 * cross the boundary.
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../../middleware/auth';
import { requireDocumentReadAccess, requireDocumentManageAccess } from '../authorization';
import { requireComparisonReadAccess, requireComparisonManageAccess } from './comparisonAuthorization';
import { createOrGetComparison, ComparisonError } from './comparisonService';
import { resolveVersionText, type VersionMeta } from './versionText';
import documentsService from '../services';
import {
  listComparisonsForDocument, getComparison, listSegments, updateSegment,
  linkSegmentTask, linkSegmentAnnotation,
} from './comparisonReadService';
import { toComparisonDto, toSegmentDto } from './comparisonDto';

/** Real text resolver: reads authoritative version bytes via the download path. */
async function realResolveText(version: VersionMeta) {
  return resolveVersionText(version, async (documentId, versionId) => {
    const res = await documentsService.downloadDocumentVersion(documentId, versionId);
    if (!res || 'error' in res) return null;
    return res.content;
  });
}

function fail(res: Response, err: unknown) {
  if (err instanceof ComparisonError) {
    res.status(err.status).json({ status: err.status, code: err.code, message: err.message });
    return;
  }
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

const userId = (req: Request) => (req as any).user?.userId as string | undefined;

// ---- document-scoped ----
export const documentScopedComparisonRouter = Router();

documentScopedComparisonRouter.post('/:id/comparisons', authenticate, requireDocumentReadAccess, async (req: Request, res: Response) => {
  try {
    const { baseVersionId, targetVersionId } = req.body || {};
    if (!baseVersionId || !targetVersionId) {
      res.status(400).json({ status: 400, code: 'VERSION_PAIR_REQUIRED', message: 'baseVersionId and targetVersionId are required.' });
      return;
    }
    const row = await createOrGetComparison(
      { actorId: userId(req)!, documentId: String(req.params.id), baseVersionId, targetVersionId },
      { resolveText: realResolveText },
    );
    res.status(201).json(toComparisonDto(row));
  } catch (err) { fail(res, err); }
});

documentScopedComparisonRouter.get('/:id/comparisons', authenticate, requireDocumentReadAccess, async (req: Request, res: Response) => {
  try {
    const rows = await listComparisonsForDocument(String(req.params.id));
    res.json({ data: rows.map(toComparisonDto) });
  } catch (err) { fail(res, err); }
});

// ---- comparison-scoped ----
export const comparisonRouter = Router();

comparisonRouter.get('/:comparisonId', authenticate, requireComparisonReadAccess, async (req: Request, res: Response) => {
  try { res.json(toComparisonDto(await getComparison(String(req.params.comparisonId)))); }
  catch (err) { fail(res, err); }
});

comparisonRouter.get('/:comparisonId/segments', authenticate, requireComparisonReadAccess, async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const page = await listSegments(String(req.params.comparisonId), {
      changeType: q.changeType as string | undefined,
      category: q.category as string | undefined,
      reviewState: q.reviewState as string | undefined,
      unreviewedOnly: q.unreviewedOnly === 'true',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    res.json({ data: page.items.map(toSegmentDto), total: page.total, limit: page.limit, offset: page.offset });
  } catch (err) { fail(res, err); }
});

comparisonRouter.post('/:comparisonId/retry', authenticate, requireComparisonManageAccess, async (req: Request, res: Response) => {
  try {
    const existing = await getComparison(String(req.params.comparisonId));
    const row = await createOrGetComparison(
      { actorId: userId(req)!, documentId: existing.documentId, baseVersionId: existing.baseVersionId, targetVersionId: existing.targetVersionId },
      { resolveText: realResolveText },
    );
    res.json(toComparisonDto(row));
  } catch (err) { fail(res, err); }
});

comparisonRouter.patch('/:comparisonId/segments/:segmentId', authenticate, requireComparisonManageAccess, async (req: Request, res: Response) => {
  try {
    const { category, categorySource, reviewState, internalRationale, expectedRevision } = req.body || {};
    const updated = await updateSegment(String(req.params.comparisonId), String(req.params.segmentId), {
      category, categorySource, reviewState, internalRationale, expectedRevision,
    });
    res.json(toSegmentDto(updated));
  } catch (err) { fail(res, err); }
});

comparisonRouter.post('/:comparisonId/segments/:segmentId/task-link', authenticate, requireComparisonManageAccess, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body || {};
    if (!taskId) { res.status(400).json({ status: 400, code: 'TASK_ID_REQUIRED', message: 'taskId is required.' }); return; }
    res.json(toSegmentDto(await linkSegmentTask(String(req.params.comparisonId), String(req.params.segmentId), taskId)));
  } catch (err) { fail(res, err); }
});

comparisonRouter.delete('/:comparisonId/segments/:segmentId/task-link', authenticate, requireComparisonManageAccess, async (req: Request, res: Response) => {
  try { res.json(toSegmentDto(await linkSegmentTask(String(req.params.comparisonId), String(req.params.segmentId), null))); }
  catch (err) { fail(res, err); }
});

comparisonRouter.post('/:comparisonId/segments/:segmentId/annotation-link', authenticate, requireComparisonManageAccess, async (req: Request, res: Response) => {
  try {
    const { annotationId } = req.body || {};
    if (!annotationId) { res.status(400).json({ status: 400, code: 'ANNOTATION_ID_REQUIRED', message: 'annotationId is required.' }); return; }
    res.json(toSegmentDto(await linkSegmentAnnotation(String(req.params.comparisonId), String(req.params.segmentId), annotationId)));
  } catch (err) { fail(res, err); }
});

comparisonRouter.delete('/:comparisonId/segments/:segmentId/annotation-link', authenticate, requireComparisonManageAccess, async (req: Request, res: Response) => {
  try { res.json(toSegmentDto(await linkSegmentAnnotation(String(req.params.comparisonId), String(req.params.segmentId), null))); }
  catch (err) { fail(res, err); }
});
