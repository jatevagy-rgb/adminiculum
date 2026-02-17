"use strict";
/**
 * Authentication Middleware
 * JWT verification and role-based access control
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_NAMES = exports.canAssignTask = exports.canAccess = exports.ROLES = exports.requireRole = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
/**
 * Verify JWT token and attach user to request
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwt_1.jwtConfig.secret);
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authenticate = authenticate;
/**
 * Check if user has required role
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
/**
 * Role constants matching Prisma schema
 */
exports.ROLES = {
    LAWYER: 'LAWYER',
    COLLAB_LAWYER: 'COLLAB_LAWYER',
    TRAINEE: 'TRAINEE',
    LEGAL_ASSISTANT: 'LEGAL_ASSISTANT',
    ADMIN: 'ADMIN'
};
/**
 * Role hierarchy for authorization
 */
const ROLE_HIERARCHY = {
    LAWYER: 4,
    COLLAB_LAWYER: 3,
    TRAINEE: 2,
    LEGAL_ASSISTANT: 1,
    ADMIN: 5
};
/**
 * Check if user can access resource based on role hierarchy
 */
const canAccess = (userRole, requiredLevel) => {
    return ROLE_HIERARCHY[userRole] >= requiredLevel;
};
exports.canAccess = canAccess;
/**
 * Role-based task assignment rules
 * LAWYER → TRAINEE, LEGAL_ASSISTANT
 * COLLAB_LAWYER → TRAINEE, LEGAL_ASSISTANT
 * TRAINEE → LEGAL_ASSISTANT
 * LEGAL_ASSISTANT → cannot assign
 */
const canAssignTask = (assignorRole, assigneeRole) => {
    const superiorRoles = [exports.ROLES.LAWYER, exports.ROLES.COLLAB_LAWYER, exports.ROLES.TRAINEE];
    const subordinateRoles = [exports.ROLES.TRAINEE, exports.ROLES.LEGAL_ASSISTANT];
    if (!superiorRoles.includes(assignorRole)) {
        return false;
    }
    if ([exports.ROLES.LAWYER, exports.ROLES.COLLAB_LAWYER].includes(assignorRole)) {
        return subordinateRoles.includes(assigneeRole);
    }
    if (assignorRole === exports.ROLES.TRAINEE) {
        return assigneeRole === exports.ROLES.LEGAL_ASSISTANT;
    }
    return false;
};
exports.canAssignTask = canAssignTask;
/**
 * Get all role names for display
 */
exports.ROLE_NAMES = {
    LAWYER: 'Ügyvéd',
    COLLAB_LAWYER: 'Együttműködő ügyvéd',
    TRAINEE: 'Ügyvédjelölt',
    LEGAL_ASSISTANT: 'Jogi asszisztens',
    ADMIN: 'Adminisztrátor'
};
//# sourceMappingURL=auth.js.map