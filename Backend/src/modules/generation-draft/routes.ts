/**
 * Generation Draft Routes
 * REST API for persisted user-entered generation field data
 * 
 * Endpoints:
 * - GET /api/v1/generation-drafts/:caseId - Get all drafts for a case
 * - GET /api/v1/generation-drafts/:caseId?templateId=xxx - Get specific draft
 * - PUT /api/v1/generation-drafts/:caseId - Upsert draft
 * - DELETE /api/v1/generation-drafts/:caseId?templateId=xxx - Delete draft
 */

import { Router, Request, Response } from 'express';
import generationDraftService from './service';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess, requireCaseManageAccess } from '../cases/authorization';

const router = Router();
router.use(authenticate, requireWorkforceUser);

// ============================================================================
// FEATURE FLAG GUARD — Generation Draft
// ============================================================================
const isGenerationDraftEnabled = process.env.ENABLE_GENERATION_DRAFT === 'true';

function requireGenerationDraftEnabled(req: Request, res: Response, next: () => void) {
  if (!isGenerationDraftEnabled) {
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'Generation Draft feature is disabled. Set ENABLE_GENERATION_DRAFT=true to enable.',
    });
  }
  next();
}

// ============================================================================
// GET /api/v1/generation-drafts/:caseId
// ============================================================================
router.get('/:caseId', authenticate, requireGenerationDraftEnabled, requireCaseReadAccess, async (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { templateId } = req.query;

    if (templateId) {
      const draft = await generationDraftService.getDraft(caseId, String(templateId));
      if (!draft) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }
      res.json(draft);
    } else {
      const drafts = await generationDraftService.getDraftsByCase(caseId);
      res.json(drafts);
    }
  } catch (error: any) {
    console.error('Error fetching draft:', error);
    res.status(500).json({ error: 'Failed to fetch draft', details: error.message });
  }
});

/**
 * PUT /api/v1/generation-drafts/:caseId
 * Upsert (create or update) draft
 */
router.put('/:caseId', authenticate, requireGenerationDraftEnabled, requireCaseManageAccess, async (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { templateId, templateName, documentFamily, draftData } = req.body;

    if (!draftData) {
      res.status(400).json({ error: 'draftData is required' });
      return;
    }

    // Get user ID from auth if available
    const userId = (req as any).user?.userId;

    const result = await generationDraftService.upsertDraft({
      caseId,
      templateId,
      templateName,
      documentFamily,
      draftData,
      userId
    });

    res.status(result.isNew ? 201 : 200).json(result);
  } catch (error: any) {
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft', details: error.message });
  }
});

/**
 * DELETE /api/v1/generation-drafts/:caseId
 * Delete draft(s) for a case
 */
router.delete('/:caseId', authenticate, requireGenerationDraftEnabled, requireCaseManageAccess, async (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { templateId } = req.query;

    if (templateId) {
      const deleted = await generationDraftService.deleteDraft(caseId, String(templateId));
      if (!deleted) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }
      res.json({ success: true, message: 'Draft deleted' });
    } else {
      const count = await generationDraftService.deleteAllDraftsForCase(caseId);
      res.json({ success: true, deletedCount: count });
    }
  } catch (error: any) {
    console.error('Error deleting draft:', error);
    res.status(500).json({ error: 'Failed to delete draft', details: error.message });
  }
});

export default router;
