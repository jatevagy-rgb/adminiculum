/**
 * Clause Library Routes
 * REST API for clause library, lawyer profiles, and contract assembly drafts.
 * 
 * Endpoints:
 * CLAUSE CRUD:
 * - GET    /api/v1/clause-library/clauses          — List clauses
 * - GET    /api/v1/clause-library/clauses/:id      — Get single clause
 * - POST   /api/v1/clause-library/clauses          — Create clause
 * - PUT    /api/v1/clause-library/clauses/:id      — Update clause
 * - DELETE /api/v1/clause-library/clauses/:id      — Delete clause
 * 
 * LAWYER PROFILES:
 * - GET    /api/v1/clause-library/lawyer-profiles  — List profiles
 * - GET    /api/v1/clause-library/lawyer-profiles/:id — Get profile
 * - PUT    /api/v1/clause-library/lawyer-profiles/:id — Upsert profile
 * 
 * ASSEMBLY DRAFTS:
 * - GET    /api/v1/clause-library/assembly/:caseId  — Get assembly for case
 * - POST   /api/v1/clause-library/assembly/recommend — Get recommended clauses
 * - PUT    /api/v1/clause-library/assembly/:caseId   — Upsert assembly
 * - DELETE /api/v1/clause-library/assembly/:caseId  — Delete assembly
 * - PATCH  /api/v1/clause-library/assembly/:caseId/status — Update status
 */

import { Router, Request, Response } from 'express';
import clauseLibraryService from './service';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { requireCaseReadAccess, requireCaseManageAccess } from '../cases/authorization';
import { requireContractGenerationReadAccessFromBody } from '../contracts/contractAuthorization';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';

const router = Router();
router.use(authenticate, requireWorkforceUser);

// ============================================================================
// FEATURE FLAG GUARD
// ============================================================================
const isClauseLibraryEnabled = () =>
  isDatabaseFoundationEnabled('ENABLE_CLAUSE_LIBRARY');
const requireEnabled = requireDatabaseFoundation({
  feature: 'CLAUSE_LIBRARY',
  enabled: isClauseLibraryEnabled,
  message: 'Clause library persistence is not available in this environment.',
  nextStep: 'Complete the clause and assembly database reconciliation before enabling this feature.',
});

// Root status endpoint for staging smoke checks.
router.get('/', (_req: Request, res: Response) => {
  if (!isClauseLibraryEnabled()) {
    res.status(200).json({
      enabled: false,
      message: 'Clause Library feature is disabled. Set ENABLE_CLAUSE_LIBRARY=true to enable.',
    });
    return;
  }

  res.status(200).json({
    enabled: true,
    message: 'Clause Library feature is enabled. Use subroutes for data operations.',
  });
});

// ============================================================================
// CLAUSE ROUTES
// ============================================================================

/**
 * GET /api/v1/clause-library/clauses
 * List clauses with optional filters
 */
router.get('/clauses', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const { contractType, clauseKind, representedSide, category, lawyerProfileId, includeInactive, search } = req.query;

    const filter: any = {};
    if (contractType) filter.contractType = String(contractType);
    if (clauseKind) filter.clauseKind = String(clauseKind);
    if (representedSide) filter.representedSide = String(representedSide);
    if (category) filter.category = String(category);
    if (lawyerProfileId !== undefined) filter.lawyerProfileId = lawyerProfileId === 'null' ? null : String(lawyerProfileId);
    if (includeInactive) filter.includeInactive = includeInactive === 'true';
    if (search) filter.search = String(search);

    const clauses = await clauseLibraryService.listClauses(filter);
    res.json(clauses);
  } catch (error: any) {
    console.error('Error listing clauses:', error);
    res.status(500).json({ error: 'Failed to list clauses', details: error.message });
  }
});

/**
 * GET /api/v1/clause-library/clauses/:id
 * Get single clause
 */
router.get('/clauses/:id', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const clause = await clauseLibraryService.getClause(String(req.params.id));
    if (!clause) {
      res.status(404).json({ error: 'Clause not found' });
      return;
    }
    res.json(clause);
  } catch (error: any) {
    console.error('Error getting clause:', error);
    res.status(500).json({ error: 'Failed to get clause', details: error.message });
  }
});

/**
 * POST /api/v1/clause-library/clauses
 * Create a new clause
 */
router.post('/clauses', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const { title, slug, body, summary, contractType, clauseKind, representedSide, category, keywords, triggerConditions, sortOrder, sourceType, bankPackTag, lawyerProfileId } = req.body;

    if (!title || !slug || !body || !contractType || !clauseKind || !representedSide || !category) {
      res.status(400).json({ error: 'title, slug, body, contractType, clauseKind, representedSide, category are required' });
      return;
    }

    const clause = await clauseLibraryService.createClause({
      title, slug, body, summary, contractType, clauseKind, representedSide, category,
      keywords, triggerConditions, sortOrder, sourceType, bankPackTag, lawyerProfileId,
    });
    res.status(201).json(clause);
  } catch (error: any) {
    console.error('Error creating clause:', error);
    res.status(500).json({ error: 'Failed to create clause', details: error.message });
  }
});

/**
 * PUT /api/v1/clause-library/clauses/:id
 * Update a clause
 */
router.put('/clauses/:id', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const { title, slug, body, summary, keywords, triggerConditions, sortOrder, isActive, clauseKind, representedSide, category } = req.body;
    const clause = await clauseLibraryService.updateClause(String(req.params.id), {
      title, slug, body, summary, keywords, triggerConditions, sortOrder, isActive, clauseKind, representedSide, category,
    });
    if (!clause) {
      res.status(404).json({ error: 'Clause not found' });
      return;
    }
    res.json(clause);
  } catch (error: any) {
    console.error('Error updating clause:', error);
    res.status(500).json({ error: 'Failed to update clause', details: error.message });
  }
});

/**
 * DELETE /api/v1/clause-library/clauses/:id
 * Delete a clause
 */
router.delete('/clauses/:id', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const deleted = await clauseLibraryService.deleteClause(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Clause not found' });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting clause:', error);
    res.status(500).json({ error: 'Failed to delete clause', details: error.message });
  }
});

// ============================================================================
// LAWYER PROFILE ROUTES
// ============================================================================

/**
 * GET /api/v1/clause-library/lawyer-profiles
 * List all lawyer profiles
 */
router.get('/lawyer-profiles', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const profiles = await clauseLibraryService.listLawyerProfiles();
    res.json(profiles);
  } catch (error: any) {
    console.error('Error listing lawyer profiles:', error);
    res.status(500).json({ error: 'Failed to list lawyer profiles', details: error.message });
  }
});

/**
 * GET /api/v1/clause-library/lawyer-profiles/:id
 * Get single profile
 */
router.get('/lawyer-profiles/:id', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const profile = await clauseLibraryService.getLawyerProfile(String(req.params.id));
    if (!profile) {
      res.status(404).json({ error: 'Lawyer profile not found' });
      return;
    }
    res.json(profile);
  } catch (error: any) {
    console.error('Error getting lawyer profile:', error);
    res.status(500).json({ error: 'Failed to get lawyer profile', details: error.message });
  }
});

/**
 * PUT /api/v1/clause-library/lawyer-profiles/:id
 * Upsert lawyer profile (id in body is ignored — uses URL param)
 */
router.put('/lawyer-profiles/:id', authenticate, requireEnabled, async (req: Request, res: Response) => {
  try {
    const { lawyerName, lawyerEmail, preferredNumbering, defaultClosingText, styleNotes } = req.body;
    if (!lawyerName) {
      res.status(400).json({ error: 'lawyerName is required' });
      return;
    }
    const profile = await clauseLibraryService.upsertLawyerProfile({
      lawyerName, lawyerEmail, preferredNumbering, defaultClosingText, styleNotes,
    });
    res.json(profile);
  } catch (error: any) {
    console.error('Error upserting lawyer profile:', error);
    res.status(500).json({ error: 'Failed to upsert lawyer profile', details: error.message });
  }
});

// ============================================================================
// ASSEMBLY ROUTES
// ============================================================================

/**
 * GET /api/v1/clause-library/assembly/:caseId
 * Get assembly draft for a case
 */
router.get('/assembly/:caseId', requireEnabled, requireCaseReadAccess, async (req: Request, res: Response) => {
  try {
    const assembly = await clauseLibraryService.getAssembly(String(req.params.caseId));
    if (!assembly) {
      res.status(404).json({ error: 'Assembly not found for this case' });
      return;
    }
    res.json(assembly);
  } catch (error: any) {
    console.error('Error getting assembly:', error);
    res.status(500).json({ error: 'Failed to get assembly', details: error.message });
  }
});

/**
 * POST /api/v1/clause-library/assembly/recommend
 * Get recommended clauses for an intake
 * Body: { contractType, intakeData, lawyerProfileId? }
 */
router.post('/assembly/recommend', requireEnabled, async (req: Request, res: Response) => {
  try {
    const { contractType, intakeData, lawyerProfileId } = req.body;

    if (!contractType || !intakeData) {
      res.status(400).json({ error: 'contractType and intakeData are required' });
      return;
    }

    const recommendations = await clauseLibraryService.recommendClauses({ contractType, intakeData, lawyerProfileId });
    res.json(recommendations);
  } catch (error: any) {
    console.error('Error recommending clauses:', error);
    res.status(500).json({ error: 'Failed to recommend clauses', details: error.message });
  }
});

/**
 * POST /api/v1/clause-library/review-guidance
 * Get compact review guidance for generated contract document
 * Body: { documentId, contractType?, lawyerProfileId? }
 */
router.post('/review-guidance', requireEnabled, requireContractGenerationReadAccessFromBody, async (req: Request, res: Response) => {
  try {
    const { documentId, contractType, lawyerProfileId } = req.body;

    if (!documentId) {
      res.status(400).json({ error: 'documentId is required' });
      return;
    }

    const guidance = await clauseLibraryService.getReviewGuidance({
      documentId: String(documentId),
      contractType,
      lawyerProfileId,
    });

    res.json(guidance);
  } catch (error: any) {
    console.error('Error building review guidance:', error);
    res.status(500).json({ error: 'Failed to build review guidance', details: error.message });
  }
});

/**
 * PUT /api/v1/clause-library/assembly/:caseId
 * Upsert assembly draft
 */
router.put('/assembly/:caseId', requireEnabled, requireCaseManageAccess, async (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { contractType, intakeData, selectedClauses, assembledText, status, lawyerProfileId, templateId } = req.body;

    if (!intakeData) {
      res.status(400).json({ error: 'intakeData is required' });
      return;
    }

    const userId = (req as any).user?.userId;

    const assembly = await clauseLibraryService.upsertAssembly({
      caseId,
      contractType,
      intakeData,
      selectedClauses: selectedClauses || [],
      assembledText,
      status,
      lawyerProfileId,
      templateId,
      userId,
    });
    res.json(assembly);
  } catch (error: any) {
    console.error('Error upserting assembly:', error);
    res.status(500).json({ error: 'Failed to upsert assembly', details: error.message });
  }
});

/**
 * PATCH /api/v1/clause-library/assembly/:caseId/status
 * Update assembly status
 */
router.patch('/assembly/:caseId/status', requireEnabled, requireCaseManageAccess, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const assembly = await clauseLibraryService.updateAssemblyStatus(String(req.params.caseId), status);
    if (!assembly) {
      res.status(404).json({ error: 'Assembly not found' });
      return;
    }
    res.json(assembly);
  } catch (error: any) {
    console.error('Error updating assembly status:', error);
    res.status(500).json({ error: 'Failed to update assembly status', details: error.message });
  }
});

/**
 * DELETE /api/v1/clause-library/assembly/:caseId
 * Delete assembly draft
 */
router.delete('/assembly/:caseId', requireEnabled, requireCaseManageAccess, async (req: Request, res: Response) => {
  try {
    const deleted = await clauseLibraryService.deleteAssembly(String(req.params.caseId));
    if (!deleted) {
      res.status(404).json({ error: 'Assembly not found' });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting assembly:', error);
    res.status(500).json({ error: 'Failed to delete assembly', details: error.message });
  }
});

export default router;
