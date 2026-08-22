/**
 * PHASE 5B — ORGANIZATIONAL CUSTOMER COMPANY OVERVIEW (Vállalat).
 *
 * A simple customer-facing overview of the CUSTOMER'S OWN organization for an
 * ORGANIZATION workspace. Content is composed from canonical customer-safe
 * projectors only:
 *   - projectCompanyOverviewForCustomer (profile headline + safe milestones/
 *     initiatives, internal findings/notes/verification stripped) — ONLY after
 *     the canonical ORGANIZATION summary-scope authorization succeeds;
 *   - workspace-scoped client organization groups (ACTIVE, current workspace only);
 *   - listOrganizationalCases (visible matters per organizational area, so every
 *     count reflects ONLY granted/visible cases — never hidden ones).
 *
 * AUTHORIZATION — the Phase 5B company gate:
 *   1. workspace mode must be exactly ORGANIZATION (NOT CASE_RELAY);
 *   2. the active portal membership must hold an ACTIVE ClientPortalSummaryScope
 *      with scopeType=ORGANIZATION for the current workspace (reuses the canonical
 *      canViewOrganizationSummary primitive).
 *   Missing scope -> 403 CLIENT_SUMMARY_SCOPE_FORBIDDEN. Sensitive organization-
 *   wide company data is never loaded before authorization.
 *
 * SAFETY BOUNDARY: the customer person directory is NOT exposed (no OrganizationPerson
 * names/jobTitle/manager/deputy/portalMembershipId/employmentStatus/responsibilities —
 * there is no explicit customer-directory publication policy yet). Groups are
 * restricted to the current workspace (workspaceId + ACTIVE), never derived from
 * clientId alone. Internal findings/notes/verification state, lawyer ownership,
 * skills, HR data, hidden cases/groups and internal tasks never cross.
 *
 * NO new persistence. Reuses existing canonical models + services.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';
import { canViewOrganizationSummary } from './leadershipSummaryService';
import { listOrganizationalCases } from './organizationalCaseService';
import { projectCompanyOverviewForCustomer } from '../client-company/projector';

type Prisma = typeof defaultPrisma;

export interface OrgCompanyGroup {
  id: string;
  name: string;
  parentGroupId: string | null;
}

export interface OrgCompanyVisibleArea {
  areaName: string;
  visibleMatterCount: number;
}

export interface OrgCompanyDto {
  companyName: string;
  profileHeadline: string | null;
  groups: OrgCompanyGroup[];
  visibleMattersByArea: OrgCompanyVisibleArea[];
  totalVisibleMatterCount: number;
  milestones: Array<{ id: string; title: string; date: string | null }>;
  initiatives: Array<{ id: string; title: string; targetState: string | null; statusLabel: string; targetAt: string | null }>;
}

const INITIATIVE_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Tervezett',
  ACTIVE: 'Folyamatban',
  COMPLETED: 'Kész',
  HOLD: 'Szünetel',
  CANCELLED: 'Törölve',
};

const ORG_CASE_LIST_LIMIT = 200;

/**
 * Build the customer company overview DTO. Requires an ACTIVE ORGANIZATION
 * workspace AND an ACTIVE ORGANIZATION summary scope; all content comes from
 * canonical customer-safe projections. Sensitive org-wide data is loaded only
 * after the authorization gate succeeds.
 */
export async function getOrganizationalCompany(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrgCompanyDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  // Phase 5B company overview is ORGANIZATION-mode only; CASE_RELAY is denied.
  const modeRow = await prisma.clientPortalWorkspace.findFirst({ where: { id: workspace.id }, select: { mode: true } });
  if (String(modeRow?.mode) !== 'ORGANIZATION') {
    throw new InteractionError(403, 'CLIENT_SUMMARY_SCOPE_FORBIDDEN', 'A company overview is only available for organizational workspaces.');
  }
  // The canonical per-membership authorization gate for organization-wide content.
  if (!(await canViewOrganizationSummary(identityId, workspaceId, prisma))) {
    throw new InteractionError(403, 'CLIENT_SUMMARY_SCOPE_FORBIDDEN', 'An organization summary scope is required.');
  }

  const client = await prisma.client.findUnique({ where: { id: workspace.clientId }, select: { name: true } });

  // Organization-wide overview content is loaded only after authorization.
  const [overview, cases] = await Promise.all([
    projectCompanyOverviewForCustomer(workspace.clientId, prisma),
    listOrganizationalCases(identityId, workspaceId, { limit: ORG_CASE_LIST_LIMIT }, prisma),
  ]);

  // Workspace-scoped ACTIVE groups only — never a client-wide directory, and never
  // derived from clientId alone. Allowlisted fields: id, name, parentGroupId.
  const groups = await prisma.clientOrganizationGroup.findMany({
    where: { workspaceId: workspace.id, status: 'ACTIVE' },
    select: { id: true, name: true, parentGroupId: true },
    orderBy: { name: 'asc' },
  });

  // Visible matter counts per organizational area derive ONLY from the customer's
  // granted/visible cases (never hidden ones). The per-area sum equals the total.
  const byArea = new Map<string, number>();
  for (const row of cases.items) {
    const area = row.organizationUnitName || 'Egyéb szervezeti terület';
    byArea.set(area, (byArea.get(area) || 0) + 1);
  }

  const dto: OrgCompanyDto = {
    companyName: client?.name || 'Szervezet',
    profileHeadline: overview.profileHeadline,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      parentGroupId: group.parentGroupId ? String(group.parentGroupId) : null,
    })),
    visibleMattersByArea: [...byArea.entries()].map(([areaName, visibleMatterCount]) => ({ areaName, visibleMatterCount })),
    totalVisibleMatterCount: cases.total,
    milestones: (overview.milestones as any[]).map((milestone) => ({
      id: String(milestone.id),
      title: String(milestone.title),
      date: milestone.date ? String(milestone.date) : null,
    })),
    initiatives: (overview.initiatives as any[]).map((initiative) => ({
      id: String(initiative.id),
      title: String(initiative.title),
      targetState: initiative.targetState ? String(initiative.targetState) : null,
      statusLabel: INITIATIVE_STATUS_LABELS[String(initiative.status)] || 'Folyamatban',
      targetAt: initiative.targetAt ? String(initiative.targetAt) : null,
    })),
  };

  assertClientSafe(dto);
  return dto;
}