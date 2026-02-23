"use strict";
/**
 * Workgroup Routes
 * Client workload tracking API endpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const services_1 = require("./services");
const router = (0, express_1.Router)();
// ============================================================================
// Workgroup CRUD Endpoints
// ============================================================================
// POST /clients/:clientId/workgroups - Create new workgroup
router.post('/clients/:clientId/workgroups', auth_1.authenticate, async (req, res) => {
    try {
        const { clientId } = req.params;
        const { name, description } = req.body;
        if (!name) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required field: name' });
            return;
        }
        const workgroup = await services_1.workgroupService.createWorkgroup(clientId, { name, description });
        res.status(201).json(workgroup);
    }
    catch (error) {
        console.error('Create workgroup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        if (message === 'Client not found') {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
        }
        else {
            res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
        }
    }
});
// GET /clients/:clientId/workgroups - List client workgroups
router.get('/clients/:clientId/workgroups', auth_1.authenticate, async (req, res) => {
    try {
        const { clientId } = req.params;
        const workgroups = await services_1.workgroupService.getWorkgroupsByClient(clientId);
        res.json(workgroups);
    }
    catch (error) {
        console.error('Get workgroups error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// GET /workgroups/:id - Get single workgroup
router.get('/workgroups/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const workgroup = await services_1.workgroupService.getWorkgroupById(id);
        if (!workgroup) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Workgroup not found' });
            return;
        }
        res.json(workgroup);
    }
    catch (error) {
        console.error('Get workgroup error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// PATCH /workgroups/:id - Update workgroup
router.patch('/workgroups/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;
        const workgroup = await services_1.workgroupService.updateWorkgroup(id, { name, description, isActive });
        res.json(workgroup);
    }
    catch (error) {
        console.error('Update workgroup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        if (message === 'Workgroup not found') {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
        }
        else {
            res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
        }
    }
});
// DELETE /workgroups/:id - Soft delete workgroup
router.delete('/workgroups/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await services_1.workgroupService.deleteWorkgroup(id);
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete workgroup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        if (message === 'Workgroup not found') {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
        }
        else {
            res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
        }
    }
});
// ============================================================================
// Workload Recording Endpoints
// ============================================================================
// POST /workgroups/:id/workload - Record workload
router.post('/workgroups/:id/workload', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { period, reportedHours, note } = req.body;
        if (!period || reportedHours === undefined) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Missing required fields: period, reportedHours'
            });
            return;
        }
        // Validate period format
        if (!(0, services_1.isValidPeriodFormat)(period)) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Invalid period format. Expected YYYY-MM'
            });
            return;
        }
        const record = await services_1.workloadService.recordWorkload(id, { period, reportedHours, note });
        res.status(201).json(record);
    }
    catch (error) {
        console.error('Record workload error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        if (message === 'Workgroup not found') {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
        }
        else if (message.includes('Invalid period format')) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
        }
        else {
            res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
        }
    }
});
// GET /workgroups/:id/workload - Get workload records for workgroup
router.get('/workgroups/:id/workload', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const records = await services_1.workloadService.getWorkloadByWorkgroup(id);
        res.json(records);
    }
    catch (error) {
        console.error('Get workload error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// Workload Summary Endpoints
// ============================================================================
// GET /clients/:clientId/workload-summary - Get workload summary for client
router.get('/clients/:clientId/workload-summary', auth_1.authenticate, async (req, res) => {
    try {
        const { clientId } = req.params;
        const { period } = req.query;
        if (!period) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Missing required query parameter: period'
            });
            return;
        }
        // Validate period format
        if (!(0, services_1.isValidPeriodFormat)(period)) {
            res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Invalid period format. Expected YYYY-MM'
            });
            return;
        }
        const summary = await services_1.workloadService.getClientWorkloadSummary(clientId, period);
        res.json(summary);
    }
    catch (error) {
        console.error('Get workload summary error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        if (message === 'Client not found') {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message });
        }
        else if (message.includes('Invalid period format')) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message });
        }
        else {
            res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message });
        }
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map