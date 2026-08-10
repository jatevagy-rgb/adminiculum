import { Request, Response, Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { authenticateClientPortal, requireRegisteredClientPortalSession } from '../../middleware/clientPortalAuth';
import {
  acceptPortalInvitation,
  approveMembershipRequest,
  cancelMembershipRequest,
  createGrantForApprovedMembership,
  createOrganizationGroup,
  ClientIdentityError,
  getClientProfile,
  getCurrentMembershipRequests,
  getMembershipRequestDetail,
  listActiveMemberships,
  listMembershipQueue,
  rejectMembershipRequest,
  submitMembershipRequest,
  transitionMembership,
  validateInvitation,
} from './identityService';
import {
  cancelInvitationNotificationRetry,
  createWorkspace,
  inviteWorkspaceMember,
  listAdminWorkspaces,
  revokeInvitation,
  transitionWorkspace,
  transitionWorkspaceMembership,
  updateWorkspace,
} from '../client-workspace/workspaceService';
import {
  assignUnitMembership,
  createParticipant,
  createSummaryScope,
  linkUnitToWorkspace,
  listParticipants,
  listSummaryScopes,
  listUnitMemberships,
  listWorkspaceUnits,
  revokeParticipant,
  revokeUnitMembership,
  transitionSummaryScope,
  unlinkUnitFromWorkspace,
  updateParticipant,
} from '../client-workspace/organizationAdminService';
import {
  approveIntakeRequesterAccess,
  closeIntake,
  convertIntakeToNewCase,
  declineIntake,
  getIntakeTriageDetail,
  linkIntakeToExistingCase,
  listIntakeHistory,
  listIntakeQueue,
  performApprovedConversion,
  publishIntakeSnapshot,
  requestMoreInformation,
  startIntakeTriage,
} from '../client-workspace/intakeTriageService';

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
clientIdentityRouter.post('/me/invitations/accept', async (req, res) => {
  try { res.json(await acceptPortalInvitation(requireRegisteredClientPortalSession(req), req.body || {})); }
  catch (error) { fail(res, error); }
});

clientIdentityRouter.use('/admin', authenticate, requireRole('ADMIN', 'PARTNER'));
clientIdentityRouter.get('/admin/membership-requests', async (req, res) => {
  try { res.json(await listMembershipQueue(internalActor(req))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.get('/admin/membership-requests/:requestId', async (req, res) => {
  try { res.json(await getMembershipRequestDetail(internalActor(req), String(req.params.requestId))); }
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
clientIdentityRouter.post('/admin/invitations/:invitationId/revoke', async (req, res) => {
  try { res.json(await revokeInvitation(internalActor(req), String(req.params.invitationId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/invitations/:invitationId/cancel-notification', async (req, res) => {
  try { res.json(await cancelInvitationNotificationRetry(internalActor(req), String(req.params.invitationId))); }
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

clientIdentityRouter.get('/admin/intakes', async (req, res) => {
  try { res.json(await listIntakeQueue(internalActor(req), req.query as Record<string, unknown>)); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.get('/admin/intakes/:intakeId', async (req, res) => {
  try { res.json(await getIntakeTriageDetail(internalActor(req), String(req.params.intakeId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.get('/admin/intakes/:intakeId/history', async (req, res) => {
  try { res.json(await listIntakeHistory(internalActor(req), String(req.params.intakeId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/start-triage', async (req, res) => {
  try { res.json(await startIntakeTriage(internalActor(req), String(req.params.intakeId), req.body?.expectedRevision)); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/request-more-information', async (req, res) => {
  try { res.status(201).json(await requestMoreInformation(internalActor(req), String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/decline', async (req, res) => {
  try { res.json(await declineIntake(internalActor(req), String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/link-existing-case', async (req, res) => {
  try { res.json(await linkIntakeToExistingCase(internalActor(req), String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/convert-new-case', async (req, res) => {
  try { res.status(201).json(await convertIntakeToNewCase(internalActor(req), String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/approve-requester-access', async (req, res) => {
  try { res.json(await approveIntakeRequesterAccess(internalActor(req), String(req.params.intakeId), Array.isArray(req.body?.permissions) ? req.body.permissions : [])); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/publish-initial-snapshot', async (req, res) => {
  try { res.status(201).json(await publishIntakeSnapshot(internalActor(req), String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/approved-conversion', async (req, res) => {
  try { res.status(201).json(await performApprovedConversion(internalActor(req), String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/intakes/:intakeId/close', async (req, res) => {
  try { res.json(await closeIntake(internalActor(req), String(req.params.intakeId), req.body?.expectedRevision)); }
  catch (error) { fail(res, error); }
});

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
clientIdentityRouter.get('/admin/workspaces/:workspaceId/members/:workspaceMembershipId/unit-memberships', async (req, res) => {
  try { res.json(await listUnitMemberships(internalActor(req), String(req.params.workspaceId), String(req.params.workspaceMembershipId))); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/workspaces/:workspaceId/members/:workspaceMembershipId/unit-memberships', async (req, res) => {
  try { res.status(201).json(await assignUnitMembership(internalActor(req), String(req.params.workspaceId), String(req.params.workspaceMembershipId), req.body || {})); }
  catch (error) { fail(res, error); }
});
clientIdentityRouter.post('/admin/unit-memberships/:unitMembershipId/revoke', async (req, res) => {
  try { res.json(await revokeUnitMembership(internalActor(req), String(req.params.unitMembershipId))); }
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
