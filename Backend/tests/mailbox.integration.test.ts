import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { InMemorySecretStore } from '../src/modules/mailbox/secretStore';
import { setMailboxProviderForTest, type MailboxProviderAdapter } from '../src/modules/mailbox/provider';
import { MailboxServiceError, ownedMailbox, sendMailboxMessage, syncMailbox } from '../src/modules/mailbox/service';

const databaseUrl = process.env.MAILBOX_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('universal mailbox PostgreSQL boundary', () => {
  const suffix = crypto.randomUUID(); let db: PrismaClient; const store = new InMemorySecretStore();
  const ownerId = crypto.randomUUID(), colleagueId = crypto.randomUUID(), otherId = crypto.randomUUID();
  const connectionA = crypto.randomUUID(), connectionB = crypto.randomUUID();
  let failSend = false;
  const adapter: MailboxProviderAdapter = {
    code: 'MICROSOFT_GRAPH', displayName: 'fake', requiresProviderConfiguration: false,
    buildAuthorizationUrl: () => '', exchangeAuthorizationCode: async () => ({ secret: { kind: 'OAUTH2', accessToken: 'access-token', refreshToken: 'refresh-token' } }),
    listMessagesSinceCursor: async () => ({ messages: [{ providerMessageId: 'shared-message', direction: 'INBOUND', from: { email: 'sender@example.invalid' }, to: [{ email: 'owner@example.invalid' }], cc: [], subject: 'Inbound', bodyText: 'body must not reach audit', bodyHtml: '<p>body</p>', attachments: [{ providerAttachmentId: 'a1', fileName: 'safe.pdf', contentType: 'application/pdf', sizeBytes: 12 }] }], nextCursor: 'cursor-2' }),
    sendMessage: async () => { if (failSend) throw new Error('MAILBOX_PROVIDER_SEND_FAILED'); return { providerMessageId: 'sent-message', internetMessageId: '<sent@example.invalid>', providerConversationId: 'thread-1' }; },
    refreshAuthorization: async (secret) => secret, disconnect: async () => undefined,
  };
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); setMailboxProviderForTest('MICROSOFT_GRAPH', adapter);
    await db.user.createMany({ data: [ownerId, colleagueId, otherId].map((id, i) => ({ id, email: `mailbox-${i}-${suffix}@fixture.invalid`, name: `Mailbox ${i}`, role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } as never)) });
    await db.communicationMailboxConnection.createMany({ data: [connectionA, connectionB].map((id, i) => ({ id, ownerUserId: ownerId, mailboxAddress: `owner${i}@example.invalid`, provider: 'MICROSOFT_GRAPH', status: 'CONNECTED', verifiedAt: new Date(), readCapability: true, sendCapability: true, secretReference: `ref-${i}` })) });
    await store.put('ref-0', { kind: 'OAUTH2', accessToken: 'access-token', refreshToken: 'refresh-token' }); await store.put('ref-1', { kind: 'OAUTH2', accessToken: 'access-token', refreshToken: 'refresh-token' });
  });
  afterAll(async () => { setMailboxProviderForTest('MICROSOFT_GRAPH', null); await db.mailboxAuditEvent.deleteMany({ where: { actorUserId: { in: [ownerId, colleagueId, otherId] } } }); await db.communication.deleteMany({ where: { createdById: ownerId } }); await db.communicationMailboxConnection.deleteMany({ where: { id: { in: [connectionA, connectionB] } } }); await db.user.deleteMany({ where: { id: { in: [ownerId, colleagueId, otherId] } } }); await db.$disconnect(); });
  it('keeps mailbox ownership authoritative and preserves legacy communication rows', async () => {
    await expect(ownedMailbox(connectionA, ownerId)).resolves.toMatchObject({ id: connectionA });
    await expect(ownedMailbox(connectionA, colleagueId)).rejects.toMatchObject({ code: 'MAILBOX_NOT_FOUND' });
    await db.communication.create({ data: { type: 'EMAIL', subject: 'legacy', createdById: ownerId } });
    expect(await db.communication.count({ where: { createdById: ownerId, mailboxConnectionId: null } })).toBe(1);
  });
  it('normalizes inbound communication, attachment metadata and per-connection dedupe', async () => {
    await syncMailbox(connectionA, ownerId, store); await syncMailbox(connectionA, ownerId, store); await syncMailbox(connectionB, ownerId, store);
    expect(await db.communication.count({ where: { mailboxConnectionId: connectionA, mailboxProviderMessageId: 'shared-message' } })).toBe(1);
    expect(await db.communication.count({ where: { mailboxProviderMessageId: 'shared-message' } })).toBe(2);
    const row = await db.communication.findFirstOrThrow({ where: { mailboxConnectionId: connectionA } }); expect(row).toMatchObject({ type: 'EMAIL', direction: 'INBOUND', source: 'MAILBOX', caseId: null, clientId: null });
    expect(await db.communicationAttachment.findFirst({ where: { communicationId: row.id, providerAttachmentId: 'a1' } })).toMatchObject({ fileName: 'safe.pdf', sizeBytes: 12 });
  });
  it('persists outbound only after provider confirmation and rejects revoked connections', async () => {
    await expect(sendMailboxMessage({ id: connectionA, ownerUserId: ownerId, to: [{ email: 'to@example.invalid' }], subject: 'reply', bodyText: 'text' }, store)).resolves.toMatchObject({ direction: 'OUTBOUND' });
    failSend = true; const before = await db.communication.count({ where: { mailboxConnectionId: connectionA, mailboxProviderMessageId: 'sent-message-failed' } }); await expect(sendMailboxMessage({ id: connectionA, ownerUserId: ownerId, to: [{ email: 'to@example.invalid' }], subject: 'fail', bodyText: 'text' }, store)).rejects.toThrow(); expect(await db.communication.count({ where: { mailboxConnectionId: connectionA, mailboxProviderMessageId: 'sent-message-failed' } })).toBe(before); failSend = false;
    await db.communicationMailboxConnection.update({ where: { id: connectionB }, data: { status: 'REVOKED', readCapability: false, sendCapability: false } }); await expect(syncMailbox(connectionB, ownerId, store)).rejects.toMatchObject({ code: 'MAILBOX_REVOKED' });
  });
  it('writes only safe audit metadata', async () => {
    const events = await db.mailboxAuditEvent.findMany({ where: { mailboxConnectionId: connectionA } }); expect(events.map((e) => e.eventType)).toEqual(expect.arrayContaining(['MAILBOX_SYNC_STARTED', 'MAILBOX_SYNC_SUCCEEDED', 'MAILBOX_SEND_SUCCEEDED']));
    expect(JSON.stringify(events)).not.toMatch(/access-token|refresh-token|body must not reach audit|password/i);
  });
});
