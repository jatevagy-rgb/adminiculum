// ============================================================================
// TASK ROUTES - Feladatkezelési endpointok
// ============================================================================

import { Router, Request, Response } from 'express';
import taskService from './services.js';
import { authenticate, requireRole } from '../../middleware/auth.js';

const router = Router();

// ============================================================================
// POST /api/v1/tasks - Új feladat létrehozása
// ============================================================================
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { 
      caseId, title, description, type, priority, 
      assignedTo, requiredSkills, dueDate, documentId 
    } = req.body;
    
    const assignedBy = (req as any).user?.userId;

    // Validate required fields
    if (!caseId || !title || !type) {
      return res.status(400).json({ 
        error: 'Hiányzó kötelező mezők: caseId, title, type' 
      });
    }

    // Check if user can assign to this person
    if (assignedTo) {
      const canAssign = await taskService.canAssign(assignedBy, assignedTo);
      if (!canAssign) {
        return res.status(403).json({ 
          error: 'Nincs jogosultságod ehhez a felhasználóhoz rendelni' 
        });
      }
    }

    const task = await taskService.createTask({
      caseId,
      title,
      description,
      type,
      priority,
      assignedTo,
      assignedBy,
      requiredSkills,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      documentId
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Hiba a feladat létrehozásakor' });
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
router.get('/tasks/:id', authenticate, async (req: Request, res: Response) => {
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
router.post('/tasks/:id/start', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;

    const task = await taskService.startTask(id, userId);
    res.json(task);
  } catch (error) {
    console.error('Error starting task:', error);
    res.status(500).json({ error: 'Hiba a feladat elkezdésekor' });
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/submit - Feladat beküldése review-ra
// ============================================================================
router.post('/tasks/:id/submit', authenticate, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { notes } = req.body;
    const userId = (req as any).user?.userId;

    const task = await taskService.submitTask(id, userId, notes);
    res.json(task);
  } catch (error) {
    console.error('Error submitting task:', error);
    res.status(500).json({ error: 'Hiba a feladat beküldésekor' });
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/complete - Feladat jóváhagyása/elutasítása
// ============================================================================
router.post('/tasks/:id/complete', authenticate, async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({ error: 'Hiba a feladat lezárásakor' });
  }
});

// ============================================================================
// POST /api/v1/tasks/:id/reassign - Feladat átadása
// ============================================================================
router.post('/tasks/:id/reassign', authenticate, async (req: Request, res: Response) => {
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
