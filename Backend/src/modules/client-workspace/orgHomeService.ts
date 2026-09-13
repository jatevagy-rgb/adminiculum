/**
 * PHASE 5 — ORGANIZATIONAL CUSTOMER HOME SERVICE (Slice 5A).
 *
 * Composes the customer's organizational home (Főoldal) journey
 * `Eddig → Most → Következőként` from ONLY customer-safe published data.
 *
 * Authorization is the canonical org portal path:
 *   requireOrganizationWorkspace + resolveParticipantAccess (via the org case
 *   services) and the canonical publication/read resolvers. Nothing is inferred
 *   from email, membership alone, org group, or the frontend. Every returned
 *   field is an explicit allowlist projection; internal Task/AssessmentFinding/
 *   Outlook/HR/SharePoint data never crosses.
 *
 * NO new persistence. Reuses existing canonical models and services.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';
import { listOrganizationalCases, getOrganizationalCaseDetail } from './organizationalCaseService';
import { listPortalActionRequests, listPortalDocuments } from '../client-publication/publicationService';
import { resolveActiveCustomerGrant } from '../client-interaction/base';
import { listCustomerThreads } from '../client-interaction/questionService';
import { getClientSafeComplianceReadModel } from '../compliance/clientSafeComplianceService';

type Prisma = typeof defaultPrisma;

export interface OrgHomeCustomerMatter {
  publicationId: string;
  title: string;
  status: string;
  currentPosition: string;
  nextStep: string | null;
  waitingOn: string;
  publicTargetDate: string | null;
  progressPercentage?: number | null;
  milestones: Array<{
    reference?: string;
    title?: string;
    state?: string;
    displayOrder?: number;
    completedAt?: string | null;
  }>;
}

export interface OrgHomeDocument {
  id: string;
  matterTitle?: string | null;
  title: string;
  publishedAt?: string | null;
  downloadAvailable: boolean;
}

export interface OrgHomeAction {
  id: string;
  matterPublicationId?: string | null;
  matterTitle?: string | null;
  title: string;
  instructions?: string | null;
  dueAt?: string | null;
  typeLabel: string;
  readOnlyNote: string;
  area: 'LEGAL' | 'GROW' | 'COMPLIANCE';
  actionUrl: string;
}

export interface OrgHomeMatterRow {
  publicReference: string;
  matterPublicationId: string;
  publicTitle: string;
  organizationUnitName: string | null;
  relationshipToCase: string;
  publicStatus: string;
  waitingOn: string;
  nextStep: string | null;
  publicTargetDate: string | null;
  customerActionRequired: boolean;
  lastPublishedUpdateAt: string | null;
}

export interface OrgHomeContactSummary {
  openCount: number;
  unreadCount: number;
  latestPreview: string | null;
  latestUpdatedAt: string | null;
}

export interface OrgHomeGrowSummary {
  activeInitiativesCount: number;
  initiatives: Array<{ id: string; title: string; statusLabel: string; targetState: string | null }>;
  knownProcessesCount: number;
}

export interface OrgHomeComplianceSummary {
  attentionCount: number;
  inProgressCount: number;
  noActionExpectedCount: number;
  topics: Array<{ topicId: string; topicLabel: string; state: string; nextAction: string | null }>;
}

export interface OrgHomeDigitalTwinSummary {
  organizationUnitsCount: number;
  knownProcessesCount: number;
  knownSystemsCount: number;
  employeeCount: number | null;
}

export interface OrgHomeDto {
  customer: { name: string };
  currentMatter?: OrgHomeCustomerMatter;
  matters: OrgHomeMatterRow[];
  actions: OrgHomeAction[];
  recentDocuments: OrgHomeDocument[];
  contactSummary: OrgHomeContactSummary;
  growSummary: OrgHomeGrowSummary;
  complianceSummary: OrgHomeComplianceSummary;
  digitalTwinSummary: OrgHomeDigitalTwinSummary;
}

function iso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

/**
 * Resolve the current, most relevant customer-visible matter for the home
 * journey: the first granted case (preferring OWN) with a published snapshot.
 */
async function resolveCurrentMatter(
  identityId: string,
  workspaceId: string,
  caseRows: OrgHomeMatterRow[],
  prisma: Prisma,
): Promise<OrgHomeCustomerMatter | undefined> {
  const ordered = [...caseRows].sort((a, b) => {
    const aOwn = a.relationshipToCase === 'OWN' ? 0 : 1;
    const bOwn = b.relationshipToCase === 'OWN' ? 0 : 1;
    return aOwn - bOwn || String(b.lastPublishedUpdateAt || '').localeCompare(String(a.lastPublishedUpdateAt || ''));
  });
  const row = ordered[0];
  if (!row) return undefined;
  try {
    const detail = await getOrganizationalCaseDetail(identityId, workspaceId, row.publicReference, prisma);
    const milestones = Array.isArray(detail.safeMilestones)
      ? detail.safeMilestones.map((m: any) => ({
          reference: m.reference ?? null,
          title: m.title ?? null,
          state: m.state ?? null,
          displayOrder: m.displayOrder ?? 0,
          completedAt: m.completedAt ?? null,
        }))
      : [];
    return {
      publicationId: row.matterPublicationId,
      title: row.publicTitle,
      status: row.publicStatus,
      currentPosition: detail.currentStatusText || row.publicStatus,
      nextStep: row.nextStep,
      waitingOn: row.waitingOn,
      publicTargetDate: row.publicTargetDate,
      progressPercentage: detail.progressPercentage ?? null,
      milestones,
    };
  } catch {
    // A granted case may lack a published snapshot; fall back to the next row
    // or none. Never fail the whole home for one unpublished case.
    return undefined;
  }
}

/**
 * Aggregate participant-authorized question threads across the customer's
 * granted cases into a compact contact summary.
 */
async function unreadForThread(threadId: string, membershipId: string, prisma: Prisma): Promise<number> {
  const readState = await prisma.clientQuestionThreadReadState.findUnique({
    where: { threadId_workspaceMembershipId: { threadId, workspaceMembershipId: membershipId } },
    select: { lastReadAt: true },
  });
  return prisma.clientQuestionMessage.count({
    where: {
      threadId,
      visibility: 'SENT',
      createdAt: readState?.lastReadAt ? { gt: readState.lastReadAt } : undefined,
    },
  });
}

/**
 * Aggregate participant-authorized question threads across the customer's
 * granted cases into a compact contact summary.
 *
 * openCount/unreadCount include EVERY authorized thread; the preview is still
 * limited to the five newest threads so the home surface stays compact.
 */
async function buildContactSummary(
  identityId: string,
  workspaceId: string,
  prisma: Prisma,
): Promise<OrgHomeContactSummary> {
  let open = 0;
  let unread = 0;
  let latestPreview: string | null = null;
  let latestUpdatedAt: string | null = null;

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

  for (const { caseId } of grants) {
    try {
      const ctx = await resolveActiveCustomerGrant(identityId, caseId, workspaceId, prisma);
      // Totals: every thread where this membership is an authorized participant.
      const threads = await prisma.clientQuestionThread.findMany({
        where: {
          caseId,
          workspaceId,
          participants: { some: { workspaceMembershipId: ctx.membershipId, removedAt: null, canRead: true } },
        },
        select: { id: true, status: true, archivedAt: true, updatedAt: true, lastMessageAt: true },
      });
      for (const t of threads) {
        if (t.status !== 'CLOSED' && !t.archivedAt) open += 1;
        unread += await unreadForThread(t.id, ctx.membershipId, prisma);
      }
      // Preview remains limited to the five newest threads.
      const preview = await listCustomerThreads(ctx, prisma, { limit: 5 });
      for (const t of preview.items as any[]) {
        const ts = iso(t.lastMessageAt || t.updatedAt || null);
        if (ts && (!latestUpdatedAt || ts > latestUpdatedAt)) {
          latestUpdatedAt = ts;
          latestPreview = t.lastMessagePreview ?? t.subject ?? null;
        }
      }
    } catch {
      // permission-gated cases simply contribute nothing to the summary
    }
  }
  return { openCount: open, unreadCount: unread, latestPreview, latestUpdatedAt };
}

/**
 * Build the organizational customer home DTO. Requires an active ORGANIZATION
 * workspace; all data is derived from canonical safe projections.
 */
export async function getOrganizationalHome(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrgHomeDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const client = await prisma.client.findUnique({ where: { id: workspace.clientId }, select: { name: true } });
  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  const list = await listOrganizationalCases(identityId, workspaceId, { limit: 50 }, prisma);
  const caseRows = list.items as unknown as OrgHomeMatterRow[];

  const isProduction = process.env.NODE_ENV === 'production';
  const demoEnabled = !isProduction && process.env.ADMINICULUM_DEMO_CONTENT_ENABLED === 'true';

  const [
    currentMatter,
    actions,
    documents,
    contactSummary,
    complianceModel,
    growInitiatives,
    growInitiativesCount,
    processesCount,
    systemsCount,
    groupsCount,
    employeeFact,
  ] = await Promise.all([
    resolveCurrentMatter(identityId, workspaceId, caseRows, prisma),
    listPortalActionRequests({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId }, undefined, prisma),
    listPortalDocuments({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId }, undefined, prisma),
    buildContactSummary(identityId, workspaceId, prisma),
    getClientSafeComplianceReadModel(workspace.clientId, isProduction, demoEnabled, prisma).catch(() => ({ topics: [] })),
    prisma.developmentInitiative.findMany({
      where: { clientId: workspace.clientId, status: { in: ['PLANNED', 'ACTIVE'] } },
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true, targetState: true },
    }),
    prisma.developmentInitiative.count({
      where: { clientId: workspace.clientId, status: { in: ['PLANNED', 'ACTIVE'] } },
    }),
    prisma.businessProcess.count({
      where: { clientId: workspace.clientId, status: 'ACTIVE' },
    }),
    prisma.businessSystem.count({
      where: { clientId: workspace.clientId, status: 'ACTIVE' },
    }),
    prisma.clientOrganizationGroup.count({
      where: { workspaceId: workspace.id, status: 'ACTIVE' },
    }),
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

  const legalActions: OrgHomeAction[] = (actions.items as unknown as OrgHomeAction[]).map((a) => {
    const matterId = (a as any).matterId ?? (a as any).matterPublicationId ?? null;
    return {
      id: a.id,
      matterPublicationId: matterId,
      matterTitle: a.matterTitle ?? null,
      title: a.title,
      instructions: a.instructions ?? null,
      dueAt: a.dueAt ?? null,
      typeLabel: a.typeLabel || 'Ügyintézési teendő',
      readOnlyNote: a.readOnlyNote || 'Ügyféli teendő',
      area: 'LEGAL',
      actionUrl: matterId ? `/portal/matters/${encodeURIComponent(String(matterId))}` : `/portal/action-requests/${encodeURIComponent(String(a.id))}`,
    };
  });

  const complianceActions: OrgHomeAction[] = [];
  let compAttentionCount = 0;
  let compInProgressCount = 0;
  let compNoActionExpectedCount = 0;

  for (const topic of complianceModel.topics) {
    if (topic.state === 'MORE_INFORMATION_NEEDED') {
      compAttentionCount += 1;
      for (const missing of topic.missingInformation) {
        if (missing.portalAnswerable) {
          complianceActions.push({
            id: `compliance-${topic.topicId}-${missing.questionKey || missing.label}`,
            matterPublicationId: null,
            matterTitle: topic.topicLabel,
            title: missing.label,
            instructions: topic.shortExplanation,
            dueAt: null,
            typeLabel: 'Megfelelési adatkérés',
            readOnlyNote: 'Töltse ki a hiányzó adatot a portálon.',
            area: 'COMPLIANCE',
            actionUrl: '/portal/megfeleles',
          });
        }
      }
    } else if (topic.state === 'ACTION_IN_PROGRESS' || topic.state === 'LAWYER_REVIEW_REQUIRED') {
      compInProgressCount += 1;
    } else if (topic.state === 'RESOLVED' || topic.state === 'REVIEW_RECOMMENDED') {
      compNoActionExpectedCount += 1;
    }
  }

  const INITIATIVE_STATUS_LABELS: Record<string, string> = {
    PLANNED: 'Tervezett',
    ACTIVE: 'Folyamatban',
    COMPLETED: 'Kész',
    ON_HOLD: 'Szünetel',
    HOLD: 'Szünetel',
  };

  const growSummary: OrgHomeGrowSummary = {
    activeInitiativesCount: growInitiativesCount,
    initiatives: growInitiatives.map((i) => ({
      id: i.id,
      title: i.title,
      statusLabel: INITIATIVE_STATUS_LABELS[i.status] || i.status,
      targetState: i.targetState || null,
    })),
    knownProcessesCount: processesCount,
  };

  const complianceSummary: OrgHomeComplianceSummary = {
    attentionCount: compAttentionCount,
    inProgressCount: compInProgressCount,
    noActionExpectedCount: compNoActionExpectedCount,
    topics: complianceModel.topics.slice(0, 5).map((t) => ({
      topicId: t.topicId,
      topicLabel: t.topicLabel,
      state: t.state,
      nextAction: t.nextAction,
    })),
  };

  const digitalTwinSummary: OrgHomeDigitalTwinSummary = {
    organizationUnitsCount: groupsCount,
    knownProcessesCount: processesCount,
    knownSystemsCount: systemsCount,
    employeeCount: employeeFact?.numberValue != null ? Number(employeeFact.numberValue) : null,
  };

  const dto: OrgHomeDto = {
    customer: { name: client.name },
    currentMatter,
    matters: caseRows,
    actions: [...legalActions, ...complianceActions],
    recentDocuments: (documents.items as unknown as OrgHomeDocument[]).map((d) => ({
      id: d.id,
      matterTitle: d.matterTitle ?? null,
      title: d.title,
      publishedAt: d.publishedAt ?? null,
      downloadAvailable: Boolean(d.downloadAvailable),
    })),
    contactSummary,
    growSummary,
    complianceSummary,
    digitalTwinSummary,
  };

  // Safety net: forbid internal fields from ever crossing the boundary.
  const json = JSON.stringify(dto);
  for (const forbidden of ['workInstruction', 'taskNotes', 'reviewer', 'internalOwner', 'assessmentFinding', 'sharePoint', 'spItemId', 'aiPrompt', 'aiResponse', 'auditEvent']) {
    if (json.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new InteractionError(500, 'ORG_HOME_FORBIDDEN_FIELD', 'Organizational home DTO contains forbidden internal data.');
    }
  }
  return dto;
}