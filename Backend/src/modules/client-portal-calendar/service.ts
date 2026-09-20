/**
 * CUSTOMER PORTAL CALENDAR — customer-safe read projection.
 *
 * This is NOT the internal workforce client-calendar. That endpoint aggregates
 * ContractRecord / ClientObligation / ContractEntitlement / CompanyMilestone /
 * Case.deadline / Task.dueDate / CaseIntakeDeadline and stays internal. This
 * module composes ONLY explicitly customer-safe, already-published sources:
 *
 *   - publicTargetDate from the published matter revision  (MATTER_TARGET)
 *   - publishedDeadlinesSnapshot on the published revision (PUBLISHED_DEADLINE)
 *   - published ClientActionRequest.dueAt                  (ACTION_REQUEST)
 *   - customer-visible ClientRequest.dueAt                 (CUSTOMER_REQUEST)
 *   - keyDate of an EXPLICITLY published ContractRecord     (CONTRACT_DATE, ORGANIZATION)
 *   - ACHIEVED company milestones of a published overview   (COMPANY_MILESTONE, ORGANIZATION)
 *   - DevelopmentInitiative.targetAt from the customer-safe Grow projection
 *     already shown on /portal/fejlesztes                   (GROW_TARGET, ORGANIZATION)
 *   - ClientControl.nextReviewAt from the customer-safe compliance read model
 *     already shown on /portal/megfeleles                   (COMPLIANCE_REVIEW, ORGANIZATION)
 *
 * Every source is read through the canonical customer-safe readers; this module
 * never queries an internal table directly and never accepts a client/case/grant
 * id from the caller. No new persistence; read projection only.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError, resolveActiveCustomerGrant } from '../client-interaction/base';
import { listCustomerRequests } from '../client-interaction/requestService';
import { listPortalActionRequests, listPortalMatters } from '../client-publication/publicationService';
import { getOrganizationalContracts } from '../client-workspace/orgContractsService';
import { canViewOrganizationSummary } from '../client-workspace/leadershipSummaryService';
import { getOrganizationalGrow } from '../client-workspace/orgGrowService';
import { getClientSafeComplianceReadModel } from '../compliance/clientSafeComplianceService';
import { projectCompanyOverviewForCustomer } from '../client-company/projector';
import { resolveCalendarRange } from '../client-calendar/service';
import {
  CustomerCalendarProjection,
  CustomerCalendarSourceItem,
  buildCustomerCalendar,
} from './projection';
import {
  CompanyMilestoneSourceRow,
  ComplianceReviewSourceRow,
  CustomerRequestSourceRow,
  GrowInitiativeSourceRow,
  OrgContractSourceRow,
  PortalActionRequestSourceRow,
  PortalMatterSourceRow,
  mapActionRequestSources,
  mapCompanyMilestoneSource,
  mapComplianceReviewSource,
  mapCustomerRequestSource,
  mapGrowInitiativeSource,
  mapMatterSources,
  mapOrgContractSource,
} from './mappers';

type Prisma = typeof defaultPrisma;

export interface CustomerCalendarQuery {
  from?: unknown;
  to?: unknown;
}

export interface CustomerCalendarResponse extends CustomerCalendarProjection {
  from: string;
  to: string;
  today: string;
}

/** Canonical customer-safe readers, injectable so the orchestration is unit-testable. */
export interface CustomerCalendarReaders {
  listMatters(): Promise<PortalMatterSourceRow[]>;
  listActionRequests(): Promise<PortalActionRequestSourceRow[]>;
  grantedCaseIds(): Promise<string[]>;
  listCaseRequests(caseId: string): Promise<CustomerRequestSourceRow[]>;
  listContracts(): Promise<OrgContractSourceRow[]>;
  listCompanyMilestones(): Promise<CompanyMilestoneSourceRow[]>;
  listGrowInitiatives(): Promise<GrowInitiativeSourceRow[]>;
  listComplianceReviews(): Promise<ComplianceReviewSourceRow[]>;
}

export interface CustomerCalendarOptions {
  readers?: CustomerCalendarReaders;
  now?: Date;
}

function actorFor(identityId: string, workspaceId: string) {
  return { userId: identityId, role: 'CLIENT_PORTAL', workspaceId };
}

/**
 * Resolve the canonical safe reader bundle for the identity/workspace. Optional
 * ORGANIZATION-only sections degrade to an empty list rather than failing the
 * whole calendar (mirrors the existing portal views' optional-section posture).
 */
async function canonicalReaders(identityId: string, workspaceId: string, prisma: Prisma): Promise<CustomerCalendarReaders> {
  const actor = actorFor(identityId, workspaceId);
  const workspace = await prisma.clientPortalWorkspace.findFirst({
    where: { id: workspaceId, status: 'ACTIVE' },
    select: { id: true, mode: true, clientId: true },
  });
  if (!workspace) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  const isOrganization = String(workspace.mode) === 'ORGANIZATION';

  return {
    async listMatters() {
      const result = await listPortalMatters(actor, prisma);
      return result.items as unknown as PortalMatterSourceRow[];
    },
    async listActionRequests() {
      const result = await listPortalActionRequests(actor, null, prisma);
      return result.items as unknown as PortalActionRequestSourceRow[];
    },
    async grantedCaseIds() {
      const now = new Date();
      const grants = await prisma.clientPortalGrant.findMany({
        where: {
          clientPortalIdentityId: identityId,
          workspaceId,
          status: 'ACTIVE',
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { caseId: true },
        distinct: ['caseId'],
      });
      return grants.map((grant) => String(grant.caseId)).filter(Boolean);
    },
    async listCaseRequests(caseId: string) {
      const ctx = await resolveActiveCustomerGrant(identityId, caseId, workspaceId, prisma);
      const result = await listCustomerRequests(ctx, prisma);
      return result.items as unknown as CustomerRequestSourceRow[];
    },
    async listContracts() {
      if (!isOrganization) return [];
      try {
        const result = await getOrganizationalContracts(identityId, workspaceId, prisma);
        return result.items as unknown as OrgContractSourceRow[];
      } catch {
        return [];
      }
    },
    async listCompanyMilestones() {
      if (!isOrganization) return [];
      try {
        if (!(await canViewOrganizationSummary(identityId, workspaceId, prisma))) return [];
        const overview = await projectCompanyOverviewForCustomer(workspace.clientId, prisma);
        return (overview.milestones as unknown as CompanyMilestoneSourceRow[]) || [];
      } catch {
        return [];
      }
    },
    async listGrowInitiatives() {
      if (!isOrganization) return [];
      try {
        // Reuses the SAME customer-safe projection that backs /portal/fejlesztes,
        // so an initiative reaches the calendar only when it already reaches Grow.
        const grow = await getOrganizationalGrow(identityId, workspaceId, prisma);
        return grow.initiatives.map((initiative) => ({
          id: initiative.id,
          title: initiative.title,
          targetAt: initiative.targetAt,
          statusLabel: initiative.statusLabel,
        }));
      } catch {
        return [];
      }
    },
    async listComplianceReviews() {
      if (!isOrganization) return [];
      try {
        // Reuses the SAME customer-safe read model that backs /portal/megfeleles.
        const model = await getClientSafeComplianceReadModel(
          workspace.clientId,
          process.env.NODE_ENV === 'production',
          process.env.PORTAL_DEMO_ENABLED === 'true',
          prisma,
        );
        return model.controlsSummary.flatMap((group) =>
          group.controls
            .filter((control) => Boolean(control.nextReviewAt))
            .map((control) => ({
              requirementTitle: group.requirementTitle,
              title: control.title,
              nextReviewAt: control.nextReviewAt,
            })),
        );
      } catch {
        return [];
      }
    },
  };
}

/**
 * Build the customer-safe calendar for the selected workspace. The workspace is
 * resolved server-side by the route; the identity is the authenticated portal
 * identity. No internal id is accepted from the caller.
 */
export async function getCustomerCalendar(
  identityId: string,
  workspaceId: string,
  query: CustomerCalendarQuery = {},
  prisma: Prisma = defaultPrisma,
  options: CustomerCalendarOptions = {},
): Promise<CustomerCalendarResponse> {
  const { from, toDay } = resolveCalendarRange(query);
  const fromDay = from.toISOString().slice(0, 10);
  const toDayString = toDay.toISOString().slice(0, 10);
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);

  const readers = options.readers ?? await canonicalReaders(identityId, workspaceId, prisma);

  const [matters, actionRequests, caseIds, contracts, milestones, growInitiatives, complianceReviews] = await Promise.all([
    readers.listMatters(),
    readers.listActionRequests(),
    readers.grantedCaseIds(),
    readers.listContracts(),
    readers.listCompanyMilestones(),
    readers.listGrowInitiatives(),
    readers.listComplianceReviews(),
  ]);

  const publicationByCase = new Map<string, string>();
  for (const matter of matters) {
    if (matter.caseId) publicationByCase.set(String(matter.caseId), String(matter.id));
  }

  const sources: CustomerCalendarSourceItem[] = [];
  for (const matter of matters) sources.push(...mapMatterSources(matter));
  for (const action of actionRequests) sources.push(...mapActionRequestSources(action));
  for (const contract of contracts) sources.push(...mapOrgContractSource(contract));
  for (const milestone of milestones) sources.push(...mapCompanyMilestoneSource(milestone));
  for (const initiative of growInitiatives) sources.push(...mapGrowInitiativeSource(initiative));
  for (const review of complianceReviews) sources.push(...mapComplianceReviewSource(review));

  const seenRequests = new Set<string>();
  for (const caseId of caseIds) {
    let requests: CustomerRequestSourceRow[];
    try {
      requests = await readers.listCaseRequests(caseId);
    } catch (error) {
      // A grant that cannot resolve for this workspace simply contributes nothing;
      // genuine faults (non-auth) still surface.
      if ((error as { status?: number } | null)?.status === 403) continue;
      throw error;
    }
    for (const request of requests) {
      if (seenRequests.has(request.id)) continue;
      seenRequests.add(request.id);
      const href = publicationByCase.has(caseId)
        ? `/portal/matters/${encodeURIComponent(publicationByCase.get(caseId) as string)}`
        : '/portal/dokumentumok';
      sources.push(...mapCustomerRequestSource(request, href));
    }
  }

  const projection = buildCustomerCalendar(sources, { from: fromDay, to: toDayString, today });
  const dto: CustomerCalendarResponse = { from: fromDay, to: toDayString, today, ...projection };
  assertClientSafe(dto);
  return dto;
}
