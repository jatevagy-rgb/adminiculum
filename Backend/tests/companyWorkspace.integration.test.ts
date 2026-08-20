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
  const lawyerId = crypto.randomUUID();
  const externalLawyerId = crypto.randomUUID();
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
  const personOwner = crypto.randomUUID();
  const personInactive = crypto.randomUUID();
  const personEndedNotOwner = crypto.randomUUID();
  const personB = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };
  const externalLawyer = { userId: externalLawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: adminId, email: `ws-admin-${suffix}@test.invalid`, name: 'Workspace Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: lawyerId, email: `ws-lawyer-${suffix}@test.invalid`, name: 'Workspace Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: externalLawyerId, email: `ws-lawyer-b-${suffix}@test.invalid`, name: 'Workspace Lawyer B', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
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
      { clientId: clientA, type: 'REVENUE_BAND', value: '500 M Ft – 1 Mrd Ft', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
      { clientId: clientA, type: 'OPERATING_COUNTRY', value: 'Magyarország, Szlovákia', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'LAW_FIRM_VERIFIED' },
      { clientId: clientA, type: 'IMPORTANT_IT_SYSTEM', value: 'Vállalatirányítási rendszer', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
      // Historical (expired) fact for the same type as a current one — must not be presented as live.
      { clientId: clientA, type: 'EMPLOYEE_COUNT', value: '35 fő', validFrom: new Date('2024-01-01T00:00:00Z'), validTo: new Date('2025-12-31T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
      { clientId: clientB, type: 'EMPLOYEE_COUNT', value: '7 fő', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'UNVERIFIED' },
    ] as never });
    // Client A assessments + findings (one with an important open finding).
    const assessmentHigh = crypto.randomUUID();
    const assessmentDone = crypto.randomUUID();
    await db.assessment.createMany({ data: [
      { id: assessmentHigh, clientId: clientA, type: 'CONTRACT_GOVERNANCE', title: 'Szerződés-kormányzási felmérés', status: 'IN_PROGRESS', createdByUserId: adminId },
      { id: assessmentDone, clientId: clientA, type: 'DIGITAL_MATURITY', title: 'Digitális érettség felmérés', status: 'COMPLETED', completedAt: new Date('2026-06-01T00:00:00Z'), createdByUserId: adminId },
    ] as never });
    const findingCritical = crypto.randomUUID();
    const findingResolved = crypto.randomUUID();
    await db.assessmentFinding.createMany({ data: [
      { id: findingCritical, clientId: clientA, assessmentId: assessmentHigh, severity: 'CRITICAL', title: 'Hiányzó szerződéses irányítás', status: 'OPEN', createdByUserId: adminId },
      { id: findingResolved, clientId: clientA, assessmentId: assessmentHigh, severity: 'HIGH', title: 'Rendezett adatkezelés', status: 'RESOLVED', createdByUserId: adminId },
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
      { id: personEndedNotOwner, clientId: clientA, name: 'Régi munkatárs', jobTitle: 'Munkatárs', employmentStatus: 'ENDED' },
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
    // An ENDED person still referenced as the current owner of an ACTIVE contract.
    await setContractBusinessOwner(admin, contractInactiveOwner, personInactive);
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

  it('computes the deterministic attention summary from existing data', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const codes = view.attention.map((a: any) => a.code);
    expect(codes).toContain('OPEN_IMPORTANT_FINDINGS');
    expect(codes).toContain('CONTRACTS_WITHOUT_OWNER');
    expect(codes).toContain('OBLIGATIONS_WITHOUT_OWNER');
    expect(codes).toContain('INACTIVE_OWNER_PERSONS');
    expect(codes).toContain('ACTIVE_INITIATIVES');
    const contractGap = view.attention.find((a: any) => a.code === 'CONTRACTS_WITHOUT_OWNER');
    expect(contractGap.count).toBe(1); // only the ACTIVE contract without a person owner
    const inactiveGap = view.attention.find((a: any) => a.code === 'INACTIVE_OWNER_PERSONS');
    expect(inactiveGap.count).toBe(1); // only the ENDED person still referenced as an owner
  });

  it('flags an inactive person only when they are ACTUALLY referenced as a current owner', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    // The ENDED person who still owns an ACTIVE contract IS an ownership gap.
    expect(view.gaps.inactiveOwnerPersons.map((g: any) => g.id)).toContain(personInactive);
    // A former employee who is NOT referenced as any current owner is NOT a gap.
    expect(view.gaps.inactiveOwnerPersons.map((g: any) => g.id)).not.toContain(personEndedNotOwner);
    expect(view.gaps.inactiveOwnerCount).toBe(1);
  });

  it('marks current vs historical ClientFacts (isCurrent flag respects validFrom/validTo)', async () => {
    const view = await getWorkspaceOverview(admin, clientA, db);
    const sizeGroup = view.factGroups.find((g: any) => g.key === 'SIZE');
    const employeeFacts = sizeGroup.facts.filter((f: any) => f.type === 'EMPLOYEE_COUNT');
    expect(employeeFacts.length).toBe(2);
    const current = employeeFacts.find((f: any) => f.isCurrent);
    const historical = employeeFacts.find((f: any) => !f.isCurrent);
    expect(current.value).toBe('42 fő');
    expect(historical.value).toBe('35 fő');
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

  it('enforces workforce-only access: a lawyer without a case in the client is forbidden', async () => {
    await expect(getWorkspaceOverview(externalLawyer, clientA, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    // A lawyer with a case in the client may read it.
    const view = await getWorkspaceOverview(lawyer, clientA, db);
    expect(view.client.id).toBe(clientA);
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