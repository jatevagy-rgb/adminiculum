/**
 * Version-scoped read authorization for the Phase 2 reader routes.
 *
 * This mirrors the annotation route's version access check exactly — resolve the
 * immutable version to its owning document/case, enforce the HR_CONFIDENTIAL
 * boundary, then apply case-scoped read access — WITHOUT altering the existing
 * annotation route. It is a narrow addition, not a shared rewrite, so the
 * established annotation behaviour cannot regress.
 */

import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { userCanReadCase } from '../cases/authorization';
import { hrConfidentialReadAllowed } from './documentObjectAuthorization';

export type CaseAccessCheck = (req: Request, caseId: string) => Promise<boolean | null>;

function sendForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'DOCUMENT_ACCESS_FORBIDDEN',
    message: 'You do not have access to this document.',
  });
}

async function requireVersionAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  check: CaseAccessCheck
): Promise<void> {
  const documentId = String(req.params.documentId || '').trim();
  const versionId = String(req.params.versionId || '').trim();
  if (!documentId || !versionId) {
    res.status(400).json({
      status: 400,
      code: 'DOCUMENT_VERSION_ID_REQUIRED',
      message: 'documentId and versionId are required.',
    });
    return;
  }

  try {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      select: { document: { select: { caseId: true, securityClassification: true } } },
    });
    if (!version) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_VERSION_NOT_FOUND',
        message: 'Document version not found.',
      });
      return;
    }

    if (
      String(version.document.securityClassification) === 'HR_CONFIDENTIAL' &&
      !hrConfidentialReadAllowed(req.user?.role)
    ) {
      sendForbidden(res);
      return;
    }

    const access = await check(req, version.document.caseId);
    if (access === null) {
      res.status(404).json({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found.',
      });
      return;
    }
    if (!access) {
      sendForbidden(res);
      return;
    }

    next();
  } catch (error) {
    console.error('Document version authorization error:', error);
    res.status(500).json({
      status: 500,
      code: 'DOCUMENT_AUTHORIZATION_ERROR',
      message: 'Document access could not be verified.',
    });
  }
}

export function requireVersionReadAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  return requireVersionAccess(req, res, next, userCanReadCase);
}
