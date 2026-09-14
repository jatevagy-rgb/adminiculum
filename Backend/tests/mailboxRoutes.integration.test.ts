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
type ResponseJson = { status: number; body: any; raw: string };

function request(app: Express, method: string, path: string, userId?: string, body?: unknown, role = 'LAWYER'): Promise<ResponseJson> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('route test server did not bind'));
      const req = http.request({ hostname: '127.0.0.1', port: address.port, method, path, headers: { ...(userId ? { 'x-test-user-id': userId, 'x-test-role': role } : {}), ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } }, (res) => {
        let raw = ''; res.on('data', (chunk) => { raw += chunk; }); res.on('end', () => { server.close(); resolve({ status: res.statusCode || 0, raw, body: raw ? JSON.parse(raw) : null }); });
      });
      req.on('error', (error) => { server.close(); reject(error); }); if (payload) req.write(payload); req.end();
    });
  });
}

describeWithDatabase('universal mailbox route ownership and redaction PostgreSQL proof', () => {
  const suffix = crypto.randomUUID();
  const ids = Object.fromEntries(['owner', 'caseCollaborator', 'taskAssignee', 'taskReviewer', 'taskCollaborator', 'tenantPeer', 'otherTenant', 'portalMember'].map((key) => [key, crypto.randomUUID()])) as Record<string, string>;
  const connectionId = crypto.randomUUID(), readOnlyConnectionId = crypto.randomUUID(), revokedConnectionId = crypto.randomUUID(), oauthConnectionId = crypto.randomUUID(), mismatchConnectionId = crypto.randomUUID();
  const clientId = crypto.randomUUID(), caseId = crypto.randomUUID(), taskId = crypto.randomUUID();
  const sentinels = { access: `oauth-access-${suffix}`, refresh: `oauth-refresh-${suffix}`, clientSecret: `oauth-client-secret-${suffix}`, imap: `imap-password-${suffix}`, smtp: `smtp-password-${suffix}`, verification: `verification-code-${suffix}`, provider: `provider-error-${suffix}` };
  let db: PrismaClient; let app: Express; let store: any; let InMemorySecretStore: any; let setProvider: any; let setStore: any; let setTransactionalTransport: any; let sentVerificationCode = '';
  let providerFailsWithSentinel = false, providerRequiresReauth = false, providerAuthorizedAddress = `oauth-${suffix}@fixture.invalid`, refreshCount = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    process.env.MAILBOX_OAUTH_STATE_SECRET = 'mailbox-route-test-state-secret-32-chars';
    ({ prisma: db } = require('../src/prisma/prisma.service'));
    ({ setMailboxProviderForTest: setProvider } = require('../src/modules/mailbox/provider'));
    ({ InMemorySecretStore, setSecretStoreForTest: setStore } = require('../src/modules/mailbox/secretStore'));
    ({ setTransactionalMailTransport: setTransactionalTransport } = require('../src/modules/mailbox/transactionalMail'));
    store = new InMemorySecretStore(); setStore(store);
    setTransactionalTransport({ sendVerificationCode: async ({ code }: { code: string }) => { sentVerificationCode = code; } });
    setProvider('MICROSOFT_GRAPH', {
      code: 'MICROSOFT_GRAPH', displayName: 'route fake', requiresProviderConfiguration: false,
      buildAuthorizationUrl: () => 'https://provider.invalid/authorize', exchangeAuthorizationCode: async () => ({ authorizedAddress: providerAuthorizedAddress, secret: { kind: 'OAUTH2', accessToken: sentinels.access, refreshToken: sentinels.refresh } }),
      listMessagesSinceCursor: async () => { if (providerRequiresReauth) throw new Error('AUTHORIZATION_REQUIRED'); if (providerFailsWithSentinel) throw new Error(sentinels.provider); return { messages: [], nextCursor: 'route-cursor' }; },
      sendMessage: async () => { if (providerFailsWithSentinel) throw new Error(sentinels.provider); return { providerMessageId: `sent-${suffix}` }; }, refreshAuthorization: async (secret: any) => { refreshCount += 1; return secret; }, disconnect: async () => undefined,
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
      { id: mismatchConnectionId, ownerUserId: ids.owner, mailboxAddress: `verified-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH', status: 'AUTHORIZATION_REQUIRED', verifiedAt: new Date(), readCapability: false, sendCapability: false },
    ] });
    await store.put(`ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access, refreshToken: sentinels.refresh, password: sentinels.imap, username: 'safe@example.invalid' });
    await store.put(`readonly-ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access, refreshToken: sentinels.refresh, password: sentinels.smtp });
    await store.put(`revoked-ref-${suffix}`, { kind: 'OAUTH2', accessToken: sentinels.access });
  });

  afterAll(async () => {
    setProvider('MICROSOFT_GRAPH', null); setStore(null); setTransactionalTransport(null);
    await db.mailboxAuditEvent.deleteMany({ where: { actorUserId: { in: Object.values(ids) } } });
    await db.emailVerificationChallenge.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await db.communication.deleteMany({ where: { createdById: { in: Object.values(ids) } } });
    await db.communicationMailboxConnection.deleteMany({ where: { id: { in: [connectionId, readOnlyConnectionId, revokedConnectionId, oauthConnectionId, mismatchConnectionId] } } });
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
  });

  it('transitions provider authorization loss to a truthful non-connected state', async () => {
    refreshCount = 0;
    providerRequiresReauth = true;
    expect((await request(app, 'POST', `/mailboxes/${connectionId}/sync`, ids.owner)).status).toBe(502);
    providerRequiresReauth = false;
    expect(refreshCount).toBe(1);
    expect((await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe('AUTHORIZATION_REQUIRED');
    expect(await db.mailboxAuditEvent.count({ where: { mailboxConnectionId: connectionId, eventType: 'MAILBOX_REAUTH_REQUIRED' } })).toBeGreaterThan(0);
  });

  it('persists the authorization, connected, disconnect, and revoked lifecycle events', async () => {
    expect((await request(app, 'POST', `/mailboxes/${oauthConnectionId}/authorize/microsoft/start`, ids.owner)).status).toBe(200);
    const { createOAuthState } = require('../src/modules/mailbox/oauthState');
    const state = createOAuthState({ userId: ids.owner, connectionId: oauthConnectionId, mailboxAddress: `oauth-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH' });
    expect((await request(app, 'GET', `/mailboxes/oauth/microsoft/callback?state=${encodeURIComponent(state)}&code=safe`, ids.owner)).status).toBe(200);
    expect((await request(app, 'POST', `/mailboxes/${oauthConnectionId}/disconnect`, ids.owner)).status).toBe(204);
    const events = await db.mailboxAuditEvent.findMany({ where: { mailboxConnectionId: oauthConnectionId }, select: { eventType: true } });
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['MAILBOX_AUTHORIZATION_STARTED', 'MAILBOX_CONNECTED', 'MAILBOX_DISCONNECTED', 'MAILBOX_REVOKED']));
  });

  it('rejects a provider identity mismatch before secret persistence or connection', async () => {
    providerAuthorizedAddress = `different-${suffix}@fixture.invalid`;
    const { createOAuthState } = require('../src/modules/mailbox/oauthState');
    const state = createOAuthState({ userId: ids.owner, connectionId: mismatchConnectionId, mailboxAddress: `verified-${suffix}@fixture.invalid`, provider: 'MICROSOFT_GRAPH' });
    const result = await request(app, 'GET', `/mailboxes/oauth/microsoft/callback?state=${encodeURIComponent(state)}&code=safe`, ids.owner);
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('MAILBOX_PROVIDER_IDENTITY_MISMATCH');
    const connection = await db.communicationMailboxConnection.findUniqueOrThrow({ where: { id: mismatchConnectionId } });
    expect(connection.status).toBe('AUTHORIZATION_REQUIRED');
    expect(connection.secretReference).toBeNull();
    expect(await db.mailboxAuditEvent.count({ where: { mailboxConnectionId: mismatchConnectionId, eventType: 'MAILBOX_IDENTITY_MISMATCH' } })).toBe(1);
    providerAuthorizedAddress = `oauth-${suffix}@fixture.invalid`;
  });
});
