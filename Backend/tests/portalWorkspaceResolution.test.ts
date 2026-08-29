import {
  getOnboardingContext,
  getPortalIdentityContext,
  resolvePortalWorkspace,
  ClientWorkspaceError,
} from '../src/modules/client-workspace/workspaceService';
import type { ClientPortalSession } from '../src/middleware/clientPortalAuth';

describe('Portal Identity and Multi-Workspace Resolution (R0)', () => {
  const session: ClientPortalSession = {
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://login.microsoftonline.com/test-tenant/v2.0',
    audience: 'test-audience',
    subject: 'test-subject-123',
    clientPortalIdentityId: 'identity-123',
    normalizedEmail: 'test.user@example.com',
    displayName: 'Péterfi János',
    accountType: 'ORGANIZATION_MEMBER',
    status: 'ACTIVE',
    emailVerified: true,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  };

  const mockDbWithWorkspaces = (workspaces: any[], memberships: any[] = [], grants: any[] = []) => {
    return {
      clientPortalWorkspaceMembership: {
        findMany: jest.fn().mockResolvedValue(memberships),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      clientPortalWorkspace: {
        findMany: jest.fn().mockResolvedValue(workspaces),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      client: {
        findMany: jest.fn().mockResolvedValue(workspaces.map((w) => ({ id: w.clientId, name: `${w.name} Client` }))),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      clientPortalGrant: {
        findMany: jest.fn().mockResolvedValue(grants),
      },
      clientPortalSummaryScope: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      clientPortalInvitation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      clientOrganizationMembershipRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
  };

  const individualWs = {
    id: 'ws-individual',
    clientId: 'client-individual',
    name: 'Péterfi János Ügyfélkapu',
    mode: 'INDIVIDUAL',
    status: 'ACTIVE',
    communicationMode: 'PORTAL_PRIMARY',
    connectedSystemState: 'NOT_CONFIGURED',
    publicReference: 'REF-INDIVIDUAL-123',
  };

  const orgWs = {
    id: 'ws-org',
    clientId: 'client-demo-kft',
    name: 'Demo Kft. Ügyfélkapu',
    mode: 'ORGANIZATION',
    status: 'ACTIVE',
    communicationMode: 'PORTAL_PRIMARY',
    connectedSystemState: 'NOT_CONFIGURED',
    publicReference: 'REF-DEMO-KFT-ORG',
  };

  const relayWs = {
    id: 'ws-relay',
    clientId: 'client-relay',
    name: 'Relay Kapu',
    mode: 'CASE_RELAY',
    status: 'ACTIVE',
    communicationMode: 'EXTERNAL_ONLY',
    connectedSystemState: 'READY',
    publicReference: 'REF-RELAY-123',
  };

  const memberIndividual = {
    id: 'mem-1',
    clientPortalIdentityId: session.clientPortalIdentityId,
    workspaceId: individualWs.id,
    status: 'ACTIVE',
    role: 'MEMBER',
    expiresAt: null,
  };

  const memberOrg = {
    id: 'mem-2',
    clientPortalIdentityId: session.clientPortalIdentityId,
    workspaceId: orgWs.id,
    status: 'ACTIVE',
    role: 'APPROVER',
    expiresAt: null,
  };

  const memberRelay = {
    id: 'mem-3',
    clientPortalIdentityId: session.clientPortalIdentityId,
    workspaceId: relayWs.id,
    status: 'ACTIVE',
    role: 'REPRESENTATIVE',
    expiresAt: null,
  };

  const grantsOrg = [
    { workspaceId: orgWs.id, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'ACTION_REQUEST_READ'] },
  ];

  it('1. INDIVIDUAL only → individual portal', async () => {
    const db = mockDbWithWorkspaces([individualWs], [memberIndividual]);
    const context = await getOnboardingContext(session, null, db);
    expect(context.state).toBe('READY');
    expect(context.selectedWorkspace).not.toBeNull();
    expect(context.selectedWorkspace?.mode).toBe('INDIVIDUAL');
    expect(context.selectedWorkspace?.publicReference).toBe('REF-INDIVIDUAL-123');
  });

  it('2. ORGANIZATION only → organization portal', async () => {
    const db = mockDbWithWorkspaces([orgWs], [memberOrg], grantsOrg);
    const context = await getOnboardingContext(session, null, db);
    expect(context.state).toBe('READY');
    expect(context.selectedWorkspace).not.toBeNull();
    expect(context.selectedWorkspace?.mode).toBe('ORGANIZATION');
    expect(context.selectedWorkspace?.publicReference).toBe('REF-DEMO-KFT-ORG');
  });

  it('3. same identity has both INDIVIDUAL and ORGANIZATION → deterministic selection-required behavior', async () => {
    const db = mockDbWithWorkspaces([individualWs, orgWs], [memberIndividual, memberOrg], grantsOrg);
    const context = await getOnboardingContext(session, null, db);
    expect(context.state).toBe('SELECTION_REQUIRED');
    expect(context.selectedWorkspace).toBeNull();
    expect(context.workspaces).toHaveLength(2);
    expect(context.workspaces.map((w: any) => w.mode).sort()).toEqual(['INDIVIDUAL', 'ORGANIZATION']);
  });

  it('4. explicit valid org workspace on multi-workspace identity → organization portal', async () => {
    const db = mockDbWithWorkspaces([individualWs, orgWs], [memberIndividual, memberOrg], grantsOrg);
    const context = await getOnboardingContext(session, 'REF-DEMO-KFT-ORG', db);
    expect(context.state).toBe('READY');
    expect(context.selectedWorkspace).not.toBeNull();
    expect(context.selectedWorkspace?.mode).toBe('ORGANIZATION');
    expect(context.selectedWorkspace?.publicReference).toBe('REF-DEMO-KFT-ORG');
  });

  it('5. stale localStorage individual workspace after identity/context change cannot hijack selection', async () => {
    // Identity now only has ORGANIZATION workspace, but browser localStorage sent old INDIVIDUAL reference
    const db = mockDbWithWorkspaces([orgWs], [memberOrg], grantsOrg);
    const context = await getOnboardingContext(session, 'REF-OLD-INDIVIDUAL-STALE', db);
    expect(context.state).toBe('READY');
    expect(context.selectedWorkspace).not.toBeNull();
    expect(context.selectedWorkspace?.mode).toBe('ORGANIZATION');
    expect(context.selectedWorkspace?.publicReference).toBe('REF-DEMO-KFT-ORG');

    // Multi-workspace identity with stale reference sent from localStorage
    const multiDb = mockDbWithWorkspaces([individualWs, orgWs], [memberIndividual, memberOrg], grantsOrg);
    const multiContext = await getOnboardingContext(session, 'REF-STALE-FOREIGN-WORKSPACE', multiDb);
    expect(multiContext.state).toBe('SELECTION_REQUIRED');
    expect(multiContext.selectedWorkspace).toBeNull();
  });

  it('6. revoked/inactive membership cannot be selected', async () => {
    const db = mockDbWithWorkspaces([], []);
    const context = await getOnboardingContext(session, 'REF-DEMO-KFT-ORG', db);
    expect(['NO_ACCESS', 'ONBOARDING_REQUIRED', 'ACCESS_SUSPENDED', 'PENDING_APPROVAL']).toContain(context.state);
    expect(context.selectedWorkspace).toBeNull();
  });

  it('7. cross-client workspace substitution fails closed on operational endpoints', async () => {
    const db = mockDbWithWorkspaces([individualWs], [memberIndividual]);
    await expect(
      resolvePortalWorkspace(session, 'REF-OTHER-CLIENT-FORGED', db)
    ).rejects.toThrow(ClientWorkspaceError);

    await expect(
      resolvePortalWorkspace(session, 'REF-OTHER-CLIENT-FORGED', db)
    ).rejects.toMatchObject({ status: 403, code: 'CLIENT_WORKSPACE_FORBIDDEN' });
  });

  it('8. CASE_RELAY semantics unchanged', async () => {
    const db = mockDbWithWorkspaces([relayWs], [memberRelay]);
    const context = await getOnboardingContext(session, null, db);
    expect(context.state).toBe('READY');
    expect(context.selectedWorkspace?.mode).toBe('CASE_RELAY');
    expect(context.selectedWorkspace?.publicReference).toBe('REF-RELAY-123');
  });

  it('9. single workspace with empty requested reference resolves cleanly', async () => {
    const db = mockDbWithWorkspaces([orgWs], [memberOrg], grantsOrg);
    const resolved = await resolvePortalWorkspace(session, null, db);
    expect(resolved.publicReference).toBe('REF-DEMO-KFT-ORG');
    expect(resolved.mode).toBe('ORGANIZATION');
  });

  it('10. multi-workspace requires selection on operational endpoint when requestedReference is missing', async () => {
    const db = mockDbWithWorkspaces([individualWs, orgWs], [memberIndividual, memberOrg], grantsOrg);
    await expect(
      resolvePortalWorkspace(session, null, db)
    ).rejects.toMatchObject({ status: 409, code: 'CLIENT_WORKSPACE_SELECTION_REQUIRED' });

    const resolved = await resolvePortalWorkspace(session, 'REF-DEMO-KFT-ORG', db);
    expect(resolved.publicReference).toBe('REF-DEMO-KFT-ORG');
  });
});
