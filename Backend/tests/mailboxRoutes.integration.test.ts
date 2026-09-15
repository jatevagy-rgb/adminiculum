import crypto from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import { PrismaClient } from '@prisma/client';

// The mailbox router is mounted with the real service and Prisma client.  Only
// identity extraction is replaced so this PostgreSQL test can exercise each
// route as a distinct principal without relying on an external identity issuer.
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const userId = String(req.headers['x-test-user-id'] || '');
    if (!userId) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId, email: `${userId}@fixture.invalid`, role: String(req.headers['x-test-role'] || 'LAWYER') as any, authProvider: 'local-jwt' };
    next();
  },
}));

const databaseUrl = process.env.MAILBOX_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
type ResponseJson = { status: number; body: any; raw: string; headers: Record<string, string | undefined> };

function request(app: Express, method: string, path: string, userId?: string, body?: unknown, role = 'LAWYER'): Promise<ResponseJson> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('route test server did not bind'));
      const req = http.request({ hostname: '127.0.0.1', port: address.port, method, path, headers: { ...(userId ? { 'x-test-user-id': userId, 'x-test-role': role } : {}), ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } }, (res) => {
        let raw = ''; res.on('data', (chunk) => { raw += chunk; }); res.on('end', () => { server.close(); let body: unknown = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; } resolve({ status: res.statusCode || 0, raw, body, headers: { location: res.headers.location } }); });
      });
      req.on('error', (error) => { server.close(); reject(error); }); if (payload) req.write(payload); req.end();
    });
  });
}

describeWithDatabase('universal mailbox route ownership and redaction PostgreSQL proof', () => {
  const suffix = crypto.randomUUID();
  const ids = Object.fromEntries(['owner', 'caseCollaborator', 'taskAssignee', 'taskReviewer', 'taskCollaborator', 'tenantPeer', 'otherTenant', 'portalMember'].map((key) => [key, crypto.randomUUID()])) as Record<string, string>;
  const connectionId = crypto.randomUUID(), readOnlyConnectionId = crypto.randomUUID(), revokedConnectionId = crypto.randomUUID(), oauthConnectionId = crypto.randomUUID(), googleOauthConnectionId = crypto.randomUUID(), mismatchConnectionId = crypto.randomUUID(), contextConnectionId = crypto.randomUUID(), replyCommunicationId = crypto.randomUUID(), forwardCommunicationId = crypto.randomUUID();
  const clientId = crypto.randomUUID(), caseId = crypto.randomUUID(), taskId = crypto.randomUUID();
  const sentinels = { access: `oauth-access-${suffix}`, refresh: `oauth-refresh-${suffix}`, clientSecret: `oauth-client-secret-${suffix}`, imap: `imap-password-${suffix}`, smtp: `smtp-password-${suffix}`, verification: `verification-code-${suffix}`, provider: `provider-error-${suffix}` };
  let db: PrismaClient; let app: Express; let store: any; let InMemorySecretStore: any; let setProvider: any; let setStore: any; let setTransactionalTransport: any; let sentVerificationCode = '';
  let providerFailsWithSentinel = false, providerRequiresReauth = false, providerAuthorizedAddress = `oauth-${suffix}@fixture.invalid`, providerAuthorizedAddresses: string[] | undefined = undefined, refreshCount = 0, transactionalDeliveryFails = false, sentMessageCount = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    process.env.MAILBOX_OAUTH_STATE_SECRET = 'mailbox-route-test-state-secret-32-chars';
    process.env.FRONTEND_URL = 'https://adminiculum.example.test';
    ({ prisma: db } = require('../src/prisma/prisma.service'));
    ({ setMailboxProviderForTest: setProvider } = require('../src/modules/mailbox/provider'));
    ({ InMemorySecretStore, setSecretStoreForTest: setStore } = require('../src/modules/mailbox/secretStore'));
    ({ setTransactionalMailTransport: setTransactionalTransport } = require('../src/modules/mailbox/transactionalMail'));
    store = new InMemorySecretStore(); setStore(store);
    setTransactionalTransport({ sendVerificationCode: async ({ code }: { code: string }) => { if (transactionalDeliveryFails) throw new Error('TLS_REQUIRED'); sentVerificationCode = code; } });
    setProvider('MICROSOFT_GRAPH', {
      code: 'MICROSOFT_GRAPH', displayName: 'route fake', requiresProviderConfiguration: false,
      buildAuthorizationUrl: () => 'https://provider.invalid/authorize', exchangeAuthorizationCode: async () => ({ authorizedAddress: providerAuthorizedAddress, authorizedAddresses: providerAuthorizedAddresses, secret: { kind: 'OAUTH2', accessToken: sentinels.access, refreshToken: sentinels.refresh } }),
      listMessagesSinceCursor: async () => { if (providerRequiresReauth) throw new Error('AUTHORIZATION_REQUIRED'); if (providerFailsWithSentinel) throw new Error(sentinels.provider); return { messages: [], nextCursor: 'route-cursor' }; },
      sendMessage: async () => { if (providerFailsWithSentinel) throw new Error(sentinels.provider); sentMessageCount += 1; return { providerMessageId: `sent-${suffix}-${sentMessageCount}` }; }, refreshAuthorization: async (secret: any) => { refreshCount += 1; return secret; }, disconnect: async () => undefined,
    });
    setProvider('GOOGLE_GMAIL', {
      code: 'GOOGLE_GMAIL', displayName: 'route Google fake', requiresProviderConfiguration: false,
      buildAuthorizationUrl: () => 'https://provider.invalid/google-authorize', exchangeAuthorizationCode: async () => ({ authorizedAddress: `google-${suffix}@fixture.invalid`, secret: { kind: 'OAUTH2', accessToken: `google-access-${suffix}`, refreshToken: `google-refresh-${suffix}` } }),
      listMessagesSinceCursor: async () => ({ messages: [], nextCursor: 'google-route-cursor' }),
      sendMessage: async () => ({ providerMessageId: `google-sent-${suffix}` }), refreshAuthorization: async (secret: any) => secret, disconnect: async () => undefined,
    });
    const router = require('../src/modules/mailbox/routes').default; app = express(); app.use(express.json()); app.use('/mailboxes', router);
    await db.user.createMany({ data: Object.entries(ids).map(([key, id]) => ({ id, email: `${key}-${suffix}@fixture.invalid`, name: key, role: key === 'portalMember' ? 'CLIENT' : 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } as any)) });
    await db.client.create({ data: { id: clientId, name: `Mailbox route tenant ${suffix}` } });
    await db.case.create({ data: { id: caseId, caseNumber: `MBX-${suffix}`, title: 'Mailbox route relationship fixture', caseType: 'OTHER', clientId, createdById: ids.owner } });
    await db.caseCollaborator.create({ data: { caseId, userId: ids.caseCollaborator, role: 'COLLABORATOR' } });
    await db.task.create({ data: { id: taskId, title: 'Mailbox route relationship fixture', taskType: 'OTHER', caseId, assignedToId: ids.taskAssignee, plannedReviewerId: ids.taskReviewer, requiredSkills: [] } });
    await db.taskCollaborator.create({ data: { taskId, userId: ids.taskCollaborator, addedById: ids.owner } });
    await db.communicationMailboxConnection.createMany({ data: [
      { id: connectionId, ownerUserId: ids.owner, mailboxAddress: `owner-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'CONNECTED', verifiedAt: new Date(), readCapability: true, sendCapability: true, secretReference: `ref-${suffix}` },
      { id: readOnlyConnectionId, ownerUserId: ids.owner, mailboxAddress: `readonly-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'CONNECTED_READ_ONLY', verifiedAt: new Date(), readCapability: true, sendCapability: false, secretReference: `readonly-ref-${suffix}` },
      { id: revokedConnectionId, ownerUserId: ids.owner, mailboxAddress: `revoked-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'REVOKED', verifiedAt: new Date(), readCapability: false, sendCapability: false, secretReference: `revoked-ref-${suffix}` },
      { id: oauthConnectionId, ownerUserId: ids.owner, mailboxAddress: `oauth-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'AUTHORIZATION_REQUIRED', verifiedAt: new Date(), readCapability: true, sendCapability: false },
      { id: googleOauthConnectionId, ownerUserId: ids.owner, mailboxAddress: `google-${suffix}@fixture.invalid`, provider: 'GOOGLE_GMAIL', status: 'AUTHORIZATION_REQUIRED', verifiedAt: new Date(), readCapability: false, sendCapability: false },
      { id: mismatchConnectionId, ownerUserId: ids.owner, mailboxAddress: `verified-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'AUTHORIZATION_REQUIRED', verifiedAt: new Date(), readCapability: false, sendCapability: false },
      { id: contextConnectionId, ownerUserId: ids.tenantPeer, mailboxAddress: `context-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'CONNECTED', verifiedAt: new Date(), readCapability: true, sendCapability: true, secretReference: `context-ref-${suffix}` },
    ] });
    await store.put(`ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access, refreshToken: sentinels.refresh, password: sentinels.imap, username: 'safe@example.invalid' });
    await store.put(`readonly-ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access, refreshToken: sentinels.refresh, password: sentinels.smtp });
    await store.put(`revoked-ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access });
    await store.put(`context-ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access });
    await db.communication.createMany({ data: [
      { id: replyCommunicationId, type: 'EMAIL', subject: 'Case source', content: 'source', createdById: ids.owner, mailboxConnectionId: connectionId, mailboxProviderMessageId: `source-${suffix}`, caseId, clientId, source: 'MAILBOX', direction: 'INBOUND' },
      { id: forwardCommunicationId, type: 'EMAIL', subject: 'Removed member source', content: 'source', createdById: ids.tenantPeer, mailboxConnectionId: contextConnectionId, mailboxProviderMessageId: `removed-source-${suffix}`, caseId, clientId, source: 'MAILBOX', direction: 'INBOUND' },
    ] as any });
  });

  afterAll(async () => {
    setProvider('MICROSOFT_GRAPH', null); setProvider('GOOGLE_GMAIL', null); setStore(null); setTransactionalTransport(null);
    await db.mailboxAuditEvent.deleteMany({ where: { actorUserId: { in: Object.values(ids) } } });
    await db.emailVerificationChallenge.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await db.communication.deleteMany({ where: { createdById: { in: Object.values(ids) } } });
    await db.communicationMailboxConnection.deleteMany({ where: { id: { in: [connectionId, readOnlyConnectionId, revokedConnectionId, oauthConnectionId, googleOauthConnectionId, mismatchConnectionId, contextConnectionId] } } });
    await db.taskCollaborator.deleteMany({ where: { taskId } });
    await db.task.deleteMany({ where: { id: taskId } });
    await db.caseCollaborator.deleteMany({ where: { caseId } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  it('allows the owner route lifecycle, exposes no secrets, and keeps read-only truthful', async () => {
    expect((await request(app, 'GET', '/mailboxes', ids.owner)).status).toBe(200);
    expect((await request(app, 'GET', `/mailboxes/${connectionId}`, ids.owner)).body.mailbox.status).toBe('CONNECTED');
    expect((await request(app, 'POST', `/mailboxes/${connectionId}/sync`, ids.owner)).status).toBe(200);
    expect((await request(app, 'POST', `/mailboxes/${connectionId}/send`, ids.owner, { to: [{ email: 'to@fixture.invalid' }], subject: 'safe', bodyText: 'safe' })).status).toBe(201);
    const readOnlySync = await request(app, 'POST', `/mailboxes/${readOnlyConnectionId}/sync`, ids.owner);
    expect(readOnlySync.status).toBe(200); expect(readOnlySync.body.mailbox.status).toBe('CONNECTED_READ_ONLY');
    expect((await request(app, 'POST', `/mailboxes/${readOnlyConnectionId}/send`, ids.owner, { to: [], subject: '', bodyText: '' })).body.code).toBe('MAILBOX_SEND_NOT_AVAILABLE');
    expect((await request(app, 'POST', `/mailboxes/${revokedConnectionId}/sync`, ids.owner)).body.code).toBe('MAILBOX_REVOKED');
    expect((await request(app, 'POST', `/mailboxes/${revokedConnectionId}/send`, ids.owner, { to: [], subject: '', bodyText: '' })).body.code).toBe('MAILBOX_SEND_NOT_AVAILABLE');
    const dto = await request(app, 'GET', `/mailboxes/${connectionId}`, ids.owner);
    for (const value of Object.values(sentinels)) expect(dto.raw).not.toContain(value);
  });

  it('denies every non-owner route principal regardless of an asserted relationship and tenant', async () => {
    for (const key of ['caseCollaborator', 'taskAssignee', 'taskReviewer', 'taskCollaborator', 'tenantPeer', 'otherTenant']) {
      expect((await request(app, 'GET', `/mailboxes/${connectionId}`, ids[key])).status).toBe(404);
      expect((await request(app, 'POST', `/mailboxes/${connectionId}/sync`, ids[key])).status).toBe(404);
      expect((await request(app, 'POST', `/mailboxes/${connectionId}/send`, ids[key], { to: [], subject: '', bodyText: '' })).status).toBe(404);
      expect((await request(app, 'POST', `/mailboxes/${connectionId}/disconnect`, ids[key])).status).toBe(404);
    }
    expect((await request(app, 'GET', `/mailboxes/${connectionId}`)).status).toBe(401);
    expect((await request(app, 'GET', `/mailboxes/${connectionId}`, ids.portalMember, undefined, 'CLIENT')).status).toBe(403);
  });

  it('persists only secret references and redacts provider and verification sentinels', async () => {
    providerFailsWithSentinel = true;
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const providerFailure = await request(app, 'POST', `/mailboxes/${connectionId}/send`, ids.owner, { to: [{ email: 'to@fixture.invalid' }], subject: 'safe', bodyText: 'safe' });
    expect(providerFailure.status).toBe(500); expect(providerFailure.raw).not.toContain(sentinels.provider);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(sentinels.provider); errorLog.mockRestore();
    providerFailsWithSentinel = false;
    const verificationStart = await request(app, 'POST', '/mailboxes/verification/start', ids.owner, { email: `verify-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH' });
    expect(verificationStart.status).toBe(202); expect(sentVerificationCode).toMatch(/^\d{6}$/);
    const verification = await request(app, 'POST', '/mailboxes/verification/confirm', ids.owner, { email: `verify-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', code: sentinels.verification });
    expect(verification.status).toBe(400);
    const serialized = JSON.stringify({ connections: await db.communicationMailboxConnection.findMany({ where: { ownerUserId: ids.owner } }), audits: await db.mailboxAuditEvent.findMany({ where: { actorUserId: ids.owner } }), challenges: await db.emailVerificationChallenge.findMany({ where: { userId: ids.owner } }) });
    for (const value of [...Object.values(sentinels), sentVerificationCode]) expect(serialized).not.toContain(value);
    expect(serialized).toContain(`ref-${suffix}`);
    expect(await db.mailboxAuditEvent.count({ where: { actorUserId: ids.owner, eventType: 'MAILBOX_VERIFICATION_STARTED' } })).toBeGreaterThan(0);
    await db.communicationMailboxConnection.update({ where: { id: connectionId }, data: { status: 'CONNECTED', readCapability: true, sendCapability: true, lastSyncStatus: 'SUCCEEDED', lastSyncError: null } });
  });

  it('does not create a verification challenge when transactional delivery fails', async () => {
    const email = `tls-failure-${suffix}@fixture.invalid`;
    transactionalDeliveryFails = true;
    const response = await request(app, 'POST', '/mailboxes/verification/start', ids.owner, { email, provider: 'MICROSOFT_GRAPH' });
    transactionalDeliveryFails = false;
    expect(response.status).toBe(500);
    expect(await db.emailVerificationChallenge.count({ where: { userId: ids.owner, emailAddress: email } })).toBe(0);
  });

  it('transitions provider authorization loss to a truthful non-connected state', async () => {
    refreshCount = 0;
    providerRequiresReauth = true;
    expect((await request(app, 'POST', `/mailboxes/${connectionId}/sync`, ids.owner)).status).toBe(502);
    providerRequiresReauth = false;
    expect(refreshCount).toBe(1);
    expect((await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe('AUTHORIZATION_REQUIRED');
    expect(await db.mailboxAuditEvent.count({ where: { mailboxConnectionId: connectionId, eventType: 'MAILBOX_REAUTH_REQUIRED' } })).toBeGreaterThan(0);
    await db.communicationMailboxConnection.update({ where: { id: connectionId }, data: { status: 'CONNECTED', readCapability: true, sendCapability: true, lastSyncStatus: 'SUCCEEDED', lastSyncError: null } });
  });

  it('persists the authorization, connected, disconnect, and revoked lifecycle events', async () => {
    expect((await request(app, 'POST', `/mailboxes/${oauthConnectionId}/authorize/microsoft/start`, ids.owner)).status).toBe(200);
    const { createOAuthState } = require('../src/modules/mailbox/oauthState');
    const state = createOAuthState({ userId: ids.owner, connectionId: oauthConnectionId, mailboxAddress: `oauth-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH' });
    const microsoftCallback = await request(app, 'GET', `/mailboxes/oauth/microsoft/callback?state=${encodeURIComponent(state)}&code=safe&redirect_uri=https%3A%2F%2Fevil.example.test`);
    expect(microsoftCallback.status).toBe(303);
    expect(microsoftCallback.headers.location).toBe('https://adminiculum.example.test/communications/mailboxes?mailbox=connected');
    const googleState = createOAuthState({ userId: ids.owner, connectionId: googleOauthConnectionId, mailboxAddress: `google-${suffix}@fixture.invalid`, provider: 'GOOGLE_GMAIL' });
    const googleCallback = await request(app, 'GET', `/mailboxes/oauth/google/callback?state=${encodeURIComponent(googleState)}&code=safe`);
    expect(googleCallback.status).toBe(303);
    expect(googleCallback.headers.location).toBe('https://adminiculum.example.test/communications/mailboxes?mailbox=connected');
    expect(googleCallback.headers.location).not.toContain('code=');
    expect(googleCallback.headers.location).not.toContain('state=');
    expect((await request(app, 'POST', `/mailboxes/${oauthConnectionId}/disconnect`, ids.owner)).status).toBe(204);
    const events = await db.mailboxAuditEvent.findMany({ where: { mailboxConnectionId: oauthConnectionId }, select: { eventType: true } });
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['MAILBOX_AUTHORIZATION_STARTED', 'MAILBOX_CONNECTED', 'MAILBOX_DISCONNECTED', 'MAILBOX_REVOKED']));
  });

  it('rejects a provider identity mismatch before secret persistence or connection', async () => {
    providerAuthorizedAddress = `different-${suffix}@fixture.invalid`;
    const { createOAuthState } = require('../src/modules/mailbox/oauthState');
    const state = createOAuthState({ userId: ids.owner, connectionId: mismatchConnectionId, mailboxAddress: `verified-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH' });
    const browserResult = await request(app, 'GET', `/mailboxes/oauth/microsoft/callback?state=${encodeURIComponent(state)}&code=safe`);
    expect(browserResult.status).toBe(303);
    expect(browserResult.headers.location).toBe('https://adminiculum.example.test/communications/mailboxes?mailbox=error&error=MAILBOX_PROVIDER_IDENTITY_MISMATCH');
    const apiResult = await request(app, 'POST', '/mailboxes/oauth/microsoft/callback', undefined, { state, code: 'safe' });
    expect(apiResult.status).toBe(403);
    expect(apiResult.body.code).toBe('MAILBOX_PROVIDER_IDENTITY_MISMATCH');
    const connection = await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: mismatchConnectionId } });
    expect(connection.status).toBe('AUTHORIZATION_REQUIRED');
    expect(connection.secretReference).toBeNull();
    expect(await db.mailboxAuditEvent.count({ where: { mailboxConnectionId: mismatchConnectionId, eventType: 'MAILBOX_IDENTITY_MISMATCH' } })).toBe(2);
    providerAuthorizedAddress = `oauth-${suffix}@fixture.invalid`;
  });

  it('accepts a verified SMTP alias of the same Microsoft mailbox and persists the secret only after validation', async () => {
    const verified = `alias-${suffix}@fixture.invalid`;
    const primary = `primary-${suffix}@fixture.invalid`;
    const aliasConnectionId = crypto.randomUUID();
    await db.communicationMailboxConnection.create({
      data: {
        id: aliasConnectionId,
        ownerUserId: ids.owner,
        mailboxAddress: verified,
        provider: 'MICROSOFT_GRAPH',
        status: 'AUTHORIZATION_REQUIRED',
        verifiedAt: new Date(),
        readCapability: false,
        sendCapability: false,
      } as any,
    });

    // Microsoft reports a different primary and lists the verified address only as an SMTP alias.
    // The provider layer has ALREADY parsed/stripped the `smtp:` prefix, so the route receives
    // plain authoritative email addresses (this is the provider/route contract boundary).
    providerAuthorizedAddress = primary;
    providerAuthorizedAddresses = [primary, verified];
    const { createOAuthState } = require('../src/modules/mailbox/oauthState');
    const state = createOAuthState({ userId: ids.owner, connectionId: aliasConnectionId, mailboxAddress: verified, provider: 'MICROSOFT_GRAPH' });

    const result = await request(app, 'POST', '/mailboxes/oauth/microsoft/callback', undefined, { state, code: 'alias' });
    expect(result.status).toBe(200);

    const connection = await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: aliasConnectionId } });
    expect(connection.status).toBe('CONNECTED');
    expect(connection.readCapability).toBe(true);
    expect(connection.sendCapability).toBe(true);
    // Secret is written only AFTER the authoritative identity set accepted the verified alias.
    expect(connection.secretReference).not.toBeNull();
    expect(await store.get(connection.secretReference!)).not.toBeNull();

    await db.communicationMailboxConnection.deleteMany({ where: { id: aliasConnectionId } });
    providerAuthorizedAddress = `oauth-${suffix}@fixture.invalid`;
    providerAuthorizedAddresses = undefined;
  });

  it('allows only the owner to reauthorize a revoked mailbox with a fresh authorization', async () => {
    const denied = await request(app, 'POST', `/mailboxes/${revokedConnectionId}/authorize/microsoft/start`, ids.otherTenant);
    expect(denied.status).toBe(404);
    const started = await request(app, 'POST', `/mailboxes/${revokedConnectionId}/authorize/microsoft/start`, ids.owner);
    expect(started.status).toBe(200);
    expect((await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: revokedConnectionId } })).status).toBe('AUTHORIZATION_REQUIRED');
    expect(await store.get(`revoked-ref-${suffix}`)).toBeNull();
    const { createOAuthState } = require('../src/modules/mailbox/oauthState');
    const state = createOAuthState({ userId: ids.owner, connectionId: revokedConnectionId, mailboxAddress: `revoked-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH' });
    providerAuthorizedAddress = `revoked-${suffix}@fixture.invalid`;
    const callback = await request(app, 'POST', '/mailboxes/oauth/microsoft/callback', ids.owner, { state, code: 'fresh' });
    expect(callback.status).toBe(200);
    const connection = await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: revokedConnectionId } });
    expect(connection.status).toBe('CONNECTED');
    expect(connection.secretReference).not.toBe('revoked-ref-' + suffix);
    expect(await store.get(connection.secretReference!)).toEqual(expect.objectContaining({ accessToken: sentinels.access }));
    providerAuthorizedAddress = `oauth-${suffix}@fixture.invalid`;
  });

  it('inherits canonical Case and Client context for replies and forwards', async () => {
    const reply = await request(app, 'POST', `/mailboxes/${connectionId}/send`, ids.owner, {
      to: [{ email: 'reply-target@fixture.invalid' }],
      subject: 'Reply',
      bodyText: 'Reply body',
      replyToCommunicationId: replyCommunicationId,
    });
    expect(reply.status).toBe(201);
    expect(reply.body.communication.caseId).toBe(caseId);
    expect(reply.body.communication.clientId).toBe(clientId);

    const forward = await request(app, 'POST', `/mailboxes/${connectionId}/send`, ids.owner, {
      to: [{ email: 'forward-target@fixture.invalid' }],
      subject: 'Forward',
      bodyText: 'Forward body',
      contextCommunicationId: replyCommunicationId,
    });
    expect(forward.status).toBe(201);
    expect(forward.body.communication.caseId).toBe(caseId);
    expect(forward.body.communication.clientId).toBe(clientId);
    expect(forward.body.communication.inReplyTo).toBeNull();
  });

  it('denies a mailbox owner who no longer has access to the source Case', async () => {
    await db.caseCollaborator.create({ data: { caseId, userId: ids.tenantPeer, role: 'COLLABORATOR' } });
    await db.caseCollaborator.deleteMany({ where: { caseId, userId: ids.tenantPeer } });
    const denied = await request(app, 'POST', `/mailboxes/${contextConnectionId}/send`, ids.tenantPeer, {
      to: [{ email: 'reply-target@fixture.invalid' }],
      subject: 'Denied reply',
      bodyText: 'Denied',
      replyToCommunicationId: forwardCommunicationId,
    });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('CASE_ACCESS_FORBIDDEN');
  });
});
