/**
 * Handoff Packages Routes — v1A
 * Authenticated CRUD + review workflow for lawyer handoff packages.
 * Mount: /api/v1/cases/:caseId/handoff-packages, /api/v1/handoff-packages/:id
 */

import { NextFunction, Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import handoffPackagesService, {
  HandoffPackageServiceError,
} from './service';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';
import {
  requireHandoffCaseAccess,
  requireHandoffPackageAccess,
} from './authorization';

const router = Router();
const isHandoffFoundationEnabled = () =>
  isDatabaseFoundationEnabled('ENABLE_HANDOFF_PACKAGES');
const requireHandoffFoundation = requireDatabaseFoundation({
  feature: 'LAWYER_HANDOFF_PACKAGES',
  enabled: isHandoffFoundationEnabled,
  message: 'Lawyer handoff package persistence is not available in this environment.',
  nextStep: 'Complete the handoff package database reconciliation before enabling writes.',
});

function getUserId(req: Request): string | undefined {
  return (req as any).user?.userId;
}

function gateHandoffListRead(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isHandoffFoundationEnabled()) {
    res.json([]);
    return;
  }
  next();
}

function sendServiceError(res: Response, error: unknown): void {
  if (error instanceof HandoffPackageServiceError) {
    res.status(error.statusCode).json({
      status: error.statusCode,
      code: error.code,
      message: error.message,
    });
    return;
  }
  res.status(500).json({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}

// GET /api/v1/cases/:caseId/handoff-packages
router.get('/cases/:caseId/handoff-packages', authenticate, gateHandoffListRead, requireHandoffCaseAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const packages = await handoffPackagesService.listHandoffPackages(caseId);
    res.json(packages);
  } catch (error) {
    console.error('listHandoffPackages error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// POST /api/v1/cases/:caseId/handoff-packages
router.post('/cases/:caseId/handoff-packages', authenticate, requireHandoffFoundation, requireHandoffCaseAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const {
      sourceDocumentId,
      anonymizedDocumentId,
      generatedContractId,
      legalAnalysisId,
      reviewNotesId,
      preparerSummary,
      packageType,
    } = req.body || {};

    if (!caseId) {
      res.status(400).json({ status: 400, code: 'CASE_ID_REQUIRED', message: 'caseId is required' });
      return;
    }

    const pkg = await handoffPackagesService.createHandoffPackage({
      caseId,
      sourceDocumentId,
      anonymizedDocumentId,
      generatedContractId,
      legalAnalysisId,
      reviewNotesId,
      preparerSummary,
      packageType,
      userId: getUserId(req),
    });

    res.status(201).json(pkg);
  } catch (error) {
    console.error('createHandoffPackage error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// GET /api/v1/handoff-packages/:id
router.get('/handoff-packages/:id', authenticate, requireHandoffFoundation, requireHandoffPackageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const pkg = await handoffPackagesService.getHandoffPackage(id);

    if (!pkg) {
      res.status(404).json({ status: 404, code: 'HANDOFF_PACKAGE_NOT_FOUND', message: 'Handoff package not found' });
      return;
    }

    res.json(pkg);
  } catch (error) {
    console.error('getHandoffPackage error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// PATCH /api/v1/handoff-packages/:id
router.patch('/handoff-packages/:id', authenticate, requireHandoffFoundation, requireHandoffPackageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const {
      sourceDocumentId,
      anonymizedDocumentId,
      generatedContractId,
      legalAnalysisId,
      reviewNotesId,
      preparerSummary,
      status,
    } = req.body || {};

    const pkg = await handoffPackagesService.updateHandoffPackage(id, {
      sourceDocumentId,
      anonymizedDocumentId,
      generatedContractId,
      legalAnalysisId,
      reviewNotesId,
      preparerSummary,
      status,
      userId: getUserId(req),
    });

    res.json(pkg);
  } catch (error) {
    console.error('updateHandoffPackage error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// POST /api/v1/handoff-packages/:id/archive
router.post('/handoff-packages/:id/archive', authenticate, requireHandoffFoundation, requireHandoffPackageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const pkg = await handoffPackagesService.archiveHandoffPackage(id);
    res.json(pkg);
  } catch (error) {
    console.error('archiveHandoffPackage error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

// POST /api/v1/handoff-packages/:id/review
router.post('/handoff-packages/:id/review', authenticate, requireHandoffFoundation, requireHandoffPackageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { decision, reviewComment } = req.body || {};

    if (!decision) {
      res.status(400).json({ status: 400, code: 'DECISION_REQUIRED', message: 'decision is required' });
      return;
    }

    const validDecisions = ['APPROVED', 'REJECTED_NEEDS_REVISION', 'REJECTED_BLOCKING'];
    if (!validDecisions.includes(decision)) {
      res.status(400).json({ status: 400, code: 'INVALID_DECISION', message: 'decision must be APPROVED, REJECTED_NEEDS_REVISION, or REJECTED_BLOCKING' });
      return;
    }

    const pkg = await handoffPackagesService.reviewHandoffPackage(id, {
      decision,
      reviewComment,
      userId: getUserId(req),
    });

    res.json(pkg);
  } catch (error) {
    console.error('reviewHandoffPackage error:', error instanceof Error ? error.message : 'Unknown error');
    sendServiceError(res, error);
  }
});

export default router;
