/**
 * Task planning role eligibility (PostgreSQL).
 *
 * Proves the backend remains the sole authority: only case-eligible users can be
 * assigned as worker/reviewer/collaborator; forged/inactive/outsider IDs are
 * rejected; role assignment grants no case access; legacy simple tasks still work.
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { createTask } from '../src/modules/tasks/services';
import { assertTaskPlanningRolesEligible } from '../src/modules/tasks/taskPlanning';
import { listCaseResponsibleCandidates } from '../src/modules/cases/caseWorkPackageOperational.service';
import { userCanManageCase } from '../src/modules/cases/authorization';

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
    partner: crypto.randomUUID(),
    creator: crypto.randomUUID(),
    unrelated: crypto.randomUUID(),
    client: crypto.randomUUID(),
    otherClient: crypto.randomUUID(),
    case: crypto.randomUUID(),
    creatorCase: crypto.randomUUID(),
    otherCase: crypto.randomUUID(),
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
      { id: ids.partner, email: `tr-partner-${suffix}@test.invalid`, name: 'TR Partner', role: 'PARTNER', status: 'ACTIVE' },
      { id: ids.creator, email: `tr-creator-${suffix}@test.invalid`, name: 'TR Case Creator', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.unrelated, email: `tr-unrelated-${suffix}@test.invalid`, name: 'TR Unrelated', role: 'LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.createMany({ data: [{ id: ids.client, name: `TR Client ${suffix}` }, { id: ids.otherClient, name: `TR Other Client ${suffix}` }] as never });
    await db.case.createMany({ data: [
      { id: ids.case, caseNumber: `TR-${suffix}`, title: 'TR case', caseType: 'OTHER', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.lawyer },
      { id: ids.creatorCase, caseNumber: `TR-C-${suffix}`, title: 'TR creator case', caseType: 'OTHER', clientId: ids.client, createdById: ids.creator, assignedLawyerId: ids.lawyer },
      { id: ids.otherCase, caseNumber: `TR-O-${suffix}`, title: 'TR other-client case', caseType: 'OTHER', clientId: ids.otherClient, createdById: ids.outsider, assignedLawyerId: ids.outsider },
    ] as never });
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

  it('B. candidate projection includes directly case-related workforce and privileged users', async () => {
    const candidates = await listCaseResponsibleCandidates(ids.case);
    const idset = new Set((candidates ?? []).map((c) => c.id));
    for (const eligible of [ids.admin, ids.lawyer, ids.reviewer, ids.collaborator]) expect(idset.has(eligible)).toBe(true);
    for (const ineligible of [ids.outsider, ids.inactive]) expect(idset.has(ineligible)).toBe(false);
  });

  it('B2. privileged authorization remains available without flooding default discovery', async () => {
    await expect(assertTaskPlanningRolesEligible(ids.case, { assigneeId: ids.admin })).resolves.toBeUndefined();
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

  it('K. canonical CASE_MANAGE permits only privileged, assigned lawyer or creator authority', async () => {
    const manage = (userId: string, role: string, caseId: string) => userCanManageCase({ user: { userId, role } } as unknown as Request, caseId);
    for (const [actorId, role, target] of [
      [ids.admin, 'ADMIN', ids.case], [ids.partner, 'PARTNER', ids.case],
      [ids.lawyer, 'LAWYER', ids.case], [ids.creator, 'LAWYER', ids.creatorCase],
    ]) expect(await manage(actorId, role, target)).toBe(true);
    for (const [actorId, role] of [
      [ids.reviewer, 'LAWYER'], [ids.collaborator, 'COLLAB_LAWYER'],
      [ids.outsider, 'LAWYER'], [ids.unrelated, 'LAWYER'],
    ]) expect(await manage(actorId, role, ids.case)).toBe(false);
    expect(await manage(ids.lawyer, 'LAWYER', ids.otherCase)).toBe(false);
    expect(await manage(ids.admin, 'ADMIN', crypto.randomUUID())).toBeNull();
  });
});
