import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  approveOpportunityPublication,
  createOpportunityPublicationDraft,
  publishOpportunityPublication,
  revokeOpportunityPublication,
  submitOpportunityPublication,
} from '../src/modules/company-growth/opportunityPublicationService';

const databaseUrl = process.env.GROW_OPPORTUNITY_PUBLICATION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Grow opportunity customer publication (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const ids = {
    admin: crypto.randomUUID(),
    partner: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    assistant: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    customer: crypto.randomUUID(),
    clientA: crypto.randomUUID(),
    clientB: crypto.randomUUID(),
    workspaceAdmin: crypto.randomUUID(),
    workspacePartner: crypto.randomUUID(),
    workspaceLawyer: crypto.randomUUID(),
    workspaceOther: crypto.randomUUID(),
    workspaceB: crypto.randomUUID(),
    caseId: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    recommendationId: crypto.randomUUID(),
    opportunityId: crypto.randomUUID(),
  };

  const actor = (userId: string, role: string) => ({ userId, role });
  const safeInput = (workspaceId: string) => ({
    opportunityId: ids.opportunityId,
    workspaceId,
    title: 'Ügyféloldali fejlesztési lehetőség',
    summary: 'A folyamat ügyféloldali, biztonságos összefoglalója.',
    direction: 'Közösen áttekinthető fejlesztési irány.',
  });

  async function publishFor(userId: string, role: string, workspaceId: string) {
    const created = await createOpportunityPublicationDraft(actor(userId, role), ids.clientA, safeInput(workspaceId), db);
    const submitted = await submitOpportunityPublication(actor(userId, role), ids.clientA, String(created.id), { expectedRevision: created.revision }, db);
    const approved = await approveOpportunityPublication(actor(userId, role), ids.clientA, String(created.id), { expectedRevision: submitted.revision }, db);
    return publishOpportunityPublication(actor(userId, role), ids.clientA, String(created.id), { expectedRevision: approved.revision }, db);
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `grow-pub-admin-${suffix}@fixture.invalid`, name: 'Grow publication admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.partner, email: `grow-pub-partner-${suffix}@fixture.invalid`, name: 'Grow publication partner', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.lawyer, email: `grow-pub-lawyer-${suffix}@fixture.invalid`, name: 'Grow publication lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.assistant, email: `grow-pub-assistant-${suffix}@fixture.invalid`, name: 'Grow publication assistant', role: 'LEGAL_ASSISTANT', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.collaborator, email: `grow-pub-collab-${suffix}@fixture.invalid`, name: 'Grow publication collaborator', role: 'COLLAB_LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.customer, email: `grow-pub-customer-${suffix}@fixture.invalid`, name: 'Grow publication customer', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] },
    ] as any });
    await db.client.createMany({ data: [
      { id: ids.clientA, name: `Grow publication client A ${suffix}` },
      { id: ids.clientB, name: `Grow publication client B ${suffix}` },
    ] });
    await db.clientPortalWorkspace.createMany({ data: [
      { id: ids.workspaceAdmin, clientId: ids.clientA, name: 'Publication admin workspace', mode: 'ORGANIZATION', publicReference: `grow-pub-a-${suffix}`, createdById: ids.admin },
      { id: ids.workspacePartner, clientId: ids.clientA, name: 'Publication partner workspace', mode: 'ORGANIZATION', publicReference: `grow-pub-p-${suffix}`, createdById: ids.admin },
      { id: ids.workspaceLawyer, clientId: ids.clientA, name: 'Publication lawyer workspace', mode: 'ORGANIZATION', publicReference: `grow-pub-l-${suffix}`, createdById: ids.admin },
      { id: ids.workspaceOther, clientId: ids.clientA, name: 'Publication other workspace', mode: 'ORGANIZATION', publicReference: `grow-pub-o-${suffix}`, createdById: ids.admin },
      { id: ids.workspaceB, clientId: ids.clientB, name: 'Publication client B workspace', mode: 'ORGANIZATION', publicReference: `grow-pub-b-${suffix}`, createdById: ids.admin },
    ] as any });
    await db.case.create({ data: { id: ids.caseId, caseNumber: `GROW-PUB-${suffix}`, title: 'Publication authorization case', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, createdById: ids.admin, assignedLawyerId: ids.lawyer } as any });
    await db.recommendationRun.create({ data: { id: ids.runId, clientId: ids.clientA, status: 'COMPLETED', completedAt: new Date() } });
    await db.recommendationCandidate.create({ data: { id: ids.recommendationId, clientId: ids.clientA, runId: ids.runId, title: 'Internal recommendation', problemStatement: 'Internal problem statement', direction: 'Internal direction', kind: 'DEVELOPMENT', sufficiency: 'SUPPORTED', status: 'ACCEPTED' } as any });
    await db.improvementOpportunity.create({ data: { id: ids.opportunityId, clientId: ids.clientA, recommendationId: ids.recommendationId, title: 'Internal opportunity title', problem: 'Internal diagnosis', direction: 'Internal recommendation direction', kind: 'DEVELOPMENT', evidenceStrength: 'STRONG', status: 'OPEN' } as any });
  });

  afterAll(async () => {
    await db?.clientPublicationEvent.deleteMany({ where: { clientId: ids.clientA } });
    await db?.clientImprovementOpportunityPublication.deleteMany({ where: { clientId: ids.clientA } });
    await db?.improvementOpportunity.deleteMany({ where: { id: ids.opportunityId } });
    await db?.recommendationCandidate.deleteMany({ where: { id: ids.recommendationId } });
    await db?.recommendationRun.deleteMany({ where: { id: ids.runId } });
    await db?.case.deleteMany({ where: { id: ids.caseId } });
    await db?.clientPortalWorkspace.deleteMany({ where: { id: { in: [ids.workspaceAdmin, ids.workspacePartner, ids.workspaceLawyer, ids.workspaceOther, ids.workspaceB] } } });
    await db?.client.deleteMany({ where: { id: { in: [ids.clientA, ids.clientB] } } });
    await db?.user.deleteMany({ where: { id: { in: [ids.admin, ids.partner, ids.lawyer, ids.assistant, ids.collaborator, ids.customer] } } });
    await db?.$disconnect();
  });

  it('keeps opportunities internal by default and proves the complete publication lifecycle', async () => {
    expect(await db.clientImprovementOpportunityPublication.count({ where: { opportunityId: ids.opportunityId } })).toBe(0);
    const beforeSideEffects = {
      initiatives: await db.developmentInitiative.count({ where: { clientId: ids.clientA } }),
      tasks: await db.task.count({ where: { case: { clientId: ids.clientA } } }),
      outcomes: await db.outcomeMeasurement.count({ where: { clientId: ids.clientA } }),
      timeEntries: await db.timeEntry.count({ where: { case: { clientId: ids.clientA } } }),
    };

    const published = await publishFor(ids.admin, 'ADMIN', ids.workspaceAdmin);
    expect(published.status).toBe('PUBLISHED');
    const publication = await db.clientImprovementOpportunityPublication.findUniqueOrThrow({ where: { id: String(published.id) } });
    const firstRevision = await db.clientImprovementOpportunityPublicationRevision.findUniqueOrThrow({ where: { id: String(publication.currentRevisionId) } });
    expect(firstRevision.clientSafeTitle).toBe('Ügyféloldali fejlesztési lehetőség');
    const snapshotBefore = JSON.parse(JSON.stringify(firstRevision));

    await expect(createOpportunityPublicationDraft(actor(ids.admin, 'ADMIN'), ids.clientA, safeInput(ids.workspaceAdmin), db)).rejects.toMatchObject({ code: 'PUBLICATION_REVOKE_REQUIRED' });
    expect((await db.clientImprovementOpportunityPublication.findUniqueOrThrow({ where: { id: publication.id } })).status).toBe('PUBLISHED');
    await expect(submitOpportunityPublication(actor(ids.admin, 'ADMIN'), ids.clientB, String(publication.id), { expectedRevision: published.revision }, db)).rejects.toMatchObject({ code: 'PUBLICATION_CLIENT_MISMATCH' });

    await db.improvementOpportunity.update({ where: { id: ids.opportunityId }, data: { title: 'Changed internal title', problem: 'Changed internal problem' } });
    expect(JSON.parse(JSON.stringify(await db.clientImprovementOpportunityPublicationRevision.findUniqueOrThrow({ where: { id: firstRevision.id } })))).toEqual(snapshotBefore);

    await expect(createOpportunityPublicationDraft(actor(ids.assistant, 'LEGAL_ASSISTANT'), ids.clientA, safeInput(ids.workspacePartner), db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' });
    await expect(createOpportunityPublicationDraft(actor(ids.collaborator, 'COLLAB_LAWYER'), ids.clientA, safeInput(ids.workspacePartner), db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    await expect(createOpportunityPublicationDraft(actor(ids.customer, 'CLIENT'), ids.clientA, safeInput(ids.workspacePartner), db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' });

    expect((await publishFor(ids.partner, 'PARTNER', ids.workspacePartner)).status).toBe('PUBLISHED');
    expect((await publishFor(ids.lawyer, 'LAWYER', ids.workspaceLawyer)).status).toBe('PUBLISHED');
    await expect(createOpportunityPublicationDraft(actor(ids.admin, 'ADMIN'), ids.clientA, safeInput(ids.workspaceB), db)).rejects.toMatchObject({ code: 'WORKSPACE_CLIENT_MISMATCH' });
    expect(await db.clientImprovementOpportunityPublication.findUnique({ where: { opportunityId_workspaceId: { opportunityId: ids.opportunityId, workspaceId: ids.workspaceOther } } })).toBeNull();

    await revokeOpportunityPublication(actor(ids.admin, 'ADMIN'), ids.clientA, String(publication.id), { expectedRevision: published.revision }, db);
    expect((await db.clientImprovementOpportunityPublication.findUniqueOrThrow({ where: { id: publication.id } })).status).toBe('REVOKED');
    const republishedDraft = await createOpportunityPublicationDraft(actor(ids.admin, 'ADMIN'), ids.clientA, safeInput(ids.workspaceAdmin), db);
    const republishedSubmitted = await submitOpportunityPublication(actor(ids.admin, 'ADMIN'), ids.clientA, String(republishedDraft.id), { expectedRevision: republishedDraft.revision }, db);
    const republishedApproved = await approveOpportunityPublication(actor(ids.admin, 'ADMIN'), ids.clientA, String(republishedDraft.id), { expectedRevision: republishedSubmitted.revision }, db);
    expect((await publishOpportunityPublication(actor(ids.admin, 'ADMIN'), ids.clientA, String(republishedDraft.id), { expectedRevision: republishedApproved.revision }, db)).status).toBe('PUBLISHED');
    const revisions = await db.clientImprovementOpportunityPublicationRevision.findMany({ where: { publicationId: publication.id }, orderBy: { revisionNumber: 'asc' } });
    expect(revisions).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(revisions[0]))).toEqual(snapshotBefore);
    expect(revisions[1].revisionNumber).toBe(2);
    const actions = await db.clientPublicationEvent.findMany({ where: { improvementOpportunityPublicationId: publication.id }, select: { action: true, fromStatus: true, toStatus: true, metadataSafe: true } });
    expect(actions.map((event) => String(event.action))).toEqual(expect.arrayContaining(['DRAFT_CREATED', 'SUBMITTED_FOR_APPROVAL', 'APPROVED', 'PUBLISHED', 'REVOKED', 'SUPERSEDED']));
    const superseded = actions.find((event) => String(event.action) === 'SUPERSEDED');
    expect(superseded).toMatchObject({ fromStatus: null, toStatus: null });
    expect(superseded?.metadataSafe).toMatchObject({ supersededRevisionNumber: 1, replacementRevisionNumber: 2 });
    const publishedEvents = actions.filter((event) => String(event.action) === 'PUBLISHED');
    expect(publishedEvents.some((event) => event.fromStatus === 'APPROVED' && event.toStatus === 'PUBLISHED')).toBe(true);

    const afterSideEffects = {
      initiatives: await db.developmentInitiative.count({ where: { clientId: ids.clientA } }),
      tasks: await db.task.count({ where: { case: { clientId: ids.clientA } } }),
      outcomes: await db.outcomeMeasurement.count({ where: { clientId: ids.clientA } }),
      timeEntries: await db.timeEntry.count({ where: { case: { clientId: ids.clientA } } }),
    };
    expect(afterSideEffects).toEqual(beforeSideEffects);
  });
});
