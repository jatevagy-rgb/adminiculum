/**
 * ORGANIZATION (Phase 3) — internal workforce services.
 *
 * Reuses ClientOrganizationGroup as the canonical unit model (no second org
 * hierarchy). OrganizationPerson is an operational responsibility record,
 * DISTINCT from ClientPortalIdentity / membership / internal User. Manager and
 * deputy are separate from group hierarchy; all relational inputs are
 * same-Client validated. HR-confidential document links are gated to
 * ADMIN/PARTNER only (narrow conservative role gate; no parallel ACL).
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, assertClientSafe, internalCaseScope, safeText } from '../client-interaction/base';
import { isPersonDocumentRole, isResponsibilityType } from './registry';

type Prisma = typeof defaultPrisma;

const MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);
const HR_ROLES = new Set(['ADMIN', 'PARTNER']);

const PERSON_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['ON_LEAVE', 'INACTIVE', 'ENDED'],
  ON_LEAVE: ['ACTIVE', 'INACTIVE', 'ENDED'],
  INACTIVE: ['ACTIVE', 'ENDED'],
  ENDED: [],
};

function requireManager(actor: InternalActor): void {
  if (!actor?.userId || !MANAGER_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'ORGANIZATION_MANAGE_FORBIDDEN', 'Only client managers may modify organization records.');
  }
}

async function assertClientReadAccess(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE') throw new InteractionError(403, 'CLIENT_ACCESS_FORBIDDEN', 'Actor cannot access this client.');
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return client;
  const scope = await internalCaseScope(actor, prisma);
  if (scope !== null) {
    const has = await prisma.case.findFirst({ where: { id: { in: scope }, clientId }, select: { id: true } });
    if (!has) throw new InteractionError(403, 'CLIENT_ACCESS_FORBIDDEN', 'Actor has no case access in this client.');
  }
  return client;
}

function assertTransition(from: string, to: string): void {
  if (!PERSON_TRANSITIONS[from]?.includes(to)) {
    throw new InteractionError(409, 'INVALID_STATUS_TRANSITION', `Transition ${from} -> ${to} is not allowed.`);
  }
}

function iso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

/** Walk the manager chain from `proposedManagerId`; throws on a cycle if the
 *  chain reaches `personId`, and on cross-client manager. */
async function resolveManagerRoot(prisma: Prisma, personId: string, clientId: string, proposedManagerId: string): Promise<void> {
  const seen = new Set<string>([personId]);
  let cur: string | null = proposedManagerId;
  while (cur) {
    if (seen.has(cur)) throw new InteractionError(400, 'MANAGER_CYCLE', 'Manager cycle is not allowed.');
    seen.add(cur);
    const p = await prisma.organizationPerson.findUnique({ where: { id: cur }, select: { clientId: true, managerPersonId: true } });
    if (!p) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Manager person not found.');
    if (p.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_MANAGER', 'Manager belongs to another client.');
    cur = p.managerPersonId;
  }
}

async function assertSameClientPerson(prisma: Prisma, clientId: string, personId: string, code: string): Promise<void> {
  const p = await prisma.organizationPerson.findUnique({ where: { id: personId }, select: { clientId: true } });
  if (!p) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  if (p.clientId !== clientId) throw new InteractionError(403, code, 'Person belongs to another client.');
}

async function assertSameClientGroup(prisma: Prisma, clientId: string, groupId: string): Promise<void> {
  const g = await prisma.clientOrganizationGroup.findUnique({ where: { id: groupId }, select: { clientId: true } });
  if (!g) throw new InteractionError(404, 'GROUP_NOT_FOUND', 'Organization group not found.');
  if (g.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_GROUP', 'Group belongs to another client.');
}

async function assertSameClientDocumentVersion(prisma: Prisma, clientId: string, documentVersionId: string): Promise<void> {
  const v = await prisma.documentVersion.findUnique({ where: { id: documentVersionId }, select: { document: { select: { clientId: true, securityClassification: true } } } });
  if (!v) throw new InteractionError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version not found.');
  if (v.document.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_DOCUMENT_VERSION', 'Document version belongs to another client.');
  return undefined;
}

async function assertSameClientContract(prisma: Prisma, clientId: string, contractId: string): Promise<void> {
  const c = await prisma.contractRecord.findUnique({ where: { id: contractId }, select: { clientId: true } });
  if (!c) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  if (c.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_CONTRACT', 'Contract belongs to another client.');
}

async function assertSameClientObligation(prisma: Prisma, clientId: string, obligationId: string): Promise<void> {
  const o = await prisma.clientObligation.findUnique({ where: { id: obligationId }, select: { clientId: true } });
  if (!o) throw new InteractionError(404, 'OBLIGATION_NOT_FOUND', 'Obligation not found.');
  if (o.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_OBLIGATION', 'Obligation belongs to another client.');
}

async function assertSameClientInitiative(prisma: Prisma, clientId: string, initiativeId: string): Promise<void> {
  const i = await prisma.developmentInitiative.findUnique({ where: { id: initiativeId }, select: { clientId: true } });
  if (!i) throw new InteractionError(404, 'INITIATIVE_NOT_FOUND', 'Initiative not found.');
  if (i.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_INITIATIVE', 'Initiative belongs to another client.');
}

/* -------------------------------------------------------------------------- */
/* DTOs                                                                       */
/* -------------------------------------------------------------------------- */

export function toPersonDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    organizationGroupId: row.organizationGroupId,
    managerPersonId: row.managerPersonId,
    deputyPersonId: row.deputyPersonId,
    name: row.name,
    jobTitle: row.jobTitle,
    employmentStatus: row.employmentStatus,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    responsibilitiesSummary: row.responsibilitiesSummary,
    portalMembershipId: row.portalMembershipId,
    responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities.map(toResponsibilityDTO) : undefined,
    documentLinks: Array.isArray(row.documentLinks) ? row.documentLinks.map((d: any) => ({ id: d.id, documentVersionId: d.documentVersionId, documentRole: d.documentRole })) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export function toGroupDTO(row: any): any {
  return {
    id: row.id,
    clientId: row.clientId,
    workspaceId: row.workspaceId,
    name: row.name,
    descriptionSafe: row.descriptionSafe,
    status: String(row.status),
    parentGroupId: row.parentGroupId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toResponsibilityDTO(row: any): any {
  return { id: row.id, organizationPersonId: row.organizationPersonId, type: row.type, label: row.label, createdAt: row.createdAt.toISOString() };
}

/* -------------------------------------------------------------------------- */
/* Organization groups (reuse ClientOrganizationGroup)                        */
/* -------------------------------------------------------------------------- */

export async function listGroups(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.clientOrganizationGroup.findMany({ where: { clientId }, orderBy: { name: 'asc' } });
  const dto = rows.map(toGroupDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createGroup(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  let parentGroupId: string | null = null;
  if (input.parentGroupId) {
    parentGroupId = String(input.parentGroupId);
    await assertSameClientGroup(prisma, clientId, parentGroupId);
    // cycle / self check
    const seen = new Set<string>();
    let cur: string | null = parentGroupId;
    while (cur) {
      if (seen.has(cur)) throw new InteractionError(400, 'GROUP_CYCLE', 'Group hierarchy cycle is not allowed.');
      seen.add(cur);
      const g = await prisma.clientOrganizationGroup.findUnique({ where: { id: cur }, select: { parentGroupId: true } });
      if (!g) throw new InteractionError(404, 'GROUP_NOT_FOUND', 'Parent group not found.');
      cur = g.parentGroupId;
    }
  }
  const row = await prisma.clientOrganizationGroup.create({
    data: {
      clientId,
      workspaceId: input.workspaceId ? String(input.workspaceId) : null,
      name: safeText(input.name, 'name', 180, true)!,
      descriptionSafe: safeText(input.descriptionSafe, 'descriptionSafe', 500, false),
      parentGroupId,
      createdById: actor.userId,
    },
  });
  return toGroupDTO(row);
}

export async function updateGroup(actor: InternalActor, groupId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.clientOrganizationGroup.findUnique({ where: { id: groupId } });
  if (!row) throw new InteractionError(404, 'GROUP_NOT_FOUND', 'Group not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const data: any = {};
  if (input.name !== undefined) data.name = safeText(input.name, 'name', 180, true)!;
  if (input.descriptionSafe !== undefined) data.descriptionSafe = safeText(input.descriptionSafe, 'descriptionSafe', 500, false);
  if (input.parentGroupId !== undefined) {
    const parentId = input.parentGroupId ? String(input.parentGroupId) : null;
    if (parentId) {
      if (parentId === groupId) throw new InteractionError(400, 'SELF_PARENT_FORBIDDEN', 'A group cannot be its own parent.');
      await assertSameClientGroup(prisma, row.clientId, parentId);
      const seen = new Set<string>([groupId]);
      let cur: string | null = parentId;
      while (cur) {
        if (seen.has(cur)) throw new InteractionError(400, 'GROUP_CYCLE', 'Group hierarchy cycle is not allowed.');
        seen.add(cur);
        const g = await prisma.clientOrganizationGroup.findUnique({ where: { id: cur }, select: { parentGroupId: true } });
        if (!g) throw new InteractionError(404, 'GROUP_NOT_FOUND', 'Parent group not found.');
        cur = g.parentGroupId;
      }
    }
    data.parentGroupId = parentId;
  }
  const updated = await prisma.clientOrganizationGroup.update({ where: { id: groupId }, data });
  return toGroupDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* Organization persons                                                       */
/* -------------------------------------------------------------------------- */

export async function listPersons(actor: InternalActor, clientId: string, opts: { status?: string; groupId?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.organizationPerson.findMany({
    where: { clientId, ...(opts.status ? { employmentStatus: opts.status as any } : {}), ...(opts.groupId ? { organizationGroupId: opts.groupId } : {}) },
    include: { responsibilities: true, organizationGroup: { select: { id: true, name: true } }, managerPerson: { select: { id: true, name: true } }, deputyPerson: { select: { id: true, name: true } } },
    orderBy: [{ name: 'asc' }],
  });
  const dto = rows.map((row) => ({ ...toPersonDTO(row), organizationGroupName: row.organizationGroup?.name ?? null, managerName: row.managerPerson?.name ?? null, deputyName: row.deputyPerson?.name ?? null }));
  assertClientSafe(dto);
  return { items: dto };
}

export async function getPerson(actor: InternalActor, personId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.organizationPerson.findUnique({
    where: { id: personId },
    include: {
      responsibilities: true,
      organizationGroup: { select: { id: true, name: true } },
      managerPerson: { select: { id: true, name: true } },
      deputyPerson: { select: { id: true, name: true } },
      ownedContracts: { select: { id: true, title: true, status: true } },
      ownedObligations: { select: { id: true, title: true, status: true } },
      ownedInitiatives: { select: { id: true, title: true, status: true } },
    },
  });
  if (!row) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const dto = {
    ...toPersonDTO(row),
    organizationGroupName: row.organizationGroup?.name ?? null,
    managerName: row.managerPerson?.name ?? null,
    deputyName: row.deputyPerson?.name ?? null,
    ownedContracts: row.ownedContracts,
    ownedObligations: row.ownedObligations,
    ownedInitiatives: row.ownedInitiatives,
  };
  assertClientSafe(dto);
  return dto;
}

export async function createPerson(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  if (input.startDate && input.endDate) {
    const s = new Date(String(input.startDate));
    const e = new Date(String(input.endDate));
    if (s.getTime() > e.getTime()) throw new InteractionError(400, 'DATE_RANGE_INVALID', 'endDate must be on or after startDate.');
  }
  let groupId: string | null = null;
  if (input.organizationGroupId) {
    groupId = String(input.organizationGroupId);
    await assertSameClientGroup(prisma, clientId, groupId);
  }
  let managerId: string | null = null;
  if (input.managerPersonId) {
    managerId = String(input.managerPersonId);
    await assertSameClientPerson(prisma, clientId, managerId, 'CROSS_CLIENT_MANAGER');
  }
  let deputyId: string | null = null;
  if (input.deputyPersonId) {
    deputyId = String(input.deputyPersonId);
    if (deputyId === managerId) throw new InteractionError(400, 'DEPUTY_EQUALS_MANAGER', 'Deputy cannot be the same as the manager.');
    await assertSameClientPerson(prisma, clientId, deputyId, 'CROSS_CLIENT_DEPUTY');
  }
  const status = String(input.employmentStatus || 'ACTIVE');
  if (!Object.keys(PERSON_TRANSITIONS).includes(status)) throw new InteractionError(400, 'PERSON_STATUS_INVALID', 'Invalid employment status.');
  const row = await prisma.organizationPerson.create({
    data: {
      clientId,
      organizationGroupId: groupId,
      managerPersonId: managerId,
      deputyPersonId: deputyId,
      name: safeText(input.name, 'name', 180, true)!,
      jobTitle: safeText(input.jobTitle, 'jobTitle', 180, false),
      employmentStatus: status as any,
      startDate: input.startDate ? new Date(String(input.startDate)) : null,
      endDate: input.endDate ? new Date(String(input.endDate)) : null,
      responsibilitiesSummary: safeText(input.responsibilitiesSummary, 'responsibilitiesSummary', 2000, false),
      portalMembershipId: input.portalMembershipId ? String(input.portalMembershipId) : null,
    },
  });
  return toPersonDTO(row);
}

export async function updatePerson(actor: InternalActor, personId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.organizationPerson.findUnique({ where: { id: personId } });
  if (!row) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const data: any = {};
  if (input.name !== undefined) data.name = safeText(input.name, 'name', 180, true)!;
  if (input.jobTitle !== undefined) data.jobTitle = safeText(input.jobTitle, 'jobTitle', 180, false);
  if (input.responsibilitiesSummary !== undefined) data.responsibilitiesSummary = safeText(input.responsibilitiesSummary, 'responsibilitiesSummary', 2000, false);
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(String(input.startDate)) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(String(input.endDate)) : null;
  if (input.organizationGroupId !== undefined) {
    if (input.organizationGroupId) await assertSameClientGroup(prisma, row.clientId, String(input.organizationGroupId));
    data.organizationGroupId = input.organizationGroupId ? String(input.organizationGroupId) : null;
  }
  if (input.managerPersonId !== undefined) {
    const managerId = input.managerPersonId ? String(input.managerPersonId) : null;
    if (managerId) {
      if (managerId === personId) throw new InteractionError(400, 'SELF_MANAGER_FORBIDDEN', 'A person cannot be their own manager.');
      await resolveManagerRoot(prisma, personId, row.clientId, managerId);
    }
    data.managerPersonId = managerId;
  }
  if (input.deputyPersonId !== undefined) {
    const deputyId = input.deputyPersonId ? String(input.deputyPersonId) : null;
    if (deputyId) {
      if (deputyId === personId) throw new InteractionError(400, 'SELF_DEPUTY_FORBIDDEN', 'A person cannot be their own deputy.');
      if (deputyId === data.managerPersonId || deputyId === row.managerPersonId) throw new InteractionError(400, 'DEPUTY_EQUALS_MANAGER', 'Deputy cannot be the manager.');
      await assertSameClientPerson(prisma, row.clientId, deputyId, 'CROSS_CLIENT_DEPUTY');
    }
    data.deputyPersonId = deputyId;
  }
  if (input.portalMembershipId !== undefined) data.portalMembershipId = input.portalMembershipId ? String(input.portalMembershipId) : null;
  const updated = await prisma.organizationPerson.update({ where: { id: personId }, data });
  return toPersonDTO(updated);
}

export async function transitionPerson(actor: InternalActor, personId: string, status: unknown, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const target = String(status || '');
  if (!Object.keys(PERSON_TRANSITIONS).includes(target)) throw new InteractionError(400, 'PERSON_STATUS_INVALID', 'Invalid employment status.');
  const row = await prisma.organizationPerson.findUnique({ where: { id: personId } });
  if (!row) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  assertTransition(String(row.employmentStatus), target);
  const data: any = { employmentStatus: target };
  if (target === 'ENDED' && !row.endDate) data.endDate = new Date();
  const updated = await prisma.organizationPerson.update({ where: { id: personId }, data });
  return toPersonDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* Responsibilities                                                           */
/* -------------------------------------------------------------------------- */

export async function addResponsibility(actor: InternalActor, personId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const person = await prisma.organizationPerson.findUnique({ where: { id: personId } });
  if (!person) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  await assertClientReadAccess(actor, person.clientId, prisma);
  const type = String(input.type || '');
  if (!isResponsibilityType(type)) throw new InteractionError(400, 'RESPONSIBILITY_TYPE_UNKNOWN', 'Unknown responsibility type.');
  const row = await prisma.organizationPersonResponsibility.create({
    data: { organizationPersonId: personId, type, label: safeText(input.label, 'label', 180, true)! },
  });
  return toResponsibilityDTO(row);
}

export async function removeResponsibility(actor: InternalActor, responsibilityId: string, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.organizationPersonResponsibility.findUnique({ where: { id: responsibilityId }, include: { organizationPerson: true } });
  if (!row) throw new InteractionError(404, 'RESPONSIBILITY_NOT_FOUND', 'Responsibility not found.');
  await assertClientReadAccess(actor, row.organizationPerson.clientId, prisma);
  await prisma.organizationPersonResponsibility.delete({ where: { id: responsibilityId } });
  return { id: responsibilityId, removed: true };
}

/* -------------------------------------------------------------------------- */
/* Person-document links (HR-confidential gated)                              */
/* -------------------------------------------------------------------------- */

export async function listPersonDocuments(actor: InternalActor, personId: string, prisma: Prisma = defaultPrisma) {
  const person = await prisma.organizationPerson.findUnique({ where: { id: personId } });
  if (!person) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  await assertClientReadAccess(actor, person.clientId, prisma);
  const links = await prisma.organizationPersonDocumentLink.findMany({
    where: { organizationPersonId: personId },
    include: { documentVersion: { include: { document: { select: { id: true, name: true, securityClassification: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  // HR-confidential documents only visible to privileged roles.
  const privileged = HR_ROLES.has(String(actor.role || ''));
  const dto = links
    .filter((link) => privileged || String(link.documentVersion.document.securityClassification) !== 'HR_CONFIDENTIAL')
    .map((link) => ({ id: link.id, documentVersionId: link.documentVersionId, documentRole: link.documentRole, documentName: link.documentVersion.document.name, classification: link.documentVersion.document.securityClassification }));
  assertClientSafe(dto);
  return { items: dto };
}

export async function linkPersonDocument(actor: InternalActor, personId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const person = await prisma.organizationPerson.findUnique({ where: { id: personId } });
  if (!person) throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  await assertClientReadAccess(actor, person.clientId, prisma);
  const documentVersionId = String(input.documentVersionId || '');
  const role = String(input.documentRole || '');
  if (!isPersonDocumentRole(role)) throw new InteractionError(400, 'DOCUMENT_ROLE_UNKNOWN', 'Unknown person-document role.');
  await assertSameClientDocumentVersion(prisma, person.clientId, documentVersionId);
  const row = await prisma.organizationPersonDocumentLink.create({
    data: { organizationPersonId: personId, documentVersionId, documentRole: role },
  });
  return { id: row.id, documentVersionId, documentRole: role };
}

export async function unlinkPersonDocument(actor: InternalActor, linkId: string, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const link = await prisma.organizationPersonDocumentLink.findUnique({ where: { id: linkId }, include: { organizationPerson: true } });
  if (!link) throw new InteractionError(404, 'PERSON_DOCUMENT_LINK_NOT_FOUND', 'Person-document link not found.');
  await assertClientReadAccess(actor, link.organizationPerson.clientId, prisma);
  await prisma.organizationPersonDocumentLink.delete({ where: { id: linkId } });
  return { id: linkId, removed: true };
}

/* -------------------------------------------------------------------------- */
/* Owner linkage (contract / obligation / initiative)                         */
/* -------------------------------------------------------------------------- */

export async function setContractBusinessOwner(actor: InternalActor, contractId: string, personId: string | null, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const contract = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!contract) throw new InteractionError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.');
  await assertClientReadAccess(actor, contract.clientId, prisma);
  if (personId) await assertSameClientPerson(prisma, contract.clientId, personId, 'CROSS_CLIENT_PERSON');
  await prisma.contractRecord.update({ where: { id: contractId }, data: { businessOwnerPersonId: personId } });
  return { contractId, businessOwnerPersonId: personId };
}

export async function setObligationOwner(actor: InternalActor, obligationId: string, personId: string | null, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const obligation = await prisma.clientObligation.findUnique({ where: { id: obligationId } });
  if (!obligation) throw new InteractionError(404, 'OBLIGATION_NOT_FOUND', 'Obligation not found.');
  await assertClientReadAccess(actor, obligation.clientId, prisma);
  if (personId) await assertSameClientPerson(prisma, obligation.clientId, personId, 'CROSS_CLIENT_PERSON');
  await prisma.clientObligation.update({ where: { id: obligationId }, data: { ownerPersonId: personId } });
  return { obligationId, ownerPersonId: personId };
}

export async function setInitiativeClientOwner(actor: InternalActor, initiativeId: string, personId: string | null, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const initiative = await prisma.developmentInitiative.findUnique({ where: { id: initiativeId } });
  if (!initiative) throw new InteractionError(404, 'INITIATIVE_NOT_FOUND', 'Initiative not found.');
  await assertClientReadAccess(actor, initiative.clientId, prisma);
  if (personId) await assertSameClientPerson(prisma, initiative.clientId, personId, 'CROSS_CLIENT_PERSON');
  await prisma.developmentInitiative.update({ where: { id: initiativeId }, data: { clientOwnerPersonId: personId } });
  return { initiativeId, clientOwnerPersonId: personId };
}

/* -------------------------------------------------------------------------- */
/* Responsibility gaps (deterministic internal read model)                    */
/* -------------------------------------------------------------------------- */

export async function responsibilityGaps(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const [contracts, obligations, persons] = await Promise.all([
    prisma.contractRecord.findMany({ where: { clientId, status: 'ACTIVE', businessOwnerPersonId: null }, select: { id: true, title: true } }),
    prisma.clientObligation.findMany({ where: { clientId, status: { in: ['OPEN', 'IN_PROGRESS'] }, ownerPersonId: null }, select: { id: true, title: true } }),
    prisma.organizationPerson.findMany({ where: { clientId, employmentStatus: { in: ['ENDED', 'INACTIVE'] } }, select: { id: true, name: true } }),
  ]);
  const dto = {
    contractsWithoutOwner: contracts,
    obligationsWithoutOwner: obligations,
    ownerPersonsInactive: persons,
  };
  assertClientSafe(dto);
  return dto;
}

/* -------------------------------------------------------------------------- */
/* Customer-safe projector (dormant in Phase 3)                               */
/* -------------------------------------------------------------------------- */

export async function projectOrganizationForCustomer(clientId: string, prisma: Prisma = defaultPrisma) {
  const [groups, persons] = await Promise.all([
    prisma.clientOrganizationGroup.findMany({ where: { clientId, status: 'ACTIVE' }, select: { id: true, name: true, parentGroupId: true } }),
    prisma.organizationPerson.findMany({
      where: { clientId, employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } },
      select: { id: true, name: true, jobTitle: true, organizationGroupId: true, managerPerson: { select: { id: true, name: true } }, deputyPerson: { select: { id: true, name: true } }, responsibilities: { select: { type: true, label: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  const dto = {
    groups: groups.map((g) => ({ id: g.id, name: g.name, parentGroupId: g.parentGroupId })),
    persons: persons.map((p) => ({
      id: p.id,
      name: p.name,
      jobTitle: p.jobTitle,
      organizationGroupId: p.organizationGroupId,
      managerName: p.managerPerson?.name ?? null,
      deputyName: p.deputyPerson?.name ?? null,
      responsibilities: p.responsibilities.map((r) => ({ type: r.type, label: r.label })),
    })),
  };
  assertClientSafe(dto);
  return dto;
}
