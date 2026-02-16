"use strict";
// ============================================================================
// TASK ROUTES - Feladatkezelési endpointok
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const services_js_1 = __importDefault(require("./services.js"));
const auth_js_1 = require("../../middleware/auth.js");
const router = (0, express_1.Router)();
// ============================================================================
// POST /api/v1/tasks - Új feladat létrehozása
// ============================================================================
router.post('/', auth_js_1.authenticate, async (req, res) => {
    try {
        const { caseId, title, description, type, priority, assignedTo, requiredSkills, dueDate, documentId } = req.body;
        const assignedBy = req.user?.userId;
        // Validate required fields
        if (!caseId || !title || !type) {
            return res.status(400).json({
                error: 'Hiányzó kötelező mezők: caseId, title, type'
            });
        }
        // Check if user can assign to this person
        if (assignedTo) {
            const canAssign = await services_js_1.default.canAssign(assignedBy, assignedTo);
            if (!canAssign) {
                return res.status(403).json({
                    error: 'Nincs jogosultságod ehhez a felhasználóhoz rendelni'
                });
            }
        }
        const task = await services_js_1.default.createTask({
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
    }
    catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Hiba a feladat létrehozásakor' });
    }
});
// ============================================================================
// GET /api/v1/cases/:caseId/tasks - Case-hez tartozó feladatok
// ============================================================================
router.get('/cases/:caseId/tasks', auth_js_1.authenticate, async (req, res) => {
    try {
        const caseId = req.params.caseId;
        const { status, assignedTo } = req.query;
        const tasks = await services_js_1.default.getCaseTasks(caseId, {
            status: status,
            assignedTo: assignedTo
        });
        res.json(tasks);
    }
    catch (error) {
        console.error('Error fetching case tasks:', error);
        res.status(500).json({ error: 'Hiba a feladatok lekérésekor' });
    }
});
// ============================================================================
// GET /api/v1/tasks/:id - Egy feladat adatai
// ============================================================================
router.get('/tasks/:id', auth_js_1.authenticate, async (req, res) => {
    try {
        const id = req.params.id;
        const task = await services_js_1.default.getTask(id);
        if (!task) {
            return res.status(404).json({ error: 'Feladat nem található' });
        }
        res.json(task);
    }
    catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ error: 'Hiba a feladat lekérésekor' });
    }
});
// ============================================================================
// POST /api/v1/tasks/:id/start - Feladat elkezdése
// ============================================================================
router.post('/tasks/:id/start', auth_js_1.authenticate, async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.user?.userId;
        const task = await services_js_1.default.startTask(id, userId);
        res.json(task);
    }
    catch (error) {
        console.error('Error starting task:', error);
        res.status(500).json({ error: 'Hiba a feladat elkezdésekor' });
    }
});
// ============================================================================
// POST /api/v1/tasks/:id/submit - Feladat beküldése review-ra
// ============================================================================
router.post('/tasks/:id/submit', auth_js_1.authenticate, async (req, res) => {
    try {
        const id = req.params.id;
        const { notes } = req.body;
        const userId = req.user?.userId;
        const task = await services_js_1.default.submitTask(id, userId, notes);
        res.json(task);
    }
    catch (error) {
        console.error('Error submitting task:', error);
        res.status(500).json({ error: 'Hiba a feladat beküldésekor' });
    }
});
// ============================================================================
// POST /api/v1/tasks/:id/complete - Feladat jóváhagyása/elutasítása
// ============================================================================
router.post('/tasks/:id/complete', auth_js_1.authenticate, async (req, res) => {
    try {
        const id = req.params.id;
        const { approved, notes } = req.body;
        const userId = req.user?.userId;
        if (typeof approved !== 'boolean') {
            return res.status(400).json({ error: 'Hiányzó approved mező' });
        }
        const task = await services_js_1.default.completeTask(id, userId, approved, notes);
        res.json(task);
    }
    catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ error: 'Hiba a feladat lezárásakor' });
    }
});
// ============================================================================
// POST /api/v1/tasks/:id/reassign - Feladat átadása
// ============================================================================
router.post('/tasks/:id/reassign', auth_js_1.authenticate, async (req, res) => {
    try {
        const id = req.params.id;
        const { newAssigneeId } = req.body;
        const reassignedBy = req.user?.userId;
        if (!newAssigneeId) {
            return res.status(400).json({ error: 'Hiányzó newAssigneeId' });
        }
        // Check if reassigner can assign to new assignee
        const canAssign = await services_js_1.default.canAssign(reassignedBy, newAssigneeId);
        if (!canAssign) {
            return res.status(403).json({
                error: 'Nincs jogosultságod ehhez a felhasználóhoz rendelni'
            });
        }
        const task = await services_js_1.default.reassignTask(id, newAssigneeId, reassignedBy);
        res.json(task);
    }
    catch (error) {
        console.error('Error reassigning task:', error);
        res.status(500).json({ error: 'Hiba a feladat átadásakor' });
    }
});
// ============================================================================
// GET /api/v1/tasks/recommendations - Skill-alapú ajánlások
// ============================================================================
router.get('/recommendations', auth_js_1.authenticate, async (req, res) => {
    try {
        const { taskType, caseId, requiredSkills } = req.query;
        if (!taskType || !caseId) {
            return res.status(400).json({
                error: 'Hiányzó kötelező mezők: taskType, caseId'
            });
        }
        const skills = requiredSkills
            ? requiredSkills.split(',')
            : undefined;
        const recommendations = await services_js_1.default.getTaskRecommendations({
            taskType: taskType,
            caseId: caseId,
            requiredSkills: skills
        });
        res.json(recommendations);
    }
    catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({ error: 'Hiba az ajánlások lekérésekor' });
    }
});
// ============================================================================
// GET /api/v1/my/tasks - Bejelentkezett felhasználó feladatai
// ============================================================================
router.get('/my/tasks', auth_js_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { status, caseId } = req.query;
        const tasks = await services_js_1.default.getUserTasks(userId, {
            status: status,
            caseId: caseId
        });
        res.json(tasks);
    }
    catch (error) {
        console.error('Error fetching user tasks:', error);
        res.status(500).json({ error: 'Hiba a feladatok lekérésekor' });
    }
});
// ============================================================================
// POST /api/v1/tasks/auto-generate - Automatikus feladat generálás
// ============================================================================
router.post('/auto-generate', auth_js_1.authenticate, async (req, res) => {
    try {
        const { caseId, workflowEvent, originalDocumentId } = req.body;
        const triggeredBy = req.user?.userId;
        if (!caseId || !workflowEvent) {
            return res.status(400).json({
                error: 'Hiányzó kötelező mezők: caseId, workflowEvent'
            });
        }
        const task = await services_js_1.default.autoGenerateTask({
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
    }
    catch (error) {
        console.error('Error auto-generating task:', error);
        res.status(500).json({ error: 'Hiba a feladat automatikus létrehozásakor' });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map