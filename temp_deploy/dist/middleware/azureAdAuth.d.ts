/**
 * Azure AD Token Validation Middleware
 * Validates Azure AD access tokens from Power Apps Custom Connector
 *
 * This middleware allows the backend to accept Azure AD tokens from Power Apps
 */
import { Request, Response, NextFunction } from 'express';
/**
 * Hybrid authentication middleware
 * Accepts both:
 * 1. Azure AD tokens (from Power Apps)
 * 2. Custom JWT tokens (from /auth/login endpoint)
 */
export declare const hybridAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export default hybridAuth;
//# sourceMappingURL=azureAdAuth.d.ts.map