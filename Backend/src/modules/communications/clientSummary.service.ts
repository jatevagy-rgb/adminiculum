// ============================================================================
// COMMUNICATIONS MODULE - Client Communication Summary Read Model (Phase 5)
// ============================================================================
//
// A truthful, authorization-safe, efficient client-wide communication read model
// for compact Client Overview context. A communication belongs to this client
// context when:
//   communication.clientId === clientId
//   OR
//   communication.case.clientId === clientId   (resolved via the client's cases)
//
// No N+1 per-case fetching, no frontend relation reconstruction, no provider
// identifiers, no thread/unread/state invention. Caller-supplied clientId is NOT
// authority: authorization is REUSED from the canonical workforce/client access
// gate (assertClientReadAccess) and is verified before any row is returned.
// ============================================================================

import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  assertClientReadAccess,
  internalCaseScope,
  type InternalActor,
} from '../client-interaction/base';

export type Prisma = typeof defaultPrisma;

export type ClientCommunicationSummaryItem = {
  id: string;
  sender: string | null;
  subject: string;
  timestamp: string | null;
  preview: string | null;
  caseId: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  attachmentCount: number;
  taskCount: number;
};

export type ClientCommunicationSummary = {
  client: { id: string; name: string };
  communications: ClientCommunicationSummaryItem[];
};

export const DEFAULT_CLIENT_SUMMARY_LIMIT = 5;
export const MAX_CLIENT_SUMMARY_LIMIT = 20;
const CONTENT_PREVIEW_LIMIT = 240;

export type ClientSummaryOptions = { limit?: number };

function clampLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 1) return DEFAULT_CLIENT_SUMMARY_LIMIT;
  return Math.min(Math.floor(value), MAX_CLIENT_SUMMARY_LIMIT);
}

function toContentPreview(content?: string | null): string | null {
  if (!content) return null;
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > CONTENT_PREVIEW_LIMIT
    ? `${compact.slice(0, CONTENT_PREVIEW_LIMIT - 1)}…`
    : compact;
}

function countByKey<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

/**
 * List the client-wide communication summary.
 *
 * Authorization is fail-closed and happens BEFORE any row is returned:
 *  - assertClientReadAccess verifies the actor may read this client; a
 *    cross-client request throws 403 / unknown client 404.
 *  - For non-manager roles the case-linked scope is further intersected with the
 *    actor's readable case ids so a case the actor cannot read is never surfaced
 *    merely because its caseId is known.
 *
 * The datastore work is bounded (constant number of queries): one case lookup,
 * one communication lookup, one attachment-count lookup, one task-count lookup —
 * never an N+1 per-case loop.
 */
export async function listClientCommunicationSummary(
  actor: InternalActor,
  clientId: string,
  opts: ClientSummaryOptions = {},
  prisma: Prisma = defaultPrisma,
): Promise<ClientCommunicationSummary> {
  // Fail-closed client authorization (caller-supplied clientId is NOT authority).
  const client = await assertClientReadAccess(actor, clientId, prisma);

  // Resolve the client's own cases once to derive the case-linked scope and the
  // (already-authorized) public case label/number for the summary DTO.
  const clientCases = await prisma.case.findMany({
    where: { clientId },
    select: { id: true, caseNumber: true, title: true },
  });
  const clientCaseById = new Map(clientCases.map((c) => [c.id, c]));

  // Managers (ADMIN/PARTNER) read every case of the client; other internal roles
  // are restricted to cases they can actually read (intersect with their scope).
  const scope = await internalCaseScope(actor, prisma);
  const readableCaseIds = scope === null
    ? clientCases.map((c) => c.id)
    : clientCases.filter((c) => scope.includes(c.id)).map((c) => c.id);

  const where: Prisma.CommunicationWhereInput = {
    OR: [
      { clientId },                       // directly linked to the client
      { caseId: { in: readableCaseIds } }, // linked to a readable case of the client
    ],
  };

  const rows = await prisma.communication.findMany({
    where,
    orderBy: [
      { receivedAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: clampLimit(opts.limit),
    select: {
      id: true,
      subject: true,
      senderName: true,
      senderEmail: true,
      recipientName: true,
      content: true,
      caseId: true,
      clientId: true,
      createdAt: true,
      receivedAt: true,
      sentAt: true,
    },
  });

  const rowIds = rows.map((row) => row.id);
  let attachmentCounts = new Map<string, number>();
  let taskCounts = new Map<string, number>();

  if (rowIds.length > 0) {
    const attachments = await prisma.communicationAttachment.findMany({
      where: { communicationId: { in: rowIds } },
      select: { communicationId: true },
    });
    attachmentCounts = countByKey(attachments, 'communicationId');

    const tasks = await prisma.task.findMany({
      where: { sourceCommunicationId: { in: rowIds } },
      select: { sourceCommunicationId: true },
    });
    taskCounts = countByKey(tasks, 'sourceCommunicationId');
  }

  const communications: ClientCommunicationSummaryItem[] = rows.map((row) => {
    const linkedCase = row.caseId ? clientCaseById.get(row.caseId) : null;
    const timestamp = row.receivedAt || row.sentAt || row.createdAt;
    return {
      id: row.id,
      sender: row.senderName || row.senderEmail || row.recipientName || null,
      subject: row.subject,
      timestamp: timestamp ? timestamp.toISOString() : null,
      preview: toContentPreview(row.content),
      // Never leak a case id/number/title outside the client-owned case set.
      caseId: linkedCase ? row.caseId : null,
      caseNumber: linkedCase?.caseNumber ?? null,
      caseTitle: linkedCase?.title ?? null,
      attachmentCount: attachmentCounts.get(row.id) || 0,
      taskCount: taskCounts.get(row.id) || 0,
    };
  });

  return { client: { id: client.id, name: client.name }, communications };
}
