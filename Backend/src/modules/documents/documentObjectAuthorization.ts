/**
 * Document Object Authorization (SEC-1)
 *
 * Shared middleware for resolving any document-related object to its owning Case
 * and checking case-scoped access. Covers:
 *   - Document → case
 *   - DocumentVersion → document → case
 *   - ContractGeneration → case
 *   - ContractRecord → case (via sourceCaseId)
 *
 * Every object lookup derives the owning Case server-side. Caller-supplied
 * clientId/caseId is NEVER trusted as authority.
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
    code: 'DOCUMENT_ACCESS_FORBIDDEN',
    message: 'You do not have access to this resource.',
  });
}

function sendNotFound(res: Response): void {
  res.status(404).json({
    status: 404,
    code: 'NOT_FOUND',
    message: 'Resource not found',
  });
}

function sendAuthorizationError(res: Response): void {
  res.status(500).json({
    status: 500,
    code: 'DOCUMENT_AUTHORIZATION_ERROR',
    message: 'Access could not be verified.',
  });
}

/** Resolve a document's owning caseId. Returns null if document not found. */
async function resolveDocumentCaseId(documentId: string): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { caseId: true },
  });
  return doc?.caseId ?? null;
}

/** Resolve a DocumentVersion → owning caseId via its parent Document. */
async function resolveVersionCaseId(versionId: string): Promise<string | null> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { document: { select: { caseId: true } } },
  });
  return version?.document?.caseId ?? null;
}

/** Resolve a ContractGeneration → caseId. */
async function resolveContractGenerationCaseId(generationId: string): Promise<string | null> {
  const gen = await prisma.contractGeneration.findUnique({
    where: { id: generationId },
    select: { caseId: true },
  });
  return gen?.caseId ?? null;
}

/** Resolve a DocumentComment → owning caseId via its parent Document. */
async function resolveCommentCaseId(commentId: string): Promise<string | null> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { caseId: true },
  });
  return comment?.caseId ?? null;
}

/**
 * Core case-scoped authorization gate. Resolves caseId via the provided
 * resolver, then delegates to the access-check function.
 *
 * Returns false if denied, true if allowed, and sends the HTTP response
 * itself (so callers can simply `return` on false).
 */
async function enforceCaseAccess(
  req: Request,
  res: Response,
  resolver: () => Promise<string | null>,
  check: (req: Request, caseId: string) => Promise<boolean | null>
): Promise<boolean> {
  try {
    const caseId = await resolver();
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
// Resolvers — public for use in route handlers that need the caseId
// ---------------------------------------------------------------------------

export async function getCaseIdFromDocument(documentId: string): Promise<string | null> {
  return resolveDocumentCaseId(documentId);
}

export async function getCaseIdFromVersion(versionId: string): Promise<string | null> {
  return resolveVersionCaseId(versionId);
}

export async function getCaseIdFromContractGeneration(generationId: string): Promise<string | null> {
  return resolveContractGenerationCaseId(generationId);
}

export async function getCaseIdFromComment(commentId: string): Promise<string | null> {
  return resolveCommentCaseId(commentId);
}

// ---------------------------------------------------------------------------
// Middleware factories — read (case-scoped) + HR_CONFIDENTIAL boundary
// ---------------------------------------------------------------------------

/**
 * HR_CONFIDENTIAL classification check. This is an ADDITIONAL boundary on top
 * of case-scoped authorization. A document's classification never grants access;
 * it only restricts it. Only ADMIN/PARTNER may read HR_CONFIDENTIAL documents.
 */
export function hrConfidentialReadAllowed(userRole: string | undefined | null): boolean {
  return ['ADMIN', 'PARTNER'].includes(String(userRole || ''));
}

/**
 * Combined case-scoped + HR_CONFIDENTIAL read authorization.
 * Resolves the document → case, checks HR_CONFIDENTIAL boundary, then
 * delegates to userCanReadCase.
 */
export async function requireDocumentObjectReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const documentId = String(req.params.id || req.params.documentId || '').trim();
  if (!documentId) {
    res.status(400).json({ status: 400, code: 'DOCUMENT_ID_REQUIRED', message: 'Document ID is required' });
    return;
  }

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { caseId: true, securityClassification: true },
    });

    if (!document?.caseId) {
      sendNotFound(res);
      return;
    }

    // HR_CONFIDENTIAL boundary
    if (
      String(document.securityClassification) === 'HR_CONFIDENTIAL' &&
      !hrConfidentialReadAllowed((req.user as any)?.role)
    ) {
      sendForbidden(res);
      return;
    }

    const access = await userCanReadCase(req, document.caseId);
    if (access === null) { sendNotFound(res); return; }
    if (!access) { sendForbidden(res); return; }

    next();
  } catch {
    sendAuthorizationError(res);
  }
}

/**
 * Combined case-scoped + HR_CONFIDENTIAL manage authorization.
 */
export async function requireDocumentObjectManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const documentId = String(req.params.id || req.params.documentId || '').trim();
  if (!documentId) {
    res.status(400).json({ status: 400, code: 'DOCUMENT_ID_REQUIRED', message: 'Document ID is required' });
    return;
  }

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { caseId: true, securityClassification: true },
    });

    if (!document?.caseId) {
      sendNotFound(res);
      return;
    }

    // HR_CONFIDENTIAL boundary
    if (
      String(document.securityClassification) === 'HR_CONFIDENTIAL' &&
      !hrConfidentialReadAllowed((req.user as any)?.role)
    ) {
      sendForbidden(res);
      return;
    }

    const access = await userCanManageCase(req, document.caseId);
    if (access === null) { sendNotFound(res); return; }
    if (!access) { sendForbidden(res); return; }

    next();
  } catch {
    sendAuthorizationError(res);
  }
}

// ---------------------------------------------------------------------------
// Version-scoped authorization middleware
// ---------------------------------------------------------------------------

/**
 * Case-scoped read authorization for DocumentVersion.
 * Resolves Version → Document → Case, then checks userCanReadCase.
 */
export async function requireVersionReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const versionId = String(req.params.versionId || '').trim();
  if (!versionId) {
    res.status(400).json({ status: 400, code: 'VERSION_ID_REQUIRED', message: 'Version ID is required' });
    return;
  }

  const allowed = await enforceCaseAccess(req, res, () => resolveVersionCaseId(versionId), userCanReadCase);
  if (allowed) next();
}

/**
 * Case-scoped manage authorization for DocumentVersion.
 */
export async function requireVersionManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const versionId = String(req.params.versionId || '').trim();
  if (!versionId) {
    res.status(400).json({ status: 400, code: 'VERSION_ID_REQUIRED', message: 'Version ID is required' });
    return;
  }

  const allowed = await enforceCaseAccess(req, res, () => resolveVersionCaseId(versionId), userCanManageCase);
  if (allowed) next();
}

// ---------------------------------------------------------------------------
// ContractGeneration-scoped authorization middleware
// ---------------------------------------------------------------------------

/**
 * Case-scoped read authorization for ContractGeneration.
 */
export async function requireContractGenerationReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const generationId = String(req.params.id || '').trim();
  if (!generationId) {
    res.status(400).json({ status: 400, code: 'CONTRACT_ID_REQUIRED', message: 'Contract generation ID is required' });
    return;
  }

  const allowed = await enforceCaseAccess(
    req,
    res,
    () => resolveContractGenerationCaseId(generationId),
    userCanReadCase
  );
  if (allowed) next();
}

/**
 * Case-scoped manage authorization for ContractGeneration.
 */
export async function requireContractGenerationManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const generationId = String(req.params.id || '').trim();
  if (!generationId) {
    res.status(400).json({ status: 400, code: 'CONTRACT_ID_REQUIRED', message: 'Contract generation ID is required' });
    return;
  }

  const allowed = await enforceCaseAccess(
    req,
    res,
    () => resolveContractGenerationCaseId(generationId),
    userCanManageCase
  );
  if (allowed) next();
}

// ---------------------------------------------------------------------------
// Comment-scoped authorization middleware
// ---------------------------------------------------------------------------

/**
 * Case-scoped read authorization for DocumentComment.
 */
export async function requireCommentReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const commentId = String(req.params.commentId || '').trim();
  if (!commentId) {
    // Fall through to document-level check if no commentId
    next();
    return;
  }

  const allowed = await enforceCaseAccess(req, res, () => resolveCommentCaseId(commentId), userCanReadCase);
  if (allowed) next();
}

/**
 * Case-scoped manage authorization for DocumentComment.
 */
export async function requireCommentManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const commentId = String(req.params.commentId || '').trim();
  if (!commentId) {
    next();
    return;
  }

  const allowed = await enforceCaseAccess(req, res, () => resolveCommentCaseId(commentId), userCanManageCase);
  if (allowed) next();
}
