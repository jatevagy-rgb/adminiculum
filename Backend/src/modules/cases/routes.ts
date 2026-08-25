/**
 * Cases Routes Module V3
 * Case management endpoints with Timeline + Documents integration
 */

import { Router, Request, Response } from 'express';
import casesService from './services';
import { workflowService } from '../workflow';
import { authenticate } from '../../middleware/auth';
import { requireCaseCollaboratorManageAccess, requireCaseManageAccess, requireCaseReadAccess } from './authorization';
import { getCaseWorkflowSummary } from './workflowSummary';
import { getCaseWorkItems } from './workItems';
import { getCaseActivity } from './activity';
import { getCaseWorkspace } from './workspace';
import { createCaseComment, listCaseComments, resolveCaseComment, reopenCaseComment, sendCaseCommentError } from './caseComments.service';
import { createCaseIntake, CaseIntakeError } from './intakeCreate.service';
import {
  listWorkflowTemplatesForSelection,
  listWorkflowTemplatesAdmin,
  getWorkflowTemplateAdmin,
  createWorkflowTemplate,
  updateWorkflowTemplateDraft,
  createWorkflowTemplateVersion,
  duplicateWorkflowTemplate,
  activateWorkflowTemplate,
  archiveWorkflowTemplate,
  WorkflowTemplateError,
} from './workflowTemplateService';
import { AgendaRequestError, getCaseDeadlines } from '../agenda/service';
import { getCaseResponsibility } from '../responsibility/service';
import { getCaseLifecycle, closeCase, reopenCase, archiveCase, LifecycleServiceError } from './lifecycleService';
import { getCaseLitigationDossier } from './litigationDossier';
import {
  activateMatter,
  createOpeningTasks,
  declineIntake,
  getCaseIntakeReadiness,
  IntakeServiceError,
} from './intakeService';
import { getDashboardOperationalOverview } from './dashboardOperational';
import { getCaseAttentionSummary, listCaseAttentionSummaries } from './attention.service';

const router = Router();

type LifecycleMutation = (
  caseId: string,
  actor: { userId: string; role?: string | null }
) => Promise<unknown>;

async function handleLifecycleMutation(
  req: Request,
  res: Response,
  action: LifecycleMutation
): Promise<void> {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const result = await action(caseId, { userId, role: req.user?.role });
    res.json(result);
  } catch (error) {
    if (error instanceof LifecycleServiceError) {
      res.status(error.statusCode).json({
        status: error.statusCode,
        code: error.code,
        message: error.message,
        ...(error.blockers ? { blockers: error.blockers } : {}),
      });
      return;
    }
    console.error('Case lifecycle mutation error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

// ============================================================================
// Workflow templates (Beállítások → Munkafolyamatok) + New Case selection.
// Registered BEFORE /:caseId routes so the literal path is not captured by the
// caseId param.
// ============================================================================
function handleWorkflowTemplateError(res: Response, error: unknown): void {
  if (error instanceof WorkflowTemplateError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  console.error('Workflow template error:', error);
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

// Selection list for New Case: active DB templates merged with built-ins.
router.get('/workflow-templates', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ items: await listWorkflowTemplatesForSelection() });
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

// Admin surfaces (workforce-only; server also enforces role in the service).
router.get('/workflow-templates/admin', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ items: await listWorkflowTemplatesAdmin() });
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.get('/workflow-templates/admin/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getWorkflowTemplateAdmin(String(req.params.id)));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.post('/workflow-templates', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await createWorkflowTemplate(req.user!.userId, req.body || {}));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.patch('/workflow-templates/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await updateWorkflowTemplateDraft(req.user!.userId, String(req.params.id), req.body || {}));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.post('/workflow-templates/:id/version', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await createWorkflowTemplateVersion(req.user!.userId, String(req.params.id), req.body || {}));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.post('/workflow-templates/:id/duplicate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await duplicateWorkflowTemplate(req.user!.userId, String(req.params.id), req.body || {}));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.post('/workflow-templates/:id/activate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await activateWorkflowTemplate(req.user!.userId, String(req.params.id)));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

router.post('/workflow-templates/:id/archive', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await archiveWorkflowTemplate(req.user!.userId, String(req.params.id)));
  } catch (error) { handleWorkflowTemplateError(res, error); }
});

// ============================================================================
// GET /cases
// ============================================================================
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const assignedLawyerId = req.query.assignedLawyerId ? String(req.query.assignedLawyerId).trim() : undefined;
    const clientId = req.query.clientId ? String(req.query.clientId).trim() : undefined;

    if (status && !workflowService.isValidStatus(status)) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: `Invalid status filter: ${status}` });
      return;
    }

    const result = await casesService.getCases({ page, limit, status, assignedLawyerId, clientId });
    res.json(result);
    } catch (error) {
      console.error('Get cases error:', error);
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  });

router.get('/attention', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required.' }); return; }
    res.json({ items: await listCaseAttentionSummaries({ userId, role: req.user?.role, clientId: req.query.clientId ? String(req.query.clientId) : undefined, limit: Number(req.query.limit) || 25, offset: Number(req.query.offset) || 0 }) });
  } catch (error) { console.error('List case attention error:', error); res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Case attention could not be loaded.' }); }
});

// ============================================================================
// GET /cases/dashboard/operational-overview
// ============================================================================
router.get('/dashboard/operational-overview', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const overview = await getDashboardOperationalOverview({ userId, role: req.user?.role });
    res.json(overview);
  } catch (error) {
    console.error('Dashboard operational overview error:', error);
    res.status(500).json({ status: 500, code: 'DASHBOARD_OPERATIONAL_OVERVIEW_ERROR', message: 'Operational dashboard data could not be loaded.' });
  }
});

// ============================================================================
// GET /cases/:caseId/timeline
// ============================================================================
router.get('/:caseId/timeline', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const timeline = await casesService.getCaseTimeline(caseId);
    res.json(timeline);
  } catch (error) {
    console.error('Get timeline error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/documents
// ============================================================================
router.get('/:caseId/documents', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const documents = await casesService.getCaseDocuments(caseId);
    res.json(documents);
  } catch (error) {
    console.error('Get case documents error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/:caseId/workflow', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const workflow = await casesService.getWorkflow(caseId);
    
    if (!workflow) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(workflow);
  } catch (error) {
    console.error('Get workflow error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/workflow-graph (NEW)
// ============================================================================
router.get('/:caseId/workflow-graph', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const workflowGraph = await workflowService.getWorkflowGraph(caseId);
    
    if (!workflowGraph) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(workflowGraph);
  } catch (error) {
    console.error('Get workflow graph error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/workflow-history
// ============================================================================
router.get('/:caseId/workflow-history', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const history = await workflowService.getWorkflowHistory(caseId);
    res.json(history);
  } catch (error) {
    console.error('Get workflow history error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/summary
// ============================================================================
router.get('/:caseId/summary', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const summary = await casesService.getCaseSummary(caseId);
    
    if (!summary) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(summary);
  } catch (error) {
    console.error('Get case summary error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/workspace — case overview mini-dashboard read projection
// ============================================================================
router.get('/:caseId/workspace', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const workspace = await getCaseWorkspace(caseId);
    if (!workspace) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }
    res.json(workspace);
  } catch (error) {
    console.error('Get case workspace error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

router.get('/:caseId/attention', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const attention = await getCaseAttentionSummary(String(req.params.caseId));
    if (!attention) { res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found.' }); return; }
    res.json(attention);
  } catch (error) { console.error('Get case attention error:', error); res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Case attention could not be loaded.' }); }
});

// ============================================================================
// GET /cases/:caseId/workflow-summary
// ============================================================================
router.get('/:caseId/workflow-summary', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }

    const summary = await getCaseWorkflowSummary(caseId, userId);

    if (!summary) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(summary);
  } catch (error) {
    console.error('Get workflow summary error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/work-items
// ============================================================================
router.get('/:caseId/work-items', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }

    const workItems = await getCaseWorkItems(caseId, userId, req.user?.role);

    if (!workItems) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(workItems);
  } catch (error) {
    console.error('Get case work items error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/responsibility
// ============================================================================
router.get('/:caseId/responsibility', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }

    const result = await getCaseResponsibility(caseId, { userId, role: req.user?.role });
    if (!result) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Get case responsibility error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/activity
// ============================================================================
router.get('/:caseId/activity', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const activity = await getCaseActivity(caseId, {
      limit: req.query.limit,
      offset: req.query.offset,
      type: req.query.type,
    });

    if (!activity) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(activity);
  } catch (error) {
    console.error('Get case activity error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/deadlines
// ============================================================================
router.get('/:caseId/deadlines', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const result = await getCaseDeadlines(caseId, userId, {
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AgendaRequestError) {
      res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
      return;
    }
    console.error('Get case deadlines error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/lifecycle
// ============================================================================
router.get('/:caseId/lifecycle', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const lifecycle = await getCaseLifecycle(caseId, { userId, role: req.user?.role });
    if (!lifecycle) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }
    res.json(lifecycle);
  } catch (error) {
    console.error('Get case lifecycle error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/litigation-dossier
// ============================================================================
router.get('/:caseId/litigation-dossier', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const dossier = await getCaseLitigationDossier(caseId, { userId, role: req.user?.role });
    if (!dossier) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }
    res.json(dossier);
  } catch (error) {
    console.error('Get litigation dossier error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/intake-readiness
// ============================================================================
router.get('/:caseId/intake-readiness', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const readiness = await getCaseIntakeReadiness(caseId, { userId, role: req.user?.role });
    if (!readiness) {
      res.status(404).json({ status: 404, code: 'CASE_NOT_FOUND', message: 'Case not found' });
      return;
    }
    res.json(readiness);
  } catch (error) {
    console.error('Get intake readiness error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

function sendIntakeError(res: Response, error: unknown, label: string): void {
  if (error instanceof IntakeServiceError) {
    res.status(error.statusCode).json({
      status: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.blockers ? { blockers: error.blockers } : {}),
    });
    return;
  }
  console.error(`${label} error:`, error);
  res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

// ============================================================================
// POST /cases/:caseId/opening-tasks — explicit, user-confirmed bundle only
// ============================================================================
router.post('/:caseId/opening-tasks', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const result = await createOpeningTasks(caseId, { userId, role: req.user?.role }, req.body);
    res.status(201).json(result);
  } catch (error) {
    sendIntakeError(res, error, 'Create opening tasks');
  }
});

// ============================================================================
// POST /cases/:caseId/activate | /decline-intake — explicit intake transitions
// ============================================================================
router.post('/:caseId/activate', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const result = await activateMatter(caseId, { userId, role: req.user?.role });
    res.json(result);
  } catch (error) {
    sendIntakeError(res, error, 'Activate matter');
  }
});

router.post('/:caseId/decline-intake', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
      return;
    }
    const result = await declineIntake(caseId, { userId, role: req.user?.role });
    res.json(result);
  } catch (error) {
    sendIntakeError(res, error, 'Decline intake');
  }
});

// ============================================================================
// POST /cases/:caseId/close | /reopen | /archive  (lifecycle transitions)
// ============================================================================
router.post('/:caseId/close', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  const force = Boolean((req.body as any)?.force);
  await handleLifecycleMutation(req, res, (caseId, actor) => closeCase(caseId, actor, { force }));
});

router.post('/:caseId/reopen', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  await handleLifecycleMutation(req, res, (caseId, actor) => reopenCase(caseId, actor));
});

router.post('/:caseId/archive', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  await handleLifecycleMutation(req, res, (caseId, actor) => archiveCase(caseId, actor));
});

// ============================================================================
// GET /cases/:caseId/client-house-style
// ============================================================================
router.get('/:caseId/client-house-style', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const profile = await casesService.getCaseClientHouseStyle(caseId);
    res.json(profile);
  } catch (error) {
    console.error('Get case client house style error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Case not found') {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId
// ============================================================================
router.get('/:caseId', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const caseData = await casesService.getCaseById(caseId);
    
    if (!caseData) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
      return;
    }

    res.json(caseData);
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// POST /cases
// ============================================================================
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required for case creation' });
      return;
    }
    
    // Handle both JSON and form-urlencoded data
    let clientName = req.body?.clientName || req.body?.['clientName'];
    let clientId = req.body?.clientId || req.body?.['clientId'];
    let matterType = req.body?.matterType || req.body?.['matterType'];
    let description = req.body?.description || req.body?.['description'];
    let clientRole = req.body?.clientRole || req.body?.['clientRole'];
    let deadline = req.body?.deadline || req.body?.['deadline'];
    let workflowTemplateKey = req.body?.workflowTemplateKey || req.body?.['workflowTemplateKey'];
    let workflowAssignees = req.body?.workflowAssignees || req.body?.['workflowAssignees'];

    if (!clientName && !clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: clientName or clientId' });
      return;
    }

    const result = await casesService.createCase({
      clientName,
      clientId,
      matterType: matterType || 'OTHER',
      description,
      clientRole,
      deadline: deadline || undefined,
      workflowTemplateKey: workflowTemplateKey || undefined,
      workflowAssignees: workflowAssignees && typeof workflowAssignees === 'object' ? workflowAssignees : undefined,
      createdById: userId
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create case error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Client not found') {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
      return;
    }
    if (message === 'Client is required for case creation' || message === 'Client name or clientId is required') {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
      return;
    }
    if (message === 'Authenticated user not found' || message === 'Authenticated user is required for case creation') {
      res.status(401).json({ status: 401, code: 'AUTH_USER_NOT_FOUND', message });
      return;
    }
    if (message === 'Authenticated user is inactive') {
      res.status(403).json({ status: 403, code: 'AUTH_USER_INACTIVE', message });
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
  }
});

// ============================================================================
// PATCH /cases/:caseId - Partial update (deadline, priority, description)
// ============================================================================
router.patch('/:caseId', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId } = req.params as { caseId: string };
    const { deadline, priority, description, clientRole } = req.body;

    // At least one field must be provided
    if (deadline === undefined && priority === undefined && description === undefined && clientRole === undefined) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'At least one field (deadline, priority, description, clientRole) must be provided' });
      return;
    }

    const result = await casesService.updateCase({
      caseId,
      deadline: deadline !== undefined ? (deadline === null || deadline === '' ? null : deadline) : undefined,
      priority,
      description,
      clientRole: clientRole !== undefined ? (clientRole === '' ? null : clientRole) : undefined,
      userId
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Update case error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Case not found') {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
    } else {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
    }
  }
});

// ============================================================================
// PATCH /cases/:caseId/status (NOW USES WORKFLOW ENGINE)
// ============================================================================
router.patch('/:caseId/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId } = req.params as { caseId: string };
    const { status, comment } = req.body;

    if (!status) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: status' });
      return;
    }

    // Validate status
    if (!workflowService.isValidStatus(status)) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: `Invalid status: ${status}` });
      return;
    }

    // Check if transition is allowed
    const validation = await workflowService.canTransition(caseId, status);
    if (!validation.allowed) {
      res.status(400).json({ 
        status: 400, 
        code: 'INVALID_TRANSITION', 
        message: validation.reason,
        currentStatus: validation.currentStatus
      });
      return;
    }

    // Execute status change through workflow engine
    const result = await workflowService.changeStatus({
      caseId,
      fromStatus: validation.currentStatus,
      toStatus: status as any,
      userId,
      comment
    });

    if (!result.success) {
      res.status(400).json({ 
        status: 400, 
        code: 'WORKFLOW_ERROR', 
        message: result.error 
      });
      return;
    }

    res.json({
      success: true,
      caseId: result.caseId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      timelineEventId: result.timelineEventId,
      documentsMoved: result.documentsMoved,
      message: `Status changed from ${result.fromStatus} to ${result.toStatus}`
    });
  } catch (error) {
    console.error('Update case status error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// ============================================================================
// POST /cases/:caseId/assign
// ============================================================================
router.post('/:caseId/assign', authenticate, requireCaseManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const assignedById = (req as any).user?.userId;
    const { caseId } = req.params as { caseId: string };
    const { userId, role } = req.body;

    if (!userId || !role) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required fields: userId, role' });
      return;
    }

    const result = await casesService.assignUser(caseId, userId, role, assignedById);
    res.status(201).json(result);
  } catch (error) {
    console.error('Assign user error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/dashboard/stats
// ============================================================================
router.get('/dashboard/stats', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await casesService.getDashboardStats(req.user?.userId);
    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /cases/:caseId/collaborators
// ============================================================================
router.get('/:caseId/collaborators', authenticate, requireCaseReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const caseId = req.params.caseId as string;
    const collaborators = await casesService.getCaseCollaborators(caseId);
    res.json(collaborators);
  } catch (error) {
    console.error('Get collaborators error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// POST /cases/:caseId/collaborators
// ============================================================================
router.post('/:caseId/collaborators', authenticate, requireCaseCollaboratorManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const caseId = req.params.caseId as string;
    const { userId, role } = req.body as { userId: string; role?: string };
    if (!userId) {
      res.status(400).json({ status: 400, code: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }
    const collaborator = await casesService.addCaseCollaborator(caseId, userId, role || 'COLLABORATOR');
    res.status(201).json(collaborator);
  } catch (error: any) {
    console.error('Add collaborator error:', error);
    if (error?.code === 'P2002') {
      res.status(409).json({ status: 409, code: 'ALREADY_EXISTS', message: 'User is already a collaborator on this case' });
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// DELETE /cases/:caseId/collaborators/:collaboratorId
// ============================================================================
router.delete('/:caseId/collaborators/:collaboratorId', authenticate, requireCaseCollaboratorManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const collaboratorId = req.params.collaboratorId as string;
    await casesService.removeCaseCollaborator(collaboratorId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Remove collaborator error:', error);
    if (error?.code === 'P2025') {
      res.status(404).json({ status: 404, code: 'COLLABORATOR_NOT_FOUND', message: 'Collaborator not found for this case' });
      return;
    }
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// POST /cases/intake — transactional matter intake (CASE-INTAKE-REDESIGN-1).
// Creates the matter together with participants, typed deadlines, communication
// links and initial tasks atomically. The legacy POST /cases is unchanged, so
// existing callers keep working; this is an additive, versioned intake path.
// ============================================================================
router.post('/intake', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required.' });
      return;
    }
    const result = await createCaseIntake(userId, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof CaseIntakeError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    console.error('Case intake error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Matter intake failed.' });
  }
});

// ============================================================================
// Case-level comments (internal notes) — polymorphic Comment model, caseId set.
// Authorization + author derivation handled inside the service.
// ============================================================================
router.get('/:caseId/comments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await listCaseComments(req, String(req.params.caseId || ''), req.query);
    res.json(result);
  } catch (error) {
    sendCaseCommentError(res, error);
  }
});

router.post('/:caseId/comments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await createCaseComment(req, String(req.params.caseId || ''), req.body);
    res.status(201).json(result);
  } catch (error) {
    sendCaseCommentError(res, error);
  }
});

router.post('/:caseId/comments/:commentId/resolve', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await resolveCaseComment(req, String(req.params.caseId || ''), String(req.params.commentId || ''));
    res.json(result);
  } catch (error) {
    sendCaseCommentError(res, error);
  }
});

router.post('/:caseId/comments/:commentId/reopen', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await reopenCaseComment(req, String(req.params.caseId || ''), String(req.params.commentId || ''));
    res.json(result);
  } catch (error) {
    sendCaseCommentError(res, error);
  }
});

export default router;
