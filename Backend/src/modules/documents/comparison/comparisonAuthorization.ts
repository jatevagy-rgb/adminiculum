/**
 * Authorization for comparison-scoped routes (STRUCTURED-DOC-COMPARISON-1).
 * Resolves :comparisonId → owning document → owning case, then defers to the
 * shared case read/manage checks. Never reveals existence to unauthorized callers.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../prisma/prisma.service';
import { userCanReadCase, userCanManageCase } from '../../cases/authorization';

async function resolveCaseIdForComparison(comparisonId: string): Promise<string | null> {
  const row = await prisma.documentComparison.findUnique({
    where: { id: comparisonId },
    select: { document: { select: { caseId: true } } },
  });
  return row?.document?.caseId ?? null;
}

function guard(check: (req: Request, caseId: string) => Promise<boolean | null>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const comparisonId = String(req.params.comparisonId || '').trim();
    if (!comparisonId) { res.status(400).json({ status: 400, code: 'COMPARISON_ID_REQUIRED', message: 'comparisonId is required' }); return; }
    try {
      const caseId = await resolveCaseIdForComparison(comparisonId);
      if (!caseId) { res.status(404).json({ status: 404, code: 'COMPARISON_NOT_FOUND', message: 'Comparison not found' }); return; }
      const access = await check(req, caseId);
      if (access === null) { res.status(404).json({ status: 404, code: 'COMPARISON_NOT_FOUND', message: 'Comparison not found' }); return; }
      if (!access) { res.status(403).json({ status: 403, code: 'FORBIDDEN', message: 'You do not have access to this comparison.' }); return; }
      next();
    } catch {
      res.status(500).json({ status: 500, code: 'AUTHORIZATION_ERROR', message: 'Authorization check failed.' });
    }
  };
}

export const requireComparisonReadAccess = guard(userCanReadCase);
export const requireComparisonManageAccess = guard(userCanManageCase);
