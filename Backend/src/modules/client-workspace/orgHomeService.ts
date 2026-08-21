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

export interface OrgHomeDto {
  customer: { name: string };
  currentMatter?: OrgHomeCustomerMatter;
  matters: OrgHomeMatterRow[];
  actions: OrgHomeAction[];
  recentDocuments: OrgHomeDocument[];
  contactSummary: OrgHomeContactSummary;
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

  const [currentMatter, actions, documents, contactSummary] = await Promise.all([
    resolveCurrentMatter(identityId, workspaceId, caseRows, prisma),
    listPortalActionRequests({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId }, undefined, prisma),
    listPortalDocuments({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId }, undefined, prisma),
    buildContactSummary(identityId, workspaceId, prisma),
  ]);

  const dto: OrgHomeDto = {
    customer: { name: client.name },
    currentMatter,
    matters: caseRows,
    actions: (actions.items as unknown as OrgHomeAction[]).map((a) => ({
      id: a.id,
      matterPublicationId: (a as any).matterId ?? (a as any).matterPublicationId ?? null,
      matterTitle: a.matterTitle ?? null,
      title: a.title,
      instructions: a.instructions ?? null,
      dueAt: a.dueAt ?? null,
      typeLabel: a.typeLabel,
      readOnlyNote: a.readOnlyNote,
    })),
    recentDocuments: (documents.items as unknown as OrgHomeDocument[]).map((d) => ({
      id: d.id,
      matterTitle: d.matterTitle ?? null,
      title: d.title,
      publishedAt: d.publishedAt ?? null,
      downloadAvailable: Boolean(d.downloadAvailable),
    })),
    contactSummary,
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