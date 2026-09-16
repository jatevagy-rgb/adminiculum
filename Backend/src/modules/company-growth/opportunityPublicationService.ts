import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientReadAccess, InteractionError, InternalActor, requireExpected, safeText } from '../client-interaction/base';
import { requireOrganizationWorkspace } from '../client-workspace/organizationalAccessPolicy';
import { isClientPublicationPublisherRole } from '../client-publication/publicationService';

type Db = PrismaClient | Prisma.TransactionClient;
type PublicationInput = {
  opportunityId: string;
  workspaceId: string;
  title: unknown;
  summary: unknown;
  direction?: unknown;
  expectedRevision?: unknown;
};
type TransitionInput = { expectedRevision?: unknown };

const TITLE_LIMIT = 240;
const SUMMARY_LIMIT = 2_000;
const DIRECTION_LIMIT = 2_000;

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function publisher(actor: InternalActor): void {
  if (!actor?.userId || !isClientPublicationPublisherRole(actor.role)) {
    throw new InteractionError(403, 'PUBLICATION_NOT_AUTHORIZED', 'Actor is not authorized for publication administration.');
  }
}

async function workspaceClient(db: Db, workspaceId: string, clientId: string): Promise<void> {
  const workspace = await requireOrganizationWorkspace(workspaceId, db as any);
  if (workspace.clientId !== clientId) {
    throw new InteractionError(403, 'WORKSPACE_CLIENT_MISMATCH', 'The selected workspace belongs to another client.');
  }
}

async function opportunityForClient(db: Db, opportunityId: string, clientId: string) {
  const opportunity = await (db as any).improvementOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, clientId: true, title: true, problem: true, direction: true, kind: true, updatedAt: true },
  });
  if (!opportunity) throw new InteractionError(404, 'OPPORTUNITY_NOT_FOUND', 'Improvement opportunity not found.');
  if (opportunity.clientId !== clientId) throw new InteractionError(403, 'OPPORTUNITY_CLIENT_MISMATCH', 'Opportunity is outside the selected client.');
  return opportunity;
}

async function publicationRow(db: Db, publicationId: string) {
  const row = await (db as any).clientImprovementOpportunityPublication.findUnique({
    where: { id: publicationId },
    include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
  });
  if (!row) throw new InteractionError(404, 'OPPORTUNITY_PUBLICATION_NOT_FOUND', 'Opportunity publication not found.');
  return row;
}

function dto(row: any, revision?: any): Record<string, unknown> {
  const snapshot = revision || row.revisions?.[0] || null;
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    clientId: row.clientId,
    workspaceId: row.workspaceId,
    status: row.status,
    currentRevisionId: row.currentRevisionId,
    preparedById: row.preparedById,
    approvedById: row.approvedById,
    publishedById: row.publishedById,
    revokedById: row.revokedById,
    approvedAt: row.approvedAt,
    publishedAt: row.publishedAt,
    revokedAt: row.revokedAt,
    revision: row.revision,
    snapshot: snapshot ? {
      id: snapshot.id,
      revisionNumber: snapshot.revisionNumber,
      clientSafeTitle: snapshot.clientSafeTitle,
      clientSafeSummary: snapshot.clientSafeSummary,
      clientSafeDirection: snapshot.clientSafeDirection,
      sourceFingerprint: snapshot.sourceFingerprint,
      audienceSnapshot: snapshot.audienceSnapshot,
      createdAt: snapshot.createdAt,
    } : null,
  };
}

async function audit(db: Db, publication: any, actorId: string, action: string, fromStatus: string | null, toStatus: string | null, revisionNumber?: number): Promise<void> {
  await (db as any).clientPublicationEvent.create({
    data: {
      id: crypto.randomUUID(),
      action: action as any,
      actorId,
      clientId: publication.clientId,
      improvementOpportunityPublicationId: publication.id,
      fromStatus,
      toStatus,
      metadataSafe: { domain: 'GROW_OPPORTUNITY_PUBLICATION', revisionNumber: revisionNumber ?? null },
    },
  });
}

export async function createOpportunityPublicationDraft(actor: InternalActor, clientId: string, input: PublicationInput, db: PrismaClient = defaultPrisma): Promise<Record<string, unknown>> {
  await assertClientReadAccess(actor, clientId, db as any);
  const opportunity = await opportunityForClient(db, String(input.opportunityId), clientId);
  await workspaceClient(db, String(input.workspaceId), clientId);
  const title = safeText(input.title, 'title', TITLE_LIMIT, true)!;
  const summary = safeText(input.summary, 'summary', SUMMARY_LIMIT, true)!;
  const direction = safeText(input.direction, 'direction', DIRECTION_LIMIT);
  const fingerprint = hash({ opportunityId: opportunity.id, clientId, workspaceId: String(input.workspaceId), title, summary, direction, sourceUpdatedAt: opportunity.updatedAt.toISOString() });

  return db.$transaction(async (tx) => {
    const existing = await (tx as any).clientImprovementOpportunityPublication.findUnique({ where: { opportunityId_workspaceId: { opportunityId: opportunity.id, workspaceId: String(input.workspaceId) } } });
    if (existing) {
      requireExpected(existing, input.expectedRevision);
      if (String(existing.status) === 'PUBLISHED') {
        throw new InteractionError(409, 'PUBLICATION_REVOKE_REQUIRED', 'Published opportunity publications require explicit revocation before republishing.');
      }
      if (['DRAFT', 'READY_FOR_APPROVAL', 'APPROVED'].includes(String(existing.status))) {
        throw new InteractionError(409, 'PUBLICATION_ALREADY_IN_PROGRESS', 'An opportunity publication is already in progress.');
      }
    }
    const previousRevision = existing
      ? await (tx as any).clientImprovementOpportunityPublicationRevision.findFirst({ where: { publicationId: existing.id }, orderBy: { revisionNumber: 'desc' }, select: { revisionNumber: true } })
      : null;
    const revisionNumber = Number(previousRevision?.revisionNumber || 0) + 1;
    const publication = existing
      ? await (tx as any).clientImprovementOpportunityPublication.update({ where: { id: existing.id }, data: { status: 'DRAFT', currentRevisionId: null, approvedById: null, approvedAt: null, publishedById: null, publishedAt: null, revokedById: null, revokedAt: null, revision: { increment: 1 } } })
      : await (tx as any).clientImprovementOpportunityPublication.create({ data: { opportunityId: opportunity.id, clientId, workspaceId: String(input.workspaceId), status: 'DRAFT', preparedById: actor.userId, revision: 0 } });
    const revision = await (tx as any).clientImprovementOpportunityPublicationRevision.create({
      data: {
        publicationId: publication.id,
        revisionNumber,
        clientSafeTitle: title,
        clientSafeSummary: summary,
        clientSafeDirection: direction,
        sourceFingerprint: fingerprint,
        audienceSnapshot: { scope: 'WORKSPACE', clientId, workspaceId: String(input.workspaceId) },
        createdById: actor.userId,
      },
    });
    const row = await (tx as any).clientImprovementOpportunityPublication.update({ where: { id: publication.id }, data: { currentRevisionId: revision.id, revision: existing ? undefined : 1 } });
    await audit(tx, row, actor.userId, 'DRAFT_CREATED', existing?.status ?? null, 'DRAFT', revisionNumber);
    return dto(row, revision);
  });
}

async function transition(actor: InternalActor, clientId: string, publicationId: string, input: TransitionInput, action: 'submit' | 'approve' | 'publish' | 'revoke', db: PrismaClient): Promise<Record<string, unknown>> {
  if (action !== 'submit') publisher(actor);
  await assertClientReadAccess(actor, clientId, db as any);
  const current = await publicationRow(db, publicationId);
  if (current.clientId !== clientId) {
    throw new InteractionError(403, 'PUBLICATION_CLIENT_MISMATCH', 'Opportunity publication is outside the selected client.');
  }
  await opportunityForClient(db, current.opportunityId, clientId);
  await workspaceClient(db, current.workspaceId, clientId);
  requireExpected(current, input.expectedRevision);
  const from = String(current.status);
  const next = action === 'submit' && from === 'DRAFT' ? 'READY_FOR_APPROVAL'
    : action === 'approve' && from === 'READY_FOR_APPROVAL' ? 'APPROVED'
      : action === 'publish' && from === 'APPROVED' ? 'PUBLISHED'
        : action === 'revoke' && from === 'PUBLISHED' ? 'REVOKED' : null;
  if (!next) {
    if ((action === 'publish' && from === 'PUBLISHED') || (action === 'revoke' && from === 'REVOKED')) return dto(current, current.revisions?.[0]);
    throw new InteractionError(409, 'INVALID_PUBLICATION_TRANSITION', `Cannot ${action} publication in ${from}.`);
  }
  return db.$transaction(async (tx) => {
    const row = await (tx as any).clientImprovementOpportunityPublication.update({
      where: { id: publicationId },
      data: {
        status: next,
        revision: { increment: 1 },
        approvedById: next === 'APPROVED' ? actor.userId : undefined,
        approvedAt: next === 'APPROVED' ? new Date() : undefined,
        publishedById: next === 'PUBLISHED' ? actor.userId : undefined,
        publishedAt: next === 'PUBLISHED' ? new Date() : undefined,
        revokedById: next === 'REVOKED' ? actor.userId : undefined,
        revokedAt: next === 'REVOKED' ? new Date() : undefined,
      },
    });
    const revisionNumber = current.revisions?.[0]?.revisionNumber;
    if (next === 'PUBLISHED' && Number(revisionNumber) > 1) {
      await (tx as any).clientPublicationEvent.create({
        data: {
          id: crypto.randomUUID(),
          action: 'SUPERSEDED',
          actorId: actor.userId,
          clientId: row.clientId,
          improvementOpportunityPublicationId: row.id,
          fromStatus: null,
          toStatus: null,
          metadataSafe: {
            domain: 'GROW_OPPORTUNITY_PUBLICATION',
            supersededRevisionNumber: Number(revisionNumber) - 1,
            replacementRevisionNumber: Number(revisionNumber),
          },
        },
      });
    }
    await audit(tx, row, actor.userId, next === 'READY_FOR_APPROVAL' ? 'SUBMITTED_FOR_APPROVAL' : next, from, next, revisionNumber);
    return dto(row, current.revisions?.[0]);
  });
}

export const submitOpportunityPublication = (actor: InternalActor, clientId: string, id: string, input: TransitionInput = {}, db = defaultPrisma) => transition(actor, clientId, id, input, 'submit', db);
export const approveOpportunityPublication = (actor: InternalActor, clientId: string, id: string, input: TransitionInput = {}, db = defaultPrisma) => transition(actor, clientId, id, input, 'approve', db);
export const publishOpportunityPublication = (actor: InternalActor, clientId: string, id: string, input: TransitionInput = {}, db = defaultPrisma) => transition(actor, clientId, id, input, 'publish', db);
export const revokeOpportunityPublication = (actor: InternalActor, clientId: string, id: string, input: TransitionInput = {}, db = defaultPrisma) => transition(actor, clientId, id, input, 'revoke', db);
