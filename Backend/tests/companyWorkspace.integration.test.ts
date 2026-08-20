/**
 * COMPANY WORKSPACE (Phase 4) — PostgreSQL integration + authorization.
 *
 * Exercises the coherent company workspace projection over the canonical
 * Phase 1-3 data: operating profile + grouped facts, assessments + findings,
 * contracts + obligations with linked OrganizationPerson owners (with legacy
 * label fallback), organization summary + responsibility gaps, development plan
 * with client-side owner, and the deterministic attention summary. Also covers
 * client-scope isolation and workforce-only access posture.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getWorkspaceOverview } from '../src/modules/company-workspace/service';
import {
  toContractDTO,
  toObligationDTO,
} from '../src/modules/client-contracts/service';
import { toInitiativeDTO } from '../src/modules/client-company/service';
import {
  setContractBusinessOwner,
  setInitiativeClientOwner,
  setObligationOwner,
} from '../src/modules/client-organization/service';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Company workspace (Phase 4) (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const externalLawyerId = crypto.randomUUID();
  const customerUserId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const groupRoot = crypto.randomUUID();
  const groupFinance = crypto.randomUUID();
  const contractOwned = crypto.randomUUID();
  const contractLegacy = crypto.randomUUID();
  const contractNoOwner = crypto.randomUUID();
  const contractInactiveOwner = crypto.randomUUID();
  const obligationOwned = crypto.randomUUID();
  const obligationLegacy = crypto.randomUUID();
  const obligationNoOwner = crypto.randomUUID();
  const initiativeOwned = crypto.randomUUID();
  const initiativeLegacy = crypto.randomUUID();
  const assessmentArchived = crypto.randomUUID();
  const findingArchived = crypto.randomUUID();
  const personOwner = crypto.randomUUID();
  const personInactive = crypto.randomUUID();
  const personInactiveOwner = crypto.randomUUID();
  const personB = crypto.randomUUID();
  const inactiveWorkforceId = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };
  const externalLawyer = { userId: externalLawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: adminId, email: `ws-admin-${suffix}@test.invalid`, name: 'Workspace Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: partnerId, email: `ws-partner-${suffix}@test.invalid`, name: 'Workspace Partner', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: lawyerId, email: `ws-lawyer-${suffix}@test.invalid`, name: 'Workspace Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: externalLawyerId, email: `ws-lawyer-b-${suffix}@test.invalid`, name: 'Workspace Lawyer B', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: customerUserId, email: `ws-customer-${suffix}@test.invalid`, name: 'Customer User', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] },
      { id: inactiveWorkforceId, email: `ws-inactive-${suffix}@test.invalid`, name: 'Workspace Inactive', role: 'LAWYER', status: 'INACTIVE', isActive: false, skills: [] },
    ] as never });
    await db.client.createMany({ data: [
      { id: clientA, name: `Workspace Client A ${suffix}` },
      { id: clientB, name: `Workspace Client B ${suffix}` },
    ] });
    await db.case.create({ data: { id: caseA, caseNumber: `WS-${suffix}`, title: 'Workspace Case A', caseType: 'CONTRACT_REVIEW', clientId: clientA, assignedLawyerId: lawyerId, createdById: adminId } as never });
    // Client A operating profile + facts spanning multiple groups.
    await db.clientOperatingProfile.create({ data: { clientId: clientA, summary: 'Családi tulajdonú kereskedő cég, dinamikus exportmérleggel.', status: 'ACTIVE', nextReviewAt: new Date('2026-12-01T00:00:00Z') } });
    await db.clientFact.createMany({ data: [
      { clientId: clientA, type: 'EMPLOYEE_COUNT', value: '42 fő', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED' },
      { clientId: clientA, type: 'EMPLOYEE_COUNT', value: '43 fő', validFrom: new Date('2026-08-01T00:00:00Z'), verificationStatus: 'LAW_FIRM_VERIFIED' },
      // Superseded historical EMPLOYEE_COUNT (ended before now) — must NOT appear in the current Cégkép.
      { clientId: clientA, type: 'EMPLOYEE_COUNT', value: '30 fő', validFrom: new Date('2024-01-01T00:00:00Z'), validTo: new Date('2025-12-31T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED' },
      { clientId: clientA, type: 'EMPLOYEE_COUNT', value: '99 fő', validFrom: new Date('2027-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED' },
      { clientId: clientA, type: 'REVENUE_BAND', value: '500 M Ft – 1 Mrd Ft', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
      { clientId: clientA, type: 'OPERATING_COUNTRY', value: 'Magyarország, Szlovákia', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'LAW_FIRM_VERIFIED' },
      { clientId: clientA, type: 'IMPORTANT_IT_SYSTEM', value: 'Vállalatirányítási rendszer', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
      { clientId: clientB, type: 'EMPLOYEE_COUNT', value: '7 fő', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
    ] as never });
    // Client A assessments + findings (one with an important open finding).
    const assessmentHigh = crypto.randomUUID();
    const assessmentDone = crypto.randomUUID();
    await db.assessment.createMany({ data: [
      { id: assessmentHigh, clientId: clientA, type: 'CONTRACT_GOVERNANCE', title: 'Szerződés-kormányzási felmérés', status: 'IN_PROGRESS', createdByUserId: adminId },
      { id: assessmentDone, clientId: clientA, type: 'DIGITAL_MATURITY', title: 'Digitális érettség felmérés', status: 'COMPLETED', completedAt: new Date('2026-06-01T00:00:00Z'), createdByUserId: adminId },
      { id: assessmentArchived, clientId: clientA, type: 'HR_GOVERNANCE', title: 'Archivált HR felmérés', status: 'ARCHIVED', completedAt: new Date('2025-06-01T00:00:00Z'), createdByUserId: adminId },
    ] as never });
    const findingCritical = crypto.randomUUID();
    const findingResolved = crypto.randomUUID();
    await db.assessmentFinding.createMany({ data: [
      { id: findingCritical, clientId: clientA, assessmentId: assessmentHigh, severity: 'CRITICAL', title: 'Hiányzó szerződéses irányítás', status: 'OPEN', createdByUserId: adminId },
      { id: findingResolved, clientId: clientA, assessmentId: assessmentHigh, severity: 'HIGH', title: 'Rendezett adatkezelés', status: 'RESOLVED', createdByUserId: adminId },
      { id: findingArchived, clientId: clientA, assessmentId: assessmentArchived, severity: 'CRITICAL', title: 'Archivált kritikus megállapítás', status: 'OPEN', createdByUserId: adminId },
    ] as never });
    await db.contractParty.createMany({ data: [
      { contractId: contractOwned, roleCode: 'CUSTOMER', displayName: 'Egyedi megrendelő' },
      { contractId: contractLegacy, roleCode: 'LESSOR', displayName: 'Bérbeadó Zrt.' },
      { contractId: contractLegacy, roleCode: 'LESSEE', displayName: 'Bérlő Kft.' },
    ] as never });
    // Contracts: one owned by person, one legacy label only, one with no owner.
    await db.contractRecord.createMany({ data: [
      { id: contractOwned, clientId: clientA, title: 'Beszállítói keretszerződés', contractType: 'B2B_SUPPLY', status: 'ACTIVE', effectiveDate: new Date('2026-01-01T00:00:00Z'), expiryDate: new Date('2027-01-01T00:00:00Z') },
      { id: contractLegacy, clientId: clientA, title: 'Irodabérleti szerződés', contractType: 'LEASE', status: 'ACTIVE', businessOwnerLabel: 'Tulajdonos (A. B.)', effectiveDate: new Date('2025-01-01T00:00:00Z') },
      { id: contractNoOwner, clientId: clientA, title: 'Szolgáltatási szerződés', contractType: 'SERVICE', status: 'ACTIVE', effectiveDate: new Date('2026-03-01T00:00:00Z') },
      { id: contractInactiveOwner, clientId: clientA, title: 'Karbantartási szerződés', contractType: 'SERVICE', status: 'ACTIVE', effectiveDate: new Date('2026-02-01T00:00:00Z') },
      { id: contractOwned + 'b', clientId: clientB, title: 'B ügyfél szerződés', contractType: 'SERVICE', status: 'ACTIVE', effectiveDate: new Date('2026-01-01T00:00:00Z') },
    ] as never });
    // Obligations: owned, legacy label only, no owner, and one belonging to client B.
    await db.clientObligation.createMany({ data: [
      { id: obligationOwned, clientId: clientA, sourceType: 'CONTRACT', sourceContractId: contractOwned, title: 'Éves beszámoló benyújtása', triggerType: 'RECURRING', frequencyCode: 'ANNUAL', status: 'OPEN', nextDueDate: new Date('2026-09-30T00:00:00Z') },
      { id: obligationLegacy, clientId: clientA, sourceType: 'CONTRACT', sourceContractId: contractLegacy, title: 'Bérleti díj éves indexálása', triggerType: 'DATE', status: 'IN_PROGRESS', ownerLabel: 'Pénzügyi vezető', nextDueDate: new Date('2026-12-31T00:00:00Z') },
      { id: obligationNoOwner, clientId: clientA, sourceType: 'CONTRACT', sourceContractId: contractNoOwner, title: 'Szolgáltatási jelentés', triggerType: 'RECURRING', frequencyCode: 'QUARTERLY', status: 'OPEN', nextDueDate: new Date('2026-08-15T00:00:00Z') },
      { id: obligationOwned + 'b', clientId: clientB, sourceType: 'CONTRACT', sourceContractId: contractOwned + 'b', title: 'B kötelezettség', triggerType: 'DATE', status: 'OPEN', nextDueDate: new Date('2026-10-01T00:00:00Z') },
    ] as never });
    // Organization: groups + persons.
    await db.clientOrganizationGroup.create({ data: { id: groupRoot, clientId: clientA, name: 'Vezetőség', createdById: adminId } });
    await db.clientOrganizationGroup.create({ data: { id: groupFinance, clientId: clientA, name: 'Pénzügy', createdById: adminId, parentGroupId: groupRoot } });
    await db.organizationPerson.createMany({ data: [
      { id: personOwner, clientId: clientA, organizationGroupId: groupFinance, name: 'Pénzügyi vezető', jobTitle: 'Pénzügyi vezető', employmentStatus: 'ACTIVE' },
      { id: personInactive, clientId: clientA, organizationGroupId: groupRoot, name: 'Korábbi ügyvezető', jobTitle: 'Ügyvezető', employmentStatus: 'ENDED' },
      { id: personInactiveOwner, clientId: clientA, organizationGroupId: groupFinance, name: 'Távozott felelős', jobTitle: 'Szerződésgazda', employmentStatus: 'ENDED' },
      { id: personB, clientId: clientB, name: 'B személy', jobTitle: 'B vezető', employmentStatus: 'ACTIVE' },
    ] as never });
    // Initiatives: one with client owner, one without, plus milestone for the owned one.
    await db.developmentInitiative.createMany({ data: [
      { id: initiativeOwned, clientId: clientA, title: 'ISO 27001 bevezetés', priority: 'HIGH', status: 'ACTIVE', startedAt: new Date('2026-04-01T00:00:00Z') },
      { id: initiativeLegacy, clientId: clientA, title: 'Könyvelési folyamatfejlesztés', priority: 'MEDIUM', status: 'PLANNED' },
      { id: initiativeOwned + 'b', clientId: clientB, title: 'B program', priority: 'MEDIUM', status: 'ACTIVE' },
    ] as never });
    await db.companyMilestone.create({ data: { id: crypto.randomUUID(), clientId: clientA, type: 'IMPORTANT_IT_SYSTEM', title: 'Bevezetés kezdete', status: 'PLANNED', targetDate: new Date('2026-09-01T00:00:00Z'), developmentInitiativeId: initiativeOwned, createdByUserId: adminId } });
    // Link owners.
    await setContractBusinessOwner(admin, contractOwned, personOwner);
    await setObligationOwner(admin, obligationOwned, personOwner);
    await setInitiativeClientOwner(admin, initiativeOwned, personOwner);
    // An ENDED person who IS the current owner of an active contract — the only
    // legitimate "inactive owner" attention case.
    await setContractBusinessOwner(admin, contractInactiveOwner, personInactiveOwner);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('projects the coherent workspace overview for an admin', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    expect(view.client.id).toBe(clientA);
    expect(view.profile.summary).toContain('Családi');
    // Facts are grouped by category (not a raw flat table).
    const groupLabels = view.factGroups.map((g: any) => g.label);
    expect(groupLabels).toContain('Méret és forgalom');
    expect(groupLabels).toContain('Piaci jelenlét');
    expect(groupLabels).toContain('Digitális működés és adatok');
    const sizeFacts = view.factGroups.find((g: any) => g.key === 'SIZE').facts;
    expect(sizeFacts.map((f: any) => f.type)).toEqual(expect.arrayContaining(['EMPLOYEE_COUNT', 'REVENUE_BAND']));
  });

  it('surfaces the linked OrganizationPerson owner on contracts, obligations and initiatives', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const owned = view.contracts.find((c: any) => c.id === contractOwned);
    expect(owned.businessOwnerDisplay).toBe('Pénzügyi vezető');
    expect(owned.businessOwnerPersonId).toBe(personOwner);
    expect(owned.businessOwnerPersonActive).toBe(true);
    const obligation = view.obligations.find((o: any) => o.id === obligationOwned);
    expect(obligation.ownerDisplay).toBe('Pénzügyi vezető');
    expect(obligation.ownerPersonId).toBe(personOwner);
    const initiative = view.initiatives.find((i: any) => i.id === initiativeOwned);
    expect(initiative.clientOwnerDisplay).toBe('Pénzügyi vezető');
    expect(initiative.clientOwnerPersonId).toBe(personOwner);
  });

  it('falls back to the legacy owner label when no OrganizationPerson is linked', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const legacy = view.contracts.find((c: any) => c.id === contractLegacy);
    expect(legacy.businessOwnerDisplay).toBe('Tulajdonos (A. B.)');
    expect(legacy.businessOwnerPersonId).toBeNull();
    const obligation = view.obligations.find((o: any) => o.id === obligationLegacy);
    expect(obligation.ownerDisplay).toBe('Pénzügyi vezető');
    expect(obligation.ownerPersonId).toBeNull();
  });

  it('marks contracts/obligations without any owner as a gap with no display owner', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const noOwnerContract = view.contracts.find((c: any) => c.id === contractNoOwner);
    expect(noOwnerContract.businessOwnerDisplay).toBeNull();
    expect(view.gaps.contractsWithoutOwner.map((g: any) => g.id)).toContain(contractNoOwner);
    expect(view.gaps.obligationsWithoutOwner.map((g: any) => g.id)).toContain(obligationNoOwner);
  });

  it('computes the deterministic attention summary; active initiatives are not a warning', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const codes = view.attention.map((a: any) => a.code);
    expect(codes).toContain('OPEN_IMPORTANT_FINDINGS');
    expect(codes).toContain('CONTRACTS_WITHOUT_OWNER');
    expect(codes).toContain('OBLIGATIONS_WITHOUT_OWNER');
    expect(codes).toContain('INACTIVE_OWNER_PERSONS');
    // Active initiatives are normal, expected state — never an attention warning.
    expect(codes).not.toContain('ACTIVE_INITIATIVES');
    const contractGap = view.attention.find((a: any) => a.code === 'CONTRACTS_WITHOUT_OWNER');
    // Only the ACTIVE contract with NO owner at all — legacy-label contracts are not gaps.
    expect(contractGap.count).toBe(1);
  });

  it('flags only inactive persons who are the actual current owner, not every former employee', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const inactiveIds = view.gaps.inactiveOwnerPersons.map((p: any) => p.id);
    expect(inactiveIds).toContain(personInactiveOwner); // ENDED and owns an ACTIVE contract
    expect(inactiveIds).not.toContain(personInactive);  // ENDED but owns nothing current
    const item = view.attention.find((a: any) => a.code === 'INACTIVE_OWNER_PERSONS');
    expect(item.count).toBe(1);
  });

  it('marks expired, future and overlapping facts with exactly one deterministic current row', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const sizeGroup = view.factGroups.find((g: any) => g.key === 'SIZE');
    const employeeFacts = sizeGroup.facts.filter((f: any) => f.type === 'EMPLOYEE_COUNT');
    expect(employeeFacts.map((f: any) => f.value)).toEqual(expect.arrayContaining(['30 fő', '42 fő', '43 fő', '99 fő']));
    expect(employeeFacts.filter((f: any) => f.isCurrent)).toHaveLength(1);
    expect(employeeFacts.find((f: any) => f.value === '43 fő').isCurrent).toBe(true);
    expect(employeeFacts.find((f: any) => f.value === '30 fő').isCurrent).toBe(false);
    expect(employeeFacts.find((f: any) => f.value === '99 fő').isCurrent).toBe(false);
  });

  it('does not let archived assessments create live attention', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    expect(view.attention.find((a: any) => a.code === 'OPEN_IMPORTANT_FINDINGS')?.count).toBe(1);
    expect(view.assessments.find((a: any) => a.status === 'ARCHIVED')?.importantFindings).toEqual([]);
  });

  it('uses a neutral deterministic party summary without a universal SUPPLIER assumption', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    expect(view.contracts.find((c: any) => c.id === contractOwned).counterpartySummary).toBe('Egyedi megrendelő');
    const multiple = view.contracts.find((c: any) => c.id === contractLegacy).counterpartySummary;
    expect(multiple).toContain('Bérbeadó Zrt.');
    expect(multiple).toContain('Bérlő Kft.');
  });

  it('presents assessments with their important open findings', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const inProgress = view.assessments.find((a: any) => a.status === 'IN_PROGRESS');
    expect(inProgress.importantFindings.length).toBe(1);
    expect(inProgress.importantFindings[0].severity).toBe('CRITICAL');
    expect(inProgress.importantFindings[0].status).toBe('OPEN');
    const completed = view.assessments.find((a: any) => a.status === 'COMPLETED');
    expect(completed.importantFindings.length).toBe(0);
  });

  it('summarizes obligations with related contract title, owner and due date', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const obligation = view.obligations.find((o: any) => o.id === obligationOwned);
    expect(obligation.sourceContractTitle).toBe('Beszállítói keretszerződés');
    expect(obligation.status).toBe('OPEN');
    expect(obligation.nextDueDate).toBe('2026-09-30T00:00:00.000Z');
  });

  it('presents the development plan with the client-side owner and next milestone', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const initiative = view.initiatives.find((i: any) => i.id === initiativeOwned);
    expect(initiative.clientOwnerDisplay).toBe('Pénzügyi vezető');
    expect(initiative.nextMilestone.title).toBe('Bevezetés kezdete');
    expect(initiative.nextMilestone.status).toBe('PLANNED');
  });

  it('isolates clients: client B data is never present in the client A workspace', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const json = JSON.stringify(view);
    expect(json).not.toContain('B ügyfél szerződés');
    expect(json).not.toContain('B program');
    expect(view.contracts.some((c: any) => c.id === contractOwned + 'b')).toBe(false);
    expect(view.obligations.some((o: any) => o.id === obligationOwned + 'b')).toBe(false);
    expect(view.initiatives.some((i: any) => i.id === initiativeOwned + 'b')).toBe(false);
  });

  it('masks a corrupted cross-client owner relation in the read projection', async () => {
    await db.contractRecord.update({ where: { id: contractOwned }, data: { businessOwnerPersonId: personB } });
    try {
      const view = await getWorkspaceOverview(admin, clientA, db);
      const corrupted = view.contracts.find((c: any) => c.id === contractOwned);
      expect(corrupted.businessOwnerPersonId).toBeNull();
      expect(corrupted.businessOwnerDisplay).toBeNull();
      expect(JSON.stringify(view)).not.toContain('B személy');
    } finally {
      await db.contractRecord.update({ where: { id: contractOwned }, data: { businessOwnerPersonId: personOwner } });
    }
  });

  it('enforces the canonical workforce access posture (ADMIN/PARTNER/lawyer/scope/inactive/external)', async () => {
    // ADMIN and PARTNER may read any client.
    expect((await getWorkspaceOverview(admin, clientA, db)).client.id).toBe(clientA);
    expect((await getWorkspaceOverview({ userId: partnerId, role: 'PARTNER' }, clientA, db)).client.id).toBe(clientA);
    // A lawyer WITH a Case in the client may read it; WITHOUT one is forbidden.
    expect((await getWorkspaceOverview(lawyer, clientA, db)).client.id).toBe(clientA);
    await expect(getWorkspaceOverview(externalLawyer, clientA, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    // An inactive workforce user is forbidden even though they hold a workforce role.
    await expect(getWorkspaceOverview({ userId: inactiveWorkforceId, role: 'LAWYER' }, clientA, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    // A customer/external identity (not a workforce User) resolves to no user -> forbidden;
    // company-level access never leaks to non-workforce principals.
    await expect(getWorkspaceOverview({ userId: crypto.randomUUID(), role: 'CLIENT' }, clientA, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' });
    await expect(getWorkspaceOverview({ userId: customerUserId, role: 'CLIENT' }, clientA, db)).rejects.toMatchObject({ code: 'INTERACTION_NOT_AUTHORIZED' });
  });

  it('phase 2 DTOs surface the linked owner alongside the legacy label (regression coverage)', async () => {
    const contract = await db.contractRecord.findUnique({
      where: { id: contractOwned },
      include: { businessOwnerPerson: { select: { id: true, name: true, employmentStatus: true } }, lawFirmOwner: { select: { id: true, name: true } } },
    });
    const contractDto = toContractDTO(contract);
    expect(contractDto.businessOwnerPersonName).toBe('Pénzügyi vezető');
    expect(contractDto.businessOwnerDisplay).toBe('Pénzügyi vezető');

    const obligation = await db.clientObligation.findUnique({
      where: { id: obligationLegacy },
      include: { ownerPerson: { select: { id: true, name: true } } },
    });
    const obligationDto = toObligationDTO(obligation);
    expect(obligationDto.ownerPersonName).toBeNull();
    expect(obligationDto.ownerDisplay).toBe('Pénzügyi vezető');

    const initiative = await db.developmentInitiative.findUnique({
      where: { id: initiativeOwned },
      include: { clientOwnerPerson: { select: { id: true, name: true } }, lawFirmOwner: { select: { id: true, name: true } } },
    });
    const initiativeDto = toInitiativeDTO(initiative);
    expect(initiativeDto.clientOwnerPersonName).toBe('Pénzügyi vezető');
    expect(initiativeDto.clientOwnerDisplay).toBe('Pénzügyi vezető');
    expect(initiativeDto.lawFirmOwnerName).toBeNull();
  });

  it('never leaks the client B person as an owner on client A records', async () => {
    await expect(setContractBusinessOwner(admin, contractOwned, personB)).rejects.toMatchObject({ code: 'CROSS_CLIENT_PERSON' });
    await expect(setObligationOwner(admin, obligationOwned, personB)).rejects.toMatchObject({ code: 'CROSS_CLIENT_PERSON' });
    await expect(setInitiativeClientOwner(admin, initiativeOwned, personB)).rejects.toMatchObject({ code: 'CROSS_CLIENT_PERSON' });
  });

  it('keeps the workspace surface structurally ready for a future compliance section (no placeholder data)', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const json = JSON.stringify(view);
    expect(json).not.toContain('LegalSource');
    expect(json).not.toContain('Requirement');
    expect(json).not.toContain('ApplicabilityRule');
    expect(json).not.toContain('ComplianceDocumentType');
    expect(json).not.toContain('Control');
  });
});
