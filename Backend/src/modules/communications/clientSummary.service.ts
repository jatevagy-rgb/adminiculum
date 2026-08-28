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

// Canonical effective-timestamp contract shared by the returned `timestamp` and
// the deterministic result ordering (receivedAt, then sentAt, then createdAt).
export const CLIENT_SUMMARY_TIMESTAMP_CONTRACT = 'receivedAt ?? sentAt ?? createdAt';

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
 *  - Case authorization is AUTHORITATIVE (fail-closed dual-link rule):
 *      - direct client communication is included only when case-less
 *        (clientId === target AND caseId === null);
 *      - case-linked communication is included only when its EXACT case is in the
 *        actor's readable target-client case set AND clientId is null or equals
 *        the target client. A mismatched dual link (clientId !== target on a
 *        target-case-linked row) is excluded, not silently reassigned. Managers
 *        (global case access) use the client's full case set.
 *  - Unauthorized rows are excluded BEFORE any case-label mapping or count is run.
 *
 * Timestamp/order contract: effectiveTimestamp = receivedAt ?? sentAt ?? createdAt.
 * The returned `timestamp` AND the deterministic result order both use this same
 * contract (ties broken by communication id DESC), so the list is genuinely ordered
 * by the value it reports.
 *
 * Datastore work is bounded (constant number of queries): one case lookup, one
 * communication lookup (candidate over-fetch), one attachment-count lookup, one
 * task-count lookup — never an N+1 per-case loop. Counts run ONLY for the
 * already-authorized returned ids.
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

  // Case authorization is AUTHORITATIVE. Only cases this actor may read contribute
  // to the context set; a client-level link never overrides case authorization.
  // Managers (ADMIN/PARTNER -> global case access) use the client's full case set.
  const scope = await internalCaseScope(actor, prisma);
  const readableClientCases = scope === null
    ? clientCases
    : clientCases.filter((c) => scope.includes(c.id));
  const readableCaseIds = readableClientCases.map((c) => c.id);
  const readableClientCaseById = new Map(readableClientCases.map((c) => [c.id, c]));

  const where: Prisma.CommunicationWhereInput = {
    OR: [
      // Direct client communication, case-less: a clientId match never overrides
      // case authorization on a case-linked row.
      { clientId, caseId: null },
      // Case-linked communication is readable only when the exact case is readable
      // AND the row is not dual-linked to a different client. A mismatched dual
      // link (clientId !== target on a target-case-linked row) fails closed and is
      // not silently assigned to either client summary.
      { caseId: { in: readableCaseIds }, clientId: null },
      { caseId: { in: readableCaseIds }, clientId },
    ],
  };

  const limit = clampLimit(opts.limit);
  // Bounded candidate over-fetch so the effective-timestamp sort below can prefer
  // truly recent rows; capped at MAX_CLIENT_SUMMARY_LIMIT (never N+1).
  const candidateTake = Math.min(limit * 3, MAX_CLIENT_SUMMARY_LIMIT);

  const rows = await prisma.communication.findMany({
    where,
    orderBy: [
      { receivedAt: { sort: 'desc', nulls: 'last' } },
      { sentAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: candidateTake,
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

  // Canonical effective-timestamp contract: receivedAt ?? sentAt ?? createdAt.
  // The RESULT order AND the returned `timestamp` both derive from this contract,
  // so the presented list is truly ordered by the value it reports. Deterministic
  // tie-break: communication id DESC.
  rows.sort((a, b) => {
    const ta = a.receivedAt || a.sentAt || a.createdAt;
    const tb = b.receivedAt || b.sentAt || b.createdAt;
    const diff = tb.getTime() - ta.getTime();
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
  const selected = rows.slice(0, limit);

  // Counts are computed ONLY for the already-authorized returned rows (never on a
  // candidate set that could include unauthorized rows).
  const selectedIds = selected.map((row) => row.id);
  let attachmentCounts = new Map<string, number>();
  let taskCounts = new Map<string, number>();

  if (selectedIds.length > 0) {
    const attachments = await prisma.communicationAttachment.findMany({
      where: { communicationId: { in: selectedIds } },
      select: { communicationId: true },
    });
    attachmentCounts = countByKey(attachments, 'communicationId');

    const tasks = await prisma.task.findMany({
      where: { sourceCommunicationId: { in: selectedIds } },
      select: { sourceCommunicationId: true },
    });
    taskCounts = countByKey(tasks, 'sourceCommunicationId');
  }

  const communications: ClientCommunicationSummaryItem[] = selected.map((row) => {
    const linkedCase = row.caseId ? readableClientCaseById.get(row.caseId) : null;
    const timestamp = row.receivedAt || row.sentAt || row.createdAt;
    return {
      id: row.id,
      sender: row.senderName || row.senderEmail || row.recipientName || null,
      subject: row.subject,
      timestamp: timestamp ? timestamp.toISOString() : null,
      preview: toContentPreview(row.content),
      // Only ever expose a case label the actor is authorized to read.
      caseId: linkedCase ? row.caseId : null,
      caseNumber: linkedCase?.caseNumber ?? null,
      caseTitle: linkedCase?.title ?? null,
      attachmentCount: attachmentCounts.get(row.id) || 0,
      taskCount: taskCounts.get(row.id) || 0,
    };
  });

  return { client: { id: client.id, name: client.name }, communications };
}
