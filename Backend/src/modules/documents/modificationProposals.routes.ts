import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { userCanManageCase } from '../cases/authorization';
import { AnchorValidationError } from './anchorValidation';
import {
  acceptModificationProposal,
  createModificationProposal,
  DocumentModificationProposalError,
  rejectModificationProposal,
  withdrawModificationProposal,
} from './modificationProposals.service';
import { getCaseIdFromVersion } from './documentObjectAuthorization';
import { requireVersionReadAccess } from './versionAccess';

const router = Router({ mergeParams: true });

router.use(authenticate, requireWorkforceUser, requireVersionReadAccess);

function actor(req: Request): { id: string; role: string | null | undefined } | null {
  const id = req.user?.userId;
  if (!id) return null;
  return { id, role: req.user?.role };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof DocumentModificationProposalError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  if (error instanceof AnchorValidationError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  console.error('Document modification proposal route error:', error);
  res.status(500).json({
    status: 500,
    code: 'DOCUMENT_MODIFICATION_PROPOSAL_ERROR',
    message: 'Document modification proposal request failed.',
  });
}

router.post('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const current = actor(req);
    if (!current) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId } = req.params as { documentId: string; versionId: string };
    res.status(201).json(
      await createModificationProposal(documentId, versionId, current.id, req.body || {})
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:proposalId/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = actor(req);
    if (!current) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, proposalId } = req.params as {
      documentId: string;
      versionId: string;
      proposalId: string;
    };
    res.json(
      await acceptModificationProposal(documentId, versionId, proposalId, { id: current.id, role: current.role })
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:proposalId/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = actor(req);
    if (!current) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, proposalId } = req.params as {
      documentId: string;
      versionId: string;
      proposalId: string;
    };
    res.json(
      await rejectModificationProposal(
        documentId,
        versionId,
        proposalId,
        { id: current.id, role: current.role },
        req.body?.reason
      )
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:proposalId', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = actor(req);
    if (!current) {
      res.status(401).json({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
      return;
    }
    const { documentId, versionId, proposalId } = req.params as {
      documentId: string;
      versionId: string;
      proposalId: string;
    };
    const caseId = await getCaseIdFromVersion(versionId);
    const canManage = caseId ? (await userCanManageCase(req, caseId)) === true : false;
    res.json(
      await withdrawModificationProposal(documentId, versionId, proposalId, { id: current.id, role: current.role }, {
        canManage,
      })
    );
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
