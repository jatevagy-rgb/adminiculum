/**
 * CUSTOMER PORTAL CALENDAR — PostgreSQL integration coverage for the customer
 * safety boundary:
 *  - cross-client isolation (client B never appears in client A's calendar);
 *  - internal dates are excluded (Task.dueDate, Case.deadline, CaseIntakeDeadline);
 *  - unpublished matter revisions and DRAFT action/requests are excluded;
 *  - published matter target + published deadline + published action request +
 *    customer-visible request dueAt are included;
 *  - a completed request is classified DONE, not OPEN;
 *  - unpublished contract dates and company milestones never surface;
 *  - stable ordering and inclusive range bounding.
 *
 * Runs only when a test database URL is provisioned (CI Postgres service);
 * skips locally otherwise.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { getCustomerCalendar } from '../src/modules/client-portal-calendar/service';

const databaseUrl =
  process.env.CLIENT_INTERACTION_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('customer portal calendar integration (postgres)', () => {
  let db: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  const admin = crypto.randomUUID();

  let clientA = '';
  let clientB = '';
  let workspaceA = '';
  let workspaceB = '';
  let identityA = '';
  let identityB = '';
  let caseA = '';
  let caseB = '';
  let pubA = '';
  let pubB = '';
  let orgIdentityA = '';
  let orgWorkspaceA = '';
  let clientC = '';
  let orgIdentityC = '';
  let orgWorkspaceC = '';
  let complianceClientControlId = '';

  const createdRequirementIds: string[] = [];
  const createdVersionIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdControlMapIds: string[] = [];
  const createdDomainCodes: string[] = [];

  function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  async function createPortalUser(label: string, clientId: string) {
    const identityId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    await db.clientPortalIdentity.create({
      data: { id: identityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${identityId}`, normalizedEmail: `${label}-${identityId}@t.io`, emailVerifiedAt: new Date(), displayName: label, accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    });
    await db.client.findUniqueOrThrow({ where: { id: clientId } });
    await db.clientPortalWorkspace.create({ data: { id: workspaceId, clientId, name: `WS ${label}`, mode: 'INDIVIDUAL', publicReference: `ws-${workspaceId}`, createdById: admin } });
    await db.clientPortalWorkspaceMembership.create({ data: { clientPortalIdentityId: identityId, workspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: admin } });
    return { identityId, workspaceId };
  }

  async function createOrganizationPortalUser(label: string, clientId: string) {
    const created = await createPortalUser(label, clientId);
    await db.clientPortalWorkspace.update({ where: { id: created.workspaceId }, data: { mode: 'ORGANIZATION' } });
    return created;
  }

  /**
   * Seeds the minimum canonical compliance chain plus one client-scoped
   * ClientControl carrying a next review date. Every version/rule/control map is
   * created suite-unique, so shared seeded rows are reused but never mutated.
   */
  async function seedComplianceControl(clientId: string, nextReviewAt: Date): Promise<string> {
    const domainCode = `calendar-safe-${tag}`;
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Calendar Safe' } }).catch(() => {});
    createdDomainCodes.push(domainCode);

    let requirement = await db.requirement.findFirst({ where: { key: 'GDPR_DATA_PROCESSING' } });
    if (!requirement) {
      requirement = await db.requirement.create({ data: { id: crypto.randomUUID(), key: 'GDPR_DATA_PROCESSING', jurisdictionCode: 'HU', domainCode } });
      createdRequirementIds.push(requirement.id);
    }

    const versionId = crypto.randomUUID();
    createdVersionIds.push(versionId);
    await db.requirementVersion.create({
      data: { id: versionId, requirementId: requirement.id, versionKey: `CAL_${tag}`, title: 'Calendar safe requirement', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), sourceSupportState: 'SUFFICIENT', status: 'APPROVED' },
    });

    const ruleId = crypto.randomUUID();
    createdRuleIds.push(ruleId);
    await db.applicabilityRuleVersion.create({
      data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: `CAL_R_${tag}`, schemaVersion: 'rule-ast/v1', astJson: { node: 'test' }, canonicalDigest: sha256(`calendar-rule-${tag}`), status: 'APPROVED' },
    });

    let definition = await db.controlDefinition.findFirst({ where: { key: 'GDPR_DATA_PROCESSING_CONTROL' } });
    if (!definition) {
      definition = await db.controlDefinition.create({ data: { id: crypto.randomUUID(), key: 'GDPR_DATA_PROCESSING_CONTROL', title: 'Internal calendar control title', type: 'LEGAL' } });
      createdDefinitionIds.push(definition.id);
    }

    const mapId = crypto.randomUUID();
    createdControlMapIds.push(mapId);
    await db.requirementControlMap.create({ data: { id: mapId, requirementVersionId: versionId, controlDefinitionId: definition.id } });

    await db.requirementApplicability.create({
      data: {
        id: crypto.randomUUID(), clientId, requirementVersionId: versionId, ruleVersionId: ruleId,
        ruleDigest: sha256(`calendar-app-${clientId}`), outcome: 'APPLIES', scopeType: 'COMPANY',
        evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE',
        schemaVersion: 'phase6-requirement-applicability/v1', snapshotJson: {}, snapshotDigest: sha256(`calendar-snap-${clientId}`),
      },
    });

    const control = await db.clientControl.create({ data: { clientId, controlDefinitionId: definition.id, nextReviewAt } });
    return control.id;
  }

  async function makeCase(clientId: string, caseKey: string) {
    const id = crypto.randomUUID();
    await db.case.create({ data: { id, caseNumber: `${tag}-${caseKey}`, title: `internal ${caseKey}`, caseType: 'CONTRACT_REVIEW', clientId, createdById: admin, assignedLawyerId: admin, deadline: new Date('2026-09-22T00:00:00.000Z') } as never });
    return id;
  }

  async function publishMatter(caseId: string, clientId: string, title: string, target: string | null, deadlineDueAt: string | null, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') {
    const pub = await db.clientMatterPublication.create({ data: { caseId, clientId, status, preparedById: admin, publishedAt: status === 'PUBLISHED' ? new Date() : null } });
    const rev = await db.clientMatterPublicationRevision.create({
      data: {
        publicationId: pub.id,
        revisionNumber: 1,
        clientSafeTitle: title,
        clientSafeStatus: 'Folyamatban',
        clientSafeNextStep: 'Következő lépés',
        clientSafeCurrentPosition: 'Most itt tartunk',
        clientSafeWaitingOn: 'Mire várunk',
        publicTargetDate: target ? new Date(`${target}T00:00:00.000Z`) : null,
        publishedDeadlinesSnapshot: deadlineDueAt ? [{ title: `Közzétett határidő ${title}`, dueAt: deadlineDueAt }] : [],
        safeUpdatesSnapshot: [],
        actionRequestsSnapshot: [],
        sourceFingerprint: `fp-${pub.id}`,
        audienceSnapshot: {} as never,
        createdById: admin,
      },
    });
    await db.clientMatterPublication.update({ where: { id: pub.id }, data: { currentRevisionId: rev.id } });
    return pub.id;
  }

  async function grant(identityId: string, workspaceId: string, clientId: string, caseId: string) {
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: identityId, workspaceId, clientId, caseId, status: 'ACTIVE', participantRole: 'PARTICIPANT', isRequester: false, permissions: ['MATTER_READ', 'ACTION_REQUEST_READ'] as never, invitedById: admin, activatedAt: new Date() } as never });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await db.user.create({ data: { id: admin, email: `admin-${admin}@t.io`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' } as never });
    clientA = (await db.client.create({ data: { name: `${tag} A` } })).id;
    clientB = (await db.client.create({ data: { name: `${tag} B` } })).id;

    const a = await createPortalUser('a', clientA);
    const b = await createPortalUser('b', clientB);
    identityA = a.identityId; workspaceA = a.workspaceId;
    identityB = b.identityId; workspaceB = b.workspaceId;

    caseA = await makeCase(clientA, 'A');
    caseB = await makeCase(clientB, 'B');
    await grant(identityA, workspaceA, clientA, caseA);
    await grant(identityB, workspaceB, clientB, caseB);

    pubA = await publishMatter(caseA, clientA, 'A ügy', '2026-09-20', '2026-09-25');
    pubB = await publishMatter(caseB, clientB, 'B ügy', '2026-09-21', '2026-09-26');
    // Unpublished matter revision with a date that must NOT surface.
    await publishMatter(caseA, clientA, 'A tervezet', '2026-09-28', null, 'DRAFT');

    // Published action request + internal draft action request for client A.
    await db.clientActionRequest.create({ data: { caseId: caseA, clientId: clientA, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'A teendő', dueAt: new Date('2026-09-18T00:00:00.000Z'), status: 'PUBLISHED', audienceSnapshot: {} as never, preparedById: admin, publishedById: admin } });
    await db.clientActionRequest.create({ data: { caseId: caseA, clientId: clientA, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'A draft teendő', dueAt: new Date('2026-09-26T00:00:00.000Z'), status: 'DRAFT', audienceSnapshot: {} as never, preparedById: admin } });
    // Cross-client action request.
    await db.clientActionRequest.create({ data: { caseId: caseB, clientId: clientB, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'B teendő', dueAt: new Date('2026-09-17T00:00:00.000Z'), status: 'PUBLISHED', audienceSnapshot: {} as never, preparedById: admin, publishedById: admin } });

    // Customer-visible interaction requests: open + completed + draft.
    await db.clientRequest.create({ data: { clientId: clientA, caseId: caseA, createdById: admin, type: 'INFORMATION_REQUEST', clientSafeTitle: 'A nyitott kérés', dueAt: new Date('2026-09-19T00:00:00.000Z'), status: 'PUBLISHED', audienceSnapshot: {} as never, publishedAt: new Date() } });
    await db.clientRequest.create({ data: { clientId: clientA, caseId: caseA, createdById: admin, type: 'INFORMATION_REQUEST', clientSafeTitle: 'A kész kérés', dueAt: new Date('2026-09-11T00:00:00.000Z'), status: 'COMPLETED', audienceSnapshot: {} as never, publishedAt: new Date() } });
    await db.clientRequest.create({ data: { clientId: clientA, caseId: caseA, createdById: admin, type: 'INFORMATION_REQUEST', clientSafeTitle: 'A draft kérés', dueAt: new Date('2026-09-27T00:00:00.000Z'), status: 'DRAFT', audienceSnapshot: {} as never } });
    await db.clientRequest.create({ data: { clientId: clientB, caseId: caseB, createdById: admin, type: 'INFORMATION_REQUEST', clientSafeTitle: 'B kérés', dueAt: new Date('2026-09-16T00:00:00.000Z'), status: 'PUBLISHED', audienceSnapshot: {} as never, publishedAt: new Date() } });

    // Internal dates that must never surface on the customer calendar.
    await db.caseIntakeDeadline.create({ data: { caseId: caseA, title: 'A belső intake', deadlineType: 'INTERNAL', dueAt: new Date('2026-09-24T00:00:00.000Z'), createdById: admin } });
    await db.task.create({ data: { caseId: caseA, title: 'A belső feladat', taskType: 'OTHER', status: 'PENDING', dueDate: new Date('2026-09-23T00:00:00.000Z') } });
    // Unpublished contract date + ACHIEVED milestone (INDIVIDUAL workspace: must not surface).
    await db.contractRecord.create({ data: { clientId: clientA, title: 'A belső szerződés', contractType: 'FRAMEWORK', status: 'ACTIVE', nextCriticalDate: new Date('2026-09-29T00:00:00.000Z') } });
    await db.companyMilestone.create({ data: { clientId: clientA, title: 'A mérföldkő', type: 'CORPORATE', status: 'ACHIEVED', milestoneDate: new Date('2026-09-30T00:00:00.000Z'), createdByUserId: admin } });

    // ORGANIZATION workspace for client A: the customer-safe Grow target must appear,
    // while the internal task/case/intake dates of the SAME client stay absent.
    const orgA = await createOrganizationPortalUser('a-org', clientA);
    orgIdentityA = orgA.identityId;
    orgWorkspaceA = orgA.workspaceId;
    await db.developmentInitiative.create({ data: { clientId: clientA, title: 'A fejlesztési kezdeményezés', status: 'ACTIVE', targetAt: new Date('2026-09-21T00:00:00.000Z') } });
    await db.developmentInitiative.create({ data: { clientId: clientB, title: 'B fejlesztési kezdeményezés', status: 'ACTIVE', targetAt: new Date('2026-09-23T00:00:00.000Z') } });

    // A dedicated ORGANIZATION client carries the customer-safe compliance control,
    // so client A's organization calendar stays free of compliance reviews.
    clientC = (await db.client.create({ data: { name: `${tag} C` } })).id;
    const orgC = await createOrganizationPortalUser('c-org', clientC);
    orgIdentityC = orgC.identityId;
    orgWorkspaceC = orgC.workspaceId;
    complianceClientControlId = await seedComplianceControl(clientC, new Date('2026-09-24T00:00:00.000Z'));
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    const caseIds = [caseA, caseB];
    const clientIds = [clientA, clientB, clientC];
    await db.developmentInitiative.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.contractRecord.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.companyMilestone.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.task.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.caseIntakeDeadline.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.clientRequest.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.clientActionRequest.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.clientMatterPublicationRevision.deleteMany({ where: { publicationId: { in: [pubA, pubB] } } });
    await db.clientMatterPublication.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.clientPortalGrant.deleteMany({ where: { caseId: { in: caseIds } } });
    // Compliance fixture: client-scoped rows first, then only the global rows this
    // suite created (shared seeded rows are left untouched).
    await db.clientControl.deleteMany({ where: { clientId: { in: clientIds } } });
    await db.requirementApplicability.deleteMany({ where: { clientId: { in: clientIds } } });
    if (createdControlMapIds.length > 0) await db.requirementControlMap.deleteMany({ where: { id: { in: createdControlMapIds } } });
    if (createdDefinitionIds.length > 0) await db.controlDefinition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    if (createdRuleIds.length > 0) await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: createdRuleIds } } });
    if (createdVersionIds.length > 0) await db.requirementVersion.deleteMany({ where: { id: { in: createdVersionIds } } });
    if (createdRequirementIds.length > 0) await db.requirement.deleteMany({ where: { id: { in: createdRequirementIds } } });
    if (createdDomainCodes.length > 0) await db.complianceDomain.deleteMany({ where: { code: { in: createdDomainCodes } } });
    const workspaceIds = [workspaceA, workspaceB, orgWorkspaceA, orgWorkspaceC];
    const identityIds = [identityA, identityB, orgIdentityA, orgIdentityC];
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.clientPortalIdentity.deleteMany({ where: { id: { in: identityIds } } });
    await db.case.deleteMany({ where: { id: { in: caseIds } } });
    await db.client.deleteMany({ where: { id: { in: clientIds } } });
    await db.user.deleteMany({ where: { id: admin } });
    await db.$disconnect();
  });

  it('projects only the customer-safe published sources and excludes every internal date', async () => {
    const result = await getCustomerCalendar(identityA, workspaceA, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });

    const byCategory = new Map<string, typeof result.items>();
    for (const item of result.items) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);

    expect(byCategory.get('MATTER_TARGET')?.[0].day).toBe('2026-09-20');
    expect(byCategory.get('PUBLISHED_DEADLINE')?.[0].day).toBe('2026-09-25');
    expect(byCategory.get('ACTION_REQUEST')?.map((item) => item.day)).toEqual(['2026-09-18']);
    const requests = byCategory.get('CUSTOMER_REQUEST') ?? [];
    expect(requests.map((item) => [item.day, item.status])).toEqual([
      ['2026-09-11', 'DONE'],
      ['2026-09-19', 'OPEN'],
    ]);

    // No CONTRACT_DATE / COMPANY_MILESTONE for an INDIVIDUAL workspace, even though
    // an internal ContractRecord and an ACHIEVED CompanyMilestone exist.
    expect(byCategory.has('CONTRACT_DATE')).toBe(false);
    expect(byCategory.has('COMPANY_MILESTONE')).toBe(false);

    const days = new Set(result.items.map((item) => item.day));
    for (const internalDay of ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']) {
      expect(days.has(internalDay)).toBe(false);
    }
    expect(JSON.stringify(result)).not.toContain(caseA);
  });

  it('isolates client A from client B', async () => {
    const result = await getCustomerCalendar(identityA, workspaceA, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('B ügy');
    expect(serialized).not.toContain('B teendő');
    expect(serialized).not.toContain('B kérés');
    expect(result.items.some((item) => item.day === '2026-09-16' || item.day === '2026-09-17' || item.day === '2026-09-21' || item.day === '2026-09-26')).toBe(false);
  });

  it('returns a stable ascending order and bounds the inclusive range', async () => {
    const wide = await getCustomerCalendar(identityA, workspaceA, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    const days = wide.items.map((item) => item.day);
    expect([...days].sort()).toEqual(days);

    const narrow = await getCustomerCalendar(identityA, workspaceA, { from: '2026-09-18', to: '2026-09-20' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    expect(narrow.items.map((item) => item.day)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
  });

  it('never invents dates for records without a customer-safe date', async () => {
    const result = await getCustomerCalendar(identityA, workspaceA, { from: '2023-01-01', to: '2026-12-31' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    for (const item of result.items) {
      expect(typeof item.day).toBe('string');
      expect(item.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(item.date).getTime())).toBe(false);
    }
    expect(result.counts.total).toBe(result.items.length);
  });

  it('projects the customer-safe Grow target in an ORGANIZATION workspace and still excludes internal dates', async () => {
    const result = await getCustomerCalendar(orgIdentityA, orgWorkspaceA, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    const grow = result.items.filter((item) => item.category === 'GROW_TARGET');
    expect(grow.map((item) => item.day)).toEqual(['2026-09-21']);
    expect(grow[0].status).toBe('INFO');
    expect(grow[0].href).toBe('/portal/fejlesztes');
    // Client A has no client control, so its organization calendar stays free of reviews.
    expect(result.items.some((item) => item.category === 'COMPLIANCE_REVIEW')).toBe(false);
    // Client B's initiative never leaks into client A's organization calendar.
    expect(JSON.stringify(result)).not.toContain('B fejlesztési kezdeményezés');
    // Internal Case.deadline / Task.dueDate / CaseIntakeDeadline stay absent.
    const days = new Set(result.items.map((item) => item.day));
    for (const internalDay of ['2026-09-22', '2026-09-23', '2026-09-24']) {
      expect(days.has(internalDay)).toBe(false);
    }
  });

  it('never surfaces Grow or compliance dates in an INDIVIDUAL workspace', async () => {
    const result = await getCustomerCalendar(identityA, workspaceA, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    expect(result.items.some((item) => item.category === 'GROW_TARGET' || item.category === 'COMPLIANCE_REVIEW')).toBe(false);
  });

  it('projects the customer-safe compliance review in an ORGANIZATION workspace without leaking internal identity', async () => {
    const result = await getCustomerCalendar(orgIdentityC, orgWorkspaceC, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
    const reviews = result.items.filter((item) => item.category === 'COMPLIANCE_REVIEW');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      day: '2026-09-24',
      status: 'INFO',
      href: '/portal/megfeleles',
      categoryLabel: 'Következő ellenőrzés',
      title: 'Adatvédelmi intézkedés',
    });
    // Identity is the opaque safe-registry reference: not the internal ClientControl
    // id, not the raw ControlDefinition key and not the display text.
    expect(reviews[0].id).toBe('COMPLIANCE_REVIEW:control-data-processing');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(complianceClientControlId);
    expect(serialized).not.toContain('GDPR_DATA_PROCESSING_CONTROL');
    expect(serialized).not.toContain('Adatkezelési nyilvántartás és jogalap-mátrix');
    // A review is informational; it never counts as an open customer obligation.
    expect(result.counts.open).toBe(0);
  });

  it('never surfaces a compliance review in an INDIVIDUAL workspace for the same client', async () => {
    const individual = await createPortalUser('c-individual', clientC);
    try {
      const result = await getCustomerCalendar(individual.identityId, individual.workspaceId, { from: '2026-09-01', to: '2026-11-30' }, db, { now: new Date('2026-09-15T00:00:00.000Z') });
      expect(result.items.some((item) => item.category === 'COMPLIANCE_REVIEW')).toBe(false);
    } finally {
      await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId: individual.workspaceId } });
      await db.clientPortalWorkspace.deleteMany({ where: { id: individual.workspaceId } });
      await db.clientPortalIdentity.deleteMany({ where: { id: individual.identityId } });
    }
  });
});
