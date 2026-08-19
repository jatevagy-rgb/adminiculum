import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanReadCase, userCanManageCase } from '../cases/authorization';

// Document-scoped authorization for privacy-sensitive document routes (notably any
// route that can read or persist `documents.workspaceText`, which may hold raw legal
// document text). A document always belongs to a case (Document.caseId is required),
// so access is authorized against the owning case using the established case
// authorization rules (assigned lawyer / creator / privileged role / collaborator).
//
// These middleware run AFTER `authenticate` (and after the Document/AI feature gate),
// so authentication and feature gating already applied. They never place raw
// document text into responses, logs, or errors.

function getDocumentId(req: Request): string {
  return String(req.params.id || '').trim();
}

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'DOCUMENT_ACCESS_FORBIDDEN',
    message: 'You do not have access to this document.',
  });
}

function sendAuthorizationError(res: Response): void {
  res.status(500).json({
    status: 500,
    code: 'DOCUMENT_AUTHORIZATION_ERROR',
    message: 'Document access could not be verified.',
  });
}

/** Phase 3 HR-confidential gate. A conservative narrow role gate: only client
 *  managers (ADMIN/PARTNER) may read HR_CONFIDENTIAL documents. The canonical
 *  document authorization remains case-scoped; classification is an ADDITIONAL
 *  boundary and never grants access. A future per-user HR permission would
 *  extend this helper without a parallel ACL. */
export function hrConfidentialReadAllowed(userRole: string | undefined | null): boolean {
  return ['ADMIN', 'PARTNER'].includes(String(userRole || ''));
}

async function resolveDocumentAccess(documentId: string): Promise<{ caseId: string | null; securityClassification: string | null }> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { caseId: true, securityClassification: true },
  });
  if (!document) {
    return { caseId: null, securityClassification: null };
  }
  return { caseId: document.caseId, securityClassification: String(document.securityClassification || 'STANDARD') };
}

async function requireDocumentAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  check: (req: Request, caseId: string) => Promise<boolean | null>
): Promise<void> {
  const documentId = getDocumentId(req);
  if (!documentId) {
    res.status(400).json({
      status: 400,
      code: 'DOCUMENT_ID_REQUIRED',
      message: 'documentId is required',
    });
    return;
  }

  try {
    const { caseId, securityClassification } = await resolveDocumentAccess(documentId);
    if (!caseId) {
      // Document missing, or (defensively) has no owning case: not found — do not
      // reveal existence, and never proceed to a raw-text service path.
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found',
      });
      return;
    }

    // Phase 3 HR-confidential: classification is an additional boundary on top
    // of the case-scoped check. Organization chart visibility must not imply HR
    // document access.
    if (securityClassification === 'HR_CONFIDENTIAL' && !hrConfidentialReadAllowed((req.user as any)?.role)) {
      sendForbidden(res);
      return;
    }

    const access = await check(req, caseId);
    if (access === null) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found',
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

// Read access to a document requires access to the owning case.
export async function requireDocumentReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireDocumentAccess(req, res, next, userCanReadCase);
}

// Write/persist access to a document (e.g. saving raw workspace text) requires
// manage access to the owning case.
export async function requireDocumentManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireDocumentAccess(req, res, next, userCanManageCase);
}
