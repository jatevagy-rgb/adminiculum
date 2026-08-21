/**
 * CP1 organizational case list + detail projections. Every row is derived from an
 * explicit ACTIVE workspace-scoped participant grant and an ACTIVE published
 * matter snapshot. Nothing is inferred from email, case creator, client
 * membership, organization group or the frontend. Only customer-safe fields are
 * returned, through explicit allowlist mappers.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError } from '../client-interaction/base';
import { toCustomerMilestones } from '../client-publication/publicationService';
import {
  CasePermissionDecision,
  classifyRelationship,
  decidePermissions,
  normalizeParticipantRole,
  ParticipantRole,
  RelationshipToCase,
  requireOrganizationWorkspace,
  resolveParticipantAccess,
} from './organizationalAccessPolicy';
import { safeUnitName } from './organizationUnitService';

type Prisma = typeof defaultPrisma;

export interface OrganizationalCaseListParams {
  limit?: number;
  offset?: number;
  relationship?: RelationshipToCase | null;
  unitId?: string | null;
}

export interface OrganizationalCaseRow {
  publicReference: string;
  matterPublicationId: string;
  publicTitle: string;
  organizationUnitName: string | null;
  relationshipToCase: RelationshipToCase;
  publicStatus: string;
  waitingOn: string;
  nextStep: string | null;
  publicTargetDate: string | null;
  customerActionRequired: boolean;
  lastPublishedUpdateAt: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function boundLimit(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

/** Map a linked intake request's organization unit to each case (safe name). */
async function unitNamesByCase(workspaceId: string, caseIds: string[], prisma: Prisma): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!caseIds.length) return result;
  const intakes = await prisma.clientPortalIntakeRequest.findMany({
    where: { workspaceId, linkedCaseId: { in: caseIds }, organizationGroupId: { not: null } },
    select: { linkedCaseId: true, organizationGroupId: true },
  });
  for (const intake of intakes) {
    if (!intake.linkedCaseId || result.has(intake.linkedCaseId)) continue;
    result.set(intake.linkedCaseId, await safeUnitName(workspaceId, intake.organizationGroupId, prisma));
  }
  return result;
}

function toRow(
  publicReference: string,
  matterPublicationId: string,
  revision: { clientSafeTitle: string; clientSafeStatus: string; clientSafeNextStep: string | null; clientSafeWaitingOn?: string | null; publicTargetDate?: Date | null; publishedDeadlinesSnapshot: unknown },
  relationshipToCase: RelationshipToCase,
  unitName: string | null,
  customerActionRequired: boolean,
  lastPublishedUpdateAt: Date | null,
): OrganizationalCaseRow {
  const deadlines = Array.isArray(revision.publishedDeadlinesSnapshot) ? revision.publishedDeadlinesSnapshot as Array<{ dueAt?: string }> : [];
  const nextDeadline = deadlines.map((deadline) => deadline?.dueAt).filter(Boolean).sort()[0] || null;
  return {
    publicReference,
    matterPublicationId,
    publicTitle: revision.clientSafeTitle,
    organizationUnitName: unitName,
    relationshipToCase,
    publicStatus: revision.clientSafeStatus,
    waitingOn: revision.clientSafeWaitingOn || (customerActionRequired ? 'Ügyfél válasza szükséges' : 'Irodai feldolgozás'),
    nextStep: revision.clientSafeNextStep,
    publicTargetDate: revision.publicTargetDate ? revision.publicTargetDate.toISOString() : nextDeadline ? String(nextDeadline) : null,
    customerActionRequired,
    lastPublishedUpdateAt: lastPublishedUpdateAt ? lastPublishedUpdateAt.toISOString() : null,
  };
}

/**
 * List the organizational cases the authenticated identity may see in the
 * selected ORGANIZATION workspace: exactly the cases with an ACTIVE participant
 * grant (MATTER_READ) and an ACTIVE published snapshot. Own/shared is derived
 * from the grant's participant role only.
 */
export async function listOrganizationalCases(
  clientPortalIdentityId: string,
  workspaceId: string,
  params: OrganizationalCaseListParams,
  prisma: Prisma = defaultPrisma,
): Promise<{ items: OrganizationalCaseRow[]; total: number; limit: number; offset: number }> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const now = new Date();
  const grants = await prisma.clientPortalGrant.findMany({
    where: {
      clientPortalIdentityId,
      workspaceId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { caseId: true, clientId: true, permissions: true, participantRole: true, isRequester: true },
  });
  // Only cases the participant may read, in this workspace's Client.
  const readable = grants.filter((grant) => grant.clientId === workspace.clientId && decidePermissions(normalizeParticipantRole(grant.participantRole ? String(grant.participantRole) : null), grant.permissions as string[]).canListCase);
  const grantByCase = new Map(readable.map((grant) => [grant.caseId, grant]));
  const caseIds = [...grantByCase.keys()];
  if (!caseIds.length) return { items: [], total: 0, limit: boundLimit(params.limit), offset: params.offset || 0 };

  const publications = await prisma.clientMatterPublication.findMany({
    where: { caseId: { in: caseIds }, status: 'PUBLISHED', currentRevisionId: { not: null }, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true, caseId: true, workspaceId: true, currentRevisionId: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
  });
  const preferredPublications = [...new Map(publications.sort((left, right) => Number(right.workspaceId === workspaceId) - Number(left.workspaceId === workspaceId)).map((publication) => [publication.caseId, publication])).values()];
  const revisionIds = preferredPublications.map((publication) => publication.currentRevisionId).filter((id): id is string => Boolean(id));
  const revisions = await prisma.clientMatterPublicationRevision.findMany({
    where: { id: { in: revisionIds } },
    select: { id: true, clientSafeTitle: true, clientSafeStatus: true, clientSafeNextStep: true, clientSafeCurrentPosition: true, clientSafeWaitingOn: true, publicTargetDate: true, responsibleLawyerDisplay: true, publishedDeadlinesSnapshot: true },
  });
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const unitNames = await unitNamesByCase(workspace.id, caseIds, prisma);
  const publicRefs = await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, caseNumber: true } });
  const refByCase = new Map(publicRefs.map((row) => [row.id, row.caseNumber]));

  // Customer-action indicator: any PUBLISHED action request for the case.
  const actionCounts = await prisma.clientActionRequest.groupBy({
    by: ['caseId'],
    where: { caseId: { in: caseIds }, status: 'PUBLISHED' },
    _count: { _all: true },
  });
  const actionByCase = new Map(actionCounts.map((row) => [row.caseId, row._count._all]));

  let rows: OrganizationalCaseRow[] = [];
  for (const publication of preferredPublications) {
    const grant = grantByCase.get(publication.caseId);
    const revision = publication.currentRevisionId ? revisionById.get(publication.currentRevisionId) : undefined;
    if (!grant || !revision) continue;
    const role = normalizeParticipantRole(grant.participantRole ? String(grant.participantRole) : null);
    const relationshipToCase = classifyRelationship(role, Boolean(grant.isRequester));
    rows.push(toRow(
      refByCase.get(publication.caseId) || publication.caseId,
      publication.id,
      revision,
      relationshipToCase,
      unitNames.get(publication.caseId) ?? null,
      (actionByCase.get(publication.caseId) || 0) > 0,
      publication.publishedAt,
    ));
  }

  if (params.relationship) rows = rows.filter((row) => row.relationshipToCase === params.relationship);
  if (params.unitId) {
    const name = await safeUnitName(workspace.id, params.unitId, prisma);
    rows = name ? rows.filter((row) => row.organizationUnitName === name) : [];
  }

  const total = rows.length;
  const limit = boundLimit(params.limit);
  const offset = Math.max(0, params.offset || 0);
  const dto = { items: rows.slice(offset, offset + limit), total, limit, offset };
  assertClientSafe(dto);
  return dto;
}

export interface OrganizationalCaseDetail extends OrganizationalCaseRow {
  requesterDisplayName: string | null;
  currentStatusText: string;
  progressPercentage: number | null;
  safeMilestones: unknown[];
  capabilities: {
    showTimeline: boolean;
    showDocuments: boolean;
    allowUploads: boolean;
    showMessages: boolean;
    allowMessages: boolean;
    showHours: boolean;
    showBillingStatement: boolean;
  };
}

function capabilitiesFrom(decision: CasePermissionDecision) {
  return {
    showTimeline: decision.canViewClientTimeline,
    showDocuments: decision.canViewDocuments,
    allowUploads: decision.canUploadDocuments,
    showMessages: decision.canViewMessages,
    allowMessages: decision.canSendMessages,
    showHours: decision.canViewHours,
    showBillingStatement: decision.canViewBillingStatement,
  };
}

/**
 * Organizational case detail for one case. Requires exact workspace membership +
 * active participant grant (canViewSummary). Only permitted capability flags are
 * returned; the customer-safe snapshot is the ONLY content source.
 */
export async function getOrganizationalCaseDetail(
  clientPortalIdentityId: string,
  workspaceId: string,
  caseReference: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrganizationalCaseDetail> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const caseRow = await prisma.case.findFirst({ where: { caseNumber: caseReference, clientId: workspace.clientId }, select: { id: true, caseNumber: true } });
  if (!caseRow) throw new InteractionError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Case is not available.');
  const access = await resolveParticipantAccess(clientPortalIdentityId, caseRow.id, workspaceId, prisma);
  if (!access.canViewSummary) throw new InteractionError(403, 'CLIENT_PORTAL_SUMMARY_FORBIDDEN', 'Case summary is not available for your access.');

  const publicationCandidates = await prisma.clientMatterPublication.findMany({
    where: { caseId: caseRow.id, status: 'PUBLISHED', currentRevisionId: { not: null }, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true, workspaceId: true, currentRevisionId: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
  });
  const publication = publicationCandidates.find((candidate) => candidate.workspaceId === workspaceId) || publicationCandidates[0];
  if (!publication?.currentRevisionId) throw new InteractionError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Case is not available.');
  const revision = await prisma.clientMatterPublicationRevision.findUnique({
    where: { id: publication.currentRevisionId },
    select: { clientSafeTitle: true, clientSafeStatus: true, clientSafeNextStep: true, clientSafeCurrentPosition: true, clientSafeWaitingOn: true, publicTargetDate: true, responsibleLawyerDisplay: true, publishedDeadlinesSnapshot: true, milestonesSnapshot: true, progressPercentage: true },
  });
  if (!revision) throw new InteractionError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Case is not available.');

  const actionCount = await prisma.clientActionRequest.count({ where: { caseId: caseRow.id, status: 'PUBLISHED' } });
  const unitName = (await unitNamesByCase(workspace.id, [caseRow.id], prisma)).get(caseRow.id) ?? null;
  const base = toRow(caseRow.caseNumber, publication.id, revision, access.relationshipToCase, unitName, actionCount > 0, publication.publishedAt);

  const detail: OrganizationalCaseDetail = {
    ...base,
    // Requester identity is intentionally not surfaced in this backend slice to
    // avoid leaking a colleague's identity to observers; a policy-scoped requester
    // projection is a later CP1 stage.
    requesterDisplayName: null,
    currentStatusText: revision.clientSafeCurrentPosition || revision.clientSafeStatus,
    progressPercentage: revision.progressPercentage ?? null,
    safeMilestones: toCustomerMilestones(revision.milestonesSnapshot),
    capabilities: capabilitiesFrom(access),
  };
  assertClientSafe(detail);
  return detail;
}

export type { ParticipantRole };
