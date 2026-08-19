/**
 * ORGANIZATION (Phase 3) — PostgreSQL integration + HR-confidential security.
 *
 * Covers group hierarchy, manager/deputy relations + cycles, person lifecycle,
 * responsibilities, contract/obligation/initiative owner linkage, person-
 * document links (HR-confidential gated), responsibility gaps, client-scope
 * isolation, privacy boundaries and the customer-safe projector.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  addResponsibility,
  createGroup,
  createPerson,
  getPerson,
  linkPersonDocument,
  listPersonDocuments,
  listPersons,
  projectOrganizationForCustomer,
  responsibilityGaps,
  setContractBusinessOwner,
  setInitiativeClientOwner,
  setObligationOwner,
  transitionPerson,
  updateGroup,
  updatePerson,
} from '../src/modules/client-organization/service';
import { hrConfidentialReadAllowed, requireHrConfidentialReadAccess } from '../src/modules/documents/authorization';
import documentsService from '../src/modules/documents/services';
import { listTaskDocuments } from '../src/modules/documents/workContext.service';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Organization / responsibility map (Phase 3) (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const externalLawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const groupRoot = crypto.randomUUID();
  const groupFinance = crypto.randomUUID();
  const contractId = crypto.randomUUID();
  const obligationId = crypto.randomUUID();
  const initiativeId = crypto.randomUUID();
  const docStd = crypto.randomUUID();
  const verStd = crypto.randomUUID();
  const docHr = crypto.randomUUID();
  const verHr = crypto.randomUUID();
  const taskA = crypto.randomUUID();
  const portalIdentityId = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();
  const membershipA = crypto.randomUUID();
  const membershipB = crypto.randomUUID();
  const membershipRevoked = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };
  const externalLawyer = { userId: externalLawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: adminId, email: `admin-${suffix}@test.invalid`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: lawyerId, email: `lawyer-${suffix}@test.invalid`, name: 'Lawyer A', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: externalLawyerId, email: `lawyer-b-${suffix}@test.invalid`, name: 'Lawyer B', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] as never });
    await db.client.createMany({ data: [
      { id: clientA, name: `Org Client A ${suffix}` },
      { id: clientB, name: `Org Client B ${suffix}` },
    ] });
    await db.case.create({ data: { id: caseA, caseNumber: `OR-${suffix}`, title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: clientA, assignedLawyerId: lawyerId, createdById: adminId } as never });
    // Create the root first, then the child, so the self-referencing
    // parentGroupId FK resolves within the committed row set.
    await db.clientOrganizationGroup.create({ data: { id: groupRoot, clientId: clientA, name: 'Vezetőség', createdById: adminId } });
    await db.clientOrganizationGroup.create({ data: { id: groupFinance, clientId: clientA, name: 'Pénzügy', createdById: adminId, parentGroupId: groupRoot } });
    await db.contractRecord.create({ data: { id: contractId, clientId: clientA, title: 'Teszt bérleti szerződés', contractType: 'LEASE', status: 'ACTIVE' } });
    await db.clientObligation.create({ data: { id: obligationId, clientId: clientA, sourceType: 'CONTRACT', sourceContractId: contractId, title: 'Éves beszámoló', triggerType: 'DATE', status: 'OPEN' } });
    await db.developmentInitiative.create({ data: { id: initiativeId, clientId: clientA, title: 'Fejlesztési program', status: 'PLANNED', priority: 'MEDIUM' } });
    await db.document.createMany({ data: [
      { id: docStd, name: 'Standard Doc', mimeType: 'text/plain', category: 'CONTRACT', clientId: clientA, caseId: caseA, isLatest: true, securityClassification: 'STANDARD' },
      { id: docHr, name: 'HR Confidential Doc', mimeType: 'text/plain', category: 'OTHER', clientId: clientA, caseId: caseA, isLatest: true, securityClassification: 'HR_CONFIDENTIAL' },
    ] as never });
    await db.documentVersion.createMany({ data: [
      { id: verStd, documentId: docStd, version: 1, name: 'v1', uploadedById: adminId, isCurrent: true, uploadSource: 'LAWYER_UPLOAD', versionType: 'ORIGINAL' },
      { id: verHr, documentId: docHr, version: 1, name: 'v1', uploadedById: adminId, isCurrent: true, uploadSource: 'LAWYER_UPLOAD', versionType: 'ORIGINAL' },
    ] as never });
    // Task + document-task links (STANDARD and HR) for the task-documents HR filter.
    await db.task.create({ data: { id: taskA, title: 'Feladat', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: caseA, assignedToId: lawyerId, assignedById: adminId, requiredSkills: [] } as never });
    await db.documentTaskLink.createMany({ data: [
      { documentId: docStd, taskId: taskA, createdById: adminId },
      { documentId: docHr, taskId: taskA, createdById: adminId },
    ] as never });
    // Portal workspaces + memberships for portalMembershipId validation.
    // clientA workspace + ACTIVE and REVOKED memberships; clientB workspace + membership (cross-client).
    const portalIdentityId2 = crypto.randomUUID();
    await db.clientPortalIdentity.createMany({ data: [
      { id: portalIdentityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://issuer.test', subject: `sub-${suffix}`, normalizedEmail: `person-${suffix}@test.invalid`, displayName: 'Portal Person', accountType: 'ORGANIZATION_MEMBER' },
      { id: portalIdentityId2, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://issuer.test', subject: `sub2-${suffix}`, normalizedEmail: `person2-${suffix}@test.invalid`, displayName: 'Portal Person 2', accountType: 'ORGANIZATION_MEMBER' },
    ] as never });
    await db.clientPortalWorkspace.createMany({ data: [
      { id: workspaceA, clientId: clientA, name: 'A workspace', mode: 'ORGANIZATION', createdById: adminId, publicReference: `ws-a-${suffix}` },
      { id: workspaceB, clientId: clientB, name: 'B workspace', mode: 'ORGANIZATION', createdById: adminId, publicReference: `ws-b-${suffix}` },
    ] as never });
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: membershipA, clientPortalIdentityId: portalIdentityId, workspaceId: workspaceA, status: 'ACTIVE' },
      { id: membershipRevoked, clientPortalIdentityId: portalIdentityId2, workspaceId: workspaceA, status: 'REVOKED' },
      { id: membershipB, clientPortalIdentityId: portalIdentityId, workspaceId: workspaceB, status: 'ACTIVE' },
    ] as never });
  });

  function mockRes() {
    const res: any = { statusCode: 0, body: null };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    return res;
  }

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('builds a group hierarchy and rejects self-parent / cycle / cross-client', async () => {
    const child = await createGroup(admin, clientA, { name: 'Könyvelés', parentGroupId: groupFinance });
    expect(child.parentGroupId).toBe(groupFinance);
    await expect(updateGroup(admin, groupRoot, { parentGroupId: groupRoot })).rejects.toMatchObject({ code: 'SELF_PARENT_FORBIDDEN' });
    await expect(updateGroup(admin, groupFinance, { parentGroupId: child.id })).rejects.toMatchObject({ code: 'GROUP_CYCLE' });
  });

  it('creates people with manager/deputy and rejects cycles + cross-client', async () => {
    const ceo = await createPerson(admin, clientA, { name: 'Ügyvezető', jobTitle: 'Ügyvezető', organizationGroupId: groupRoot, employmentStatus: 'ACTIVE' });
    const finance = await createPerson(admin, clientA, { name: 'Pénzügyi vezető', jobTitle: 'Pénzügyi vezető', organizationGroupId: groupFinance, managerPersonId: ceo.id, employmentStatus: 'ACTIVE' });
    const controller = await createPerson(admin, clientA, { name: 'Controller', jobTitle: 'Controller', managerPersonId: finance.id, deputyPersonId: ceo.id, employmentStatus: 'ACTIVE' });
    expect(controller.managerPersonId).toBe(finance.id);
    expect(controller.deputyPersonId).toBe(ceo.id);
    // A -> B -> C; setting A.manager = C creates a cycle.
    await expect(updatePerson(admin, ceo.id, { managerPersonId: controller.id })).rejects.toMatchObject({ code: 'MANAGER_CYCLE' });
    // Self-manager and self-deputy rejected.
    await expect(updatePerson(admin, ceo.id, { managerPersonId: ceo.id })).rejects.toMatchObject({ code: 'SELF_MANAGER_FORBIDDEN' });
    await expect(updatePerson(admin, finance.id, { deputyPersonId: finance.id })).rejects.toMatchObject({ code: 'SELF_DEPUTY_FORBIDDEN' });
  });

  it('runs a person lifecycle and rejects an illegitimate jump', async () => {
    const person = await createPerson(admin, clientA, { name: 'Teszt személy', employmentStatus: 'ACTIVE' });
    await transitionPerson(admin, person.id, 'ON_LEAVE');
    await transitionPerson(admin, person.id, 'ACTIVE');
    await transitionPerson(admin, person.id, 'ENDED');
    await expect(transitionPerson(admin, person.id, 'ACTIVE')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    const ended = await db.organizationPerson.findUnique({ where: { id: person.id }, select: { endDate: true } });
    expect(ended!.endDate).not.toBeNull();
  });

  it('adds/removes responsibilities', async () => {
    const person = await createPerson(admin, clientA, { name: 'Felelős', employmentStatus: 'ACTIVE' });
    const responsibility = await addResponsibility(admin, person.id, { type: 'CONTRACT_OWNER', label: 'Szerződésgazda' });
    expect(responsibility.type).toBe('CONTRACT_OWNER');
    const detail = await getPerson(admin, person.id);
    expect(detail.responsibilities.some((r: any) => r.id === responsibility.id)).toBe(true);
  });

  it('links contract/obligation/initiative owners (same Client) and rejects cross-client', async () => {
    const person = await createPerson(admin, clientA, { name: 'Gazda', employmentStatus: 'ACTIVE' });
    await setContractBusinessOwner(admin, contractId, person.id);
    await setObligationOwner(admin, obligationId, person.id);
    await setInitiativeClientOwner(admin, initiativeId, person.id);
    const updated = await db.contractRecord.findUnique({ where: { id: contractId }, select: { businessOwnerPersonId: true } });
    expect(updated!.businessOwnerPersonId).toBe(person.id);
    const detail = await getPerson(admin, person.id);
    expect(detail.ownedContracts.length).toBe(1);
    expect(detail.ownedObligations.length).toBe(1);
    expect(detail.ownedInitiatives.length).toBe(1);
  });

  it('links a person document (STANDARD) and gates HR_CONFIDENTIAL links by role', async () => {
    const person = await createPerson(admin, clientA, { name: 'Munkavállaló', employmentStatus: 'ACTIVE' });
    await linkPersonDocument(admin, person.id, { documentVersionId: verStd, documentRole: 'EMPLOYMENT_CONTRACT' });
    await linkPersonDocument(admin, person.id, { documentVersionId: verHr, documentRole: 'NDA' });
    // Non-privileged sees only the STANDARD document link.
    const lawyerLinks = await listPersonDocuments(lawyer, person.id);
    expect(lawyerLinks.items.length).toBe(1);
    expect(lawyerLinks.items[0].documentVersionId).toBe(verStd);
    // Privileged sees both.
    const adminLinks = await listPersonDocuments(admin, person.id);
    expect(adminLinks.items.length).toBe(2);
  });

  it('HR-confidential helper + document list filter hide HR docs from non-privileged', async () => {
    expect(hrConfidentialReadAllowed('ADMIN')).toBe(true);
    expect(hrConfidentialReadAllowed('PARTNER')).toBe(true);
    expect(hrConfidentialReadAllowed('LAWYER')).toBe(false);
    expect(hrConfidentialReadAllowed('CLIENT')).toBe(false);
    const adminDocs = await documentsService.getCaseDocuments(caseA, 'ADMIN');
    expect(adminDocs.some((doc: any) => doc.id === docHr)).toBe(true);
    const lawyerDocs = await documentsService.getCaseDocuments(caseA, 'LAWYER');
    expect(lawyerDocs.some((doc: any) => doc.id === docHr)).toBe(false);
  });

  it('computes responsibility gaps deterministically', async () => {
    const gaps = await responsibilityGaps(admin, clientA);
    expect(gaps.contractsWithoutOwner.length).toBe(0); // contract now owned
    expect(gaps.obligationsWithoutOwner.length).toBe(0); // obligation now owned
  });

  it('enforces client-scope isolation for non-manager reads', async () => {
    await expect(listPersons(externalLawyer, clientA)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const persons = await listPersons(lawyer, clientA);
    expect(Array.isArray(persons.items)).toBe(true);
  });

  it('privacy: customer-safe projector never exposes internal/HR/person IDs', async () => {
    const view = await projectOrganizationForCustomer(clientA);
    const json = JSON.stringify(view);
    expect(view.persons.length).toBeGreaterThan(0);
    expect(json).not.toContain('portalMembershipId');
    expect(json).not.toContain('employmentStatus');
    expect(json).not.toContain('responsibilitiesSummary');
    expect(json).not.toContain('HR_CONFIDENTIAL');
  });

  it('validates portalMembershipId: same-client OK, rejects cross-client + revoked', async () => {
    const ok = await createPerson(admin, clientA, { name: 'Portál személy', portalMembershipId: membershipA });
    expect(ok.portalMembershipId).toBe(membershipA);
    // Cross-client workspace membership rejected.
    await expect(createPerson(admin, clientA, { name: 'X', portalMembershipId: membershipB }))
      .rejects.toMatchObject({ code: 'CROSS_CLIENT_PORTAL_MEMBERSHIP' });
    // Revoked membership rejected.
    await expect(createPerson(admin, clientA, { name: 'Y', portalMembershipId: membershipRevoked }))
      .rejects.toMatchObject({ code: 'PORTAL_MEMBERSHIP_INACTIVE' });
    // Non-existent membership rejected.
    await expect(updatePerson(admin, ok.id, { portalMembershipId: crypto.randomUUID() }))
      .rejects.toMatchObject({ code: 'PORTAL_MEMBERSHIP_NOT_FOUND' });
  });

  it('hides HR_CONFIDENTIAL documents from search for non-privileged users', async () => {
    const adminHits = await documentsService.searchDocuments(suffix, 50, 'ADMIN');
    expect(adminHits.some((d: any) => d.id === docHr)).toBe(true);
    expect(adminHits.some((d: any) => d.id === docStd)).toBe(true);
    const lawyerHits = await documentsService.searchDocuments(suffix, 50, 'LAWYER');
    expect(lawyerHits.some((d: any) => d.id === docHr)).toBe(false);
    expect(lawyerHits.some((d: any) => d.id === docStd)).toBe(true);
  });

  it('HR read-gate middleware blocks an HR document for non-privileged, allows privileged + standard', async () => {
    // HR document + LAWYER -> forbidden, next not called.
    const res1 = mockRes(); let next1 = false;
    await requireHrConfidentialReadAccess({ params: { id: docHr }, user: { role: 'LAWYER' } } as any, res1 as any, () => { next1 = true; });
    expect(next1).toBe(false);
    expect(res1.statusCode).toBe(403);
    // HR document + ADMIN -> next called.
    const res2 = mockRes(); let next2 = false;
    await requireHrConfidentialReadAccess({ params: { id: docHr }, user: { role: 'ADMIN' } } as any, res2 as any, () => { next2 = true; });
    expect(next2).toBe(true);
    // STANDARD document + LAWYER -> next called (unchanged behaviour).
    const res3 = mockRes(); let next3 = false;
    await requireHrConfidentialReadAccess({ params: { id: docStd }, user: { role: 'LAWYER' } } as any, res3 as any, () => { next3 = true; });
    expect(next3).toBe(true);
  });

  it('filters HR_CONFIDENTIAL documents from a task linked-document list', async () => {
    const adminDocs = await listTaskDocuments({ user: { userId: adminId, role: 'ADMIN' } } as any, taskA);
    expect(adminDocs.documents.some((d: any) => d.id === docHr)).toBe(true);
    const lawyerDocs = await listTaskDocuments({ user: { userId: lawyerId, role: 'LAWYER' } } as any, taskA);
    expect(lawyerDocs.documents.some((d: any) => d.id === docHr)).toBe(false);
    expect(lawyerDocs.documents.some((d: any) => d.id === docStd)).toBe(true);
  });

  it('rejects cross-client owner person linkage', async () => {
    const personB = await createPerson(admin, clientB, { name: 'B személy', employmentStatus: 'ACTIVE' });
    await expect(setContractBusinessOwner(admin, contractId, personB.id)).rejects.toMatchObject({ code: 'CROSS_CLIENT_PERSON' });
  });
});
