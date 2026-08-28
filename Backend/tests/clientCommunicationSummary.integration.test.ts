import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { listClientCommunicationSummary } from '../src/modules/communications/clientSummary.service';
import type { InternalActor } from '../src/modules/client-interaction/base';

const databaseUrl = process.env.CLIENT_COMMUNICATION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

async function expectApiError(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    const err = error as { status?: number; code?: string };
    return { status: Number(err.status || 0), code: String(err.code || '') };
  }
  throw new Error('Expected the call to reject, but it resolved.');
}

describeWithDatabase('Client communication summary read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suiteSuffix = crypto.randomUUID();

  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  let clientA = crypto.randomUUID();
  let clientB = crypto.randomUUID();
  let caseA = crypto.randomUUID();
  let caseB = crypto.randomUUID();

  const cDirectA = crypto.randomUUID();
  const cCaseA = crypto.randomUUID();
  const cBothA = crypto.randomUUID();
  const cDirectB = crypto.randomUUID();
  const cCaseB = crypto.randomUUID();
  const cOrphan = crypto.randomUUID();

  const admin: InternalActor = { userId: adminId, role: 'ADMIN' };
  const lawyerOnB: InternalActor = { userId: lawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await db.user.create({ data: { id: adminId, email: `commsum-admin-${suiteSuffix}@example.invalid`, name: 'Admin', role: 'ADMIN' } });
    await db.user.create({ data: { id: lawyerId, email: `commsum-lawyer-${suiteSuffix}@example.invalid`, name: 'Lawyer B', role: 'LAWYER' } });

    await db.client.create({ data: { id: clientA, name: `Client A ${suiteSuffix}` } });
    await db.client.create({ data: { id: clientB, name: `Client B ${suiteSuffix}` } });

    await db.case.create({ data: { id: caseA, caseNumber: `CA-${suiteSuffix}`, title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: clientA, createdById: adminId, assignedLawyerId: adminId } });
    await db.case.create({ data: { id: caseB, caseNumber: `CB-${suiteSuffix}`, title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId: clientB, createdById: lawyerId, assignedLawyerId: lawyerId } });

    const t1 = new Date('2026-03-01T09:00:00Z');
    const t2 = new Date('2026-03-02T09:00:00Z');
    const t3 = new Date('2026-03-03T09:00:00Z');
    const t4 = new Date('2026-03-04T09:00:00Z');
    const t5 = new Date('2026-03-05T09:00:00Z');
    const t6 = new Date('2026-03-06T09:00:00Z');

    await db.communication.create({ data: { id: cDirectA, type: 'EMAIL', subject: 'Direct A', senderName: 'A sender', content: 'Direct A content', clientId: clientA, createdById: adminId, receivedAt: t1 } });
    await db.communication.create({ data: { id: cCaseA, type: 'EMAIL', subject: 'Case A', senderName: 'Case A sender', content: 'Case A content', caseId: caseA, createdById: adminId, receivedAt: t2 } });
    await db.communication.create({ data: { id: cBothA, type: 'EMAIL', subject: 'Both A', senderName: 'Both sender', content: 'Both content', clientId: clientA, caseId: caseA, createdById: adminId, receivedAt: t3 } });
    await db.communication.create({ data: { id: cDirectB, type: 'EMAIL', subject: 'Direct B', senderName: 'B sender', content: 'Direct B content', clientId: clientB, createdById: lawyerId, receivedAt: t4 } });
    await db.communication.create({ data: { id: cCaseB, type: 'EMAIL', subject: 'Case B', senderName: 'Case B sender', content: 'Case B content', caseId: caseB, createdById: lawyerId, receivedAt: t5 } });
    // Orphan: no client, no case — must never show up in a client summary.
    await db.communication.create({ data: { id: cOrphan, type: 'EMAIL', subject: 'Orphan', content: 'Orphan content', createdById: adminId, receivedAt: t6 } });

    // Attachments on the two client-A communications (leak vectors: spItemId/url/providerAttachmentId).
    await db.communicationAttachment.create({ data: { id: crypto.randomUUID(), fileName: 'a1.pdf', communicationId: cDirectA, uploadedById: adminId, url: 'https://sharepoint.example/a1', spItemId: 'SP-A1', providerAttachmentId: 'ATT-A1' } });
    await db.communicationAttachment.create({ data: { id: crypto.randomUUID(), fileName: 'a2.pdf', communicationId: cCaseA, uploadedById: adminId, url: 'https://sharepoint.example/a2', spItemId: 'SP-A2', providerAttachmentId: 'ATT-A2' } });

    // A task linked to the case-linked client-A communication.
    await db.task.create({ data: { id: crypto.randomUUID(), title: 'Follow up A', taskType: 'REVIEW_CONTRACT', caseId: caseA, sourceCommunicationId: cCaseA, status: 'PENDING' } });
  });

  afterAll(async () => {
    await db.task.deleteMany({ where: { OR: [{ caseId: caseA }, { caseId: caseB }] } });
    await db.communication.deleteMany({ where: { id: { in: [cDirectA, cCaseA, cBothA, cDirectB, cCaseB, cOrphan] } } });
    await db.case.deleteMany({ where: { id: { in: [caseA, caseB] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.$disconnect();
  });

  it('includes direct client, case-linked, and deduplicates both (once each)', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);

    const ids = result.communications.map((item) => item.id).sort();
    expect(ids).toEqual([cBothA, cCaseA, cDirectA].sort());

    // cBothA matches direct + case but is returned exactly once.
    expect(result.communications.filter((item) => item.id === cBothA)).toHaveLength(1);

    const subjectById = new Map(result.communications.map((item) => [item.id, item.subject]));
    expect(subjectById.get(cDirectA)).toBe('Direct A');
    expect(subjectById.get(cCaseA)).toBe('Case A');
    expect(subjectById.get(cBothA)).toBe('Both A');
  });

  it('excludes unrelated client, unrelated case and orphan communication', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    const ids = result.communications.map((item) => item.id);
    expect(ids).not.toContain(cDirectB);
    expect(ids).not.toContain(cCaseB);
    expect(ids).not.toContain(cOrphan);
  });

  it('enforces the bounded limit', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 2 }, db);
    expect(result.communications).toHaveLength(2);
  });

  it('sorts deterministically by real timestamp descending (tie-break by createdAt/id)', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    const ordered = result.communications.map((item) => item.subject);
    // receivedAt: Direct A (t1) < Case A (t2) < Both A (t3); desc => [Both A, Case A, Direct A].
    expect(ordered).toEqual(['Both A', 'Case A', 'Direct A']);
  });

  it('exposes safe summary-only DTO (no provider/storage/graph identifiers)', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    for (const item of result.communications) {
      expect(Object.prototype.hasOwnProperty.call(item, 'providerConversationId')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'spItemId')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'url')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'syncStatus')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'externalMessageId')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'metadata')).toBe(false);
    }
  });

  it('reports real attachment and task relation counts', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    const byId = new Map(result.communications.map((item) => [item.id, item]));
    expect(byId.get(cDirectA)?.attachmentCount).toBe(1);
    expect(byId.get(cCaseA)?.attachmentCount).toBe(1);
    expect(byId.get(cCaseA)?.taskCount).toBe(1);
  });

  it('fails closed on cross-client request for a non-privileged actor', async () => {
    // lawyer has case access only on caseB (client B); requesting client A must fail closed.
    const failure = await expectApiError(listClientCommunicationSummary(lawyerOnB, clientA, { limit: 50 }, db));
    expect(failure.status).toBe(403);
    expect(failure.code).toBe('CLIENT_ACCESS_FORBIDDEN');
  });

  it('scopes a non-privileged actor to the client they can access', async () => {
    const result = await listClientCommunicationSummary(lawyerOnB, clientB, { limit: 50 }, db);
    const ids = result.communications.map((item) => item.id).sort();
    expect(ids).toEqual([cDirectB, cCaseB].sort());
    expect(ids).not.toContain(cDirectA);
    expect(ids).not.toContain(cCaseA);
  });

  it('does not leak a client-owned case label outside the authorized scope', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    const byId = new Map(result.communications.map((item) => [item.id, item]));
    // cCaseA is linked to the client's own case -> case label present.
    expect(byId.get(cCaseA)?.caseId).toBe(caseA);
    expect(byId.get(cCaseA)?.caseNumber).toMatch(/^CA-/);
    // Direct client communication with no client-owned case -> no case label.
    expect(byId.get(cDirectA)?.caseId).toBe(null);
    expect(byId.get(cDirectA)?.caseNumber).toBe(null);
  });

  it('returns the (authorized) client identity', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 5 }, db);
    expect(result.client.id).toBe(clientA);
    expect(result.client.name).toMatch(/^Client A /);
  });
});
