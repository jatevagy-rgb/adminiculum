/**
 * C4B — read-only compliance monitoring manifest.
 *
 * Produces the DEDUPLICATED monitoring demand that an EXTERNAL legal-source
 * watcher needs: WHICH legal source to monitor, and which locator(s) matter.
 * It deliberately answers only that question.
 *
 * PRIVACY BOUNDARY — the manifest never carries customer/document identity:
 * no clientId, client name, matter, case, documentId, documentVersionId,
 * document title, clauseRef, clause title, rationale, finding, requirement,
 * client fact or internal note. Adminiculum keeps the customer/document impact
 * map internally; the watcher receives legal-source demand only.
 *
 * READ-ONLY — this module performs no writes: no LegalSource /
 * LegalSourceVersion / RequirementCitation / ComplianceDocumentClauseAnchor /
 * DocumentVersion mutation, no storage, no migration, no background job, no
 * watcher.
 *
 * SCOPE — only CURRENT monitoring demand: anchors of the current DocumentVersion
 * of documents linked as INTERNAL_ANALYSIS. Superseded versions and CLIENT_POLICY
 * documents never create (or keep) monitoring demand.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { canonicalReferenceFromAnchorKey, parseCanonicalLegalReference } from './canonicalLegalReference';
import { normalizeCelex } from './legalSourceBinding';

export const MONITORING_MANIFEST_SCHEMA_VERSION = 1;

/** Identifier families this manifest can emit. Nothing else is projected. */
export type MonitoringIdentifierFamily = 'TV' | 'CELEX';

/** Closed, bounded unresolved vocabulary (aggregate counts only). */
export type MonitoringUnresolvedReason =
  | 'NO_MACHINE_IDENTIFIER'
  | 'MALFORMED_CANONICAL_REFERENCE'
  | 'UNSUPPORTED_ELI'
  | 'INVALID_CELEX'
  | 'UNSUPPORTED_IDENTIFIER_FAMILY';

export interface MonitoringManifestSource {
  identifierFamily: MonitoringIdentifierFamily;
  sourceIdentifier: string;
  locators: string[];
  referenceCount: number;
}

export interface ComplianceMonitoringManifestV1 {
  schemaVersion: number;
  generatedAt: string;
  sources: MonitoringManifestSource[];
  unresolvedSummary: {
    count: number;
    reasons: Partial<Record<MonitoringUnresolvedReason, number>>;
  };
}

/**
 * The ONLY anchor fields the manifest reads. Deliberately no ids: the projection
 * cannot leak identity it never selected.
 */
export interface MonitoringAnchorRow {
  anchorType: string;
  anchorKey: string | null;
  eli: string | null;
  celex: string | null;
  locator: string | null;
}

const CANONICAL_REFERENCE_KEY_PREFIX = 'LEGAL|REF=';

/**
 * Exact legacy NJT ELI form only:
 *   https://njt.jog.gov.hu/eli/TV/<year>/<number>
 * No other host, family, path shape or fuzzy variant is accepted.
 */
const NJT_ELI_TV = /^https:\/\/njt\.jog\.gov\.hu\/eli\/TV\/(\d{4})\/(\d{1,12})$/;

type IdentifierExtraction =
  | { resolved: true; family: MonitoringIdentifierFamily; sourceIdentifier: string; locator: string | null }
  | { resolved: false; reason: MonitoringUnresolvedReason };

/**
 * Deterministic FIRST_VALID_SUPPORTED precedence: C4A TV reference → exact NJT ELI
 * → CELEX.
 *
 * Presence alone is NOT authoritative: a malformed C4A reference or an
 * unsupported ELI must never suppress a valid lower-priority supported
 * identifier on the same row. A row is unresolved only when NO valid supported
 * identifier can be extracted; in that case the reported reason follows the
 * failure precedence MALFORMED_CANONICAL_REFERENCE → UNSUPPORTED_ELI →
 * INVALID_CELEX → NO_MACHINE_IDENTIFIER.
 */
export function extractMonitoringIdentifier(row: MonitoringAnchorRow): IdentifierExtraction {
  const anchorKey = typeof row.anchorKey === 'string' ? row.anchorKey.trim() : '';
  let failureReason: MonitoringUnresolvedReason | null = null;

  // 1. C4A canonical reference (LEGAL|REF=TV/...).
  if (anchorKey.startsWith(CANONICAL_REFERENCE_KEY_PREFIX)) {
    const canonical = canonicalReferenceFromAnchorKey(anchorKey);
    const parsed = canonical ? parseCanonicalLegalReference(canonical) : null;
    if (parsed) {
      return { resolved: true, family: 'TV', sourceIdentifier: parsed.sourceReference, locator: parsed.locator };
    }
    failureReason = 'MALFORMED_CANONICAL_REFERENCE';
  }

  // 2. Exact legacy NJT ELI. The persisted locator is preserved verbatim.
  const eli = typeof row.eli === 'string' ? row.eli.trim() : '';
  if (eli) {
    const match = NJT_ELI_TV.exec(eli);
    if (match) {
      const locator = typeof row.locator === 'string' && row.locator.trim() ? row.locator.trim() : null;
      return { resolved: true, family: 'TV', sourceIdentifier: `TV/${match[1]}/${match[2]}`, locator };
    }
    if (!failureReason) failureReason = 'UNSUPPORTED_ELI';
  }

  // 3. Strict C3A CELEX normalization only.
  const celexRaw = typeof row.celex === 'string' ? row.celex.trim() : '';
  if (celexRaw) {
    const normalized = normalizeCelex(celexRaw);
    if (normalized) {
      const locator = typeof row.locator === 'string' && row.locator.trim() ? row.locator.trim() : null;
      return { resolved: true, family: 'CELEX', sourceIdentifier: normalized, locator };
    }
    if (!failureReason) failureReason = 'INVALID_CELEX';
  }

  if (failureReason) return { resolved: false, reason: failureReason };

  // CASE / AUTHORITY anchors are machine identifiers, but not monitoring
  // families in schemaVersion 1: they are accounted for, never invented.
  if (row.anchorType && row.anchorType !== 'LEGAL') {
    return { resolved: false, reason: 'UNSUPPORTED_IDENTIFIER_FAMILY' };
  }
  return { resolved: false, reason: 'NO_MACHINE_IDENTIFIER' };
}

/**
 * Pure, deterministic projection. Same input rows in any order → same manifest.
 *
 * - sources sorted by identifierFamily, then sourceIdentifier
 * - locators unique, sorted, null omitted (never invented)
 * - referenceCount counts contributing persisted anchor usages (NOT the number
 *   of deduplicated sources)
 * - unresolved references are accounted for as bounded aggregate counts only
 */
export function projectMonitoringManifest(
  rows: readonly MonitoringAnchorRow[],
  generatedAt: string = new Date().toISOString(),
): ComplianceMonitoringManifestV1 {
  const bySource = new Map<string, { identifierFamily: MonitoringIdentifierFamily; sourceIdentifier: string; locators: Set<string>; referenceCount: number }>();
  const reasons = new Map<MonitoringUnresolvedReason, number>();
  let unresolvedCount = 0;

  for (const row of rows) {
    const extraction = extractMonitoringIdentifier(row);
    if (extraction.resolved === false) {
      unresolvedCount += 1;
      reasons.set(extraction.reason, (reasons.get(extraction.reason) ?? 0) + 1);
      continue;
    }
    const key = `${extraction.family}\u0000${extraction.sourceIdentifier}`;
    const entry = bySource.get(key) ?? {
      identifierFamily: extraction.family,
      sourceIdentifier: extraction.sourceIdentifier,
      locators: new Set<string>(),
      referenceCount: 0,
    };
    if (extraction.locator) entry.locators.add(extraction.locator);
    entry.referenceCount += 1;
    bySource.set(key, entry);
  }

  const sources: MonitoringManifestSource[] = [...bySource.values()]
    .map((entry) => ({
      identifierFamily: entry.identifierFamily,
      sourceIdentifier: entry.sourceIdentifier,
      locators: [...entry.locators].sort(),
      referenceCount: entry.referenceCount,
    }))
    .sort((a, b) =>
      a.identifierFamily === b.identifierFamily
        ? a.sourceIdentifier.localeCompare(b.sourceIdentifier)
        : a.identifierFamily.localeCompare(b.identifierFamily),
    );

  const sortedReasons: Partial<Record<MonitoringUnresolvedReason, number>> = {};
  for (const reason of [...reasons.keys()].sort()) {
    sortedReasons[reason] = reasons.get(reason);
  }

  return {
    schemaVersion: MONITORING_MANIFEST_SCHEMA_VERSION,
    generatedAt,
    sources,
    unresolvedSummary: { count: unresolvedCount, reasons: sortedReasons },
  };
}

/**
 * Read-only builder over CURRENT monitoring demand:
 * the current DocumentVersion of documents linked as INTERNAL_ANALYSIS.
 *
 * The select is intentionally limited to the five projection fields, so no
 * customer/document identifier is ever read, let alone returned.
 */
export async function buildComplianceMonitoringManifest(
  prisma: PrismaClient = defaultPrisma,
  generatedAt: string = new Date().toISOString(),
): Promise<ComplianceMonitoringManifestV1> {
  const rows = await prisma.complianceDocumentClauseAnchor.findMany({
    where: {
      documentVersion: {
        isCurrent: true,
        document: {
          complianceDocuments: { some: { audience: 'INTERNAL_ANALYSIS' } },
        },
      },
    },
    select: {
      anchorType: true,
      anchorKey: true,
      eli: true,
      celex: true,
      locator: true,
    },
  });
  return projectMonitoringManifest(rows as MonitoringAnchorRow[], generatedAt);
}
