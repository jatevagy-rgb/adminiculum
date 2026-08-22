/**
 * PERSON ACCESS — READ-ONLY BACKEND PROJECTION (Slice A1).
 *
 * A narrow INTERNAL workforce-only read projection of one organizational
 * person's actual portal authorization principals, scoped to ONE explicit
 * client + workspace context.
 *
 * HARD INVARIANT — ORGANIZATION HIERARCHY != AUTHORIZATION GRAPH:
 *   - manager / deputy / group / responsibility / jobTitle /
 *     ClientOrganizationMembership / portalMembershipId ALONE never grant
 *     access.
 *   - The projection reflects ONLY canonical principals:
 *       case access      -> ClientPortalGrant (active, workspace-scoped)
 *       aggregate summary -> ClientPortalSummaryScope (aggregate visibility only)
 *       document access  -> ClientDocumentPublication (+Recipient) + DOCUMENT_READ
 *   - `accessibleVia` on document rows is DESCRIPTIVE projection only; it is
 *     NEVER an authorization principal.
 *
 * WORKSPACE RULE — NEVER guess:
 *   - The request must supply an explicit workspaceId (or the route context must
 *     uniquely determine it). If the person/identity has multiple valid
 *     ORGANIZATION workspaces and none is explicitly selected, the projection
 *     FAILS CLOSED. There is NO "first active workspace" fallback and no
 *     database-ordering default.
 *
 * READ-ONLY: no grant/scope/recipient/membership/hierarchy mutation. Workforce
 * auth via the canonical admin-workforce guard + client read access. No new ACL.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, assertClientReadAccess, assertClientSafe } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

const ACTIVE_GRANT_STATUS = 'ACTIVE';
const ACTIVE_SCOPE_STATUS = 'ACTIVE';
const ORGANIZATION_MODES = new Set(['ORGANIZATION', 'CASE_RELAY']);
const ACTIVE_MEMBERSHIP_STATUS = 'ACTIVE';
const PUBLISHED = 'PUBLISHED';

export type PersonPortalStatus = 'ACTIVE' | 'SUSPENDED' | 'NONE';

export interface PersonAccessProjection {
  person: {
    id: string;
    name: string;
    jobTitle: string | null;
    organizationGroupId: string | null;
    organizationGroupName: string | null;
    portalStatus: PersonPortalStatus;
  };
  workspace: {
    id: string;
    name: string | null;
    mode: string;
  };
  membership: {
    id: string;
    status: string;
    expiresAt: string | null;
  } | null;
  caseAccess: Array<{
    grantId: string;
    caseId: string;
    caseTitle: string;
    participantRole: string;
    permissions: string[];
    status: string;
    validFrom: string | null;
    validUntil: string | null;
    revision: number;
    effective: boolean;
  }>;
  summaryScopes: Array<{
    scopeId: string;
    scopeType: string;
    organizationGroupId: string | null;
    organizationGroupName: string | null;
    status: string;
    canViewCaseCounts: boolean;
    canViewStageCounts: boolean;
    canViewDeadlineCounts: boolean;
    canViewPublishedHours: boolean;
  }>;
  documentAccess: Array<{
    publicationId: string;
    documentTitle: string;
    visibility: string;
    status: string;
    accessibleVia: 'WORKSPACE' | 'SELECTED_PARTICIPANT';
  }>;
}

export interface PersonAccessInput {
  clientId: string;
  workspaceId: string;
  personId: string;
}

function iso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function mapPortalStatus(membershipStatus: string | null | undefined): PersonPortalStatus {
  if (!membershipStatus) return 'NONE';
  if (membershipStatus === 'ACTIVE') return 'ACTIVE';
  if (membershipStatus === 'SUSPENDED') return 'SUSPENDED';
  return 'NONE';
}

/** Whether a grant is currently effective (active status + valid window). */
function grantIsEffective(grant: { status: string; validFrom: Date | null; validUntil: Date | null }): boolean {
  if (String(grant.status) !== ACTIVE_GRANT_STATUS) return false;
  const now = new Date();
  if (grant.validFrom && grant.validFrom > now) return false;
  if (grant.validUntil && grant.validUntil <= now) return false;
  return true;
}

/**
 * Resolve the read-only access projection for one person in one explicit
 * client/workspace context. Fails closed on any ambiguity or cross-client /
 * cross-workspace inconsistency.
 */
export async function getPersonAccess(actor: InternalActor, input: PersonAccessInput, prisma: Prisma = defaultPrisma): Promise<PersonAccessProjection> {
  const { clientId, workspaceId, personId } = input;

  // Workforce gate: actor must be an authorized internal admin-workforce user AND
  // have client read access. A customer portal identity is never authorized here.
  await assertClientReadAccess(actor, clientId, prisma);

  // Person must belong to the requested client. A person that does not exist OR
  // belongs to another client is treated identically (generic 404) so a caller
  // cannot distinguish "no such person" from "person exists in another client".
  const person = await prisma.organizationPerson.findUnique({
    where: { id: personId },
    select: {
      id: true,
      clientId: true,
      name: true,
      jobTitle: true,
      organizationGroupId: true,
      portalMembershipId: true,
      employmentStatus: true,
      organizationGroup: { select: { id: true, name: true } },
    },
  });
  if (!person || person.clientId !== clientId) {
    throw new InteractionError(404, 'PERSON_NOT_FOUND', 'Organization person not found.');
  }

  // Workspace must belong to the requested client and be an ORGANIZATION workspace.
  const workspace = await prisma.clientPortalWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, clientId: true, name: true, mode: true, status: true },
  });
  if (!workspace) throw new InteractionError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  if (workspace.clientId !== clientId) throw new InteractionError(403, 'CROSS_CLIENT_WORKSPACE', 'Workspace belongs to another client.');
  if (!ORGANIZATION_MODES.has(String(workspace.mode))) {
    throw new InteractionError(403, 'WORKSPACE_NOT_ORGANIZATION', 'This surface is only available for organizational workspaces.');
  }

  // Resolve the person's portal membership link (plain reference, not authorizing).
  // Honor the membership ONLY if it belongs to the requested workspace.
  let membershipId: string | null = null;
  let membershipStatus: string | null = null;
  let membershipExpiresAt: Date | null = null;
  let identityId: string | null = null;

  if (person.portalMembershipId) {
    const membership = await prisma.clientPortalWorkspaceMembership.findUnique({
      where: { id: person.portalMembershipId },
      select: { id: true, status: true, expiresAt: true, workspaceId: true, clientPortalIdentityId: true },
    });
    if (membership && membership.workspaceId === workspaceId) {
      membershipId = membership.id;
      membershipStatus = String(membership.status);
      membershipExpiresAt = membership.expiresAt;
      identityId = membership.clientPortalIdentityId;
    }
    // A membership in another workspace is intentionally ignored (fail-closed).
  }

  const portalStatus = mapPortalStatus(membershipStatus);
  const membershipActive = membershipStatus === ACTIVE_MEMBERSHIP_STATUS && (!membershipExpiresAt || membershipExpiresAt > new Date());

  // CHECK 4: an inactive membership (missing/suspended/expired) must yield NO
  // effective access. Case grants, summary scopes and document access lists are
  // all EMPTY when the membership is not active — never merely flagged via a
  // status badge. Only an active membership links to authorization principals.
  const identityIdForGrants = membershipActive ? identityId : null;
  const scopedMembershipId = membershipActive ? membershipId : null;

  // ---- Case access (ClientPortalGrant, workspace-scoped, active) -------------
  const caseGrants = identityIdForGrants
    ? await prisma.clientPortalGrant.findMany({
        where: { clientId, clientPortalIdentityId: identityIdForGrants, workspaceId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, caseId: true, workspaceId: true, participantRole: true, permissions: true, status: true, validFrom: true, validUntil: true, revision: true },
      })
    : [];
  const caseIds = [...new Set(caseGrants.map((g) => g.caseId))];
  const caseTitles = caseIds.length
    ? await prisma.case.findMany({ where: { id: { in: caseIds }, clientId }, select: { id: true, title: true } })
    : [];
  const caseTitleById = new Map(caseTitles.map((c) => [c.id, c.title]));

  // Defensive: only grants for the requested workspace are included, even if a
  // foreign-workspace row were returned.
  const caseAccess = caseGrants
    .filter((g) => g.workspaceId === workspaceId)
    .map((g) => ({
      grantId: g.id,
      caseId: g.caseId,
      caseTitle: caseTitleById.get(g.caseId) ?? null,
      participantRole: g.participantRole ? String(g.participantRole) : 'PARTICIPANT',
      permissions: Array.isArray(g.permissions) ? (g.permissions as string[]).map((p) => String(p)) : [],
      status: String(g.status),
      validFrom: iso(g.validFrom),
      validUntil: iso(g.validUntil),
      revision: g.revision,
      effective: membershipActive && grantIsEffective(g),
    }));

  // ---- Aggregate summary scopes (ClientPortalSummaryScope, membership-scoped) --
  const scopes = scopedMembershipId
    ? await prisma.clientPortalSummaryScope.findMany({
        where: { workspaceMembershipId: scopedMembershipId, workspaceId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          scopeType: true,
          organizationGroupId: true,
          status: true,
          canViewCaseCounts: true,
          canViewStageCounts: true,
          canViewDeadlineCounts: true,
          canViewPublishedHours: true,
        },
      })
    : [];
  // Resolve UNIT group labels only from groups belonging to THIS client.
  const scopeGroupIds = [...new Set(scopes.map((s) => s.organizationGroupId).filter((id): id is string => Boolean(id)))];
  const scopeGroups = scopeGroupIds.length
    ? await prisma.clientOrganizationGroup.findMany({ where: { id: { in: scopeGroupIds }, clientId }, select: { id: true, name: true } })
    : [];
  const scopeGroupNameById = new Map(scopeGroups.map((g) => [g.id, g.name]));

  const summaryScopes = scopes.map((s) => ({
    scopeId: s.id,
    scopeType: String(s.scopeType),
    organizationGroupId: s.organizationGroupId,
    organizationGroupName: s.organizationGroupId ? scopeGroupNameById.get(s.organizationGroupId) ?? null : null,
    status: String(s.status),
    canViewCaseCounts: s.canViewCaseCounts,
    canViewStageCounts: s.canViewStageCounts,
    canViewDeadlineCounts: s.canViewDeadlineCounts,
    canViewPublishedHours: s.canViewPublishedHours,
  }));

  // ---- Document access (ClientDocumentPublication + Recipient + DOCUMENT_READ) --
  // A publication is visible to this person only when: an active grant on the
  // publication's case carries DOCUMENT_READ in the same workspace, the
  // publication is PUBLISHED, and for SELECTED_PARTICIPANTS the membership is an
  // explicit recipient. `accessibleVia` is descriptive only.
  let documentAccess: PersonAccessProjection['documentAccess'] = [];
  if (membershipActive && identityId && membershipId) {
    const grantsWithDocRead = caseAccess.filter((g) => g.effective && Array.isArray(g.permissions) && g.permissions.includes('DOCUMENT_READ'));
    const grantCaseIds = new Set(grantsWithDocRead.map((g) => g.caseId));
    if (grantCaseIds.size) {
      const publications = await prisma.clientDocumentPublication.findMany({
        where: { clientId, caseId: { in: [...grantCaseIds] }, status: PUBLISHED },
        select: { id: true, visibility: true, status: true, workspaceId: true, documentId: true, recipients: { select: { workspaceMembershipId: true } } },
      });
      const documentIds = [...new Set(publications.map((p) => p.documentId))];
      const documents = documentIds.length ? await prisma.document.findMany({ where: { id: { in: documentIds }, clientId }, select: { id: true, name: true } }) : [];
      const documentNameById = new Map(documents.map((d) => [d.id, d.name]));

      for (const pub of publications) {
        // Must be in the same workspace context.
        if (pub.workspaceId && pub.workspaceId !== workspaceId) continue;
        if (String(pub.visibility) === 'SELECTED_PARTICIPANTS') {
          const isRecipient = pub.recipients.some((r) => r.workspaceMembershipId === membershipId);
          if (!isRecipient) continue;
          documentAccess.push({
            publicationId: pub.id,
            documentTitle: documentNameById.get(pub.documentId) ?? 'Dokumentum',
            visibility: String(pub.visibility),
            status: String(pub.status),
            accessibleVia: 'SELECTED_PARTICIPANT',
          });
        } else {
          documentAccess.push({
            publicationId: pub.id,
            documentTitle: documentNameById.get(pub.documentId) ?? 'Dokumentum',
            visibility: String(pub.visibility),
            status: String(pub.status),
            accessibleVia: 'WORKSPACE',
          });
        }
      }
    }
  }

  const dto: PersonAccessProjection = {
    person: {
      id: person.id,
      name: person.name,
      jobTitle: person.jobTitle,
      organizationGroupId: person.organizationGroupId,
      organizationGroupName: person.organizationGroup?.name ?? null,
      portalStatus,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name ?? null,
      mode: String(workspace.mode),
    },
    membership: membershipId
      ? { id: membershipId, status: String(membershipStatus), expiresAt: iso(membershipExpiresAt) }
      : null,
    caseAccess,
    summaryScopes,
    documentAccess,
  };

  assertClientSafe(dto);
  return dto;
}