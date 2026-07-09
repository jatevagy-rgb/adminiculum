import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

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

async function getCaseAccessRecord(caseId: string): Promise<{
  id: string;
  assignedLawyerId: string | null;
  createdById: string;
} | null> {
  return prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      assignedLawyerId: true,
      createdById: true,
    },
  });
}

function isCaseManager(
  req: Request,
  caseRecord: { assignedLawyerId: string | null; createdById: string }
): boolean {
  const user = req.user;
  if (!user?.userId) {
    return false;
  }

  return (
    PRIVILEGED_ROLES.has(user.role) ||
    caseRecord.assignedLawyerId === user.userId ||
    caseRecord.createdById === user.userId
  );
}

export async function userCanReadCase(req: Request, caseId: string): Promise<boolean | null> {
  const user = req.user;
  if (!user?.userId) {
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
