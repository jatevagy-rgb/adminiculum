// ============================================================================
// CASE AUTHORIZATION — Anonymization + LegalAnalysis object-level guards
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanReadCase, userCanManageCase } from '../cases/authorization';

// ---------------------------------------------------------------------------
// PRIVILEGED ROLES — Sensitive DTO access
// ---------------------------------------------------------------------------

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

// ---------------------------------------------------------------------------
// Case resolution helpers — resolve caseId from various entity types
// ---------------------------------------------------------------------------

/**
 * Resolve caseId from a Document or ContractGeneration record.
 * Returns null if entity not found or has no caseId.
 */
export async function resolveCaseFromDocumentId(
  documentId: string,
): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { caseId: true },
  });
  if (doc?.caseId) return doc.caseId;

  const gen = await prisma.contractGeneration.findUnique({
    where: { id: documentId },
    select: { caseId: true },
  });
  if (gen?.caseId) return gen.caseId;

  return null;
}

/**
 * Resolve caseId from an AnonymousDocument record.
 */
export async function resolveCaseFromAnonymousDocumentId(
  anonymousDocId: string,
): Promise<string | null> {
  const doc = await prisma.anonymousDocument.findUnique({
    where: { id: anonymousDocId },
    select: { caseId: true },
  });
  return doc?.caseId ?? null;
}

/**
 * Resolve caseId from a LegalAnalysis record.
 */
export async function resolveCaseFromLegalAnalysisId(
  legalAnalysisId: string,
): Promise<string | null> {
  const record = await prisma.legalAnalysis.findUnique({
    where: { id: legalAnalysisId },
    select: { caseId: true },
  });
  return record?.caseId ?? null;
}

/**
 * Resolve first caseId associated with a Client (any case owned by that client).
 * Returns null if client has no cases.
 */
export async function resolveCaseFromClientId(
  clientId: string,
): Promise<string | null> {
  const caseRecord = await prisma.case.findFirst({
    where: { clientId },
    select: { id: true },
  });
  return caseRecord?.id ?? null;
}

/**
 * Resolve caseId from a Document's source document (for anonymous-documents/by-source).
 */
export async function resolveCaseFromSourceDocumentId(
  sourceDocumentId: string,
): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id: sourceDocumentId },
    select: { caseId: true },
  });
  return doc?.caseId ?? null;
}

// ---------------------------------------------------------------------------
// Authorization check helpers
// ---------------------------------------------------------------------------

export type AccessLevel = 'read' | 'manage';

/**
 * Check if authenticated user has the required access level on a case.
 * Returns true if access granted, false if denied, null if case not found.
 */
export async function checkCaseAccess(
  req: Request,
  caseId: string,
  level: AccessLevel,
): Promise<boolean | null> {
  if (level === 'read') {
    return userCanReadCase(req, caseId);
  }
  return userCanManageCase(req, caseId);
}

/**
 * Check if the authenticated user has SENSITIVE-level access to a case.
 * Sensitive access = ADMIN/PARTNER role OR responsible lawyer OR collaborator on the case.
 * This is stricter than read access — portal users are excluded.
 */
export function hasSensitiveAccess(
  req: Request,
  caseRecord: {
    assignedLawyerId: string | null;
    createdById: string;
  },
): boolean {
  const user = (req as any).user;
  if (!user?.userId) return false;

  if (PRIVILEGED_ROLES.has(user.role)) return true;
  if (caseRecord.assignedLawyerId === user.userId) return true;
  if (caseRecord.createdById === user.userId) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Express middleware factories
// ---------------------------------------------------------------------------

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'CASE_ACCESS_FORBIDDEN',
    message: 'You do not have access to this case.',
  });
}

function sendNotFound(res: Response): void {
  res.status(404).json({
    status: 404,
    code: 'CASE_NOT_FOUND',
    message: 'Case not found',
  });
}

function sendAuthorizationError(res: Response): void {
  res.status(500).json({
    status: 500,
    code: 'CASE_AUTHORIZATION_ERROR',
    message: 'Case access could not be verified.',
  });
}

/**
 * Middleware: require read access on a case resolved from a param.
 * Usage: requireAnonymizeReadAccess('documentId', resolveCaseFromDocumentId)
 */
export function requireAnonymizeReadAccess(
  paramName: string,
  resolver: (id: string) => Promise<string | null>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params[paramName] || '').trim();
      if (!id) {
        res.status(400).json({
          status: 400,
          code: 'INVALID_PARAM',
          message: `${paramName} is required`,
        });
        return;
      }

      const caseId = await resolver(id);
      if (!caseId) {
        sendNotFound(res);
        return;
      }

      const access = await checkCaseAccess(req, caseId, 'read');
      if (access === null) {
        sendNotFound(res);
        return;
      }
      if (!access) {
        sendForbidden(res);
        return;
      }

      // Attach resolved caseId for downstream use
      (req as any).__resolvedCaseId = caseId;
      next();
    } catch {
      sendAuthorizationError(res);
    }
  };
}

/**
 * Middleware: require manage access on a case resolved from a param.
 */
export function requireAnonymizeManageAccess(
  paramName: string,
  resolver: (id: string) => Promise<string | null>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params[paramName] || '').trim();
      if (!id) {
        res.status(400).json({
          status: 400,
          code: 'INVALID_PARAM',
          message: `${paramName} is required`,
        });
        return;
      }

      const caseId = await resolver(id);
      if (!caseId) {
        sendNotFound(res);
        return;
      }

      const access = await checkCaseAccess(req, caseId, 'manage');
      if (access === null) {
        sendNotFound(res);
        return;
      }
      if (!access) {
        sendForbidden(res);
        return;
      }

      (req as any).__resolvedCaseId = caseId;
      next();
    } catch {
      sendAuthorizationError(res);
    }
  };
}

/**
 * Middleware: require read access on a case from query param (caseId).
 * Used for list endpoints like GET /anonymous-documents?caseId=xxx
 */
export function requireCaseReadAccessFromQuery() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseId = String(req.query.caseId || '').trim();
      if (!caseId) {
        res.status(400).json({
          status: 400,
          code: 'CASE_ID_REQUIRED',
          message: 'caseId query parameter is required',
        });
        return;
      }

      const access = await checkCaseAccess(req, caseId, 'read');
      if (access === null) {
        sendNotFound(res);
        return;
      }
      if (!access) {
        sendForbidden(res);
        return;
      }

      (req as any).__resolvedCaseId = caseId;
      next();
    } catch {
      sendAuthorizationError(res);
    }
  };
}

/**
 * Middleware: require manage access on a case from query param (caseId).
 */
export function requireCaseManageAccessFromQuery() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseId = String(req.query.caseId || '').trim();
      if (!caseId) {
        res.status(400).json({
          status: 400,
          code: 'CASE_ID_REQUIRED',
          message: 'caseId query parameter is required',
        });
        return;
      }

      const access = await checkCaseAccess(req, caseId, 'manage');
      if (access === null) {
        sendNotFound(res);
        return;
      }
      if (!access) {
        sendForbidden(res);
        return;
      }

      (req as any).__resolvedCaseId = caseId;
      next();
    } catch {
      sendAuthorizationError(res);
    }
  };
}

/**
 * Middleware: require read access on a case resolved from body caseId.
 * Used for POST endpoints where caseId is in request body.
 */
export function requireCaseReadAccessFromBody() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseId = String(req.body?.caseId || '').trim();
      if (!caseId) {
        res.status(400).json({
          status: 400,
          code: 'CASE_ID_REQUIRED',
          message: 'caseId is required in request body',
        });
        return;
      }

      const access = await checkCaseAccess(req, caseId, 'read');
      if (access === null) {
        sendNotFound(res);
        return;
      }
      if (!access) {
        sendForbidden(res);
        return;
      }

      (req as any).__resolvedCaseId = caseId;
      next();
    } catch {
      sendAuthorizationError(res);
    }
  };
}

/**
 * Middleware: require manage access on a case resolved from body caseId.
 */
export function requireCaseManageAccessFromBody() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseId = String(req.body?.caseId || '').trim();
      if (!caseId) {
        res.status(400).json({
          status: 400,
          code: 'CASE_ID_REQUIRED',
          message: 'caseId is required in request body',
        });
        return;
      }

      const access = await checkCaseAccess(req, caseId, 'manage');
      if (access === null) {
        sendNotFound(res);
        return;
      }
      if (!access) {
        sendForbidden(res);
        return;
      }

      (req as any).__resolvedCaseId = caseId;
      next();
    } catch {
      sendAuthorizationError(res);
    }
  };
}
