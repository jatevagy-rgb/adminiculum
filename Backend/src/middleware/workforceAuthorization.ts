import { NextFunction, Request, Response } from 'express';
import { ROLES } from './auth';

// The fallback keeps isolated route tests that mock authenticate without ROLES
// aligned with the canonical runtime enum.
const canonicalRoles = ROLES || {
  ADMIN: 'ADMIN',
  PARTNER: 'PARTNER',
  LAWYER: 'LAWYER',
  COLLAB_LAWYER: 'COLLAB_LAWYER',
  TRAINEE: 'TRAINEE',
  LEGAL_ASSISTANT: 'LEGAL_ASSISTANT',
};

const WORKFORCE_ROLES = new Set<string>([
  canonicalRoles.ADMIN,
  canonicalRoles.PARTNER,
  canonicalRoles.LAWYER,
  canonicalRoles.COLLAB_LAWYER,
  canonicalRoles.TRAINEE,
  canonicalRoles.LEGAL_ASSISTANT,
]);

/** Shared canonical role boundary for workforce-only operations. */
/** Canonical workforce-role classification for route and service boundaries. */
export function isWorkforceRole(role: unknown): boolean {
  return WORKFORCE_ROLES.has(String(role || ''));
}

/** Reject client identities before internal object authorization is evaluated. */
export function requireWorkforceUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.userId || !isWorkforceRole(req.user.role)) {
    res.status(403).json({
      status: 403,
      code: 'WORKFORCE_ACCESS_REQUIRED',
      message: 'Internal workforce access is required.',
    });
    return;
  }
  next();
}
