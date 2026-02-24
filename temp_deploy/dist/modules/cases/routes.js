"use strict";
/**
 * Cases Routes Module V3
 * Case management endpoints with Timeline + Documents integration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const services_1 = __importDefault(require("./services"));
const workflow_1 = require("../workflow");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// ============================================================================
// GET /cases
// ============================================================================
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;
        const result = await services_1.default.getCases({ page, limit });
        res.json(result);
    }
    catch (error) {
        console.error('Get cases error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/:caseId/timeline
// ============================================================================
router.get('/:caseId/timeline', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const timeline = await services_1.default.getCaseTimeline(caseId);
        res.json(timeline);
    }
    catch (error) {
        console.error('Get timeline error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/:caseId/documents
// ============================================================================
router.get('/:caseId/documents', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const documents = await services_1.default.getCaseDocuments(caseId);
        res.json(documents);
    }
    catch (error) {
        console.error('Get case documents error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
router.get('/:caseId/workflow', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const workflow = await services_1.default.getWorkflow(caseId);
        if (!workflow) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
            return;
        }
        res.json(workflow);
    }
    catch (error) {
        console.error('Get workflow error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/:caseId/workflow-graph (NEW)
// ============================================================================
router.get('/:caseId/workflow-graph', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const workflowGraph = await workflow_1.workflowService.getWorkflowGraph(caseId);
        if (!workflowGraph) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
            return;
        }
        res.json(workflowGraph);
    }
    catch (error) {
        console.error('Get workflow graph error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/:caseId/workflow-history
// ============================================================================
router.get('/:caseId/workflow-history', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const history = await workflow_1.workflowService.getWorkflowHistory(caseId);
        res.json(history);
    }
    catch (error) {
        console.error('Get workflow history error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/:caseId/summary
// ============================================================================
router.get('/:caseId/summary', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const summary = await services_1.default.getCaseSummary(caseId);
        if (!summary) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
            return;
        }
        res.json(summary);
    }
    catch (error) {
        console.error('Get case summary error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/:caseId
// ============================================================================
router.get('/:caseId', auth_1.authenticate, async (req, res) => {
    try {
        const { caseId } = req.params;
        const caseData = await services_1.default.getCaseById(caseId);
        if (!caseData) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Case not found' });
            return;
        }
        res.json(caseData);
    }
    catch (error) {
        console.error('Get case error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// POST /cases
// ============================================================================
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { clientName, matterType, description } = req.body;
        if (!clientName) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: clientName' });
            return;
        }
        const result = await services_1.default.createCase({
            clientName,
            matterType: matterType || 'OTHER',
            description,
            createdById: userId
        });
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Create case error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// PATCH /cases/:caseId/status (NOW USES WORKFLOW ENGINE)
// ============================================================================
router.patch('/:caseId/status', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { caseId } = req.params;
        const { status, comment } = req.body;
        if (!status) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: status' });
            return;
        }
        // Validate status
        if (!workflow_1.workflowService.isValidStatus(status)) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: `Invalid status: ${status}` });
            return;
        }
        // Check if transition is allowed
        const validation = await workflow_1.workflowService.canTransition(caseId, status);
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
        const result = await workflow_1.workflowService.changeStatus({
            caseId,
            fromStatus: validation.currentStatus,
            toStatus: status,
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
    }
    catch (error) {
        console.error('Update case status error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' });
    }
});
// ============================================================================
// POST /cases/:caseId/assign
// ============================================================================
router.post('/:caseId/assign', auth_1.authenticate, async (req, res) => {
    try {
        const assignedById = req.user?.userId;
        const { caseId } = req.params;
        const { userId, role } = req.body;
        if (!userId || !role) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required fields: userId, role' });
            return;
        }
        const result = await services_1.default.assignUser(caseId, userId, role, assignedById);
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Assign user error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /cases/dashboard/stats
// ============================================================================
router.get('/dashboard/stats', auth_1.authenticate, async (req, res) => {
    try {
        const stats = await services_1.default.getDashboardStats();
        res.json(stats);
    }
    catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map