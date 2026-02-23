/**
 * Authentication Middleware
 * JWT verification and role-based access control
 * Supports both custom JWT and Azure AD tokens (hybrid auth for Power Apps)
 */
import { Request, Response, NextFunction } from 'express';
type Role = 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'ADMIN';
interface JwtPayload {
    userId: string;
    email: string;
    role: Role;
}
interface JwtPayload {
    userId: string;
    email: string;
    role: Role;
}
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
/**
 * Verify JWT token and attach user to request
 * Supports both Azure AD tokens (for Power Apps) and custom JWT tokens
 */
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Check if user has required role
 */
export declare const requireRole: (...allowedRoles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * Role constants matching Prisma schema
 */
export declare const ROLES: Record<string, Role>;
/**
 * Check if user can access resource based on role hierarchy
 */
export declare const canAccess: (userRole: Role, requiredLevel: number) => boolean;
/**
 * Role-based task assignment rules
 * LAWYER → TRAINEE, LEGAL_ASSISTANT
 * COLLAB_LAWYER → TRAINEE, LEGAL_ASSISTANT
 * TRAINEE → LEGAL_ASSISTANT
 * LEGAL_ASSISTANT → cannot assign
 */
export declare const canAssignTask: (assignorRole: Role, assigneeRole: Role) => boolean;
/**
 * Get all role names for display
 */
export declare const ROLE_NAMES: Record<Role, string>;
export {};
//# sourceMappingURL=auth.d.ts.map