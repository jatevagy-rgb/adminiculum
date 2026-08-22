/**
 * PHASE 5B — ORGANIZATIONAL CUSTOMER COMPANY OVERVIEW (Vállalat).
 *
 * A simple customer-facing overview of the CUSTOMER'S OWN organization for an
 * ORGANIZATION workspace. Content is composed from canonical customer-safe
 * projectors only:
 *   - projectCompanyOverviewForCustomer (profile headline + safe milestones/
 *     initiatives, internal findings/notes/verification stripped);
 *   - projectOrganizationForCustomer (customer-owned groups + active persons);
 *   - listOrganizationalCases (visible matters per organizational area, so every
 *     count reflects ONLY granted/visible cases — never hidden ones).
 *
 * Authorization is the canonical org portal path: requireOrganizationWorkspace
 * then the customer's granted-cases resolver. No client/workspace/grant id is ever
 * accepted from the browser.
 *
 * SAFETY BOUNDARY: internal responsibility assignments, lawyer ownership, skills,
 * HR data, internal departments not customer-owned, internal KPIs, compliance
 * findings, hidden cases/groups, raw ContractRecord and internal tasks are never
 * returned. Responsibilities are intentionally stripped from persons.
 *
 * NO new persistence. Reuses existing canonical models + services.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';
import { listOrganizationalCases } from './organizationalCaseService';
import { projectCompanyOverviewForCustomer } from '../client-company/projector';
import { projectOrganizationForCustomer } from '../client-organization/service';

type Prisma = typeof defaultPrisma;

export interface OrgCompanyGroup {
  id: string;
  name: string;
  parentGroupId: string | null;
}

export interface OrgCompanyPerson {
  id: string;
  name: string;
  jobTitle: string | null;
  organizationGroupId: string | null;
  managerName: string | null;
  deputyName: string | null;
}

export interface OrgCompanyVisibleArea {
  areaName: string;
  visibleMatterCount: number;
}

export interface OrgCompanyDto {
  companyName: string;
  profileHeadline: string | null;
  groups: OrgCompanyGroup[];
  persons: OrgCompanyPerson[];
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

/**
 * Build the customer company overview DTO. Requires an active ORGANIZATION
 * workspace; all content comes from canonical customer-safe projections.
 */
export async function getOrganizationalCompany(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrgCompanyDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const client = await prisma.client.findUnique({ where: { id: workspace.clientId }, select: { name: true } });

  const [overview, organization, cases] = await Promise.all([
    projectCompanyOverviewForCustomer(workspace.clientId, prisma),
    projectOrganizationForCustomer(workspace.clientId, prisma),
    listOrganizationalCases(identityId, workspaceId, { limit: 50 }, prisma),
  ]);

  // Visible matter counts per organizational area derive ONLY from the customer's
  // granted/visible cases (never hidden ones).
  const byArea = new Map<string, number>();
  for (const row of cases.items) {
    const area = row.organizationUnitName || 'Egyéb szervezeti terület';
    byArea.set(area, (byArea.get(area) || 0) + 1);
  }

  const dto: OrgCompanyDto = {
    companyName: client?.name || 'Szervezet',
    profileHeadline: overview.profileHeadline,
    groups: (organization.groups as any[]).map((group) => ({
      id: String(group.id),
      name: String(group.name),
      parentGroupId: group.parentGroupId ? String(group.parentGroupId) : null,
    })),
    // Responsibilities (internal role assignments) are intentionally stripped.
    persons: (organization.persons as any[]).map((person) => ({
      id: String(person.id),
      name: String(person.name),
      jobTitle: person.jobTitle ? String(person.jobTitle) : null,
      organizationGroupId: person.organizationGroupId ? String(person.organizationGroupId) : null,
      managerName: person.managerName ? String(person.managerName) : null,
      deputyName: person.deputyName ? String(person.deputyName) : null,
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