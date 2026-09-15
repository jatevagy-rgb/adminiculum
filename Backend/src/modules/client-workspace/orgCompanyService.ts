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
import { getCompanyProfileDiscovery } from './companyProfileAnswerService';
import { getOrganizationalGrow } from './orgGrowService';
import { listPortalDocuments } from '../client-publication/publicationService';
import { getClientSafeComplianceReadModel } from '../compliance/clientSafeComplianceService';

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

export interface OrgCompanySystem {
  id: string;
  name: string;
  category: string;
  purpose: string | null;
}

export interface OrgCompanyProcess {
  id: string;
  name: string;
  category: string;
  criticality: string;
  frequency: string;
}

export interface OrgCompanyDataSummary {
  relevantQuestionCount: number;
  answeredCount: number;
  unknownCount: number;
  unansweredCount: number;
  needsCompletion: boolean;
  portalPath: string;
}

export interface OrgCompanyDocumentsSummary {
  visibleDocumentCount: number;
  latestPublishedAt: string | null;
  portalPath: string;
}

export interface OrgCompanyComplianceSummary {
  topicCount: number;
  moreInformationNeededCount: number;
  lawyerReviewRequiredCount: number;
  actionInProgressCount: number;
  resolvedCount: number;
  portalPath: string;
}

export interface OrgCompanyDevelopmentSummary {
  initiativeCount: number;
  activeInitiativeCount: number;
  portalPath: string;
}

export interface OrgCompanyOutcomeSummary {
  measuredCount: number;
  calculatedCount: number;
  estimatedCount: number;
  portalPath: string;
}

export interface OrgCompanyDto {
  companyName: string;
  profileHeadline: string | null;
  employeeCount: number | null;
  dataSummary: OrgCompanyDataSummary | null;
  groups: OrgCompanyGroup[];
  visibleMattersByArea: OrgCompanyVisibleArea[];
  totalVisibleMatterCount: number;
  milestones: Array<{ id: string; title: string; date: string | null }>;
  initiatives: Array<{ id: string; title: string; targetState: string | null; statusLabel: string; targetAt: string | null }>;
  systems: OrgCompanySystem[];
  processes: OrgCompanyProcess[];
  documentsSummary: OrgCompanyDocumentsSummary | null;
  complianceSummary: OrgCompanyComplianceSummary | null;
  developmentSummary: OrgCompanyDevelopmentSummary | null;
  outcomeSummary: OrgCompanyOutcomeSummary | null;
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
  const [overview, cases, groups, systems, processes, profile, documents, compliance, grow, employeeFact] = await Promise.all([
    projectCompanyOverviewForCustomer(workspace.clientId, prisma),
    listOrganizationalCases(identityId, workspaceId, { limit: ORG_CASE_LIST_LIMIT }, prisma),
    prisma.clientOrganizationGroup.findMany({
      where: { workspaceId: workspace.id, status: 'ACTIVE' },
      select: { id: true, name: true, parentGroupId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.businessSystem.findMany({
      where: { clientId: workspace.clientId, status: 'ACTIVE' },
      select: { id: true, name: true, category: true, purpose: true },
      orderBy: { name: 'asc' },
    }),
    prisma.businessProcess.findMany({
      where: { clientId: workspace.clientId, status: 'ACTIVE' },
      select: { id: true, name: true, category: true, criticality: true, frequency: true },
      orderBy: { name: 'asc' },
    }),
    getCompanyProfileDiscovery(identityId, workspaceId, undefined, { includeCanonicalBaseline: true }).catch(() => null),
    listPortalDocuments({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId }, undefined, prisma).catch(() => null),
    getClientSafeComplianceReadModel(
      workspace.clientId,
      process.env.NODE_ENV === 'production',
      process.env.NODE_ENV !== 'production' && process.env.ADMINICULUM_DEMO_CONTENT_ENABLED === 'true',
      prisma,
    ).catch(() => null),
    getOrganizationalGrow(identityId, workspaceId, prisma).catch(() => null),
    prisma.clientFact.findFirst({
      where: {
        clientId: workspace.clientId,
        supersededAt: null,
        factDefinition: { key: 'employee_count' },
      },
      select: { numberValue: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Visible matter counts per organizational area derive ONLY from the customer's
  // granted/visible cases (never hidden ones). The per-area sum equals the total.
  const byArea = new Map<string, number>();
  for (const row of cases.items) {
    const area = row.organizationUnitName || 'Egyéb szervezeti terület';
    byArea.set(area, (byArea.get(area) || 0) + 1);
  }

  const profileQuestions = profile?.questions ?? [];
  const answeredCount = profileQuestions.filter((question) => question.status === 'ANSWERED').length;
  const unknownCount = profileQuestions.filter((question) => question.status === 'UNKNOWN').length;
  const unansweredCount = profileQuestions.filter((question) => question.status === 'UNANSWERED').length;
  const employeeQuestion = profileQuestions.find((question) => question.questionKey === 'employee_count');
  const employeeCount = employeeQuestion?.status === 'UNKNOWN'
    ? null
    : employeeQuestion?.status === 'ANSWERED' && typeof employeeQuestion.value === 'number'
      ? employeeQuestion.value
      : employeeFact?.numberValue != null
        ? Number(employeeFact.numberValue)
        : null;
  const complianceSummary = compliance
    ? {
        topicCount: compliance.topics.length,
        moreInformationNeededCount: compliance.topics.filter((topic) => topic.state === 'MORE_INFORMATION_NEEDED').length,
        lawyerReviewRequiredCount: compliance.topics.filter((topic) => topic.state === 'LAWYER_REVIEW_REQUIRED').length,
        actionInProgressCount: compliance.topics.filter((topic) => topic.state === 'ACTION_IN_PROGRESS').length,
        resolvedCount: compliance.topics.filter((topic) => topic.state === 'RESOLVED').length,
        portalPath: '/portal/megfeleles',
      }
    : null;
  const documentsSummary = documents
    ? (() => {
        let latestPublishedAt: string | null = null;
        for (const item of documents.items) {
          const publishedAt = typeof item.publishedAt === 'string' ? item.publishedAt : null;
          if (publishedAt && (!latestPublishedAt || publishedAt > latestPublishedAt)) latestPublishedAt = publishedAt;
        }
        return {
          visibleDocumentCount: documents.items.length,
          latestPublishedAt,
          portalPath: '/portal/dokumentumok',
        };
      })()
    : null;
  const developmentSummary = grow
    ? {
        initiativeCount: grow.initiatives.length,
        activeInitiativeCount: grow.initiatives.filter((initiative) => initiative.statusLabel === 'Folyamatban').length,
        portalPath: '/portal/fejlesztes',
      }
    : null;
  const outcomeSummary = grow
    ? {
        measuredCount: grow.outcomes.measured.length,
        calculatedCount: grow.outcomes.calculatedOrEstimated.filter((outcome) => outcome.basis === 'CALCULATED').length,
        estimatedCount: grow.outcomes.calculatedOrEstimated.filter((outcome) => outcome.basis === 'ESTIMATED').length,
        portalPath: '/portal/fejlesztes',
      }
    : null;

  const dto: OrgCompanyDto = {
    companyName: client?.name || 'Szervezet',
    profileHeadline: overview.profileHeadline,
    employeeCount,
    dataSummary: profile
      ? {
          relevantQuestionCount: profileQuestions.length,
          answeredCount,
          unknownCount,
          unansweredCount,
          needsCompletion: unansweredCount > 0,
          portalPath: '/portal/vallalat/company-profile',
        }
      : null,
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
    systems: systems.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      purpose: s.purpose || null,
    })),
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      criticality: p.criticality,
      frequency: p.frequency,
    })),
    documentsSummary,
    complianceSummary,
    developmentSummary,
    outcomeSummary,
  };

  assertClientSafe(dto);
  return dto;
}