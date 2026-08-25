/**
 * Client-safe compliance read route for the organizational portal.
 *
 * Mounts at /api/v1/client-portal/compliance.
 *
 * AUTH: authenticateClientPortal → requireActiveClientPortalSession →
 * resolvePortalWorkspace. The clientId is derived from workspace membership,
 * never from browser input.
 *
 * BOUNDARY: This route MUST NOT import or reference complianceProposalService,
 * createProposal, bindProposal, confirmProposal, or createTask.
 */
import { Request, Response, Router } from 'express';
import { authenticateClientPortal, requireActiveClientPortalSession } from '../../middleware/clientPortalAuth';
import { resolvePortalWorkspace, ResolvedPortalWorkspace } from '../client-workspace/workspaceService';
import { InteractionError } from '../client-interaction/base';
import { CLIENT_PUBLICATION_GATES } from '../client-publication/publicationService';
import { getClientSafeComplianceReadModel } from './clientSafeComplianceService';

const router = Router();

function fail(res: Response, error: unknown): void {
  if (error instanceof InteractionError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  const shaped = error as { status?: number; code?: string; message?: string };
  if (shaped?.status && shaped?.code) {
    res.status(shaped.status).json({ status: shaped.status, code: shaped.code, message: shaped.message || 'Client portal compliance request failed.' });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_PORTAL_COMPLIANCE_INTERNAL_ERROR', message: 'Client portal compliance request failed.' });
}

/**
 * Authenticate and resolve the portal workspace. Returns the resolved
 * workspace or sends an error response and returns null.
 */
async function portalAuth(req: Request, res: Response): Promise<ResolvedPortalWorkspace | null> {
  if (!CLIENT_PUBLICATION_GATES.portalRead()) {
    res.status(503).json({ status: 503, code: 'CLIENT_PORTAL_READ_DISABLED', message: 'Client portal reads are disabled.' });
    return null;
  }
  await new Promise<void>((resolve, reject) =>
    authenticateClientPortal(req, res, (error?: unknown) => (error ? reject(error) : resolve())),
  );
  if (res.headersSent) return null;
  const session = requireActiveClientPortalSession(req);
  const workspace = await resolvePortalWorkspace(session, req.header('x-client-portal-workspace'));
  (req as Request & { clientPortalWorkspace?: ResolvedPortalWorkspace }).clientPortalWorkspace = workspace;
  return workspace;
}

/**
 * GET /api/v1/client-portal/compliance
 *
 * Returns the client-safe compliance read model for the authenticated
 * organizational client. The clientId is derived from workspace membership.
 *
 * DEMO gate: requires BOTH non-production AND ADMINICULUM_DEMO_CONTENT_ENABLED=true.
 * Production hard-denies DEMO content regardless of flag.
 */
router.get('/', async (req, res: Response) => {
  try {
    const workspace = await portalAuth(req, res);
    if (!workspace) return;
    if (workspace.mode !== 'ORGANIZATION') {
      throw new InteractionError(403, 'CLIENT_ORGANIZATION_WORKSPACE_REQUIRED', 'Compliance overview is only available in an organizational workspace.');
    }
    const isProduction = process.env.NODE_ENV === 'production';
    const demoEnabled = !isProduction && process.env.ADMINICULUM_DEMO_CONTENT_ENABLED === 'true';
    const result = await getClientSafeComplianceReadModel(workspace.clientId, isProduction, demoEnabled);
    res.json(result);
  } catch (error) {
    fail(res, error);
  }
});

export default router;
