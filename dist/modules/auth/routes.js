"use strict";
/**
 * Auth Routes Module V2
 * Modular route structure for authentication
 * Matching Frontend Data Contract
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const services_1 = __importDefault(require("./services"));
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
/**
 * Validation middleware
 */
const handleValidation = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            status: 400,
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors.array()
        });
        return;
    }
    next();
};
// ============================================================================
// POST /auth/login
// ============================================================================
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 6 }),
    handleValidation
], async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await services_1.default.login(email, password);
        res.status(result.status).json(result.data);
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
// ============================================================================
// POST /auth/logout
// ============================================================================
router.post('/logout', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        await services_1.default.logout(userId);
        res.json({ message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
// ============================================================================
// GET /auth/me
// ============================================================================
router.get('/me', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const result = await services_1.default.getMe(userId);
        res.status(result.status).json(result.data);
    }
    catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
// ============================================================================
// POST /auth/refresh
// ============================================================================
router.post('/refresh', [(0, express_validator_1.body)('refreshToken').notEmpty(), handleValidation], async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const result = await services_1.default.refresh(refreshToken);
        res.status(result.status).json(result.data);
    }
    catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map