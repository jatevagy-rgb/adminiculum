/**
 * Debug endpoint for diagnosing JWT token issues
 * DO NOT USE IN PRODUCTION - only for debugging
 */
import { Request, Response } from 'express';
/**
 * GET /api/v1/debug/whoami
 * Debug endpoint - returns JWT claims without verification
 */
export declare const debugWhoami: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=debug.d.ts.map