/**
 * TASK PLANNING — catalogue + work roles integration tests (PostgreSQL).
 *
 * Contract under test:
 *  1. Legacy task creation is untouched (no catalogue/roles required).
 *  2. Free label is snapshotted on the task without creating a catalogue entry.
 *  3. Catalogue pick snapshots the label; later catalogue edits do NOT rewrite
 *     the historical task label.
 *  4. Archive (not delete): archived definitions are rejected for new work,
 *     existing tasks keep working.
 *  5. Estimate precedence: explicit > definition default > attention band > none.
 *  6. Work roles: planned reviewer ≠ worker; collaborator ≠ worker/reviewer;
 *     neither role grants case access (target must already have it).
 *  7. Reusable save is explicit (saveToCatalogue).
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  archiveTaskDefinition,
  assertTaskPlanningRolesEligible,
  createTaskDefinition,
  listTaskDefinitions,
  resolveTaskPlanning,
  updateTaskDefinition,
} from '../src/modules/tasks/taskPlanning';
import { createTask, updateTaskDetails } from '../src/modules/tasks/services';

const databaseUrl = process.env.TASK_PLANNING_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL || process.env.DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Task planning — catalogue + work roles (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const partner = { userId: crypto.randomUUID(), role: 'PARTNER' };
  const lawyer = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const outsider = { userId: crypto.randomUUID(), role: 'LAWYER' };
  const clientA = crypto.randomUUID();
  const caseA = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: admin.userId, email: `tp-admin-${suffix}@test.invalid`, name: 'TP Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: partner.userId, email: `tp-partner-${suffix}@test.invalid`, name: 'TP Partner', role: 'PARTNER', status: 'ACTIVE' },
        { id: lawyer.userId, email: `tp-lawyer-${suffix}@test.invalid`, name: 'TP Lawyer', role: 'LAWYER', status: 'ACTIVE' },
        { id: outsider.userId, email: `tp-outsider-${suffix}@test.invalid`, name: 'TP Outsider', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });
    await db.client.create({ data: { id: clientA, name: `TP Client ${suffix}` } });
    await db.case.create({
      data: {
        id: caseA,
        caseNumber: `TP-${suffix}`,
        title: 'Planning case',
        caseType: 'OTHER',
        clientId: clientA,
        createdById: admin.userId,
        assignedLawyerId: lawyer.userId,
      } as any,
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('1. legacy creation untouched: task persists with no catalogue fields', async () => {
    const task = await createTask({
      caseId: caseA,
      title: 'Legacy plain task',
      taskType: 'OTHER',
      assignedBy: admin.userId,
      assignedTo: lawyer.userId,
    }, db);
    expect(task.id).toBeDefined();
    expect(task.taskDefinitionId).toBeNull();
    expect(task.taskTypeLabelSnapshot).toBeNull();
    expect(task.plannedReviewerId).toBeNull();
  });

  it('2. free label snapshots without creating a catalogue entry', async () => {
    const resolved = await resolveTaskPlanning({ taskTypeLabel: 'Egyedi címke' }, admin, db);
    expect(resolved.taskDefinitionId).toBeNull();
    expect(resolved.taskTypeLabelSnapshot).toBe('Egyedi címke');
    const task = await createTask({
      caseId: caseA,
      title: 'Free label task',
      taskType: 'OTHER',
      assignedBy: admin.userId,
      taskDefinitionId: resolved.taskDefinitionId,
      taskTypeLabelSnapshot: resolved.taskTypeLabelSnapshot,
    }, db);
    expect(task.taskTypeLabelSnapshot).toBe('Egyedi címke');
    const defs = await listTaskDefinitions(admin, {}, db);
    expect(defs.some((d) => d.label === 'Egyedi címke')).toBe(false);
  });

  it('3 & 4. catalogue edit does not rewrite task label; archive rejects new use', async () => {
    const def = await createTaskDefinition(admin, { label: 'Szerződés review', defaultEstimatedMinutes: 45 }, db);
    const resolved = await resolveTaskPlanning({ taskDefinitionId: def.id }, admin, db);
    const task = await createTask({
      caseId: caseA,
      title: 'Catalogue task',
      taskType: 'REVIEW_CONTRACT',
      assignedBy: admin.userId,
      taskDefinitionId: resolved.taskDefinitionId,
      taskTypeLabelSnapshot: resolved.taskTypeLabelSnapshot,
      estimatedMinutes: resolved.estimatedMinutes,
    }, db);
    expect(task.taskTypeLabelSnapshot).toBe('Szerződés review');
    expect(task.estimatedMinutes).toBe(45);

    // Edit the catalogue entry — historical task keeps its snapshot.
    await updateTaskDefinition(admin, def.id, { label: 'Szerződés review (átdolgozott)' }, db);
    const after = await db.task.findUnique({ where: { id: task.id } });
    expect(after?.taskTypeLabelSnapshot).toBe('Szerződés review');
    expect(after?.estimatedMinutes).toBe(45);

    // Archive — new selection rejected, task untouched.
    await archiveTaskDefinition(admin, def.id, db);
    await expect(resolveTaskPlanning({ taskDefinitionId: def.id }, admin, db))
      .rejects.toMatchObject({ code: 'TASK_DEFINITION_ARCHIVED' });
    const still = await db.task.findUnique({ where: { id: task.id } });
    expect(still?.taskTypeLabelSnapshot).toBe('Szerződés review');
  });

  it('5. estimate precedence: explicit > definition default > attention band > none', async () => {
    const def = await createTaskDefinition(admin, { label: `Prec ${suffix}`, defaultEstimatedMinutes: 60, defaultAttentionCategory: 'EDITING' }, db);
    // Definition default wins over band.
    const r1 = await resolveTaskPlanning({ taskDefinitionId: def.id }, admin, db);
    expect(r1.estimatedMinutes).toBe(60);
    // Explicit estimate wins over definition default.
    const r2 = await resolveTaskPlanning({ taskDefinitionId: def.id, estimatedMinutes: 90 }, admin, db);
    expect(r2.estimatedMinutes).toBe(90);
    // Band midpoint when neither explicit nor definition exists.
    const r3 = await resolveTaskPlanning({ attentionCategory: 'QUICK_SCAN' }, admin, db);
    expect(r3.estimatedMinutes).toBe(10); // (5+15)/2
    // Nothing at all → null.
    const r4 = await resolveTaskPlanning({}, admin, db);
    expect(r4.estimatedMinutes).toBeNull();
  });

  it('6. work roles: reviewer eligibility + no case-access grant', async () => {
    // Reviewer cannot be the worker.
    await expect(
      assertTaskPlanningRolesEligible(caseA, { assigneeId: lawyer.userId, plannedReviewerId: lawyer.userId }, db),
    ).rejects.toMatchObject({ code: 'REVIEWER_CANNOT_BE_WORKER' });

    // Partner (existing access) can review; outsider lawyer without case access cannot.
    await assertTaskPlanningRolesEligible(caseA, { assigneeId: lawyer.userId, plannedReviewerId: partner.userId }, db);
    await expect(
      assertTaskPlanningRolesEligible(caseA, { assigneeId: lawyer.userId, plannedReviewerId: outsider.userId }, db),
    ).rejects.toMatchObject({ code: 'TASK_ROLE_CASE_ACCESS_REQUIRED' });

    // Same for collaborators.
    await expect(
      assertTaskPlanningRolesEligible(caseA, { collaboratorUserIds: [outsider.userId] }, db),
    ).rejects.toMatchObject({ code: 'TASK_ROLE_CASE_ACCESS_REQUIRED' });

    // Planner role never creates a CaseCollaborator grant.
    const task = await createTask({
      caseId: caseA,
      title: 'Roles task',
      taskType: 'OTHER',
      assignedBy: admin.userId,
      assignedTo: lawyer.userId,
      plannedReviewerId: partner.userId,
    }, db);
    expect(task.plannedReviewerId).toBe(partner.userId);
    const grants = await db.caseCollaborator.count({ where: { caseId: caseA, userId: partner.userId } });
    expect(grants).toBe(0);
  });

  it('7. reusable save is explicit and re-selected on later tasks', async () => {
    const resolved = await resolveTaskPlanning(
      { taskTypeLabel: `Újrafelhasználható ${suffix}`, estimatedMinutes: 25, saveToCatalogue: true },
      admin,
      db,
    );
    expect(resolved.taskDefinitionId).not.toBeNull();
    const defs = await listTaskDefinitions(admin, {}, db);
    expect(defs.some((d) => d.label === `Újrafelhasználható ${suffix}`)).toBe(true);

    // PATCH path: applying the definition snapshots the label.
    const task = await createTask({ caseId: caseA, title: 'Patch target', taskType: 'OTHER', assignedBy: admin.userId }, db);
    const patched = await updateTaskDetails(task.id, admin.userId, { taskDefinitionId: resolved.taskDefinitionId });
    expect(patched.taskTypeLabelSnapshot).toBe(`Újrafelhasználható ${suffix}`);
  });
});
