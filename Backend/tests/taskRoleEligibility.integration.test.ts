/**
 * Task planning role eligibility (PostgreSQL).
 *
 * Proves the backend remains the sole authority: only case-eligible users can be
 * assigned as worker/reviewer/collaborator; forged/inactive/outsider IDs are
 * rejected; role assignment grants no case access; legacy simple tasks still work.
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTask } from '../src/modules/tasks/services';
import { assertTaskPlanningRolesEligible } from '../src/modules/tasks/taskPlanning';
import { listCaseResponsibleCandidates } from '../src/modules/cases/caseWorkPackageOperational.service';

const databaseUrl = process.env.TASK_ROLE_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('task planning role eligibility (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const ids = {
    admin: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    reviewer: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    outsider: crypto.randomUUID(),
    inactive: crypto.randomUUID(),
    client: crypto.randomUUID(),
    case: crypto.randomUUID(),
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `tr-admin-${suffix}@test.invalid`, name: 'TR Admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: ids.lawyer, email: `tr-lawyer-${suffix}@test.invalid`, name: 'TR Lawyer', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.reviewer, email: `tr-reviewer-${suffix}@test.invalid`, name: 'TR Reviewer', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.collaborator, email: `tr-collab-${suffix}@test.invalid`, name: 'TR Collaborator', role: 'COLLAB_LAWYER', status: 'ACTIVE' },
      { id: ids.outsider, email: `tr-outsider-${suffix}@test.invalid`, name: 'TR Outsider', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.inactive, email: `tr-inactive-${suffix}@test.invalid`, name: 'TR Inactive', role: 'LAWYER', status: 'INACTIVE', isActive: false },
    ] as never });
    await db.client.create({ data: { id: ids.client, name: `TR Client ${suffix}` } as never });
    await db.case.create({ data: {
      id: ids.case, caseNumber: `TR-${suffix}`, title: 'TR case', caseType: 'OTHER', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.lawyer,
    } as never });
    await db.caseCollaborator.createMany({ data: [
      { id: crypto.randomUUID(), caseId: ids.case, userId: ids.reviewer, role: 'REVIEWER' },
      { id: crypto.randomUUID(), caseId: ids.case, userId: ids.collaborator, role: 'ASSISTANT' },
    ] as never });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('A. creates a task with an eligible worker, reviewer and collaborator', async () => {
    await assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, plannedReviewerId: ids.reviewer, collaboratorUserIds: [ids.collaborator] });
    const task = await createTask({
      caseId: ids.case, title: 'Eligible planning', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin,
      assignedTo: ids.lawyer, plannedReviewerId: ids.reviewer, collaboratorUserIds: [ids.collaborator],
    });
    const persisted = await db.task.findUnique({ where: { id: task.id } });
    expect((persisted as never as { plannedReviewerId: string }).plannedReviewerId).toBe(ids.reviewer);
    const collabs = await db.taskCollaborator.findMany({ where: { taskId: task.id } });
    expect(collabs.map((c) => c.userId)).toContain(ids.collaborator);
  });

  it('B. candidate projection contains only case-eligible users', async () => {
    const candidates = await listCaseResponsibleCandidates(ids.case);
    const idset = new Set((candidates ?? []).map((c) => c.id));
    for (const eligible of [ids.admin, ids.lawyer, ids.reviewer, ids.collaborator]) expect(idset.has(eligible)).toBe(true);
    for (const ineligible of [ids.outsider, ids.inactive]) expect(idset.has(ineligible)).toBe(false);
  });

  it('C. rejects a forged outsider reviewer', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, plannedReviewerId: ids.outsider }))
      .rejects.toMatchObject({ code: 'TASK_ROLE_CASE_ACCESS_REQUIRED' });
  });

  it('D. rejects a forged outsider collaborator', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, collaboratorUserIds: [ids.outsider] }))
      .rejects.toMatchObject({ code: 'TASK_ROLE_CASE_ACCESS_REQUIRED' });
  });

  it('E. rejects an inactive workforce user', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, plannedReviewerId: ids.inactive }))
      .rejects.toMatchObject({ code: 'TASK_ROLE_USER_INELIGIBLE' });
  });

  it('F. rejects reviewer == worker', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, plannedReviewerId: ids.lawyer }))
      .rejects.toMatchObject({ code: 'REVIEWER_CANNOT_BE_WORKER' });
  });

  it('G. rejects reviewer also listed as collaborator', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, plannedReviewerId: ids.reviewer, collaboratorUserIds: [ids.reviewer] }))
      .rejects.toMatchObject({ code: 'REVIEWER_CANNOT_BE_WORKER' });
  });

  it('H. rejects collaborator == worker', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, collaboratorUserIds: [ids.lawyer] }))
      .rejects.toMatchObject({ code: 'COLLABORATOR_IS_WORKER' });
  });

  it('I. role assignment grants no case access', async () => {
    const before = await db.caseCollaborator.count({ where: { caseId: ids.case, userId: ids.lawyer } });
    await assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.lawyer, plannedReviewerId: ids.reviewer, collaboratorUserIds: [ids.collaborator] });
    await createTask({ caseId: ids.case, title: 'No grant', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin, assignedTo: ids.lawyer, plannedReviewerId: ids.reviewer, collaboratorUserIds: [ids.collaborator] });
    const after = await db.caseCollaborator.count({ where: { caseId: ids.case, userId: ids.lawyer } });
    expect(after).toBe(before);
  });

  it('J. legacy simple task with only an assignee still works', async () => {
    const task = await createTask({ caseId: ids.case, title: 'Legacy simple', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin, assignedTo: ids.lawyer });
    const persisted = await db.task.findUnique({ where: { id: task.id } });
    expect(persisted?.assignedToId).toBe(ids.lawyer);
    expect((persisted as never as { plannedReviewerId: string | null }).plannedReviewerId).toBeNull();
  });
});
