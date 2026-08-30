import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { listClientCommunicationSummary } from '../src/modules/communications/clientSummary.service';

const databaseUrl = process.env.CLIENT_COMMUNICATION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('client communication summary read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const directA = crypto.randomUUID();
  const linkedA = crypto.randomUUID();
  const dualA = crypto.randomUUID();
  const mismatch = crypto.randomUUID();
  const unreadableCaseLink = crypto.randomUUID();
  const tieA = crypto.randomUUID();
  const tieB = crypto.randomUUID();

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: adminId, email: `summary-admin-${suffix}@example.invalid`, name: 'Summary admin', role: 'ADMIN' },
        { id: lawyerId, email: `summary-lawyer-${suffix}@example.invalid`, name: 'Summary lawyer', role: 'LAWYER' },
      ],
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `Summary client A ${suffix}` },
        { id: clientB, name: `Summary client B ${suffix}` },
      ],
    });
    await db.case.createMany({
      data: [
        { id: caseA, caseNumber: `SUMMARY-A-${suffix}`, title: 'Readable case', caseType: 'OTHER', clientId: clientA, createdById: lawyerId, assignedLawyerId: lawyerId },
        { id: caseB, caseNumber: `SUMMARY-B-${suffix}`, title: 'Other client case', caseType: 'OTHER', clientId: clientB, createdById: adminId, assignedLawyerId: adminId },
      ],
    });
    await db.communication.createMany({
      data: [
        { id: directA, type: 'EMAIL', subject: 'Direct client', clientId: clientA, createdById: lawyerId, receivedAt: new Date('2026-01-01T09:00:00Z') },
        { id: linkedA, type: 'EMAIL', subject: 'Case linked', caseId: caseA, createdById: lawyerId, receivedAt: new Date('2026-01-02T09:00:00Z') },
        { id: dualA, type: 'EMAIL', subject: 'Matching dual link', clientId: clientA, caseId: caseA, createdById: lawyerId, receivedAt: new Date('2026-01-03T09:00:00Z') },
        { id: mismatch, type: 'EMAIL', subject: 'Mismatched dual link', clientId: clientB, caseId: caseA, createdById: lawyerId, receivedAt: new Date('2026-01-04T09:00:00Z') },
        { id: unreadableCaseLink, type: 'EMAIL', subject: 'Unreadable case link', clientId: clientA, caseId: caseB, createdById: lawyerId, receivedAt: new Date('2026-01-05T09:00:00Z') },
        { id: tieA, type: 'EMAIL', subject: 'Tie A', clientId: clientA, createdById: lawyerId, receivedAt: new Date('2026-01-06T09:00:00Z'), providerConversationId: 'provider-tie-a', mailboxAddress: 'internal@example.invalid' },
        { id: tieB, type: 'EMAIL', subject: 'Tie B', clientId: clientA, createdById: lawyerId, receivedAt: new Date('2026-01-06T09:00:00Z') },
      ],
    });
    await db.communicationAttachment.create({
      data: {
        id: crypto.randomUUID(),
        fileName: 'summary.pdf',
        communicationId: linkedA,
        uploadedById: adminId,
        url: 'https://internal.invalid/summary.pdf',
      },
    });
    await db.task.create({
      data: {
        id: crypto.randomUUID(),
        title: 'Follow up summary',
        taskType: 'REVIEW_CONTRACT',
        status: 'PENDING',
        caseId: caseA,
        sourceCommunicationId: linkedA,
      },
    });
  });

  afterAll(async () => {
    await db.task.deleteMany({ where: { sourceCommunicationId: linkedA } });
    await db.communicationAttachment.deleteMany({ where: { communicationId: linkedA } });
    await db.communication.deleteMany({ where: { id: { in: [directA, linkedA, dualA, mismatch, unreadableCaseLink, tieA, tieB] } } });
    await db.case.deleteMany({ where: { id: { in: [caseA, caseB] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.$disconnect();
  });

  it('returns truthful client and authorized case context while failing closed on mismatched dual links', async () => {
    const result = await listClientCommunicationSummary({ userId: lawyerId, role: 'LAWYER' }, clientA, { limit: 20 }, db);
    const bySubject = new Map(result.communications.map((item) => [item.subject, item]));

    expect(bySubject.get('Direct client')?.clientId).toBe(clientA);
    expect(bySubject.get('Case linked')?.caseNumber).toContain('SUMMARY-A-');
    expect(bySubject.get('Matching dual link')?.caseId).toBe(caseA);
    expect(bySubject.has('Mismatched dual link')).toBe(false);
    expect(bySubject.has('Unreadable case link')).toBe(false);
    expect(result.communications).toHaveLength(5);
    expect(bySubject.get('Case linked')?.attachmentCount).toBe(1);
    expect(bySubject.get('Case linked')?.taskCount).toBe(1);
    for (const item of result.communications) {
      expect(item).not.toHaveProperty('providerConversationId');
      expect(item).not.toHaveProperty('mailboxAddress');
    }
    const second = await listClientCommunicationSummary({ userId: lawyerId, role: 'LAWYER' }, clientA, { limit: 20 }, db);
    expect(result.communications.map((item) => item.id)).toEqual(second.communications.map((item) => item.id));
    const tieIds = result.communications
      .filter((item) => item.subject === 'Tie A' || item.subject === 'Tie B')
      .map((item) => item.id);
    expect(tieIds).toHaveLength(2);
  });
});
