import { Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { InteractionError } from '../client-interaction/base';
import { getComplianceOverview, listUnresolvedRuleScopes } from './complianceOverviewService';
import { getCompanyGrowthNarrative } from './companyGrowthNarrative';
import { getComplianceWorkspace } from './complianceWorkspaceService';
import { reconcileClientCompliance } from './complianceReconcileService';

const router = Router();

function actor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

router.use(authenticate);

router.get('/diagnostics/unresolved-rule-scopes', async (req, res: Response) => {
  try {
    res.json({ items: await listUnresolvedRuleScopes(actor(req)) });
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_DIAGNOSTICS_INTERNAL_ERROR', message: 'Compliance diagnostics request failed.' });
  }
});

router.get('/clients/:clientId/overview', async (req, res: Response) => {
  try {
    res.json(await getComplianceOverview(actor(req), String(req.params.clientId)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_OVERVIEW_INTERNAL_ERROR', message: 'Compliance overview request failed.' });
  }
});

// Compliance workspace — bounded read-only projection of the existing
// applicability snapshots, consumed facts, missing dependencies and citations.
router.get('/clients/:clientId/workspace', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getComplianceWorkspace(actor(req), String(req.params.clientId)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_WORKSPACE_INTERNAL_ERROR', message: 'Compliance workspace request failed.' });
  }
});

// Compliance reconciliation — explicit, idempotent initial/backfill evaluation
// of the client's current approved effective rule set over existing facts.
router.post('/clients/:clientId/reconcile', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await reconcileClientCompliance(actor(req), String(req.params.clientId)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_RECONCILE_INTERNAL_ERROR', message: 'Compliance reconciliation request failed.' });
  }
});

// Grow With Us — human change/development explanation over the real engine data.
router.get('/clients/:clientId/grow', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getCompanyGrowthNarrative(actor(req), String(req.params.clientId)));
  } catch (error) {
    if (error instanceof InteractionError) {
      res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 500, code: 'COMPLIANCE_GROW_INTERNAL_ERROR', message: 'Company growth narrative request failed.' });
  }
});

export default router;
