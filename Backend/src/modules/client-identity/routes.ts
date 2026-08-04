import { Request, Response, Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { authenticateClientPortal, requireRegisteredClientPortalSession } from '../../middleware/clientPortalAuth';
import {
  approveMembershipRequest,
  cancelMembershipRequest,
  createGrantForApprovedMembership,
  createOrganizationGroup,
  ClientIdentityError,
  getClientProfile,
  getCurrentMembershipRequests,
  listActiveMemberships,
  listMembershipQueue,
  rejectMembershipRequest,
  submitMembershipRequest,
  transitionMembership,
  validateInvitation,
} from './identityService';
import {
  createWorkspace,
  inviteWorkspaceMember,
  listAdminWorkspaces,
  transitionWorkspace,
  transitionWorkspaceMembership,
  updateWorkspace,
} from '../client-workspace/workspaceService';
import {
  createParticipant,
  createSummaryScope,
  linkUnitToWorkspace,
  listParticipants,
  listSummaryScopes,
  listWorkspaceUnits,
  revokeParticipant,
  transitionSummaryScope,
  unlinkUnitFromWorkspace,
  updateParticipant,
} from '../client-workspace/organizationAdminService';

export const clientIdentityRouter = Router();

function internalActor(req: Request) {
  return { userId: String(req.user?.userId || ''), role: String(req.user?.role || '') };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof ClientIdentityError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  const shaped = error as { status?: number; code?: string; message?: string };
  if (shaped?.status && shaped?.code) {
    res.status(shaped.status).json({ status: shaped.status, code: shaped.code, message: shaped.message || 'Client identity request failed.' });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_IDENTITY_INTERNAL_ERROR', message: 'Client identity request failed.' });
}

clientIdentityRouter.get('/provider-config', (_req, res) => {
  res.json({
    provider: 'ENTRA_EXTERNAL_ID_OR_APPROVED_OIDC',
    passwordHandledByProvider: true,
    storesPasswords: false,
    routes: {
      register: '/portal/register',
      verifyEmail: '/portal/verify-email',
      login: '/portal/login',
      forgotPassword: '/portal/forgot-password',
      resetPassword: '/portal/reset-password',
      onboarding: '/portal/onboarding',
    },
  });
});

clientIdentityRouter.post('/invitations/validate', async (req, res) => {
  try { res.json(await validateInvitation(String(req.body?.token || ''))); }
  catch (error) { fail(res, error); }
});

clientIdentityRouter.use('/me', authenticateClientPortal);
clientIdentityRouter.get('/me/profile', async (req, res) => {
  try { res.json(await getClientProfile(requireRegisteredClientPortalSession(req))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.get('/me/membership-requests', async (req, res) => {
  try { res.json(await getCurrentMembershipRequests(requireRegisteredClientPortalSession(req))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/me/membership-requests', async (req, res) => {
  try { res.status(202).json(await submitMembershipRequest(requireRegisteredClientPortalSession(req), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/me/membership-requests/:requestId/cancel', async (req, res) => {
  try { res.json(await cancelMembershipRequest(requireRegisteredClientPortalSession(req), String(req.params.requestId), Number(req.body?.revision))); }
  catch (error) { fail(res, error); }
});

clientIdentityRouter.use('/admin', authenticate, requireRole('ADMIN', 'PARTNER'));
clientIdentityRouter.get('/admin/membership-requests', async (req, res) => {
  try { res.json(await listMembershipQueue(internalActor(req))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.get('/admin/memberships', async (req, res) => {
  try { res.json(await listActiveMemberships(internalActor(req))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.get('/admin/workspaces', async (req, res) => {
  try { res.json(await listAdminWorkspaces(internalActor(req), req.query.clientId ? String(req.query.clientId) : undefined)); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/workspaces', async (req, res) => {
  try { res.status(201).json(await createWorkspace(internalActor(req), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.patch('/admin/workspaces/:workspaceId', async (req, res) => {
  try { res.json(await updateWorkspace(internalActor(req), String(req.params.workspaceId), req.body || {})); }
  catch (error) { fail(res, error); }
});
for (const action of ['activate', 'suspend', 'archive'] as const) {
  clientIdentityRouter.post(`/admin/workspaces/:workspaceId/${action}`, async (req, res) => {
    try { res.json(await transitionWorkspace(internalActor(req), String(req.params.workspaceId), action, req.body?.revision)); }
    catch (error) { fail(res, error); }
  });
}
clientIdentityRouter.post('/admin/workspaces/:workspaceId/invitations', async (req, res) => {
  try { res.status(201).json(await inviteWorkspaceMember(internalActor(req), String(req.params.workspaceId), req.body || {})); }
  catch (error) { fail(res, error); }
});
for (const action of ['approve', 'suspend', 'revoke'] as const) {
  clientIdentityRouter.post(`/admin/workspace-memberships/:membershipId/${action}`, async (req, res) => {
    try { res.json(await transitionWorkspaceMembership(internalActor(req), String(req.params.membershipId), action, req.body?.revision)); }
    catch (error) { fail(res, error); }
  });
}
clientIdentityRouter.post('/admin/groups', async (req, res) => {
  try { res.status(201).json(await createOrganizationGroup(internalActor(req), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/membership-requests/:requestId/approve', async (req, res) => {
  try { res.json(await approveMembershipRequest(internalActor(req), String(req.params.requestId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/membership-requests/:requestId/reject', async (req, res) => {
  try { res.json(await rejectMembershipRequest(internalActor(req), String(req.params.requestId), req.body || {})); }
  catch (error) { fail(res, error); }
});
for (const action of ['suspend', 'revoke'] as const) {
  clientIdentityRouter.post(`/admin/memberships/:membershipId/${action}`, async (req, res) => {
    try { res.json(await transitionMembership(internalActor(req), String(req.params.membershipId), action)); }
    catch (error) { fail(res, error); }
  });
}
clientIdentityRouter.post('/admin/grants', async (req, res) => {
  try { res.status(201).json(await createGrantForApprovedMembership(internalActor(req), req.body || {})); }
  catch (error) { fail(res, error); }
});

// --- CP1 organizational administration (ADMIN/PARTNER, guarded by /admin use) ---

clientIdentityRouter.get('/admin/workspaces/:workspaceId/units', async (req, res) => {
  try { res.json(await listWorkspaceUnits(internalActor(req), String(req.params.workspaceId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/workspaces/:workspaceId/units/:groupId/link', async (req, res) => {
  try { res.json(await linkUnitToWorkspace(internalActor(req), String(req.params.groupId), String(req.params.workspaceId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/units/:groupId/unlink', async (req, res) => {
  try { res.json(await unlinkUnitFromWorkspace(internalActor(req), String(req.params.groupId))); }
  catch (error) { fail(res, error); }
});

clientIdentityRouter.get('/admin/workspaces/:workspaceId/cases/:caseId/participants', async (req, res) => {
  try { res.json(await listParticipants(internalActor(req), String(req.params.workspaceId), String(req.params.caseId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/participants', async (req, res) => {
  try { res.status(201).json(await createParticipant(internalActor(req), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.patch('/admin/participants/:grantId', async (req, res) => {
  try { res.json(await updateParticipant(internalActor(req), String(req.params.grantId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/participants/:grantId/revoke', async (req, res) => {
  try { res.json(await revokeParticipant(internalActor(req), String(req.params.grantId))); }
  catch (error) { fail(res, error); }
});

clientIdentityRouter.get('/admin/workspaces/:workspaceId/summary-scopes', async (req, res) => {
  try { res.json(await listSummaryScopes(internalActor(req), String(req.params.workspaceId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/summary-scopes', async (req, res) => {
  try { res.status(201).json(await createSummaryScope(internalActor(req), req.body || {})); }
  catch (error) { fail(res, error); }
});
for (const action of ['suspend', 'revoke'] as const) {
  clientIdentityRouter.post(`/admin/summary-scopes/:scopeId/${action}`, async (req, res) => {
    try { res.json(await transitionSummaryScope(internalActor(req), String(req.params.scopeId), action)); }
    catch (error) { fail(res, error); }
  });
}
