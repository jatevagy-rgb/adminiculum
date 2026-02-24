"use strict";
/**
 * Users Routes Module V2
 * User management endpoints
 * Matching Frontend Data Contract
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const services_1 = __importDefault(require("./services"));
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// ============================================================================
// GET /users
// ============================================================================
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const result = await services_1.default.getUsers();
        res.json(result);
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /users/:userId
// ============================================================================
router.get('/:userId', auth_1.authenticate, async (req, res) => {
    try {
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const user = await services_1.default.getUserById(userId);
        if (!user) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// POST /users
// ============================================================================
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const { name, email, role, title, phone, hourlyRate } = req.body;
        if (!name || !email || !role) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
            return;
        }
        const result = await services_1.default.createUser({
            name,
            email,
            role,
            title,
            phone,
            hourlyRate
        });
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /users/:userId/skills
// ============================================================================
router.get('/:userId/skills', auth_1.authenticate, async (req, res) => {
    try {
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const skills = await services_1.default.getUserSkills(userId);
        if (!skills) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Skill profile not found' });
            return;
        }
        res.json(skills);
    }
    catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// PATCH /users/:userId/skills
// ============================================================================
router.patch('/:userId/skills', auth_1.authenticate, async (req, res) => {
    try {
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const { skills } = req.body;
        if (!skills) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing skills' });
            return;
        }
        const result = await services_1.default.updateUserSkills(userId, skills);
        res.json(result);
    }
    catch (error) {
        console.error('Update skills error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map