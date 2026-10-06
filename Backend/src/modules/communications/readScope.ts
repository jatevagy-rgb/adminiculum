/**
 * Canonical communication read-scope — MF-MAILBOX-PRIVACY-BOUNDARY-1.
 *
 * Mailbox ownership is a privacy boundary ABOVE role. A user may read a
 * mailbox-derived email ONLY when that mailbox belongs to the authenticated DB
 * user. ADMIN/PARTNER do NOT bypass this. Non-mailbox (MANUAL / unset source)
 * communication keeps its existing authorization behavior exactly.
 *
 * Semantics:
 *  A. Personal mailbox row (`mailboxConnectionId != null`): visible only when
 *     `CommunicationMailboxConnection.ownerUserId == authenticated userId`.
 *  B. Legacy Outlook row (`source == OUTLOOK`, `mailboxConnectionId == null`):
 *     visible only on a case-insensitive EXACT match of `mailboxAddress` with
 *     the canonical authenticated DB user email. No sender/recipient/domain
 *     inference.
 *  C. A mailbox-source row without a connection cannot prove ownership — it is
 *     hidden (fail closed).
 *  D. Non-mailbox rows (source null or MANUAL, no connection) are untouched by
 *     this boundary; role/case authorization for them is unchanged.
 *
 * The canonical email is resolved server-side from the DB by user id. A
 * client-supplied email is never trusted, and a failed identity lookup fails
 * closed (no owned mailboxes, no legacy address match).
 *
 * This module is the single reusable predicate/predicate-builder for every
 * communication read surface (list, detail, client summary, case workspace,
 * case activity, case work items, workflow summary).
 */
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

export type CommunicationPrivacyDb = Pick<typeof defaultPrisma, 'user' | 'communication'>;

export type CommunicationPrivacyScope = {
  userId: string;
  /** Canonical authenticated DB user email, normalized (trim + lowercase). */
  canonicalEmail: string | null;
  ownedMailboxConnectionIds: string[];
};

/** Normalize an email for exact comparison: trim + lowercase. */
export function normalizeMailboxEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/**
 * Resolve the authenticated user's canonical email and owned mailbox
 * connection ids from the DB. Never trusts a client-supplied email.
 *
 * FAIL CLOSED: if the identity cannot be resolved (missing user or lookup
 * failure), the scope carries no owned mailboxes and no email, so mailbox-
 * derived rows stay hidden while non-mailbox rows keep their behavior.
 */
export async function resolveCommunicationPrivacyScope(
  userId: string,
  db: CommunicationPrivacyDb = defaultPrisma,
): Promise<CommunicationPrivacyScope> {
  try {
    const user = await db.user.findUnique({
      where: { id: String(userId) },
      select: { email: true, mailboxConnections: { select: { id: true } } },
    });
    return {
      userId,
      canonicalEmail: normalizeMailboxEmail(user?.email),
      ownedMailboxConnectionIds: (user?.mailboxConnections ?? []).map((connection) => connection.id),
    };
  } catch {
    return { userId, canonicalEmail: null, ownedMailboxConnectionIds: [] };
  }
}

export type CommunicationMailboxFields = {
  mailboxConnectionId?: string | null;
  source?: string | null;
  mailboxAddress?: string | null;
};

/** A row this boundary does not apply to: non-mailbox communication. */
export function isNonMailboxCommunication(row: CommunicationMailboxFields): boolean {
  return row.mailboxConnectionId == null && (row.source == null || row.source === 'MANUAL');
}

/** Canonical membership predicate for an already-loaded communication row. */
export function isCommunicationVisibleUnderMailboxPrivacy(
  row: CommunicationMailboxFields,
  scope: CommunicationPrivacyScope | null,
): boolean {
  if (row.mailboxConnectionId) {
    return Boolean(scope && scope.ownedMailboxConnectionIds.includes(row.mailboxConnectionId));
  }
  const source = row.source ?? null;
  if (source === 'OUTLOOK') {
    if (!scope?.canonicalEmail) return false;
    const address = normalizeMailboxEmail(row.mailboxAddress);
    return Boolean(address && address === scope.canonicalEmail);
  }
  if (source === 'MAILBOX') {
    return false;
  }
  return true;
}

/**
 * Prisma `where` fragment implementing the same semantics as the membership
 * predicate, for DB-level list/count filtering. `null` scope = no identity
 * (non-mailbox rows only).
 */
export function buildMailboxPrivacyWhere(scope: CommunicationPrivacyScope | null): Prisma.CommunicationWhereInput {
  const or: Prisma.CommunicationWhereInput[] = [];
  if (scope && scope.ownedMailboxConnectionIds.length > 0) {
    or.push({ mailboxConnectionId: { in: scope.ownedMailboxConnectionIds } });
  }
  if (scope?.canonicalEmail) {
    or.push({
      mailboxConnectionId: null,
      source: 'OUTLOOK',
      mailboxAddress: { equals: scope.canonicalEmail, mode: 'insensitive' },
    });
  }
  // Non-mailbox rows: existing authorization behavior is preserved.
  or.push({ mailboxConnectionId: null, source: null });
  or.push({ mailboxConnectionId: null, source: 'MANUAL' });
  return { OR: or };
}

/** Combine an existing communication filter with the mailbox privacy boundary. */
export function combineCommunicationReadWhere(
  existing: Prisma.CommunicationWhereInput,
  scope: CommunicationPrivacyScope | null,
): Prisma.CommunicationWhereInput {
  return { AND: [existing, buildMailboxPrivacyWhere(scope)] };
}

/**
 * One-shot DB-level scope for query surfaces (list/count/summary/list-like
 * projections): the caller's userId is the ONLY identity source.
 */
export async function scopedCommunicationWhereForUser(
  userId: string,
  existing: Prisma.CommunicationWhereInput,
  db: CommunicationPrivacyDb = defaultPrisma,
): Promise<Prisma.CommunicationWhereInput> {
  const scope = await resolveCommunicationPrivacyScope(userId, db);
  return combineCommunicationReadWhere(existing, scope);
}

/**
 * One-shot row-level check for single-resource surfaces (detail, mutation
 * guards). Non-mailbox rows short-circuit without extra queries; mailbox rows
 * resolve the canonical scope and fail closed when ownership is unprovable.
 */
export async function userCanReadMailboxCommunication(
  userId: string,
  row: CommunicationMailboxFields,
  db: CommunicationPrivacyDb = defaultPrisma,
): Promise<boolean> {
  if (isNonMailboxCommunication(row)) return true;
  const scope = await resolveCommunicationPrivacyScope(userId, db);
  return isCommunicationVisibleUnderMailboxPrivacy(row, scope);
}

/**
 * Which of the candidate communication ids may the scoped user read. Used by
 * case projections that link tasks/timeline events to communications so a
 * hidden foreign mailbox row is never exposed as a source projection.
 */
export async function visibleCommunicationIdSet(
  candidateIds: Array<string | null | undefined>,
  scope: CommunicationPrivacyScope | null,
  db: CommunicationPrivacyDb = defaultPrisma,
): Promise<Set<string>> {
  const ids = Array.from(new Set(candidateIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Set();
  const rows = await db.communication.findMany({
    where: combineCommunicationReadWhere({ id: { in: ids } }, scope),
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
