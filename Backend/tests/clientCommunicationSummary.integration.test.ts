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

describeWithDatabase('Client communication summary read model (PostgreSQL) — exact case authorization', () => {
  let db: PrismaClient;
  const suiteSuffix = crypto.randomUUID();

  const adminId = crypto.randomUUID();
  const lawyerAId = crypto.randomUUID();
  const lawyerBId = crypto.randomUUID();

  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();

  const caseA1 = crypto.randomUUID();
  const caseA2 = crypto.randomUUID();
  const caseB1 = crypto.randomUUID();

  const caseNumberA1 = `CA-A1-${suiteSuffix}`;
  const caseNumberA2 = `CA-A2-${suiteSuffix}`;
  const caseNumberB1 = `CB-B1-${suiteSuffix}`;

  // client A context matrix
  const cDirectANoCase = crypto.randomUUID(); // clientId A, caseId null
  const cCaseA1 = crypto.randomUUID();        // caseId A1 (readable)
  const cDualA1 = crypto.randomUUID();        // clientId A + caseId A1 (readable)
  const cCaseA2 = crypto.randomUUID();        // caseId A2 (unreadable)
  const cDualA2 = crypto.randomUUID();        // clientId A + caseId A2 (unreadable)
  const cDualCross = crypto.randomUUID();     // clientId A + caseId B1 (client B)
  // client B context
  const cDirectB = crypto.randomUUID();

  const admin: InternalActor = { userId: adminId, role: 'ADMIN' };
  const lawyerA: InternalActor = { userId: lawyerAId, role: 'LAWYER' }; // reads case A1 only
  const lawyerB: InternalActor = { userId: lawyerBId, role: 'LAWYER' }; // reads case B1 only

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await db.user.create({ data: { id: adminId, email: `csum-admin-${suiteSuffix}@example.invalid`, name: 'Admin', role: 'ADMIN' } });
    await db.user.create({ data: { id: lawyerAId, email: `csum-lawyera-${suiteSuffix}@example.invalid`, name: 'Lawyer A', role: 'LAWYER' } });
    await db.user.create({ data: { id: lawyerBId, email: `csum-lawyerb-${suiteSuffix}@example.invalid`, name: 'Lawyer B', role: 'LAWYER' } });

    await db.client.create({ data: { id: clientA, name: `Client A ${suiteSuffix}` } });
    await db.client.create({ data: { id: clientB, name: `Client B ${suiteSuffix}` } });

    await db.case.create({ data: { id: caseA1, caseNumber: caseNumberA1, title: 'Case A1', caseType: 'CONTRACT_REVIEW', clientId: clientA, createdById: adminId, assignedLawyerId: lawyerAId } });
    await db.case.create({ data: { id: caseA2, caseNumber: caseNumberA2, title: 'Case A2', caseType: 'CONTRACT_REVIEW', clientId: clientA, createdById: adminId, assignedLawyerId: adminId } });
    await db.case.create({ data: { id: caseB1, caseNumber: caseNumberB1, title: 'Case B1', caseType: 'CONTRACT_REVIEW', clientId: clientB, createdById: lawyerBId, assignedLawyerId: lawyerBId } });

    // 1) direct client A, no case
    await db.communication.create({ data: { id: cDirectANoCase, type: 'EMAIL', subject: 'Direct A no case', senderName: 'A sender', content: 'Direct A content', clientId: clientA, createdById: adminId, receivedAt: new Date('2026-03-01T09:00:00Z') } });
    // 2) case A1 only
    await db.communication.create({ data: { id: cCaseA1, type: 'EMAIL', subject: 'Case A1', senderName: 'Case A1 sender', content: 'Case A1 content', caseId: caseA1, createdById: adminId, receivedAt: new Date('2026-03-02T09:00:00Z') } });
    // 3) client A + case A1 (dual, readable)
    await db.communication.create({ data: { id: cDualA1, type: 'EMAIL', subject: 'Dual A1', senderName: 'Dual sender', content: 'Dual A1 content', clientId: clientA, caseId: caseA1, createdById: adminId, receivedAt: new Date('2026-03-03T09:00:00Z') } });
    // 4) case A2 only (unreadable by lawyerA)
    await db.communication.create({ data: { id: cCaseA2, type: 'EMAIL', subject: 'Case A2', senderName: 'Case A2 sender', content: 'Case A2 content', caseId: caseA2, createdById: adminId, receivedAt: new Date('2026-03-04T09:00:00Z') } });
    // 5) client A + case A2 (unreadable) -> must be excluded entirely
    await db.communication.create({ data: { id: cDualA2, type: 'EMAIL', subject: 'Dual A2', senderName: 'Dual A2 sender', content: 'Dual A2 content', clientId: clientA, caseId: caseA2, createdById: adminId, receivedAt: new Date('2026-03-05T09:00:00Z') } });
    // 6) client A + case B1 (client B) -> must be excluded entirely; case linkage authoritative
    await db.communication.create({ data: { id: cDualCross, type: 'EMAIL', subject: 'Dual cross', senderName: 'Cross sender', content: 'Dual cross content', clientId: clientA, caseId: caseB1, createdById: adminId, receivedAt: new Date('2026-03-06T09:00:00Z') } });
    // client B (for the non-manager scoping + cross-client test)
    await db.communication.create({ data: { id: cDirectB, type: 'EMAIL', subject: 'Direct B no case', senderName: 'B sender', content: 'Direct B content', clientId: clientB, createdById: lawyerBId, receivedAt: new Date('2026-03-07T09:00:00Z') } });

    // Attachments (leak vectors) on the two included client A items.
    await db.communicationAttachment.create({ data: { id: crypto.randomUUID(), fileName: 'a1.pdf', communicationId: cDirectANoCase, uploadedById: adminId, url: 'https://sharepoint.example/a1', spItemId: 'SP-A1', providerAttachmentId: 'ATT-A1' } });
    await db.communicationAttachment.create({ data: { id: crypto.randomUUID(), fileName: 'a2.pdf', communicationId: cCaseA1, uploadedById: adminId, url: 'https://sharepoint.example/a2', spItemId: 'SP-A2', providerAttachmentId: 'ATT-A2' } });
    // A task linked to the readable case A1 communication.
    await db.task.create({ data: { id: crypto.randomUUID(), title: 'Follow up A1', taskType: 'REVIEW_CONTRACT', caseId: caseA1, sourceCommunicationId: cCaseA1, status: 'PENDING' } });
  });

  afterAll(async () => {
    await db.task.deleteMany({ where: { OR: [{ caseId: caseA1 }, { caseId: caseA2 }, { caseId: caseB1 }] } });
    await db.communication.deleteMany({ where: { id: { in: [cDirectANoCase, cCaseA1, cDualA1, cCaseA2, cDualA2, cDualCross, cDirectB] } } });
    await db.case.deleteMany({ where: { id: { in: [caseA1, caseA2, caseB1] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerAId, lawyerBId] } } });
    await db.$disconnect();
  });

  it('NON-MANAGER: direct client (no case), readable case, readable dual-link are included', async () => {
    const result = await listClientCommunicationSummary(lawyerA, clientA, { limit: 50 }, db);
    const ids = result.communications.map((i) => i.id);
    expect(ids).toContain(cDirectANoCase);
    expect(ids).toContain(cCaseA1);
  });

  it('NON-MANAGER: readable dual-link returned exactly once', async () => {
    const result = await listClientCommunicationSummary(lawyerA, clientA, { limit: 50 }, db);
    expect(result.communications.filter((i) => i.id === cDualA1)).toHaveLength(1);
  });

  it('NON-MANAGER: unreadable case, unreadable dual-link and cross-client dual-link are excluded ENTIRELY', async () => {
    const result = await listClientCommunicationSummary(lawyerA, clientA, { limit: 50 }, db);
    const ids = result.communications.map((i) => i.id);
    expect(ids).not.toContain(cCaseA2);
    expect(ids).not.toContain(cDualA2);
    expect(ids).not.toContain(cDualCross);

    // No content/subject/preview of the excluded items is leaked.
    const subjects = result.communications.map((i) => i.subject);
    expect(subjects).not.toContain('Case A2');
    expect(subjects).not.toContain('Dual A2');
    expect(subjects).not.toContain('Dual cross');

    // No case number/title/id of the excluded cases is leaked.
    const caseNumbers = result.communications.map((i) => i.caseNumber).filter(Boolean as (v: string | null) => boolean);
    expect(caseNumbers).not.toContain(caseNumberA2);
    expect(caseNumbers).not.toContain(caseNumberB1);
    const caseIds = result.communications.map((i) => i.caseId).filter(Boolean as (v: string | null) => boolean);
    expect(caseIds).not.toContain(caseA2);
    expect(caseIds).not.toContain(caseB1);
  });

  it('NON-MANAGER: readable case label is present; direct client communication is case-agnostic', async () => {
    const result = await listClientCommunicationSummary(lawyerA, clientA, { limit: 50 }, db);
    const byId = new Map(result.communications.map((i) => [i.id, i]));
    expect(byId.get(cCaseA1)?.caseId).toBe(caseA1);
    expect(byId.get(cCaseA1)?.caseNumber).toBe(caseNumberA1);
    expect(byId.get(cDualA1)?.caseId).toBe(caseA1);
    expect(byId.get(cDirectANoCase)?.caseId).toBe(null);
    expect(byId.get(cDirectANoCase)?.caseNumber).toBe(null);
  });

  it('MANAGER: receives the full legitimate target-client context, cross-client dual-link still excluded', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    const ids = result.communications.map((i) => i.id);
    // Full client A context.
    expect(ids).toEqual([cDirectANoCase, cCaseA1, cDualA1, cCaseA2, cDualA2].sort());
    // Cross-client dual-link is still excluded (case linkage authoritative).
    expect(ids).not.toContain(cDualCross);
    expect(ids).not.toContain(cDirectB);
    const caseNumbers = result.communications.map((i) => i.caseNumber).filter(Boolean as (v: string | null) => boolean);
    expect(caseNumbers).not.toContain(caseNumberB1);
  });

  it('enforces the bounded limit', async () => {
    const result = await listClientCommunicationSummary(lawyerA, clientA, { limit: 2 }, db);
    expect(result.communications).toHaveLength(2);
  });

  it('sorts deterministically by real timestamp descending', async () => {
    const result = await listClientCommunicationSummary(lawyerA, clientA, { limit: 50 }, db);
    // Included: Direct A no case (3-01), Case A1 (3-02), Dual A1 (3-03) => desc.
    const ordered = result.communications.map((i) => i.subject);
    expect(ordered).toEqual(['Dual A1', 'Case A1', 'Direct A no case']);
  });

  it('exposes only safe summary fields (no provider/storage/graph/sync identifiers)', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    for (const item of result.communications) {
      for (const key of ['providerConversationId', 'spItemId', 'url', 'syncStatus', 'externalMessageId', 'metadata']) {
        expect(Object.prototype.hasOwnProperty.call(item, key)).toBe(false);
      }
    }
  });

  it('reports real attachment and task relation counts', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 50 }, db);
    const byId = new Map(result.communications.map((i) => [i.id, i]));
    expect(byId.get(cDirectANoCase)?.attachmentCount).toBe(1);
    expect(byId.get(cCaseA1)?.attachmentCount).toBe(1);
    expect(byId.get(cCaseA1)?.taskCount).toBe(1);
  });

  it('fails closed on a cross-client request for a non-privileged actor', async () => {
    // lawyerB has case access only on caseB1 (client B); requesting client A must fail closed.
    const failure = await expectApiError(listClientCommunicationSummary(lawyerB, clientA, { limit: 50 }, db));
    expect(failure.status).toBe(403);
    expect(failure.code).toBe('CLIENT_ACCESS_FORBIDDEN');
  });

  it('scopes a non-privileged actor to the client they can access', async () => {
    const result = await listClientCommunicationSummary(lawyerB, clientB, { limit: 50 }, db);
    const ids = result.communications.map((i) => i.id);
    expect(ids).toContain(cDirectB);
    expect(ids).not.toContain(cDirectANoCase);
    expect(ids).not.toContain(cCaseA1);
  });

  it('returns the (authorized) client identity', async () => {
    const result = await listClientCommunicationSummary(admin, clientA, { limit: 5 }, db);
    expect(result.client.id).toBe(clientA);
    expect(result.client.name).toMatch(/^Client A /);
  });
});
