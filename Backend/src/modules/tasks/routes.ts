// ============================================================================
// TASK ROUTES - Feladatkezelési endpointok
// ============================================================================

import { Router, Request, Response } from 'express';
import taskService, { TaskValidationError } from './services';
import { authenticate, requireRole } from '../../middleware/auth';
import { buildPrismaErrorResponse } from '../../utils/prismaError';
import {
  ensureNoArbitraryTaskStatusPayload,
  WorkflowTransitionError,
} from '../cases/workItems';
import taskSubmissionRoutes from './taskSubmission.routes';
import {
  addTaskCollaborator,
  archiveTaskDefinition,
  assertTaskPlanningRolesEligible,
  createTaskDefinition,
  listTaskCollaborators,
  listTaskDefinitions,
  removeTaskCollaborator,
  resolveTaskPlanning,
  setPlannedReviewer,
  updateTaskDefinition,
} from './taskPlanning';
import { InteractionError } from '../client-interaction/base';

const router = Router();

function sendTaskWorkflowError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof WorkflowTransitionError) {
    res.status(error.statusCode).json({
      status: error.statusCode,
      code: error.code,
      message: error.message,
    });
    return;
  }
  const prismaErr = buildPrismaErrorResponse(error);
  if (prismaErr) {
    res.status(prismaErr.status).json(prismaErr.body);
    return;
  }
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ error: fallbackMessage });
}

const FRONTEND_TO_PRISMA_TASK_TYPE: Record<string, string> = {
  CONTRACT_REVIEW: 'REVIEW_CONTRACT',
  CONTRACT_DRAFTING: 'DRAFT_CONTRACT',
  DOCUMENT_TRANSLATION: 'OTHER',
  LEGAL_RESEARCH: 'RESEARCH',
  CLIENT_COMMUNICATION: 'CLIENT_MEETING',
  ADMIN_SUPPORT: 'OTHER',
  REVIEW_CONTRACT: 'REVIEW_CONTRACT',
  DRAFT_CONTRACT: 'DRAFT_CONTRACT',
  CLIENT_MEETING: 'CLIENT_MEETING',
  RESEARCH: 'RESEARCH',
  COURT_FILING: 'COURT_FILING',
  DEADLINE: 'DEADLINE',
  APPROVAL: 'APPROVAL',
  REVIEW_ANONYMIZED: 'REVIEW_ANONYMIZED',
  QUALITY_CHECK: 'QUALITY_CHECK',
  OTHER: 'OTHER',
};

function mapFrontendTaskTypeToPrisma(rawType: string): string | null {
  const normalized = String(rawType || '').trim().toUpperCase();
  return FRONTEND_TO_PRISMA_TASK_TYPE[normalized] || null;
}

// ============================================================================
// GET /api/v1/tasks - Feladatok listázása (current user / case scope)
// ============================================================================
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { status, caseId, assignedTo } = req.query;

    if (caseId) {
      const tasks = await taskService.getCaseTasks(String(caseId), {
        status: status as string | undefined,
        assignedTo: assignedTo as string | undefined,
      });
      return res.json(tasks);
    }

    const tasks = await taskService.getUserTasks(userId, {
      status: status as string | undefined,
    });

    return res.json(tasks);
  } catch (error) {
    console.error('Error listing tasks:', error);
    return res.status(500).json({ error: 'Hiba a feladatok listázásakor' });
  }
});

router.get('/review-queue', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ status: 401, code: 'NOT_AUTHENTICATED', message: 'Authenticated user is required' });
    }
    const tasks = await taskService.getReviewTasksForUser(userId);
    return res.json(tasks);
  } catch (error) {
    console.error('Error fetching review queue:', error instanceof Error ? error.message : 'Unknown error');
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) return res.status(prismaErr.status).json(prismaErr.body);
    return res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Review queue could not be loaded.' });
  }
});

// ============================================================================
// TASK PLANNING — reusable type catalogue + work roles (additive)
// ============================================================================

function actor(req: Request) {
  return { userId: String((req as any).user?.userId || ''), role: String((req as any).user?.role || '') };
}

router.get('/task-definitions', authenticate, async (req: Request, res: Response) => {
  try {
    const items = await listTaskDefinitions(actor(req), {
      clientId: req.query.clientId ? String(req.query.clientId) : undefined,
      includeArchived: req.query.includeArchived === 'true',
    });
    return res.json({ items });
  } catch (error) {
    console.error('Error listing task definitions:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a feladattípus-katalógus lekérésekor');
  }
});

router.post('/task-definitions', authenticate, async (req: Request, res: Response) => {
  try {
    const created = await createTaskDefinition(actor(req), {
      clientId: req.body?.clientId ?? null,
      label: req.body?.label,
      description: req.body?.description,
      defaultEstimatedMinutes: req.body?.defaultEstimatedMinutes ?? null,
      defaultAttentionCategory: req.body?.defaultAttentionCategory ?? null,
    });
    return res.status(201).json(created);
  } catch (error) {
    console.error('Error creating task definition:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a feladattípus mentésekor');
  }
});

router.patch('/task-definitions/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const updated = await updateTaskDefinition(actor(req), String(req.params.id), {
      label: req.body?.label,
      description: req.body?.description,
      defaultEstimatedMinutes: req.body?.defaultEstimatedMinutes,
      defaultAttentionCategory: req.body?.defaultAttentionCategory,
    });
    return res.json(updated);
  } catch (error) {
    console.error('Error updating task definition:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a feladattípus frissítésekor');
  }
});

router.post('/task-definitions/:id/archive', authenticate, async (req: Request, res: Response) => {
  try {
    const archived = await archiveTaskDefinition(actor(req), String(req.params.id));
    return res.json(archived);
  } catch (error) {
    console.error('Error archiving task definition:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a feladattípus archiválásakor');
  }
});

router.get('/:id/collaborators', authenticate, async (req: Request, res: Response) => {
  try {
    const items = await listTaskCollaborators(actor(req), String(req.params.id));
    return res.json({ items });
  } catch (error) {
    console.error('Error listing task collaborators:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a közreműködők lekérésekor');
  }
});

router.put('/:id/collaborators/:userId', authenticate, async (req: Request, res: Response) => {
  try {
    const row = await addTaskCollaborator(actor(req), String(req.params.id), String(req.params.userId));
    return res.status(201).json(row);
  } catch (error) {
    console.error('Error adding task collaborator:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a közreműködő hozzáadásakor');
  }
});

router.delete('/:id/collaborators/:userId', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await removeTaskCollaborator(actor(req), String(req.params.id), String(req.params.userId));
    return res.json(result);
  } catch (error) {
    console.error('Error removing task collaborator:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a közreműködő eltávolításakor');
  }
});

router.put('/:id/planned-reviewer', authenticate, async (req: Request, res: Response) => {
  try {
    const reviewerId = req.body?.userId == null || req.body?.userId === '' ? null : String(req.body.userId);
    const task = await setPlannedReviewer(actor(req), String(req.params.id), reviewerId);
    return res.json(task);
  } catch (error) {
    console.error('Error setting planned reviewer:', error);
    return sendTaskWorkflowError(res, error, 'Hiba a tervezett reviewer beállításakor');
  }
});

router.use('/', taskSubmissionRoutes);

// ============================================================================
// POST /api/v1/tasks - Új feladat létrehozása
// ============================================================================
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      caseId, title, description, priority,
      assignedTo, requiredSkills, dueDate, documentId, requestedByOrganizationPersonId
    } = req.body;
    const rawType = req.body?.type ?? req.body?.taskType;
    
    const assignedBy = (req as any).user?.userId;
    if (!assignedBy) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate required fields
    if (!caseId || !title || !rawType) {
      return res.status(400).json({ 
        error: 'Hiányzó kötelező mezők: caseId, title, type/taskType' 
      });
    }

    const mappedTaskType = mapFrontendTaskTypeToPrisma(rawType);
    if (!mappedTaskType) {
      return res.status(400).json({ 
        error: 'Érvénytelen feladattípus', 
        field: 'type',
        message: `Ismeretlen típus: ${rawType}` 
      });
    }

    // Check if user can assign to this person
    let effectiveAssignedTo = assignedTo as string | undefined;
    if (effectiveAssignedTo) {
      const canAssign = await taskService.canAssign(assignedBy, assignedTo);
      if (!canAssign) {
        // Do not fail the entire create flow on invalid assignment choice from UI list.
        // Create task as unassigned and let reassignment happen later with explicit permissions.
        effectiveAssignedTo = undefined;
      }
    }

    const attentionInput = taskService.parseTaskAttentionInput(req.body || {});

    // Additive planning resolution: catalogue pick snapshots the label, free
    // label stays free, estimate precedence explicit > definition > band.
    const planning = await resolveTaskPlanning({
      taskDefinitionId: req.body?.taskDefinitionId ?? null,
      taskTypeLabel: req.body?.taskTypeLabel ?? null,
      plannedReviewerId: req.body?.plannedReviewerId ?? null,
      estimatedMinutes: attentionInput.estimatedMinutes ?? null,
      attentionCategory: attentionInput.attentionCategory ?? null,
      saveToCatalogue: req.body?.saveToCatalogue === true,
      taskDefinitionClientId: req.body?.taskDefinitionClientId ?? null,
    }, actor(req));

    const collaboratorUserIds = Array.isArray(req.body?.collaboratorUserIds)
      ? req.body.collaboratorUserIds.map((v: unknown) => String(v))
      : [];
    if (planning.plannedReviewerId || collaboratorUserIds.length) {
      await assertTaskPlanningRolesEligible(caseId, {
        assigneeId: effectiveAssignedTo ?? null,
        plannedReviewerId: planning.plannedReviewerId,
        collaboratorUserIds,
      });
    }

    console.log(`[TASK_CREATE] Payload: caseId=${caseId}, title=${title}, rawType=${rawType}, mappedTaskType=${mappedTaskType}, priority=${priority}, assignedTo=${effectiveAssignedTo}`);

    const task = await taskService.createTask({
      caseId,
      title,
      description,
      taskType: mappedTaskType as any,
      type: mappedTaskType as any,
      priority,
      assignedTo: effectiveAssignedTo,
      assignedBy,
      requiredSkills,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      documentId,
      attentionCategory: (planning.attentionCategory ?? attentionInput.attentionCategory) as any,
      estimatedMinutes: planning.estimatedMinutes,
      requestedByOrganizationPersonId,
      taskDefinitionId: planning.taskDefinitionId,
      taskTypeLabelSnapshot: planning.taskTypeLabelSnapshot,
      plannedReviewerId: planning.plannedReviewerId,
      collaboratorUserIds,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    if (error instanceof WorkflowTransitionError) {
      return res.status(error.statusCode).json({
        status: error.statusCode,
        code: error.code,
        message: error.message,
      });
    }
    if (error instanceof TaskValidationError) {
      return res.status(400).json({
        error: 'Validation error',
        field: 'taskType',
        message: error.message,
      });
    }
    const prismaErr = buildPrismaErrorResponse(error);
    if (prismaErr) {
      return res.status(prismaErr.status).json(prismaErr.body);
    }
    res.status(500).json({ error: 'Hiba a feladat létrehozásakor' });
  }
});

// ============================================================================
// PATCH /api/v1/tasks/:id/attention - Figyelmi kategória és becsült idő
// ============================================================================
router.patch('/:id/attention', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;
    const task = await taskService.updateTaskAttention(id, userId, req.body);
    res.json(task);
  } catch (error) {
    console.error('Error updating task attention:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat figyelmi besorolásának frissítésekor');
  }
});

// ============================================================================
// PATCH /api/v1/tasks/:id - Általános feladatszerkesztés (cím, leírás, prioritás,
// határidő, felelős, figyelmi kategória, becsült idő). Státusz NEM módosítható itt;
// az a lifecycle végpontokon keresztül megy (start/submit/complete/…).
// ============================================================================
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;
    const task = await taskService.updateTaskDetails(id, userId, req.body);
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat frissítésekor');
  }
});

// ============================================================================
// GET /api/v1/cases/:caseId/tasks - Case-hez tartozó feladatok
// ============================================================================
router.get('/cases/:caseId/tasks', authenticate, async (req: Request, res: Response) => {
  try {
    const caseIdParam = req.params.caseId;
    const caseId = Array.isArray(caseIdParam) ? caseIdParam[0] : caseIdParam;
    const { status, assignedTo } = req.query;

    const tasks = await taskService.getCaseTasks(caseId, {
      status: status as string | undefined,
      assignedTo: assignedTo as string | undefined
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching case tasks:', error);
    res.status(500).json({ error: 'Hiba a feladatok lekérésekor' });
  }
});

// ============================================================================
// GET /api/v1/tasks/:id - Egy feladat adatai
// ============================================================================
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    
    const task = await taskService.getTask(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Feladat nem található' });
    }

    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Hiba a feladat lekérésekor' });
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/start - Feladat elkezdése
// ============================================================================
router.post('/:id/start', authenticate, async (req: Request, res: Response) => {
  try {
    ensureNoArbitraryTaskStatusPayload(req.body);
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;

    const task = await taskService.startTask(id, userId);
    res.json(task);
  } catch (error) {
    console.error('Error starting task:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat elkezdésekor');
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/submit - Feladat beküldése review-ra
// ============================================================================
router.post('/:id/submit', authenticate, async (req: Request, res: Response) => {
  try {
    ensureNoArbitraryTaskStatusPayload(req.body);
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { notes } = req.body;
    const userId = (req as any).user?.userId;

    const task = await taskService.submitTask(id, userId, notes);
    res.json(task);
  } catch (error) {
    console.error('Error submitting task:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat beküldésekor');
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/complete - Feladat jóváhagyása/elutasítása
// ============================================================================
router.post('/:id/complete', authenticate, async (req: Request, res: Response) => {
  try {
    ensureNoArbitraryTaskStatusPayload(req.body);
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { approved, notes } = req.body;
    const userId = (req as any).user?.userId;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Hiányzó approved mező' });
    }

    const task = await taskService.completeTask(id, userId, approved, notes);
    res.json(task);
  } catch (error) {
    console.error('Error completing task:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat lezárásakor');
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/block - Feladat blokkolása strukturált okkal
// ============================================================================
router.post('/:id/block', authenticate, async (req: Request, res: Response) => {
  try {
    ensureNoArbitraryTaskStatusPayload(req.body);
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;
    const reason = String(req.body?.reason || '').trim();

    if (!reason) {
      return res.status(400).json({ status: 400, code: 'STUCK_REASON_REQUIRED', message: 'reason is required' });
    }

    const task = await taskService.blockTask(id, userId, reason);
    res.json(task);
  } catch (error) {
    console.error('Error blocking task:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat blokkolásakor');
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/unblock - Feladat blokkolásának feloldása
// ============================================================================
router.post('/:id/unblock', authenticate, async (req: Request, res: Response) => {
  try {
    ensureNoArbitraryTaskStatusPayload(req.body);
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;

    const task = await taskService.unblockTask(id, userId);
    res.json(task);
  } catch (error) {
    console.error('Error unblocking task:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladat blokkolásának feloldásakor');
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/reschedule - Feladathatáridő átütemezése
// ============================================================================
router.post('/:id/reschedule', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;

    const task = await taskService.rescheduleTaskDueDate(id, userId, req.body);
    res.json(task);
  } catch (error) {
    console.error('Error rescheduling task deadline:', error);
    sendTaskWorkflowError(res, error, 'Hiba a feladathatáridő átütemezésekor');
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/reassign - Feladat átadása
// ============================================================================
router.post('/:id/reassign', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { newAssigneeId } = req.body;
    const reassignedBy = (req as any).user?.userId;

    if (!newAssigneeId) {
      return res.status(400).json({ error: 'Hiányzó newAssigneeId' });
    }

    // Check if reassigner can assign to new assignee
    const canAssign = await taskService.canAssign(reassignedBy, newAssigneeId);
    if (!canAssign) {
      return res.status(403).json({ 
        error: 'Nincs jogosultságod ehhez a felhasználóhoz rendelni' 
      });
    }

    const task = await taskService.reassignTask(id, newAssigneeId, reassignedBy);
    res.json(task);
    } catch (error) {
    console.error('Error reassigning task:', error);
    if (error instanceof WorkflowTransitionError) {
      return res.status(error.statusCode).json({ status: error.statusCode, code: error.code, message: error.message });
    }
      const prismaErr = buildPrismaErrorResponse(error);
      if (prismaErr) {
        return res.status(prismaErr.status).json(prismaErr.body);
    }
    res.status(500).json({ error: 'Hiba a feladat átadásakor' });
  }
});

// ============================================================================
// GET /api/v1/tasks/recommendations - Skill-alapú ajánlások
// ============================================================================
router.get('/recommendations', authenticate, async (req: Request, res: Response) => {
  try {
    const { taskType, caseId, requiredSkills } = req.query;

    if (!taskType || !caseId) {
      return res.status(400).json({ 
        error: 'Hiányzó kötelező mezők: taskType, caseId' 
      });
    }

    const skills = requiredSkills 
      ? (requiredSkills as string).split(',') 
      : undefined;

    const recommendations = await taskService.getTaskRecommendations({
      taskType: taskType as any,
      caseId: caseId as string,
      requiredSkills: skills
    });

    res.json(recommendations);
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Hiba az ajánlások lekérésekor' });
  }
});

// ============================================================================
// GET /api/v1/my/tasks - Bejelentkezett felhasználó feladatai
// ============================================================================
router.get('/my/tasks', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { status, caseId } = req.query;

    const tasks = await taskService.getUserTasks(userId, {
      status: status as string | undefined,
      caseId: caseId as string | undefined
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    res.status(500).json({ error: 'Hiba a feladatok lekérésekor' });
  }
});

// ============================================================================
// POST /api/v1/tasks/auto-generate - Automatikus feladat generálás
// ============================================================================
router.post('/auto-generate', authenticate, async (req: Request, res: Response) => {
  try {
    const { caseId, workflowEvent, originalDocumentId } = req.body;
    const triggeredBy = (req as any).user?.userId;

    if (!caseId || !workflowEvent) {
      return res.status(400).json({ 
        error: 'Hiányzó kötelező mezők: caseId, workflowEvent' 
      });
    }

    const task = await taskService.autoGenerateTask({
      caseId,
      workflowEvent,
      triggeredBy,
      originalDocumentId
    });

    if (!task) {
      return res.status(400).json({ 
        error: 'Ehhez a workflow eseményhez nem tartozik automatikus feladat' 
      });
    }

    res.json(task);
  } catch (error) {
    console.error('Error auto-generating task:', error);
    res.status(500).json({ error: 'Hiba a feladat automatikus létrehozásakor' });
  }
});

export default router;
