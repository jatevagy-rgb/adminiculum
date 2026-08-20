/**
 * CONTRACT LIBRARY (Phase 2) — internal workforce services.
 *
 * ContractRecord is the structured legal/business relationship, DISTINCT from
 * the physical Document/DocumentVersion. The canonical final DocumentVersion is
 * LINKED (never copied). Reuses the canonical Client / Case / Task / User /
 * DocumentVersion execution layer and the client-safe validation posture.
 * No second Document / Task / org hierarchy / Document ACL is introduced.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError,
  InternalActor,
  assertClientReadAccess,
  assertClientSafe,
  safeText,
} from '../client-interaction/base';
import {
  isContractType,
  isEntitlementType,
  isObligationFrequency,
  isObligationSourceType,
  isObligationTriggerType,
  isPartyRole,
} from './registry';

type Prisma = typeof defaultPrisma;

const MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);

const CONTRACT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['NEGOTIATION', 'AWAITING_SIGNATURE', 'ACTIVE', 'SUPERSEDED', 'TERMINATED'],
  NEGOTIATION: ['DRAFT', 'AWAITING_SIGNATURE', 'ACTIVE', 'SUPERSEDED', 'TERMINATED'],
  AWAITING_SIGNATURE: ['DRAFT', 'NEGOTIATION', 'SIGNED_NOT_EFFECTIVE', 'ACTIVE', 'SUPERSEDED', 'TERMINATED'],
  SIGNED_NOT_EFFECTIVE: ['ACTIVE', 'EXPIRED', 'SUPERSEDED', 'TERMINATED'],
  ACTIVE: ['TERMINATING', 'EXPIRED', 'TERMINATED', 'SUPERSEDED'],
  TERMINATING: ['TERMINATED', 'ACTIVE', 'EXPIRED'],
  EXPIRED: ['SUPERSEDED', 'ACTIVE'],
  TERMINATED: ['SUPERSEDED'],
  SUPERSEDED: [],
};

const OBLIGATION_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'SATISFIED', 'WAIVED', 'EXPIRED'],
  IN_PROGRESS: ['OPEN', 'SATISFIED', 'WAIVED', 'EXPIRED'],
  SATISFIED: ['OPEN', 'EXPIRED'],
  WAIVED: ['OPEN'],
  EXPIRED: ['OPEN', 'IN_PROGRESS'],
};

const ENTITLEMENT_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['EXERCISED', 'EXPIRED', 'WAIVED'],
  EXERCISED: [],
  EXPIRED: ['ACTIVE'],
  WAIVED: ['ACTIVE'],
};

const LIFECYCLE_STATUS = new Set(Object.keys(CONTRACT_TRANSITIONS));
const OBLIGATION_STATUS = new Set(Object.keys(OBLIGATION_TRANSITIONS));
const ENTITLEMENT_STATUS = new Set(Object.keys(ENTITLEMENT_TRANSITIONS));

function requireManager(actor: InternalActor): void {
  if (!actor?.userId || !MANAGER_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'CONTRACT_MANAGE_FORBIDDEN', 'Only client managers may modify contract library records.');
  }
}


function assertTransition(from: string, to: string, table: Record<string, string[]>): void {
  if (!table[from]?.includes(to)) {
    throw new InteractionError(409, 'INVALID_STATUS_TRANSITION', `Transition ${from} -> ${to} is not allowed.`);
  }
}

function iso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

async function assertSameClientDocumentVersion(prisma: Prisma, contractClientId: string, documentVersionId: string): Promise<void> {
  const doc = await prisma.documentVersion.findUnique({ where: { id: documentVersionId }, select: { document: { select: { clientId: true } } } });
  if (!doc) throw new InteractionError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version not found.');
  if (doc.document.clientId !== contractClientId) throw new InteractionError(403, 'CROSS_CLIENT_DOCUMENT_VERSION', 'Document version belongs to another client.');
}

async function assertSameClientCase(prisma: Prisma, contractClientId: string, caseId: string): Promise<void> {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
  if (!c) throw new InteractionError(404, 'CASE_NOT_FOUND', 'Case not found.');
  if (c.clientId !== contractClientId) throw new InteractionError(403, 'CROSS_CLIENT_CASE', 'Case belongs to another client.');
}

async function assertSameClientTask(prisma: Prisma, contractClientId: string, taskId: string): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { case: { select: { clientId: true } } } });
  if (!t) throw new InteractionError(404, 'TASK_NOT_FOUND', 'Task not found.');
  if (t.case.clientId !== contractClientId) throw new InteractionError(403, 'CROSS_CLIENT_TASK', 'Task belongs to another client.');
}

/** Walk the parent chain from `parentId`; returns the family root id. Throws on
 *  a cycle (if the chain reaches `contractId`) and on cross-client parents. */
async function resolveFamilyRoot(prisma: Prisma, contractId: string, contractClientId: string, parentId: string): Promise<string> {
  const seen = new Set<string>([contractId]);
  let cur: string | null = parentId;
  while (cur) {
    if (seen.has(cur)) throw new InteractionError(400, 'CONTRACT_FAMILY_CYCLE', 'Contract family cycle is not allowed.');
    seen.add(cur);
    const p = await prisma.contractRecord.findUnique({ where: { id: cur }, select: { clientId: true, parentContractId: true, familyRootContractId: true } });
    if (!p) throw new InteractionError(404, 'PARENT_CONTRACT_NOT_FOUND', 'Parent contract not found.');
    if (p.clientId !== contractClientId) throw new InteractionError(403, 'CROSS_CLIENT_PARENT', 'Parent contract belongs to another client.');
    if (p.parentContractId) {
      cur = p.parentContractId;
    } else {
      // The parent chain is authoritative. Do not trust a stale denormalized
      // familyRootContractId while assigning a new parent.
      return cur;
    }
  }
  return contractId;
}

function parseDate(value: unknown, field: string): Date | null {
  if (value == null || value === '') return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new InteractionError(400, 'DATE_INVALID', `${field} must be a valid date.`);
  return parsed;
}

function validateDates(input: Record<string, unknown>, existing?: { effectiveDate?: Date | null; expiryDate?: Date | null }): void {
  const eff = parseDate(input.effectiveDate !== undefined ? input.effectiveDate : existing?.effectiveDate, 'effectiveDate');
  const exp = parseDate(input.expiryDate !== undefined ? input.expiryDate : existing?.expiryDate, 'expiryDate');
  if (eff && exp) {
    if (eff.getTime() > exp.getTime()) throw new InteractionError(400, 'DATE_RANGE_INVALID', 'expiryDate must be on or after effectiveDate.');
  }
  if (input.noticePeriodDays != null && input.noticePeriodDays !== '') {
    const n = Number(input.noticePeriodDays);
    if (!Number.isInteger(n) || n < 0) throw new InteractionError(400, 'NOTICE_PERIOD_INVALID', 'noticePeriodDays must be a non-negative integer.');
  }
}

async function assertLawFirmOwner(prisma: Prisma, userId: string | null): Promise<void> {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE') {
    throw new InteractionError(400, 'LAW_FIRM_OWNER_INVALID', 'lawFirmOwnerUserId must reference an active workforce user.');
  }
}

function validateSecurityClassification(value: unknown): 'STANDARD' | 'RESTRICTED' {
  const classification = String(value || 'STANDARD');
  if (classification !== 'STANDARD' && classification !== 'RESTRICTED') {
    throw new InteractionError(400, 'SECURITY_CLASSIFICATION_INVALID', 'Invalid contract security classification.');
  }
  return classification;
}

/* -------------------------------------------------------------------------- */
/* DTOs                                                                       */
/* -------------------------------------------------------------------------- */

export function toContractDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    title: row.title,
    contractType: row.contractType,
    status: row.status,
    businessOwnerLabel: row.businessOwnerLabel,
    businessOwnerPersonId: row.businessOwnerPersonId,
    businessOwnerPersonName: row.businessOwnerPerson?.name ?? null,
    businessOwnerPersonActive: row.businessOwnerPerson ? String(row.businessOwnerPerson.employmentStatus) === 'ACTIVE' : null,
    businessOwnerDisplay: row.businessOwnerPerson?.name ?? row.businessOwnerLabel ?? null,
    lawFirmOwnerName: row.lawFirmOwner?.name ?? null,
    lawFirmOwnerUserId: row.lawFirmOwnerUserId,
    sourceCaseId: row.sourceCaseId,
    canonicalDocumentVersionId: row.canonicalDocumentVersionId,
    signatureDate: iso(row.signatureDate),
    effectiveDate: iso(row.effectiveDate),
    expiryDate: iso(row.expiryDate),
    termType: row.termType,
    noticePeriodDays: row.noticePeriodDays,
    autoRenewal: row.autoRenewal,
    nextCriticalDate: iso(row.nextCriticalDate),
    securityClassification: row.securityClassification,
    parentContractId: row.parentContractId,
    familyRootContractId: row.familyRootContractId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export function toPartyDTO(row: any): any {
  const dto = {
    id: row.id,
    contractId: row.contractId,
    roleCode: row.roleCode,
    displayName: row.displayName,
    registrationNumber: row.registrationNumber,
    taxNumber: row.taxNumber,
    country: row.country,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export function toObligationDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    sourceType: row.sourceType,
    sourceContractId: row.sourceContractId,
    sourceReference: row.sourceReference,
    title: row.title,
    description: row.description,
    ownerLabel: row.ownerLabel,
    ownerPersonId: row.ownerPersonId,
    ownerPersonName: row.ownerPerson?.name ?? null,
    ownerDisplay: row.ownerPerson?.name ?? row.ownerLabel ?? null,
    triggerType: row.triggerType,
    frequencyCode: row.frequencyCode,
    nextDueDate: iso(row.nextDueDate),
    status: row.status,
    relatedTaskId: row.relatedTaskId,
    evidenceDocumentVersionId: row.evidenceDocumentVersionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export function toEntitlementDTO(row: any): any {
  const dto = {
    id: row.id,
    contractId: row.contractId,
    clientId: row.clientId,
    type: row.type,
    title: row.title,
    description: row.description,
    sourceReference: row.sourceReference,
    exerciseByDate: iso(row.exerciseByDate),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

/* -------------------------------------------------------------------------- */
/* ContractRecord                                                             */
/* -------------------------------------------------------------------------- */

export async function listContracts(actor: InternalActor, clientId: string, opts: { status?: string; type?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.contractRecord.findMany({
    where: { clientId, ...(opts.status ? { status: opts.status as any } : {}), ...(opts.type ? { contractType: opts.type } : {}) },
    include: {
      parties: true,
      businessOwnerPerson: { select: { id: true, name: true, employmentStatus: true } },
      lawFirmOwner: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  const dto = rows.map((row) => ({ ...toContractDTO(row), parties: row.parties.map(toPartyDTO) }));
  assertClientSafe(dto);
  return { items: dto };
}

export async function getContract(actor: InternalActor, contractId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.contractRecord.findUnique({
    where: { id: contractId },
    include: {
      parties: true,
      amendments: { orderBy: { createdAt: 'asc' } },
      obligations: { include: { ownerPerson: { select: { id: true, name: true } }, sourceContract: { select: { id: true, title: true } } } },
      entitlements: true,
      businessOwnerPerson: { select: { id: true, name: true, employmentStatus: true } },
      lawFirmOwner: { select: { id: true, name: true } },
    },
  });
  if (!row) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const dto = {
    ...toContractDTO(row),
    parties: row.parties.map(toPartyDTO),
    amendments: row.amendments.map((a: any) => toContractDTO(a)),
    obligations: row.obligations.map(toObligationDTO),
    entitlements: row.entitlements.map(toEntitlementDTO),
  };
  assertClientSafe(dto);
  return dto;
}

export async function createContract(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const type = String(input.contractType || '');
  if (!isContractType(type)) throw new InteractionError(400, 'CONTRACT_TYPE_UNKNOWN', 'Unknown contract type.');
  const status = String(input.status || 'DRAFT');
  if (!LIFECYCLE_STATUS.has(status)) throw new InteractionError(400, 'CONTRACT_STATUS_INVALID', 'Invalid contract status.');
  validateDates(input);
  const securityClassification = validateSecurityClassification(input.securityClassification);
  const lawFirmOwnerUserId = input.lawFirmOwnerUserId ? String(input.lawFirmOwnerUserId) : null;
  await assertLawFirmOwner(prisma, lawFirmOwnerUserId);
  let parentId: string | null = null;
  let familyRootId: string | null = null;
  if (input.parentContractId) {
    parentId = String(input.parentContractId);
    familyRootId = await resolveFamilyRoot(prisma, '', clientId, parentId);
  }
  if (input.canonicalDocumentVersionId) await assertSameClientDocumentVersion(prisma, clientId, String(input.canonicalDocumentVersionId));
  if (input.sourceCaseId) await assertSameClientCase(prisma, clientId, String(input.sourceCaseId));
  const row = await prisma.contractRecord.create({
    data: {
      clientId,
      title: safeText(input.title, 'title', 240, true)!,
      contractType: type,
      status: status as any,
      businessOwnerLabel: safeText(input.businessOwnerLabel, 'businessOwnerLabel', 180, false),
      lawFirmOwnerUserId,
      sourceCaseId: input.sourceCaseId ? String(input.sourceCaseId) : null,
      canonicalDocumentVersionId: input.canonicalDocumentVersionId ? String(input.canonicalDocumentVersionId) : null,
      signatureDate: parseDate(input.signatureDate, 'signatureDate'),
      effectiveDate: parseDate(input.effectiveDate, 'effectiveDate'),
      expiryDate: parseDate(input.expiryDate, 'expiryDate'),
      termType: safeText(input.termType, 'termType', 60, false),
      noticePeriodDays: input.noticePeriodDays != null && input.noticePeriodDays !== '' ? Number(input.noticePeriodDays) : null,
      autoRenewal: Boolean(input.autoRenewal),
      nextCriticalDate: parseDate(input.nextCriticalDate, 'nextCriticalDate'),
      securityClassification: securityClassification as any,
      internalNote: safeText(input.internalNote, 'internalNote', 2000, false),
      parentContractId: parentId,
      familyRootContractId: familyRootId,
    },
  });
  return toContractDTO(row);
}

export async function updateContract(actor: InternalActor, contractId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!row) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  validateDates(input, row);
  const data: any = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 240, true)!;
  if (input.businessOwnerLabel !== undefined) data.businessOwnerLabel = safeText(input.businessOwnerLabel, 'businessOwnerLabel', 180, false);
  if (input.lawFirmOwnerUserId !== undefined) {
    data.lawFirmOwnerUserId = input.lawFirmOwnerUserId ? String(input.lawFirmOwnerUserId) : null;
    await assertLawFirmOwner(prisma, data.lawFirmOwnerUserId);
  }
  if (input.sourceCaseId !== undefined) {
    if (input.sourceCaseId) await assertSameClientCase(prisma, row.clientId, String(input.sourceCaseId));
    data.sourceCaseId = input.sourceCaseId ? String(input.sourceCaseId) : null;
  }
  if (input.signatureDate !== undefined) data.signatureDate = parseDate(input.signatureDate, 'signatureDate');
  if (input.effectiveDate !== undefined) data.effectiveDate = parseDate(input.effectiveDate, 'effectiveDate');
  if (input.expiryDate !== undefined) data.expiryDate = parseDate(input.expiryDate, 'expiryDate');
  if (input.termType !== undefined) data.termType = safeText(input.termType, 'termType', 60, false);
  if (input.noticePeriodDays !== undefined) data.noticePeriodDays = input.noticePeriodDays != null && input.noticePeriodDays !== '' ? Number(input.noticePeriodDays) : null;
  if (input.autoRenewal !== undefined) data.autoRenewal = Boolean(input.autoRenewal);
  if (input.nextCriticalDate !== undefined) data.nextCriticalDate = parseDate(input.nextCriticalDate, 'nextCriticalDate');
  if (input.securityClassification !== undefined) data.securityClassification = validateSecurityClassification(input.securityClassification);
  if (input.internalNote !== undefined) data.internalNote = safeText(input.internalNote, 'internalNote', 2000, false);
  if (input.parentContractId !== undefined) {
    const parentId = input.parentContractId ? String(input.parentContractId) : null;
    if (parentId) {
      if (parentId === contractId) throw new InteractionError(400, 'SELF_PARENT_FORBIDDEN', 'A contract cannot be its own parent.');
      data.parentContractId = parentId;
      data.familyRootContractId = await resolveFamilyRoot(prisma, contractId, row.clientId, parentId);
    } else {
      data.parentContractId = null;
      data.familyRootContractId = null;
    }
  }
  const updated = await prisma.contractRecord.update({ where: { id: contractId }, data });
  return toContractDTO(updated);
}

export async function transitionContract(actor: InternalActor, contractId: string, status: unknown, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const target = String(status || '');
  if (!LIFECYCLE_STATUS.has(target)) throw new InteractionError(400, 'CONTRACT_STATUS_INVALID', 'Invalid contract status.');
  const row = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!row) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  assertTransition(String(row.status), target, CONTRACT_TRANSITIONS);
  const updated = await prisma.contractRecord.update({ where: { id: contractId }, data: { status: target as any } });
  return toContractDTO(updated);
}

/** Explicit controlled canonical DocumentVersion change. No file copy; the
 *  immutable DocumentVersion is re-pointed. Cross-client linkage rejected. */
export async function setCanonicalDocument(actor: InternalActor, contractId: string, documentVersionId: string | null, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!row) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  if (documentVersionId) await assertSameClientDocumentVersion(prisma, row.clientId, documentVersionId);
  const updated = await prisma.contractRecord.update({ where: { id: contractId }, data: { canonicalDocumentVersionId: documentVersionId } });
  return toContractDTO(updated);
}

export async function getContractFamily(actor: InternalActor, contractId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.contractRecord.findUnique({ where: { id: contractId }, select: { id: true, clientId: true, familyRootContractId: true, parentContractId: true } });
  if (!row) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const rootId = row.familyRootContractId || row.id;
  const members = await prisma.contractRecord.findMany({
    where: { OR: [{ id: rootId }, { familyRootContractId: rootId }] },
    include: { parties: true },
    orderBy: { createdAt: 'asc' },
  });
  const dto = members.map((m: any) => ({ ...toContractDTO(m), parties: m.parties.map(toPartyDTO) }));
  assertClientSafe(dto);
  return { rootId, members: dto };
}

/* -------------------------------------------------------------------------- */
/* ContractParty                                                              */
/* -------------------------------------------------------------------------- */

export async function addParty(actor: InternalActor, contractId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const contract = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!contract) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, contract.clientId, prisma);
  const roleCode = String(input.roleCode || '');
  if (!isPartyRole(roleCode)) throw new InteractionError(400, 'PARTY_ROLE_UNKNOWN', 'Unknown party role code.');
  const row = await prisma.contractParty.create({
    data: {
      contractId,
      roleCode,
      displayName: safeText(input.displayName, 'displayName', 240, true)!,
      registrationNumber: safeText(input.registrationNumber, 'registrationNumber', 120, false),
      taxNumber: safeText(input.taxNumber, 'taxNumber', 120, false),
      country: safeText(input.country, 'country', 80, false),
    },
  });
  return toPartyDTO(row);
}

export async function updateParty(actor: InternalActor, partyId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.contractParty.findUnique({ where: { id: partyId }, include: { contract: true } });
  if (!row) throw new InteractionError(404, 'PARTY_NOT_FOUND', 'Party not found.');
  await assertClientReadAccess(actor, row.contract.clientId, prisma);
  const data: any = {};
  if (input.roleCode !== undefined) {
    if (!isPartyRole(String(input.roleCode))) throw new InteractionError(400, 'PARTY_ROLE_UNKNOWN', 'Unknown party role code.');
    data.roleCode = String(input.roleCode);
  }
  if (input.displayName !== undefined) data.displayName = safeText(input.displayName, 'displayName', 240, true)!;
  if (input.registrationNumber !== undefined) data.registrationNumber = safeText(input.registrationNumber, 'registrationNumber', 120, false);
  if (input.taxNumber !== undefined) data.taxNumber = safeText(input.taxNumber, 'taxNumber', 120, false);
  if (input.country !== undefined) data.country = safeText(input.country, 'country', 80, false);
  const updated = await prisma.contractParty.update({ where: { id: partyId }, data });
  return toPartyDTO(updated);
}

export async function removeParty(actor: InternalActor, partyId: string, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.contractParty.findUnique({ where: { id: partyId }, include: { contract: true } });
  if (!row) throw new InteractionError(404, 'PARTY_NOT_FOUND', 'Party not found.');
  await assertClientReadAccess(actor, row.contract.clientId, prisma);
  await prisma.contractParty.delete({ where: { id: partyId } });
  return { id: partyId, removed: true };
}

/* -------------------------------------------------------------------------- */
/* ClientObligation                                                           */
/* -------------------------------------------------------------------------- */

export async function listObligations(actor: InternalActor, clientId: string, opts: { status?: string; contractId?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.clientObligation.findMany({
    where: { clientId, ...(opts.status ? { status: opts.status as any } : {}), ...(opts.contractId ? { sourceContractId: opts.contractId } : {}) },
    include: {
      ownerPerson: { select: { id: true, name: true } },
      sourceContract: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const dto = rows.map(toObligationDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createObligation(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const sourceType = String(input.sourceType || 'CONTRACT');
  if (!isObligationSourceType(sourceType)) throw new InteractionError(400, 'OBLIGATION_SOURCE_UNKNOWN', 'Unknown obligation source type.');
  if (sourceType === 'CONTRACT' && !input.sourceContractId) throw new InteractionError(400, 'OBLIGATION_SOURCE_CONTRACT_REQUIRED', 'Contract obligations require a source contract.');
  const triggerType = String(input.triggerType || 'DATE');
  if (!isObligationTriggerType(triggerType)) throw new InteractionError(400, 'OBLIGATION_TRIGGER_UNKNOWN', 'Unknown obligation trigger type.');
  if (input.frequencyCode != null && !isObligationFrequency(String(input.frequencyCode))) throw new InteractionError(400, 'OBLIGATION_FREQUENCY_UNKNOWN', 'Unknown obligation frequency code.');
  let sourceContractId: string | null = null;
  if (input.sourceContractId) {
    sourceContractId = String(input.sourceContractId);
    const c = await prisma.contractRecord.findUnique({ where: { id: sourceContractId }, select: { clientId: true } });
    if (!c) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Source contract not found.');
    if (c.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_CONTRACT', 'Source contract belongs to another client.');
  }
  if (input.relatedTaskId) await assertSameClientTask(prisma, clientId, String(input.relatedTaskId));
  if (input.evidenceDocumentVersionId) await assertSameClientDocumentVersion(prisma, clientId, String(input.evidenceDocumentVersionId));
  const row = await prisma.clientObligation.create({
    data: {
      clientId,
      sourceType,
      sourceContractId,
      sourceReference: safeText(input.sourceReference, 'sourceReference', 240, false),
      title: safeText(input.title, 'title', 240, true)!,
      description: safeText(input.description, 'description', 3000, false),
      ownerLabel: safeText(input.ownerLabel, 'ownerLabel', 180, false),
      triggerType,
      frequencyCode: input.frequencyCode ? String(input.frequencyCode) : null,
      nextDueDate: parseDate(input.nextDueDate, 'nextDueDate'),
      status: 'OPEN',
      relatedTaskId: input.relatedTaskId ? String(input.relatedTaskId) : null,
      evidenceDocumentVersionId: input.evidenceDocumentVersionId ? String(input.evidenceDocumentVersionId) : null,
    },
  });
  return toObligationDTO(row);
}

export async function updateObligation(actor: InternalActor, obligationId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.clientObligation.findUnique({ where: { id: obligationId } });
  if (!row) throw new InteractionError(404, 'OBLIGATION_NOT_FOUND', 'Obligation not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const data: any = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 240, true)!;
  if (input.description !== undefined) data.description = safeText(input.description, 'description', 3000, false);
  if (input.ownerLabel !== undefined) data.ownerLabel = safeText(input.ownerLabel, 'ownerLabel', 180, false);
  if (input.sourceReference !== undefined) data.sourceReference = safeText(input.sourceReference, 'sourceReference', 240, false);
  if (input.frequencyCode !== undefined) {
    if (input.frequencyCode != null && !isObligationFrequency(String(input.frequencyCode))) throw new InteractionError(400, 'OBLIGATION_FREQUENCY_UNKNOWN', 'Unknown obligation frequency code.');
    data.frequencyCode = input.frequencyCode ? String(input.frequencyCode) : null;
  }
  if (input.nextDueDate !== undefined) data.nextDueDate = parseDate(input.nextDueDate, 'nextDueDate');
  if (input.relatedTaskId !== undefined) {
    if (input.relatedTaskId) await assertSameClientTask(prisma, row.clientId, String(input.relatedTaskId));
    data.relatedTaskId = input.relatedTaskId ? String(input.relatedTaskId) : null;
  }
  if (input.evidenceDocumentVersionId !== undefined) {
    if (input.evidenceDocumentVersionId) await assertSameClientDocumentVersion(prisma, row.clientId, String(input.evidenceDocumentVersionId));
    data.evidenceDocumentVersionId = input.evidenceDocumentVersionId ? String(input.evidenceDocumentVersionId) : null;
  }
  const updated = await prisma.clientObligation.update({ where: { id: obligationId }, data });
  return toObligationDTO(updated);
}

export async function transitionObligation(actor: InternalActor, obligationId: string, status: unknown, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const target = String(status || '');
  if (!OBLIGATION_STATUS.has(target)) throw new InteractionError(400, 'OBLIGATION_STATUS_INVALID', 'Invalid obligation status.');
  const row = await prisma.clientObligation.findUnique({ where: { id: obligationId } });
  if (!row) throw new InteractionError(404, 'OBLIGATION_NOT_FOUND', 'Obligation not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  assertTransition(String(row.status), target, OBLIGATION_TRANSITIONS);
  const updated = await prisma.clientObligation.update({ where: { id: obligationId }, data: { status: target as any } });
  return toObligationDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* ContractEntitlement                                                        */
/* -------------------------------------------------------------------------- */

export async function listEntitlements(actor: InternalActor, contractId: string, opts: { status?: string } = {}, prisma: Prisma = defaultPrisma) {
  const contract = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!contract) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, contract.clientId, prisma);
  const rows = await prisma.contractEntitlement.findMany({
    where: { contractId, ...(opts.status ? { status: opts.status as any } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const dto = rows.map(toEntitlementDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createEntitlement(actor: InternalActor, contractId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const contract = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!contract) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, contract.clientId, prisma);
  const type = String(input.type || '');
  if (!isEntitlementType(type)) throw new InteractionError(400, 'ENTITLEMENT_TYPE_UNKNOWN', 'Unknown entitlement type.');
  const exerciseByDate = parseDate(input.exerciseByDate, 'exerciseByDate');
  if (exerciseByDate && contract.effectiveDate && exerciseByDate < contract.effectiveDate) {
    throw new InteractionError(400, 'ENTITLEMENT_DATE_INVALID', 'exerciseByDate must be on or after the contract effective date.');
  }
  const row = await prisma.contractEntitlement.create({
    data: {
      contractId,
      clientId: contract.clientId,
      type,
      title: safeText(input.title, 'title', 240, true)!,
      description: safeText(input.description, 'description', 3000, false),
      sourceReference: safeText(input.sourceReference, 'sourceReference', 240, false),
      exerciseByDate,
      status: 'ACTIVE',
    },
  });
  return toEntitlementDTO(row);
}

export async function updateEntitlement(actor: InternalActor, entitlementId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.contractEntitlement.findUnique({ where: { id: entitlementId }, include: { contract: true } });
  if (!row) throw new InteractionError(404, 'ENTITLEMENT_NOT_FOUND', 'Entitlement not found.');
  await assertClientReadAccess(actor, row.contract.clientId, prisma);
  const data: any = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 240, true)!;
  if (input.description !== undefined) data.description = safeText(input.description, 'description', 3000, false);
  if (input.sourceReference !== undefined) data.sourceReference = safeText(input.sourceReference, 'sourceReference', 240, false);
  if (input.exerciseByDate !== undefined) {
    const exerciseByDate = parseDate(input.exerciseByDate, 'exerciseByDate');
    if (exerciseByDate && row.contract.effectiveDate && exerciseByDate < row.contract.effectiveDate) {
      throw new InteractionError(400, 'ENTITLEMENT_DATE_INVALID', 'exerciseByDate must be on or after the contract effective date.');
    }
    data.exerciseByDate = exerciseByDate;
  }
  const updated = await prisma.contractEntitlement.update({ where: { id: entitlementId }, data });
  return toEntitlementDTO(updated);
}

export async function transitionEntitlement(actor: InternalActor, entitlementId: string, status: unknown, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const target = String(status || '');
  if (!ENTITLEMENT_STATUS.has(target)) throw new InteractionError(400, 'ENTITLEMENT_STATUS_INVALID', 'Invalid entitlement status.');
  const row = await prisma.contractEntitlement.findUnique({ where: { id: entitlementId }, include: { contract: true } });
  if (!row) throw new InteractionError(404, 'ENTITLEMENT_NOT_FOUND', 'Entitlement not found.');
  await assertClientReadAccess(actor, row.contract.clientId, prisma);
  assertTransition(String(row.status), target, ENTITLEMENT_TRANSITIONS);
  const updated = await prisma.contractEntitlement.update({ where: { id: entitlementId }, data: { status: target as any } });
  return toEntitlementDTO(updated);
}
