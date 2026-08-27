/**
 * Contract Object Authorization (SEC-1)
 *
 * Case-scoped authorization for contract generation routes.
 * Every contract operation derives the owning Case server-side via
 * ContractGeneration.caseId. Templates are global; template mutations
 * require ADMIN role.
 *
 * Caller-supplied caseId is NEVER trusted as authority.
 */

import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanReadCase, userCanManageCase } from '../cases/authorization';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'CONTRACT_ACCESS_FORBIDDEN',
    message: 'You do not have access to this contract.',
  });
}

function sendNotFound(res: Response): void {
  res.status(404).json({
    status: 404,
    code: 'NOT_FOUND',
    message: 'Contract not found',
  });
}

function sendAuthorizationError(res: Response): void {
  res.status(500).json({
    status: 500,
    code: 'CONTRACT_AUTHORIZATION_ERROR',
    message: 'Contract access could not be verified.',
  });
}

/** Resolve a ContractGeneration's caseId. Returns null if not found or no case. */
async function resolveContractCaseId(generationId: string): Promise<string | null> {
  const gen = await prisma.contractGeneration.findUnique({
    where: { id: generationId },
    select: { caseId: true },
  });
  return gen?.caseId ?? null;
}

/**
 * Core case-scoped authorization gate for contract generations.
 * Sends HTTP response on denial; returns false if denied, true if allowed.
 */
async function enforceContractCaseAccess(
  req: Request,
  res: Response,
  check: (req: Request, caseId: string) => Promise<boolean | null>,
  paramName = 'id'
): Promise<boolean> {
  const generationId = String(
    req.params[paramName] || (paramName === 'id' ? req.params.generationId : '') || ''
  ).trim();
  if (!generationId) {
    res.status(400).json({
      status: 400,
      code: 'CONTRACT_ID_REQUIRED',
      message: 'Contract generation ID is required',
    });
    return false;
  }

  try {
    const caseId = await resolveContractCaseId(generationId);
    if (!caseId) {
      sendNotFound(res);
      return false;
    }

    const access = await check(req, caseId);
    if (access === null) {
      sendNotFound(res);
      return false;
    }
    if (!access) {
      sendForbidden(res);
      return false;
    }

    return true;
  } catch {
    sendAuthorizationError(res);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Middleware: contract generation read access
// ---------------------------------------------------------------------------

/**
 * Case-scoped read authorization for ContractGeneration.
 * Resolves ContractGeneration → caseId → userCanReadCase.
 */
export async function requireContractReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const allowed = await enforceContractCaseAccess(req, res, userCanReadCase, 'id');
  if (allowed) next();
}

export async function requireContractGenerationReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const allowed = await enforceContractCaseAccess(req, res, userCanReadCase, 'generationId');
  if (allowed) next();
}

/**
 * Case-scoped read authorization for ContractGeneration supplied via req.body.documentId.
 * Resolves ContractGeneration → caseId → userCanReadCase.
 * Used for POST /clause-library/review-guidance.
 */
export async function requireContractGenerationReadAccessFromBody(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const generationId = String(req.body?.documentId || '').trim();
  if (!generationId) {
    res.status(400).json({
      status: 400,
      code: 'CONTRACT_ID_REQUIRED',
      message: 'Contract generation ID is required',
    });
    return;
  }

  try {
    const caseId = await resolveContractCaseId(generationId);
    if (!caseId) {
      sendNotFound(res);
      return;
    }

    const access = await userCanReadCase(req, caseId);
    if (access === null) {
      sendNotFound(res);
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

// ---------------------------------------------------------------------------
// Middleware: contract generation manage access
// ---------------------------------------------------------------------------

/**
 * Case-scoped manage authorization for ContractGeneration.
 * Resolves ContractGeneration → caseId → userCanManageCase.
 */
export async function requireContractManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const allowed = await enforceContractCaseAccess(req, res, userCanManageCase, 'id');
  if (allowed) next();
}

export async function requireContractGenerationManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const allowed = await enforceContractCaseAccess(req, res, userCanManageCase, 'generationId');
  if (allowed) next();
}

// ---------------------------------------------------------------------------
// Middleware: admin-only (template mutations, cleanup)
// ---------------------------------------------------------------------------

/**
 * Requires ADMIN role. Used for template uploads and cleanup operations.
 */
export async function requireAdminRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const role = (req.user as any)?.role;
  if (role !== 'ADMIN') {
    res.status(403).json({
      status: 403,
      code: 'ADMIN_REQUIRED',
      message: 'Administrator access is required.',
    });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Case-scoped authorization for body-supplied caseId (generate, bundle-download)
// ---------------------------------------------------------------------------

/**
 * Case-scoped manage access using caseId from request body or params.
 * Used for POST /generate (body.caseId) and GET /case/:caseId/bundle-download.
 */
export async function requireCaseManageAccessFromBody(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const caseId = String(req.body?.caseId || req.params.caseId || '').trim();
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
      sendNotFound(res);
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

/**
 * Case-scoped read access using caseId from params.
 * Used for GET /case/:caseId and GET /case/:caseId/bundle-download.
 */
export async function requireCaseReadAccessFromParams(
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
    const access = await userCanReadCase(req, caseId);
    if (access === null) {
      sendNotFound(res);
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
