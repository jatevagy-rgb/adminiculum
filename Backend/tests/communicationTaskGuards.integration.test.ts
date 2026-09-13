/**
 * A4 — Communication → canonical task creation guards (PostgreSQL).
 *
 * Proves the single canonical path (createCanonicalTaskFromCommunication →
 * resolveTaskPlanning → createTask) persists planning fields and enforces
 * case/client/authorization boundaries. Roles never grant case access.
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createCanonicalTaskFromCommunication } from '../src/modules/tasks/services';

const databaseUrl = process.env.COMMUNICATION_TASK_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('communication → canonical task guards (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const ids = {
    admin: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    reviewer: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    outsider: crypto.randomUUID(),
    clientA: crypto.randomUUID(),
    clientB: crypto.randomUUID(),
    caseA: crypto.randomUUID(),
    caseB: crypto.randomUUID(),
    commLinked: crypto.randomUUID(),
    commOther: crypto.randomUUID(),
    definition: crypto.randomUUID(),
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `ct-admin-${suffix}@test.invalid`, name: 'CT Admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: ids.lawyer, email: `ct-lawyer-${suffix}@test.invalid`, name: 'CT Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.reviewer, email: `ct-reviewer-${suffix}@test.invalid`, name: 'CT Reviewer', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.collaborator, email: `ct-collab-${suffix}@test.invalid`, name: 'CT Collaborator', role: 'COLLAB_LAWYER', status: 'ACTIVE' },
      { id: ids.outsider, email: `ct-outsider-${suffix}@test.invalid`, name: 'CT Outsider', role: 'LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.createMany({ data: [
      { id: ids.clientA, name: `CT Client A ${suffix}` },
      { id: ids.clientB, name: `CT Client B ${suffix}` },
    ] as never });
    await db.case.createMany({ data: [
      { id: ids.caseA, caseNumber: `CTA-${suffix}`, title: 'Case A', caseType: 'OTHER', clientId: ids.clientA, createdById: ids.admin, assignedLawyerId: ids.lawyer },
      { id: ids.caseB, caseNumber: `CTB-${suffix}`, title: 'Case B', caseType: 'OTHER', clientId: ids.clientB, createdById: ids.admin, assignedLawyerId: ids.lawyer },
    ] as never });
    await db.caseCollaborator.createMany({ data: [
      { id: crypto.randomUUID(), caseId: ids.caseA, userId: ids.reviewer, role: 'REVIEWER' },
      { id: crypto.randomUUID(), caseId: ids.caseA, userId: ids.collaborator, role: 'ASSISTANT' },
    ] as never });
    await db.communication.createMany({ data: [
      { id: ids.commLinked, type: 'EMAIL', subject: 'Linked comm', caseId: ids.caseA, clientId: ids.clientA, createdById: ids.admin, content: 'hello' },
      { id: ids.commOther, type: 'EMAIL', subject: 'Other comm', caseId: ids.caseB, clientId: ids.clientB, createdById: ids.admin, content: 'hello' },
    ] as never });
    await db.taskDefinition.create({ data: {
      id: ids.definition, clientId: ids.clientA, label: 'CT approval type', defaultAttentionCategory: 'APPROVAL', status: 'ACTIVE', createdById: ids.admin,
    } as never });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('persists sourceCommunicationId + planning fields on the same case', async () => {
    const result = await createCanonicalTaskFromCommunication(ids.commLined, ids.lawyer, 'LAWYER', {
      title: 'Canonical task from communication',
      caseId: ids.caseA,
      taskDefinitionId: ids.definition,
      plannedReviewerId: ids.reviewer,
      collaboratorUserIds: [ids.collaborator],
      estimatedMinutes: 25,
      attentionCategory: 'EDITING',
      priority: 'HIGH',
    });
    const taskId = result.task.id;
    expect(result.task.sourceCommunicationId).toBe(ids.commLinked);

    const persisted = await db.task.findUnique({ where: { id: taskId } });
    expect(persisted?.sourceCommunicationId).toBe(ids.commLinked);
    expect(persisted?.caseId).toBe(ids.caseA);
    expect((persisted as never as { taskDefinitionId: string }).taskDefinitionId).toBe(ids.definition);
    expect((persisted as never as { plannedReviewerId: string }).plannedReviewerId).toBe(ids.reviewer);
    expect((persisted as never as { estimatedMinutes: number }).estimatedMinutes).toBe(25);
    expect((persisted as never as { attentionCategory: string }).attentionCategory).toBe('EDITING');
    expect((persisted as never as { priority: string }).priority).toBe('HIGH');

    const collaborators = await db.taskCollaborator.findMany({ where: { taskId } });
    expect(collaborators.map((c) => c.userId)).toContain(ids.collaborator);
  });

  it('rejects a case that differs from the communication case', async () => {
    await expect(
      createCanonicalTaskFromCommunication(ids.commLinked, ids.lawyer, 'LAWYER', { title: 'x', caseId: ids.caseB }),
    ).rejects.toMatchObject({ code: 'SOURCE_CASE_MISMATCH' });
  });

  it('rejects a client that differs from the communication client', async () => {
    await expect(
      createCanonicalTaskFromCommunication(ids.commLinked, ids.lawyer, 'LAWYER', { title: 'x', clientId: ids.clientB }),
    ).rejects.toMatchObject({ code: 'SOURCE_CLIENT_MISMATCH' });
  });

  it('rejects an actor without access to the communication case', async () => {
    await expect(
      createCanonicalTaskFromCommunication(ids.commLinked, ids.outsider, 'LAWYER', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_NOT_AUTHORIZED', statusCode: 403 });
  });

  it('does not grant case access via reviewer/collaborator roles', async () => {
    const before = await db.caseCollaborator.count({ where: { caseId: ids.caseA, userId: ids.reviewer } });
    await createCanonicalTaskFromCommunication(ids.commLinked, ids.lawyer, 'LAWYER', {
      title: 'No access grant',
      plannedReviewerId: ids.reviewer,
      collaboratorUserIds: [ids.collaborator],
    });
    const after = await db.caseCollaborator.count({ where: { caseId: ids.caseA, userId: ids.reviewer } });
    expect(after).toBe(before);
  });

  it('does not mutate the communication row', async () => {
    const before = await db.communication.findUnique({ where: { id: ids.commLinked } });
    await createCanonicalTaskFromCommunication(ids.commLinked, ids.lawyer, 'LAWYER', { title: 'Immutability check' });
    const after = await db.communication.findUnique({ where: { id: ids.commLinked } });
    expect(after?.content).toBe(before?.content);
    expect(after?.subject).toBe(before?.subject);
    expect(after?.caseId).toBe(before?.caseId);
    expect(after?.updatedAt?.toISOString()).toBe(before?.updatedAt?.toISOString());
  });

  it('accepts the legacy communication-task request shape', async () => {
    const result = await createCanonicalTaskFromCommunication(ids.commLinked, ids.lawyer, 'LAWYER', {
      title: 'Legacy shape task',
      assigneeId: ids.lawyer,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(result.task.sourceCommunicationId).toBe(ids.commLinked);
  });
});

