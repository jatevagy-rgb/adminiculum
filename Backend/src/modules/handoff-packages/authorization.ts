import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const REVIEWER_ROLES = new Set(['LAWYER', 'COLLAB_LAWYER']);

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'HANDOFF_ACCESS_FORBIDDEN',
    message: 'You do not have access to handoff packages for this case.',
  });
}

function sendAuthorizationError(res: Response): void {
  res.status(500).json({
    status: 500,
    code: 'HANDOFF_AUTHORIZATION_ERROR',
    message: 'Handoff package access could not be verified.',
  });
}

async function userCanAccessCase(req: Request, caseId: string): Promise<boolean | null> {
  const user = req.user;
  if (!user?.userId) {
    return false;
  }

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      assignedLawyerId: true,
    },
  });

  if (!caseRecord) {
    return null;
  }

  if (PRIVILEGED_ROLES.has(user.role) || caseRecord.assignedLawyerId === user.userId) {
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

export async function requireHandoffCaseAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const caseId = String(req.params.caseId || '').trim();
  if (!caseId) {
    res.status(400).json({
      status: 400,
      code: 'CASE_ID_REQUIRED',
      message: 'caseId is required',
    });
    return;
  }

  try {
    const access = await userCanAccessCase(req, caseId);
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

export async function requireHandoffPackageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({
      status: 400,
      code: 'HANDOFF_PACKAGE_ID_REQUIRED',
      message: 'Handoff package ID is required',
    });
    return;
  }

  try {
    const packageRecord = await prisma.lawyerHandoffPackage.findUnique({
      where: { id },
      select: { caseId: true, preparedById: true },
    });

    if (!packageRecord) {
      res.status(404).json({
        status: 404,
        code: 'HANDOFF_PACKAGE_NOT_FOUND',
        message: 'Handoff package not found',
      });
      return;
    }

    const access = await userCanAccessCase(req, packageRecord.caseId);
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

    res.locals.handoffPackage = packageRecord;
    next();
  } catch {
    sendAuthorizationError(res);
  }
}

export async function requireHandoffReviewAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  const packageRecord = res.locals.handoffPackage as { caseId: string; preparedById?: string | null } | undefined;
  if (!user?.userId || !packageRecord) {
    sendAuthorizationError(res);
    return;
  }

  if (packageRecord.preparedById === user.userId) {
    res.status(403).json({
      status: 403,
      code: 'HANDOFF_SELF_REVIEW_FORBIDDEN',
      message: 'The preparer cannot review their own handoff.',
    });
    return;
  }

  if (PRIVILEGED_ROLES.has(user.role)) {
    next();
    return;
  }

  try {
    const caseRecord = await prisma.case.findUnique({
      where: { id: packageRecord.caseId },
      select: { assignedLawyerId: true },
    });
    if (caseRecord?.assignedLawyerId === user.userId && REVIEWER_ROLES.has(user.role)) {
      next();
      return;
    }

    res.status(403).json({
      status: 403,
      code: 'HANDOFF_REVIEW_FORBIDDEN',
      message: 'You are not authorized to review this handoff.',
    });
  } catch {
    sendAuthorizationError(res);
  }
}

export function requireHandoffWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  const packageRecord = res.locals.handoffPackage as { preparedById?: string | null } | undefined;
  if (!user?.userId || !packageRecord) {
    sendAuthorizationError(res);
    return;
  }

  if (PRIVILEGED_ROLES.has(user.role) || packageRecord.preparedById === user.userId) {
    next();
    return;
  }

  res.status(403).json({
    status: 403,
    code: 'HANDOFF_WRITE_FORBIDDEN',
    message: 'Only the preparer or an administrator can modify this handoff.',
  });
}
