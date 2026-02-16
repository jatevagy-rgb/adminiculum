/**
 * Authentication Middleware
 * JWT verification and role-based access control
 */
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';
/**
 * Verify JWT token and attach user to request
 */
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, jwtConfig.secret);
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
/**
 * Check if user has required role
 */
export const requireRole = (...allowedRoles) => {
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
/**
 * Role constants matching Prisma schema
 */
export const ROLES = {
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
export const canAccess = (userRole, requiredLevel) => {
    return ROLE_HIERARCHY[userRole] >= requiredLevel;
};
/**
 * Role-based task assignment rules
 * LAWYER → TRAINEE, LEGAL_ASSISTANT
 * COLLAB_LAWYER → TRAINEE, LEGAL_ASSISTANT
 * TRAINEE → LEGAL_ASSISTANT
 * LEGAL_ASSISTANT → cannot assign
 */
export const canAssignTask = (assignorRole, assigneeRole) => {
    const superiorRoles = [ROLES.LAWYER, ROLES.COLLAB_LAWYER, ROLES.TRAINEE];
    const subordinateRoles = [ROLES.TRAINEE, ROLES.LEGAL_ASSISTANT];
    if (!superiorRoles.includes(assignorRole)) {
        return false;
    }
    if ([ROLES.LAWYER, ROLES.COLLAB_LAWYER].includes(assignorRole)) {
        return subordinateRoles.includes(assigneeRole);
    }
    if (assignorRole === ROLES.TRAINEE) {
        return assigneeRole === ROLES.LEGAL_ASSISTANT;
    }
    return false;
};
/**
 * Get all role names for display
 */
export const ROLE_NAMES = {
    LAWYER: 'Ügyvéd',
    COLLAB_LAWYER: 'Együttműködő ügyvéd',
    TRAINEE: 'Ügyvédjelölt',
    LEGAL_ASSISTANT: 'Jogi asszisztens',
    ADMIN: 'Adminisztrátor'
};
//# sourceMappingURL=auth.js.map