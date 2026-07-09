import { NextFunction, Request, Response } from 'express';

const WORKLOAD_MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'WORKLOAD_ACCESS_FORBIDDEN',
    message: 'You do not have access to workload records.',
  });
}

export function requireWorkloadManagerAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  if (!user?.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (!WORKLOAD_MANAGER_ROLES.has(user.role)) {
    sendForbidden(res);
    return;
  }

  next();
}
