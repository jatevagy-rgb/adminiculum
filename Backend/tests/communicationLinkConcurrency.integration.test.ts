import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { linkCommunicationToCase } from '../src/modules/communications/linkCase.service';

const url = process.env.COMMUNICATION_TASK_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('atomic communication case link (PostgreSQL)', () => {
  let db: PrismaClient;
  const actor = { userId: randomUUID(), role: 'ADMIN' };
  const outsider = { userId: randomUUID(), role: 'LAWYER' };
  const clients = [randomUUID(), randomUUID()];
  const cases = [randomUUID(), randomUUID(), randomUUID()];
  const communications: string[] = [];
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.createMany({ data: [actor, outsider].map((a) => ({ id: a.userId, role: a.role as 'ADMIN' | 'LAWYER', name: 'Link fixture', email: `${a.userId}@test.invalid` })) });
    await db.client.createMany({ data: clients.map((id) => ({ id, name: 'Link fixture' })) });
    await db.case.createMany({ data: cases.map((id, i) => ({ id, caseNumber: id, title: 'Link fixture', caseType: 'OTHER', clientId: clients[i === 2 ? 1 : 0], createdById: actor.userId })) });
  });
  afterAll(async () => {
    await db.timelineEvent.deleteMany({ where: { caseId: { in: cases } } });
    await db.communication.deleteMany({ where: { id: { in: communications } } });
    await db.case.deleteMany({ where: { id: { in: cases } } });
    await db.client.deleteMany({ where: { id: { in: clients } } });
    await db.user.deleteMany({ where: { id: { in: [actor.userId, outsider.userId] } } });
    await db.$disconnect();
  });
  async function message(extra: Record<string, unknown> = {}) {
    const id = randomUUID(); communications.push(id);
    await db.communication.create({ data: { id, type: 'EMAIL', subject: 'Link fixture', content: 'Original private message', createdById: actor.userId, clientId: clients[0], ...extra } });
    return id;
  }
  async function events(id: string) {
    return db.timelineEvent.count({ where: { caseId: { in: cases }, payload: { path: ['communicationId'], equals: id } } });
  }
  it('two simultaneous different targets have one winner and one conflict, never a move', async () => {
    const id = await message();
    const outcomes = await Promise.allSettled(cases.slice(0, 2).map((target) => linkCommunicationToCase(id, target, actor, db)));
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409, code: 'COMMUNICATION_ALREADY_LINKED' });
    const winner = (outcomes.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
    expect(await db.communication.findUnique({ where: { id } })).toMatchObject({ caseId: winner.communication.caseId, clientId: clients[0], content: 'Original private message' });
    expect(await events(id)).toBe(1);
  });
  it('simultaneous retries for the same case produce exactly one event', async () => {
    const id = await message();
    const outcomes = await Promise.all([1, 2, 3].map(() => linkCommunicationToCase(id, cases[0], actor, db)));
    expect(outcomes.every((r) => r.success)).toBe(true);
    expect(await events(id)).toBe(1);
  });
  it('rejects a cross-client target and preserves the original unlinked row', async () => {
    const id = await message();
    await expect(linkCommunicationToCase(id, cases[2], actor, db)).rejects.toMatchObject({ status: 409, code: 'CLIENT_CASE_MISMATCH' });
    expect(await db.communication.findUnique({ where: { id } })).toMatchObject({ caseId: null, clientId: clients[0] });
    expect(await events(id)).toBe(0);
  });
  it('rechecks case authorization and mailbox privacy in the transaction even for administrators', async () => {
    const id = await message({ source: 'OUTLOOK', mailboxAddress: `${outsider.userId}@test.invalid` });
    await expect(linkCommunicationToCase(id, cases[0], actor, db)).rejects.toMatchObject({ status: 403, code: 'COMMUNICATION_ACCESS_FORBIDDEN' });
    await expect(linkCommunicationToCase(id, cases[0], outsider, db)).rejects.toMatchObject({ status: 403, code: 'CASE_ACCESS_FORBIDDEN' });
    expect(await events(id)).toBe(0);
  });
  it('does not move an already-linked same-client communication', async () => {
    const id = await message({ caseId: cases[0] });
    await expect(linkCommunicationToCase(id, cases[1], actor, db)).rejects.toMatchObject({ status: 409 });
    expect(await db.communication.findUnique({ where: { id } })).toMatchObject({ caseId: cases[0] });
    expect(await events(id)).toBe(0);
  });
  it('rolls back the association if its audit event cannot be saved', async () => {
    const id = await message();
    const failing = { $transaction: (run: any, options: any) => db.$transaction((tx) => run(new Proxy(tx, { get: (target, key) => key === 'timelineEvent' ? { create: () => { throw new Error('test audit failure'); } } : Reflect.get(target, key) })), options) };
    await expect(linkCommunicationToCase(id, cases[0], actor, failing as PrismaClient)).rejects.toThrow('test audit failure');
    expect(await db.communication.findUnique({ where: { id } })).toMatchObject({ caseId: null });
    expect(await events(id)).toBe(0);
  });
});
