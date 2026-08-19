/**
 * CONTRACT LIBRARY — CUSTOMER-SAFE PROJECTOR (foundation, dormant in Phase 2).
 *
 * The safe publication rule: a ContractRecord may appear to an organizational
 * customer ONLY when its canonical DocumentVersion is already explicitly
 * customer-published through the existing ClientDocumentPublication mechanism to
 * the current workspace / participant audience, AND the record itself is
 * eligible for customer-safe projection.
 *
 * Phase 2 does NOT expose a public contract route: the current Case-grant
 * architecture has no correct company-level publication scope, and Case access
 * must NOT imply Contract Library access. Rather than inventing a second ACL, we
 * ship a correct, dormant projector. Phase 5 must add a company-level publication
 * scope. Security correctness wins over forced portal exposure.
 *
 * Projection strips: internal notes, internal reasoning, raw User/DocumentVersion/
 * Case/Task IDs, law-firm-only classification detail.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

const CUSTOMER_VISIBLE_STATUS = new Set(['SIGNED_NOT_EFFECTIVE', 'ACTIVE', 'TERMINATING']);

export async function projectContractLibraryForCustomer(
  clientId: string,
  publishedDocumentVersionIds: Set<string>,
  prisma: Prisma = defaultPrisma,
) {
  if (publishedDocumentVersionIds.size === 0) return { items: [] };
  const rows = await prisma.contractRecord.findMany({
    where: {
      clientId,
      status: { in: Array.from(CUSTOMER_VISIBLE_STATUS) as any },
      canonicalDocumentVersionId: { in: Array.from(publishedDocumentVersionIds) },
    },
    include: { parties: true, obligations: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }, entitlements: true },
    orderBy: { title: 'asc' },
  });
  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    contractType: row.contractType,
    status: row.status,
    partners: row.parties.map((p) => ({ displayName: p.displayName, roleCode: p.roleCode })),
    effectiveDate: row.effectiveDate ? row.effectiveDate.toISOString() : null,
    expiryDate: row.expiryDate ? row.expiryDate.toISOString() : null,
    nextCriticalDate: row.nextCriticalDate ? row.nextCriticalDate.toISOString() : null,
    documentAvailable: true,
    obligations: row.obligations.map((o) => ({ id: o.id, title: o.title, nextDueDate: o.nextDueDate ? o.nextDueDate.toISOString() : null, status: o.status })),
    entitlements: row.entitlements.map((e) => ({ id: e.id, type: e.type, title: e.title, status: e.status })),
  }));
  const dto = { items };
  assertClientSafe(dto);
  return dto;
}
