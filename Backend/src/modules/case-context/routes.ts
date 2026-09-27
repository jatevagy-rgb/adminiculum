/**
 * Case Context V2 — workforce-internal routes.
 *
 * Authorization (canonical, no new role matrix):
 *  - list/detect  : workforce + canonical case READ access
 *  - create/apply : workforce + canonical case MANAGE access
 *
 * Never mounted on a client-portal path.
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseManageAccess, requireCaseReadAccess } from '../cases/authorization';
import type { ManualSensitiveTerm, SensitiveCategory } from '../anonymization';
import {
  anonymizeContextSource,
  createCommunicationContextSource,
  createPastedContextSource,
  detectContextSource,
  listContextSources,
} from './service';

const router = Router();

router.use(authenticate, requireWorkforceUser);

function actor(req: Request): { userId: string } {
  return { userId: req.user?.userId || '' };
}

function handle(res: Response, error: unknown): void {
  const typed = error as { status?: number; code?: string; message?: string };
  const status = typeof typed.status === 'number' ? typed.status : 500;
  if (status >= 500) {
    console.error('Case context error:', error);
  }
  res.status(status).json({
    status,
    code: typed.code || 'CASE_CONTEXT_ERROR',
    message: status >= 500 ? 'Internal server error' : typed.message || typed.code || 'Case context operation failed',
  });
}

function parseManualTerms(value: unknown): ManualSensitiveTerm[] {
  if (!Array.isArray(value)) return [];
  const out: ManualSensitiveTerm[] = [];
  for (const item of value) {
    if (item && typeof item === 'object') {
      const term = (item as { term?: unknown }).term;
      const category = (item as { category?: unknown }).category;
      if (typeof term === 'string' && typeof category === 'string') {
        out.push({ term, category: category as SensitiveCategory });
      }
    }
  }
  return out;
}

// POST /cases/:caseId/context-sources — create a PASTED context source.
router.post('/cases/:caseId/context-sources', requireCaseManageAccess, async (req, res) => {
  try {
    const created = await createPastedContextSource(actor(req), {
      caseId: String(req.params.caseId),
      rawText: req.body?.rawText,
    });
    res.status(201).json(created);
  } catch (error) {
    handle(res, error);
  }
});

// POST /cases/:caseId/context-sources/from-communication — create a
// COMMUNICATION context source with server-verified same-case provenance.
router.post('/cases/:caseId/context-sources/from-communication', requireCaseManageAccess, async (req, res) => {
  try {
    const created = await createCommunicationContextSource(actor(req), {
      caseId: String(req.params.caseId),
      communicationId: req.body?.communicationId,
    });
    res.status(201).json(created);
  } catch (error) {
    handle(res, error);
  }
});

// GET /cases/:caseId/context-sources — list internal context sources.
router.get('/cases/:caseId/context-sources', requireCaseReadAccess, async (req, res) => {
  try {
    res.json({ items: await listContextSources(String(req.params.caseId)) });
  } catch (error) {
    handle(res, error);
  }
});

// POST /cases/:caseId/context-sources/:id/detect — run deterministic detection.
router.post('/cases/:caseId/context-sources/:id/detect', requireCaseReadAccess, async (req, res) => {
  try {
    const result = await detectContextSource({
      caseId: String(req.params.caseId),
      id: String(req.params.id),
      manualTerms: parseManualTerms(req.body?.manualTerms),
    });
    res.json(result);
  } catch (error) {
    handle(res, error);
  }
});

// POST /cases/:caseId/context-sources/:id/anonymize — apply approved candidates.
router.post('/cases/:caseId/context-sources/:id/anonymize', requireCaseManageAccess, async (req, res) => {
  try {
    const result = await anonymizeContextSource({
      caseId: String(req.params.caseId),
      id: String(req.params.id),
      sourceHash: req.body?.sourceHash,
      optionsDigest: req.body?.optionsDigest,
      manualTerms: parseManualTerms(req.body?.manualTerms),
      approvedCandidateIds: req.body?.approvedCandidateIds,
    });
    res.json(result);
  } catch (error) {
    handle(res, error);
  }
});

export default router;
