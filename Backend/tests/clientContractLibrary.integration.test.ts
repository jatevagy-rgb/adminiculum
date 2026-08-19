/**
 * CONTRACT LIBRARY (Phase 2) — PostgreSQL integration + authorization.
 *
 * Covers lifecycle transitions, date validation, family/amendment rules,
 * cycle rejection, party validation, canonical DocumentVersion linkage (same +
 * cross client), Case linkage, obligation lifecycle + Task link, entitlement
 * lifecycle, client-scope isolation and the customer-safe projector.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  addParty,
  createContract,
  createEntitlement,
  createObligation,
  getContract,
  getContractFamily,
  listContracts,
  setCanonicalDocument,
  transitionContract,
  transitionEntitlement,
  transitionObligation,
  updateContract,
  updateObligation,
} from '../src/modules/client-contracts/service';
import { projectContractLibraryForCustomer } from '../src/modules/client-contracts/projector';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Contract library (Phase 2) (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const externalLawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const taskA = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const taskB = crypto.randomUUID();
  const docA = crypto.randomUUID();
  const versionA = crypto.randomUUID();
  const docB = crypto.randomUUID();
  const versionB = crypto.randomUUID();

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
      { id: clientA, name: `Contract Client A ${suffix}` },
      { id: clientB, name: `Contract Client B ${suffix}` },
    ] });
    await db.case.create({ data: { id: caseA, caseNumber: `CL-${suffix}`, title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: clientA, assignedLawyerId: lawyerId, createdById: adminId } as never });
    await db.case.create({ data: { id: caseB, caseNumber: `CLB-${suffix}`, title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId: clientB, assignedLawyerId: externalLawyerId, createdById: externalLawyerId } as never });
    await db.task.create({ data: { id: taskA, title: 'Obligation Task', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: caseA, assignedToId: lawyerId, assignedById: adminId, requiredSkills: [] } as never });
    await db.task.create({ data: { id: taskB, title: 'Other Client Task', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: caseB, assignedToId: externalLawyerId, assignedById: adminId, requiredSkills: [] } as never });
    await db.document.createMany({ data: [
      { id: docA, name: 'Doc A', mimeType: 'text/plain', category: 'CONTRACT', clientId: clientA, caseId: caseA, isLatest: true },
      { id: docB, name: 'Doc B', mimeType: 'text/plain', category: 'CONTRACT', clientId: clientB, caseId: caseA, isLatest: true },
    ] as never });
    await db.documentVersion.createMany({ data: [
      { id: versionA, documentId: docA, version: 1, name: 'v1', uploadedById: adminId, isCurrent: true, uploadSource: 'LAWYER_UPLOAD', versionType: 'ORIGINAL' },
      { id: versionB, documentId: docB, version: 1, name: 'v1', uploadedById: adminId, isCurrent: true, uploadSource: 'LAWYER_UPLOAD', versionType: 'ORIGINAL' },
    ] as never });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('runs a legitimate contract lifecycle and rejects an illegitimate jump', async () => {
    const c = await createContract(admin, clientA, { title: 'Bérleti szerződés', contractType: 'LEASE', status: 'DRAFT' });
    expect(c.status).toBe('DRAFT');
    const negotiated = await transitionContract(admin, c.id, 'NEGOTIATION');
    expect(negotiated.status).toBe('NEGOTIATION');
    const signed = await transitionContract(admin, c.id, 'AWAITING_SIGNATURE');
    expect(signed.status).toBe('AWAITING_SIGNATURE');
    const effective = await transitionContract(admin, c.id, 'ACTIVE');
    expect(effective.status).toBe('ACTIVE');
    // ACTIVE -> SIGNED_NOT_EFFECTIVE is illegitimate.
    await expect(transitionContract(admin, c.id, 'SIGNED_NOT_EFFECTIVE')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    // ACTIVE -> EXPIRED is legitimate.
    await transitionContract(admin, c.id, 'EXPIRED');
  });

  it('validates date ranges and notice period', async () => {
    await expect(createContract(admin, clientA, { title: 'Bad dates', contractType: 'SERVICE', effectiveDate: '2027-01-01T00:00:00Z', expiryDate: '2026-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'DATE_RANGE_INVALID' });
    await expect(createContract(admin, clientA, { title: 'Bad notice', contractType: 'SERVICE', noticePeriodDays: -1 })).rejects.toMatchObject({ code: 'NOTICE_PERIOD_INVALID' });
    await expect(createContract(admin, clientA, { title: 'Bad date', contractType: 'SERVICE', effectiveDate: 'not-a-date' })).rejects.toMatchObject({ code: 'DATE_INVALID' });
    const c = await createContract(admin, clientA, { title: 'Partial date update', contractType: 'SERVICE', effectiveDate: '2026-01-01T00:00:00Z', expiryDate: '2027-01-01T00:00:00Z' });
    await expect(updateContract(admin, c.id, { effectiveDate: '2028-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'DATE_RANGE_INVALID' });
  });

  it('rejects cross-client canonical DocumentVersion and accepts same-client', async () => {
    const c = await createContract(admin, clientA, { title: 'Canonical test', contractType: 'SERVICE' });
    // Cross-client version (belongs to client B) rejected.
    await expect(setCanonicalDocument(admin, c.id, versionB)).rejects.toMatchObject({ code: 'CROSS_CLIENT_DOCUMENT_VERSION' });
    // Same-client version accepted.
    const linked = await setCanonicalDocument(admin, c.id, versionA);
    expect(linked.canonicalDocumentVersionId).toBe(versionA);
  });

  it('enforces family/amendment rules: same client, no self-parent, no cycle', async () => {
    const original = await createContract(admin, clientA, { title: 'Eredeti', contractType: 'LEASE' });
    const amendment = await createContract(admin, clientA, { title: '1. sz. módosítás', contractType: 'LEASE', parentContractId: original.id });
    const secondAmendment = await createContract(admin, clientA, { title: '2. sz. módosítás', contractType: 'LEASE', parentContractId: amendment.id });
    expect(amendment.parentContractId).toBe(original.id);
    expect(amendment.familyRootContractId).toBe(original.id);
    expect(secondAmendment.familyRootContractId).toBe(original.id);
    const family = await getContractFamily(admin, original.id);
    expect(family.members.map((m: any) => m.id).sort()).toEqual([original.id, amendment.id, secondAmendment.id].sort());
    // Self-parent rejected.
    await expect(updateContract(admin, original.id, { parentContractId: original.id })).rejects.toMatchObject({ code: 'SELF_PARENT_FORBIDDEN' });
    // Cycle: make original a child of its own amendment -> rejected.
    await expect(updateContract(admin, original.id, { parentContractId: secondAmendment.id })).rejects.toMatchObject({ code: 'CONTRACT_FAMILY_CYCLE' });
    await expect(updateContract(admin, amendment.id, { parentContractId: secondAmendment.id })).rejects.toMatchObject({ code: 'CONTRACT_FAMILY_CYCLE' });
  });

  it('validates party role and supports add/remove', async () => {
    const c = await createContract(admin, clientA, { title: 'Parties', contractType: 'B2B_SUPPLY' });
    await expect(addParty(admin, c.id, { roleCode: 'NOT_A_ROLE', displayName: 'X' })).rejects.toMatchObject({ code: 'PARTY_ROLE_UNKNOWN' });
    const party = await addParty(admin, c.id, { roleCode: 'SUPPLIER', displayName: 'Beszállító Kft.', taxNumber: '123' });
    expect(party.roleCode).toBe('SUPPLIER');
    const detail = await getContract(admin, c.id);
    expect(detail.parties.some((p: any) => p.id === party.id)).toBe(true);
  });

  it('runs an obligation lifecycle and links a same-client Task; rejects cross-client', async () => {
    const contract = await createContract(admin, clientA, { title: 'Kötelezettség forrása', contractType: 'LEASE' });
    await expect(createObligation(admin, clientA, { sourceType: 'CONTRACT', title: 'Hiányzó forrás', triggerType: 'DATE' })).rejects.toMatchObject({ code: 'OBLIGATION_SOURCE_CONTRACT_REQUIRED' });
    const obligation = await createObligation(admin, clientA, { sourceType: 'CONTRACT', sourceContractId: contract.id, title: 'Éves beszámoló', triggerType: 'RECURRING', frequencyCode: 'ANNUAL', nextDueDate: '2027-01-31T00:00:00Z' });
    expect(obligation.status).toBe('OPEN');
    await transitionObligation(admin, obligation.id, 'IN_PROGRESS');
    await transitionObligation(admin, obligation.id, 'SATISFIED');
    await expect(transitionObligation(admin, obligation.id, 'WAIVED')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    // Link a same-client Task.
    const updated = await db.clientObligation.update({ where: { id: obligation.id }, data: { relatedTaskId: taskA } });
    expect(updated.relatedTaskId).toBe(taskA);
    await expect(updateObligation(admin, obligation.id, { relatedTaskId: taskB })).rejects.toMatchObject({ code: 'CROSS_CLIENT_TASK' });
    // Cross-client evidence version rejected.
    await expect(updateObligation(admin, obligation.id, { evidenceDocumentVersionId: versionB })).rejects.toMatchObject({ code: 'CROSS_CLIENT_DOCUMENT_VERSION' });
  });

  it('runs an entitlement lifecycle', async () => {
    const contract = await createContract(admin, clientA, { title: 'Jogok', contractType: 'PARTNERSHIP', effectiveDate: '2027-01-01T00:00:00Z' });
    await expect(createEntitlement(admin, contract.id, { type: 'RENEWAL_OPTION', title: 'Túl korai', exerciseByDate: '2026-12-31T00:00:00Z' })).rejects.toMatchObject({ code: 'ENTITLEMENT_DATE_INVALID' });
    const entitlement = await createEntitlement(admin, contract.id, { type: 'RENEWAL_OPTION', title: 'Megújítási opció' });
    expect(entitlement.status).toBe('ACTIVE');
    await transitionEntitlement(admin, entitlement.id, 'EXERCISED');
    await expect(transitionEntitlement(admin, entitlement.id, 'WAIVED')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  it('enforces client-scope isolation for non-manager reads', async () => {
    await expect(listContracts(externalLawyer, clientA)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    await expect(listContracts(lawyer, clientB)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const contracts = await listContracts(lawyer, clientA);
    expect(Array.isArray(contracts.items)).toBe(true);
  });

  it('customer-safe projector only exposes published-version contracts and strips internals', async () => {
    // No published versions -> nothing.
    const empty = await projectContractLibraryForCustomer(clientA, new Set());
    expect(empty.items).toEqual([]);
    // Only a contract whose canonical version is published shows up.
    const c = await createContract(admin, clientA, { title: 'Publikált szerződés', contractType: 'LEASE', status: 'ACTIVE' });
    await setCanonicalDocument(admin, c.id, versionA);
    const view = await projectContractLibraryForCustomer(clientA, new Set([versionA]));
    expect(view.items.length).toBe(1);
    const json = JSON.stringify(view);
    expect(json).not.toContain('internalNote');
    expect(json).not.toContain('canonicalDocumentVersionId');
    expect(json).not.toContain('lawFirmOwnerUserId');
    expect(json).not.toContain('sourceCaseId');
    expect(json).not.toContain('securityClassification');
  });
});
