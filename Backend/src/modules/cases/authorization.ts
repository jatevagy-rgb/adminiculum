import { Prisma, PrismaClient } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { isWorkforceRole } from '../../middleware/workforceAuthorization';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

type CaseAccessRecord = {
  id: string;
  assignedLawyerId: string | null;
  createdById: string;
};

type CaseDb = PrismaClient | Prisma.TransactionClient;

/** Database predicate that exactly mirrors non-privileged userCanReadCase scope. */
export function buildCaseReadScope(
  userId: string | null | undefined,
  role: string | null | undefined
): Prisma.CaseWhereInput | null {
  if (!userId || (role && !isWorkforceRole(role))) return { id: { in: [] } };
  if (PRIVILEGED_ROLES.has(String(role || ''))) return null;
  return {
    OR: [
      { assignedLawyerId: userId },
      { createdById: userId },
      { collaborators: { some: { userId } } },
    ],
  };
}

export function getCaseReadScope(req: Request): Prisma.CaseWhereInput | null {
  return buildCaseReadScope(req.user?.userId, req.user?.role);
}

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'CASE_ACCESS_FORBIDDEN',
    message: 'You do not have access to this case.',
  });
}

function sendAuthorizationError(res: Response): void {
  res.status(500).json({
    status: 500,
    code: 'CASE_AUTHORIZATION_ERROR',
    message: 'Case access could not be verified.',
  });
}

function getCaseId(req: Request): string {
  return String(req.params.caseId || '').trim();
}

async function getCaseAccessRecord(
  caseId: string,
  db: CaseDb = prisma,
): Promise<CaseAccessRecord | null> {
  return db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      assignedLawyerId: true,
      createdById: true,
    },
  });
}

function isCaseManagerById(
  userId: string,
  role: string | null | undefined,
  caseRecord: CaseAccessRecord,
): boolean {
  return (
    PRIVILEGED_ROLES.has(String(role || '')) ||
    caseRecord.assignedLawyerId === userId ||
    caseRecord.createdById === userId
  );
}

function isCaseManager(
  req: Request,
  caseRecord: CaseAccessRecord,
): boolean {
  const user = req.user;
  if (!user?.userId) {
    return false;
  }

  return isCaseManagerById(user.userId, user.role, caseRecord);
}

export async function userCanReadCase(req: Request, caseId: string): Promise<boolean | null> {
  const user = req.user;
  if (!user?.userId || !isWorkforceRole(user.role)) {
    return false;
  }

  const caseRecord = await getCaseAccessRecord(caseId);
  if (!caseRecord) {
    return null;
  }

  if (isCaseManager(req, caseRecord)) {
    return true;
  }

  const collaborator = await prisma.caseCollaborator.findFirst({
    where: {
      caseId,
      userId: user.userId,
    },
    select: { id: true },
  });

  return Boolean(collaborator);
}

export async function userCanManageCase(req: Request, caseId: string): Promise<boolean | null> {
  if (!req.user?.userId) {
    return false;
  }

  const caseRecord = await getCaseAccessRecord(caseId);
  if (!caseRecord) {
    return null;
  }

  return isCaseManager(req, caseRecord);
}

/**
 * Canonical CASE_MANAGE predicate by identity rather than Request, for service
 * and transaction callers that already hold a userId + role. Mirrors
 * userCanManageCase exactly: ADMIN/PARTNER, assigned lawyer, or case creator.
 * A CaseCollaborator-only relationship is read-only and never qualifies.
 */
export async function userCanManageCaseById(
  userId: string | null | undefined,
  role: string | null | undefined,
  caseId: string,
  db: CaseDb = prisma,
): Promise<boolean | null> {
  if (!userId) {
    return false;
  }
  const caseRecord = await getCaseAccessRecord(caseId, db);
  if (!caseRecord) {
    return null;
  }
  return isCaseManagerById(String(userId), role, caseRecord);
}

export async function requireCaseReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const caseId = getCaseId(req);
  if (!caseId) {
    res.status(400).json({
      status: 400,
      code: 'CASE_ID_REQUIRED',
      message: 'caseId is required',
    });
    return;
  }

  try {
    const access = await userCanReadCase(req, caseId);
    if (access === null) {
      res.status(404).json({
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Case not found',
      });
      return;
    }
    if (!access) {
      sendForbidden(res);
      return;
    }

    next();
  } catch {
    sendAuthorizationError(res);
  }
}

export async function requireCaseCollaboratorManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const caseId = getCaseId(req);
  if (!caseId) {
    res.status(400).json({
      status: 400,
      code: 'CASE_ID_REQUIRED',
      message: 'caseId is required',
    });
    return;
  }

  try {
    const access = await userCanManageCase(req, caseId);
    if (access === null) {
      res.status(404).json({
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Case not found',
      });
      return;
    }
    if (!access) {
      sendForbidden(res);
      return;
    }

    next();
  } catch {
    sendAuthorizationError(res);
  }
}

export async function requireCaseManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const caseId = getCaseId(req);
  if (!caseId) {
    res.status(400).json({
      status: 400,
      code: 'CASE_ID_REQUIRED',
      message: 'caseId is required',
    });
    return;
  }

  try {
    const access = await userCanManageCase(req, caseId);
    if (access === null) {
      res.status(404).json({
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Case not found',
      });
      return;
    }
    if (!access) {
      sendForbidden(res);
      return;
    }

    next();
  } catch {
    sendAuthorizationError(res);
  }
}
