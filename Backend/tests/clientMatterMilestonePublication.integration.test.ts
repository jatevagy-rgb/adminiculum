import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  createGrant,
  createMatterPublication,
  getMilestoneDraft,
  getPortalMatter,
  listEligibleMilestoneSteps,
  previewMilestonePublication,
  publishMatterPublication,
  publishMilestoneRevision,
  revokeMatterPublication,
  saveMilestoneDraft,
  submitMatterPublication,
  approveMatterPublication,
  transitionGrant,
} from '../src/modules/client-publication/publicationService';
import { revokeInvitation, cancelInvitationNotificationRetry } from '../src/modules/client-workspace/workspaceService';

const databaseUrl = process.env.PUBLICATION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

const actor = { userId: '', role: 'LAWYER' };

d('Customer-safe milestone publication (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = crypto.randomUUID();
  const lawyer = crypto.randomUUID();
  const portalUser = crypto.randomUUID();
  const client = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const taskA = crypto.randomUUID();
  const taskB = crypto.randomUUID();
  let publicationId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    actor.userId = lawyer;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: admin, email: `ms-admin-${admin}@t.io`, name: 'MS Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: lawyer, email: `ms-lawyer-${lawyer}@t.io`, name: 'MS Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: portalUser, email: `ms-portal-${portalUser}@t.io`, name: 'MS Portal User', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] },
    ] as never });
    await db.client.create({ data: { id: client, name: 'Milestone Client' } });
    await db.case.create({ data: { id: caseId, caseNumber: `MS-${caseId.slice(0, 6)}`, title: 'Milestone case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: lawyer, assignedLawyerId: lawyer } as never });
    // Two candidate workflow tasks with clearly-internal titles + assignees.
    await db.task.createMany({ data: [
      { id: taskA, title: 'INTERNAL Szerződés első jogi átnézése (Gyula)', taskType: 'REVIEW_CONTRACT', status: 'IN_PROGRESS', priority: 'MEDIUM', caseId, assignedToId: lawyer, assignedById: admin, requiredSkills: [], workflowInstanceId: 'wfi-1', workflowStepKey: 'A', workflowPublicMilestoneCandidate: true },
      { id: taskB, title: 'INTERNAL Végső partneri review (Csanád)', taskType: 'REVIEW_CONTRACT', status: 'PENDING', priority: 'MEDIUM', caseId, assignedToId: lawyer, assignedById: admin, requiredSkills: [], workflowInstanceId: 'wfi-1', workflowStepKey: 'B', workflowDependsOnKeys: ['A'], workflowPublicMilestoneCandidate: true },
    ] as never });
    // Portal grant first: creating a matter revision requires an active audience grant.
    const grant = await createGrant(actor, { caseId, clientId: client, clientUserId: portalUser, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'UPDATE_READ'] }, db);
    await transitionGrant(actor, grant.id, 'activate', { expectedRevision: grant.revision }, db);
    // A published matter publication (milestones augment an already-published matter).
    const draft = await createMatterPublication(actor, { caseId, clientSafeTitle: 'Ügy', clientSafeStatus: 'Folyamatban' }, db);
    publicationId = draft.id;
    const submitted = await submitMatterPublication(actor, draft.id, { expectedRevision: draft.revision }, db);
    const approved = await approveMatterPublication(actor, draft.id, { expectedRevision: submitted.revision }, db);
    await publishMatterPublication(actor, draft.id, { expectedRevision: approved.revision }, db);
  });

  afterAll(async () => { await db?.$disconnect(); });

  const portalActor = () => ({ userId: portalUser, role: 'CLIENT' });

  it('lists candidate steps but keeps drafts and internal data away from the customer', async () => {
    const eligible = await listEligibleMilestoneSteps(actor, caseId, db);
    expect(eligible.items.map((s: any) => s.taskId).sort()).toEqual([taskA, taskB].sort());

    await saveMilestoneDraft(actor, caseId, [
      { publicKey: 'm1', sourceTaskId: taskA, safeTitle: 'Az ügy feldolgozása megkezdődött', displayOrder: 1, weight: 1, completionState: 'COMPLETED' },
      { publicKey: 'm2', sourceTaskId: taskB, safeTitle: 'Végső szakmai ellenőrzés', displayOrder: 2, weight: 1, completionState: 'NOT_STARTED' },
    ], db);

    // Draft is not customer-visible.
    const beforePublish = await getPortalMatter(portalActor(), publicationId, db);
    expect(beforePublish.milestones).toEqual([]);
    expect(beforePublish.progressPercentage).toBeNull();

    // Preview uses the customer mapper.
    const preview = await previewMilestonePublication(actor, caseId, db);
    expect(preview.progressPercentage).toBe(50);
    expect(preview.milestones.map((m: any) => m.title)).toEqual(['Az ügy feldolgozása megkezdődött', 'Végső szakmai ellenőrzés']);
    const previewSerialized = JSON.stringify(preview);
    for (const leak of [taskA, taskB, 'Gyula', 'Csanád', 'INTERNAL', 'sourceTaskId', 'workflowStepKey']) expect(previewSerialized).not.toContain(leak);
  });

  it('publishes an immutable revision; preview == customer DTO; task completion does not mutate it', async () => {
    // Fix A regression: customer-safe Case progress is a Case concept, not a
    // Document concept. This whole suite creates ZERO documents/document
    // publications; milestone draft, preview and publish must all work anyway.
    const documentCount = await db.document.count({ where: { caseId } });
    expect(documentCount).toBe(0);

    const published = await publishMilestoneRevision(actor, caseId, db);
    expect(published.progressPercentage).toBe(50);
    const firstRevisionId = published.revisionId;

    // Preview and the customer DTO are identical for the published content.
    const customer = await getPortalMatter(portalActor(), publicationId, db);
    expect(customer.progressPercentage).toBe(50);
    expect(customer.milestones.map((m: any) => ({ title: m.title, state: m.state }))).toEqual([
      { title: 'Az ügy feldolgozása megkezdődött', state: 'COMPLETED' },
      { title: 'Végső szakmai ellenőrzés', state: 'NOT_STARTED' },
    ]);
    const serialized = JSON.stringify(customer.milestones);
    for (const leak of [taskA, taskB, 'Gyula', 'Csanád', 'INTERNAL', 'workflowStepKey', 'sourceTaskId', 'dependsOn']) expect(serialized).not.toContain(leak);

    // Completing the internal tasks afterwards must NOT change the published revision.
    await db.task.update({ where: { id: taskB }, data: { status: 'DONE' } });
    const afterTaskDone = await getPortalMatter(portalActor(), publicationId, db);
    expect(afterTaskDone.progressPercentage).toBe(50);
    const firstRev = await db.$queryRaw<Array<{ progressPercentage: number }>>`SELECT "progressPercentage" FROM client_matter_publication_revisions WHERE id=${firstRevisionId}`;
    expect(firstRev[0].progressPercentage).toBe(50);

    // Publish a new revision reflecting the completed milestone -> progress changes,
    // prior revision unchanged.
    await saveMilestoneDraft(actor, caseId, [
      { publicKey: 'm1', sourceTaskId: taskA, safeTitle: 'Az ügy feldolgozása megkezdődött', displayOrder: 1, weight: 1, completionState: 'COMPLETED' },
      { publicKey: 'm2', sourceTaskId: taskB, safeTitle: 'Végső szakmai ellenőrzés', displayOrder: 2, weight: 1, completionState: 'COMPLETED' },
    ], db);
    const republished = await publishMilestoneRevision(actor, caseId, db);
    expect(republished.progressPercentage).toBe(100);
    expect(republished.revisionId).not.toBe(firstRevisionId);
    const customer2 = await getPortalMatter(portalActor(), publicationId, db);
    expect(customer2.progressPercentage).toBe(100);
    const firstRevAgain = await db.$queryRaw<Array<{ progressPercentage: number }>>`SELECT "progressPercentage" FROM client_matter_publication_revisions WHERE id=${firstRevisionId}`;
    expect(firstRevAgain[0].progressPercentage).toBe(50);
  });

  it('validates milestone input and denies cross-case source steps', async () => {
    await expect(saveMilestoneDraft(actor, caseId, [{ publicKey: 'x', safeTitle: 'X', displayOrder: 1, weight: 0, completionState: 'COMPLETED' }], db)).rejects.toMatchObject({ code: 'MILESTONE_WEIGHT_INVALID' });
    await expect(saveMilestoneDraft(actor, caseId, [{ publicKey: 'x', safeTitle: 'X', displayOrder: 1, completionState: 'BOGUS' }], db)).rejects.toMatchObject({ code: 'MILESTONE_STATE_INVALID' });
    await expect(saveMilestoneDraft(actor, caseId, [{ publicKey: 'x', safeTitle: 'X', displayOrder: 1, completionState: 'DONE_TYPO' }], db)).rejects.toBeDefined();
    await expect(saveMilestoneDraft(actor, caseId, [{ publicKey: 'x', sourceTaskId: crypto.randomUUID(), safeTitle: 'X', displayOrder: 1, completionState: 'NOT_STARTED' }], db)).rejects.toMatchObject({ code: 'MILESTONE_SOURCE_STEP_INVALID' });
    await expect(saveMilestoneDraft(actor, caseId, [{ publicKey: 'dup', safeTitle: 'A', displayOrder: 1, completionState: 'NOT_STARTED' }, { publicKey: 'dup', safeTitle: 'B', displayOrder: 2, completionState: 'NOT_STARTED' }], db)).rejects.toMatchObject({ code: 'MILESTONE_KEY_DUPLICATE' });
    // No-weight publication -> null progress.
    await saveMilestoneDraft(actor, caseId, [{ publicKey: 'nw', safeTitle: 'Feldolgozás', displayOrder: 1, completionState: 'IN_PROGRESS' }], db);
    const preview = await previewMilestonePublication(actor, caseId, db);
    expect(preview.progressPercentage).toBeNull();
  });

  it('revoking the publication removes customer milestones', async () => {
    // republish weighted so there is something to revoke against
    await saveMilestoneDraft(actor, caseId, [{ publicKey: 'm1', safeTitle: 'Feldolgozás', displayOrder: 1, weight: 1, completionState: 'COMPLETED' }], db);
    await publishMilestoneRevision(actor, caseId, db);
    await revokeMatterPublication(actor, publicationId, {}, db);
    // After revoke the published matter is no longer returned to the customer.
    await expect(getPortalMatter(portalActor(), publicationId, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
  });

  it('revokes a failed-delivery invitation and cancels its notification retry', async () => {
    const workspace = await db.clientPortalWorkspace.create({ data: { clientId: client, name: 'MS ws', mode: 'INDIVIDUAL', publicReference: `ms-${crypto.randomUUID()}`, createdById: admin } });
    const delivery = await db.clientNotificationDelivery.create({ data: { eventType: 'PORTAL_INVITATION', clientId: client, recipientSnapshot: {}, subjectSafe: 'Meghívás', idempotencyKey: `inv-${crypto.randomUUID()}`, status: 'FAILED_RETRYABLE', attemptCount: 1, lastErrorCodeSafe: 'MAIL_PROVIDER_NOT_CONFIGURED', nextAttemptAt: new Date() } });
    const invitation = await db.clientPortalInvitation.create({ data: { clientId: client, workspaceId: workspace.id, intendedEmail: 'synthetic@example.invalid', tokenHash: crypto.randomBytes(16).toString('hex'), status: 'ACTIVE', deliveryId: delivery.id, deliveryStatus: 'FAILED_RETRYABLE', expiresAt: new Date(Date.now() + 86400000), createdById: admin } });
    const reviewer = { userId: admin, role: 'ADMIN' };

    const revoked = await revokeInvitation(reviewer, invitation.id, db);
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.notificationCancelled).toBe(true);
    const inv = await db.clientPortalInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(inv.status).toBe('REVOKED');
    const del = await db.clientNotificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(del.status).toBe('CANCELLED');
    // No token leaked in the response.
    expect(JSON.stringify(revoked)).not.toContain(inv.tokenHash);
    // Idempotent revoke.
    const again = await revokeInvitation(reviewer, invitation.id, db);
    expect(again.status).toBe('REVOKED');
    // Cancelling retry again is a safe no-op (already cancelled).
    const cancel = await cancelInvitationNotificationRetry(reviewer, invitation.id, db);
    expect(cancel.cancelled).toBe(false);
    // An accepted invitation cannot be revoked as pending.
    const used = await db.clientPortalInvitation.create({ data: { clientId: client, workspaceId: workspace.id, intendedEmail: 'used@example.invalid', tokenHash: crypto.randomBytes(16).toString('hex'), status: 'USED', expiresAt: new Date(Date.now() + 86400000), createdById: admin, usedByIdentityId: portalUser, usedAt: new Date() } });
    await expect(revokeInvitation(reviewer, used.id, db)).rejects.toMatchObject({ code: 'INVITATION_ALREADY_ACCEPTED' });
  });
});
